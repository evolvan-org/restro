import { randomUUID } from 'node:crypto';

import { ConflictException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  API_ERROR_CODES,
  type CompleteOnboardingData,
  completeOnboardingDataSchema,
  type CompleteOnboardingRequest,
  type CompleteOnboardingResponse,
  findInventoryRowIssues,
  findMenuRowIssues,
  ONBOARDING_STEPS,
  type OnboardingDraftData,
  onboardingDraftDataSchema,
  type OnboardingEmailAvailabilityResponse,
  type OnboardingInventoryPreviewResponse,
  type OnboardingMenuPreviewResponse,
  type OnboardingStage,
  onboardingStageForPath,
  type OnboardingStateResponse,
  type OnboardingStep,
  type SaveOnboardingDraftRequest,
  type SaveOnboardingDraftResponse,
  type SetupChecklistResponse,
  SKIPPABLE_ONBOARDING_STEPS,
  type SkippableOnboardingStep,
  summarizeMenuCategories,
} from '@rms/api-contract';

import { AuthTokenService } from '../auth-tokens/auth-token.service';
import type { Actor } from '../common/auth/authenticated-request';
import { mapDatabaseError } from '../common/filters/http-exception.filter';
import { errorDiagnostics } from '../common/logging/error-diagnostics';
import { EmailService } from '../email/email.service';
import { deliverBestEffort } from '../email/email-delivery';
import { inventoryCsvDraftRows } from '../stock/inventory-csv';
import { menuCsvRows } from './menu-csv';
import { OnboardingRepository, type OnboardingStateRecord } from './onboarding.repository';
import {
  OnboardingCompletionWriter,
  OnboardingStageFailure,
  type TeamAccount,
} from './onboarding-completion.writer';

const STAGE_LABELS: Record<OnboardingStage, string> = {
  details: 'Saving restaurant details',
  floor: 'Laying out sections and tables',
  statuses: 'Adding table statuses and cancellation reasons',
  menu: 'Menu import',
  inventory: 'Inventory import',
  team: 'Creating team accounts',
  final: 'Final checks',
};

/** Steps are stored as 1-based positions; 0 means the owner hasn't left the Welcome screen. */
function stepToNumber(step: OnboardingStep | null): number {
  return step === null ? 0 : ONBOARDING_STEPS.indexOf(step) + 1;
}

function numberToStep(value: number): OnboardingStep | null {
  return ONBOARDING_STEPS[value - 1] ?? null;
}

function stageError(stage: OnboardingStage, status: HttpStatus, message: string): HttpException {
  return new HttpException(
    {
      message,
      error: HttpStatus[status],
      code: API_ERROR_CODES.ONBOARDING_STAGE_FAILED,
      stage,
    },
    status,
  );
}

function alreadyCompleted(): ConflictException {
  return new ConflictException({
    message: 'Setup is already finished.',
    error: 'Conflict',
    code: API_ERROR_CODES.ONBOARDING_ALREADY_COMPLETED,
  });
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly repository: OnboardingRepository,
    private readonly writer: OnboardingCompletionWriter,
    private readonly tokens: AuthTokenService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async getState(actor: Actor): Promise<OnboardingStateResponse> {
    return this.toState(actor.restaurantId, await this.repository.findState(actor.restaurantId));
  }

  async saveDraft(
    actor: Actor,
    input: SaveOnboardingDraftRequest,
  ): Promise<SaveOnboardingDraftResponse> {
    const state = await this.repository.findState(actor.restaurantId);
    if (state.onboardingCompletedAt) throw alreadyCompleted();

    const saved = await this.repository.saveDraft(actor.restaurantId, input.version, {
      currentStep: stepToNumber(input.currentStep),
      skippedSteps: [...new Set(input.skippedSteps)].map(stepToNumber),
      data: input.data,
    });
    if (!saved) {
      const latest = this.toState(
        actor.restaurantId,
        await this.repository.findState(actor.restaurantId),
      );
      throw new ConflictException({
        message: 'Setup was updated in another tab or device.',
        error: 'Conflict',
        code: API_ERROR_CODES.ONBOARDING_DRAFT_CONFLICT,
        draft: latest,
      });
    }
    return { version: saved.version, updatedAt: saved.updatedAt.toISOString() };
  }

  previewMenu(file: Buffer): OnboardingMenuPreviewResponse {
    const rows = menuCsvRows(file, randomUUID);
    return { rows, issues: findMenuRowIssues(rows), categories: summarizeMenuCategories(rows) };
  }

  previewInventory(file: Buffer): OnboardingInventoryPreviewResponse {
    const rows = inventoryCsvDraftRows(file, randomUUID);
    return { rows, issues: findInventoryRowIssues(rows) };
  }

  async emailAvailable(email: string): Promise<OnboardingEmailAvailabilityResponse> {
    const taken = await this.repository.takenEmails([email]);
    return { available: taken.length === 0 };
  }

  async complete(
    actor: Actor,
    input: CompleteOnboardingRequest,
  ): Promise<CompleteOnboardingResponse> {
    const state = await this.repository.findState(actor.restaurantId);
    if (state.onboardingCompletedAt) throw alreadyCompleted();

    const data = this.validateForFinish(input.data, input.skippedSteps);
    const members = data.team?.members ?? [];

    const taken = new Set(await this.repository.takenEmails(members.map(({ email }) => email)));
    const clash = members.find(({ email }) => taken.has(email));
    if (clash) {
      throw stageError(
        'team',
        HttpStatus.CONFLICT,
        `${clash.email} already has an account. Use a different email.`,
      );
    }

    const team: TeamAccount[] = members.map(({ name, email, role }) => ({ name, email, role }));

    try {
      const result = await this.writer.complete({
        restaurantId: actor.restaurantId,
        ownerId: actor.userId,
        details: data.details,
        floor: data.floor,
        menu: data.menu,
        inventory: data.inventory,
        team,
      });
      // Setup is committed, so a mail outage must not fail it: each invitation can be resent.
      const invitationsHeld = result.users.length > 0 && !actor.emailVerifiedAt;
      const inviter = invitationsHeld ? null : await this.repository.findName(actor.userId);
      const invitations = await Promise.all(
        members.map(async (member, index) => {
          const user = result.users[index]!;
          const emailSent =
            !invitationsHeld &&
            (await deliverBestEffort(
              this.logger,
              { flow: 'onboarding-invite', userId: user.id },
              () =>
                this.sendInvitation(
                  actor.restaurantId,
                  user.id,
                  member,
                  result.restaurantName,
                  inviter ?? '',
                ),
            ));
          return {
            userId: user.id,
            name: member.name,
            email: member.email,
            role: member.role,
            emailSent,
          };
        }),
      );
      return {
        restaurantName: result.restaurantName,
        counts: result.counts,
        invitations,
        invitationsHeld,
      };
    } catch (error) {
      if (error instanceof OnboardingStageFailure) throw this.toStageError(actor, error);
      throw error;
    }
  }

  private sendInvitation(
    restaurantId: string,
    userId: string,
    member: { name: string; email: string; role: string },
    restaurantName: string,
    inviterName: string,
  ): Promise<void> {
    return this.tokens.issueAndDeliver(restaurantId, userId, 'STAFF_INVITE', (token) => {
      const acceptUrl = new URL(
        '/auth/accept-invite',
        this.config.getOrThrow<string>('APP_PUBLIC_URL'),
      );
      acceptUrl.searchParams.set('token', token.rawToken);
      return this.email.send({
        to: { email: member.email, name: member.name },
        template: 'STAFF_INVITE',
        variables: {
          staffName: member.name,
          restaurantName,
          inviterName,
          roleName: member.role,
          acceptUrl: acceptUrl.toString(),
          expiresInDays: 7,
        },
        idempotencyKey: token.id,
      });
    });
  }

  async checklist(actor: Actor): Promise<SetupChecklistResponse> {
    const progress = await this.repository.setupProgress(actor.restaurantId);
    return {
      details: progress.hasDetails,
      floor: progress.tables > 0,
      menu: progress.menuItems > 0,
      inventory: progress.stockItems > 0,
      team: progress.teamMembers > 0,
      missingRecipeCount: progress.missingRecipes,
    };
  }

  /**
   * Skipped steps (and a menu left for later) are dropped before the strict rules run, so a step
   * the owner abandoned half-filled never blocks finishing.
   */
  private validateForFinish(
    draft: OnboardingDraftData,
    skippedSteps: readonly SkippableOnboardingStep[],
  ): CompleteOnboardingData {
    const skipped = new Set(skippedSteps);
    const filled: OnboardingDraftData = {};
    for (const step of SKIPPABLE_ONBOARDING_STEPS) {
      if (!skipped.has(step) && draft[step]) Object.assign(filled, { [step]: draft[step] });
    }
    if (filled.menu?.mode === 'later') delete filled.menu;

    const parsed = completeOnboardingDataSchema.safeParse(filled);
    if (parsed.success) return parsed.data;

    const [first] = parsed.error.issues;
    const stage = onboardingStageForPath(first?.path ?? []);
    const messages = parsed.error.issues
      .filter((issue) => onboardingStageForPath(issue.path) === stage)
      .map((issue) => issue.message);
    throw stageError(stage, HttpStatus.BAD_REQUEST, [...new Set(messages)].slice(0, 5).join(' '));
  }

  /** Client-attributable failures keep their message; anything else is logged, not leaked. */
  private toStageError(actor: Actor, failure: OnboardingStageFailure): HttpException {
    const { stage, cause } = failure;
    const known =
      cause instanceof HttpException && cause.getStatus() < 500
        ? { status: cause.getStatus(), message: cause.message }
        : mapDatabaseError(cause);
    if (known && known.status < 500) {
      return stageError(
        stage,
        known.status,
        `${STAGE_LABELS[stage]} failed. Nothing was created. ${known.message}`,
      );
    }
    this.logger.error('Onboarding finish failed', {
      restaurantId: actor.restaurantId,
      stage,
      ...errorDiagnostics(cause),
    });
    if (known) return stageError(stage, known.status, `${known.message} Nothing was created.`);
    return stageError(
      stage,
      HttpStatus.INTERNAL_SERVER_ERROR,
      `${STAGE_LABELS[stage]} failed. Nothing was created. Try again in a moment.`,
    );
  }

  private toState(restaurantId: string, record: OnboardingStateRecord): OnboardingStateResponse {
    const draft = record.onboardingDraft;
    const data = onboardingDraftDataSchema.safeParse(draft?.data ?? {});
    if (!data.success) {
      // Only reachable if the stored JSON predates a contract change; start the owner fresh.
      this.logger.warn('Discarding an onboarding draft that no longer matches the contract');
    }
    return {
      restaurantId,
      status: record.onboardingCompletedAt ? 'COMPLETED' : 'PENDING',
      currentStep: draft ? numberToStep(draft.currentStep) : null,
      skippedSteps: (draft?.skippedSteps ?? []).flatMap((value) => {
        const step = numberToStep(value);
        return step && step !== 'review' ? [step] : [];
      }),
      data: data.success ? data.data : {},
      version: draft?.version ?? 0,
      updatedAt: draft && draft.version > 1 ? draft.updatedAt.toISOString() : null,
      restaurant: {
        name: record.name,
        currency: record.currency,
        timezone: record.timezone,
        gstNumber: record.gstNumber,
        address: record.address,
        defaultGstRate: record.defaultGstRate.toNumber(),
        maxDiscountPercent: record.maxDiscountPercent.toNumber(),
      },
    };
  }
}
