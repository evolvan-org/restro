'use client';

import {
  completeOnboardingDataSchema,
  ONBOARDING_TEAM_MAX_MEMBERS,
  ONBOARDING_TEAM_ROLES,
  type OnboardingTeamDraft,
  type OnboardingTeamMemberDraft,
} from '@rms/api-contract';
import { Plus, TriangleAlert, X } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { formatRoleLabel } from '@/lib/utils';
import { isOnboardingEmailAvailable } from '@/services/api/requests/onboarding';
import { useProfile } from '@/services/api/requests/profile';

import { newKey } from '../keys';
import { useOnboarding } from '../OnboardingProvider';
import Shell, { Section } from '../Shell';
import { useStepNavigation } from '../useStepNavigation';
import { issuesByPath } from '../validation';

function newMember(): OnboardingTeamMemberDraft {
  return { key: newKey(), name: '', email: '', role: 'MANAGER' };
}

export default function TeamStep(): ReactElement {
  const { draft, setStepData } = useOnboarding();
  const nav = useStepNavigation('team');
  const profile = useProfile();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [taken, setTaken] = useState<Record<string, boolean>>({});

  const team: OnboardingTeamDraft = draft.data.team ?? { members: [] };
  const members = team.members.length ? team.members : [newMember()];
  const save = (next: OnboardingTeamMemberDraft[]): void => setStepData('team', { members: next });
  const update = (key: string, patch: Partial<OnboardingTeamMemberDraft>): void =>
    save(members.map((member) => (member.key === key ? { ...member, ...patch } : member)));

  async function checkEmail(member: OnboardingTeamMemberDraft): Promise<void> {
    const email = member.email.trim().toLowerCase();
    if (!email.includes('@')) return;
    try {
      const available = await isOnboardingEmailAvailable(email);
      setTaken((current) => ({ ...current, [member.key]: !available }));
    } catch {
      // The check runs again at finish, so a failed lookup never blocks the owner.
    }
  }

  async function onContinue(): Promise<void> {
    // A blank row is just an unused slot, not a half-filled person.
    const filled = members.filter((m) => m.name.trim() || m.email.trim());
    const parsed = completeOnboardingDataSchema.safeParse({ team: { members: filled } });
    const fieldErrors = Object.fromEntries(
      Object.entries(issuesByPath(parsed.error)).flatMap(([path, message]) => {
        const match = /^team\.members\.(\d+)\.(\w+)$/.exec(path);
        const member = match ? filled[Number(match[1])] : undefined;
        return member ? [[`${member.key}.${match![2]}`, message]] : [];
      }),
    );
    for (const member of filled) {
      if (taken[member.key])
        fieldErrors[`${member.key}.email`] = 'This email already has an account';
    }
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    save(filled);
    await nav.next();
  }

  return (
    <Shell
      step="team"
      title="Add your team"
      description="Create accounts for the people who run the restaurant with you. They can log in once setup is finished."
      footer={{
        onBack: nav.back,
        onSkip: () => void nav.skip(),
        primary: (
          <Button className="h-11 px-5" onClick={() => void onContinue()} disabled={nav.busy}>
            Save and continue
          </Button>
        ),
      }}
    >
      <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
        When setup finishes, we email each person an invitation to set their own password.
        {!profile.data?.emailVerifiedAt && profile.data && (
          <span className="mt-2 flex items-start gap-2 text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden />
            Your own email isn&apos;t verified yet, so invitations will wait. Verify it from the
            link we emailed you, then use Resend invitation on the Staff page.
          </span>
        )}
      </p>

      <Section title="People">
        <div className="flex flex-col gap-4">
          {members.map((member, index) => {
            const err = (field: string): string | undefined => errors[`${member.key}.${field}`];
            return (
              <div
                key={member.key}
                className="grid gap-3 sm:grid-cols-[1fr_1.2fr_9rem_auto] sm:items-start"
              >
                <Field data-invalid={Boolean(err('name'))}>
                  <FieldLabel htmlFor={`m-name-${member.key}`}>Full name</FieldLabel>
                  <Input
                    id={`m-name-${member.key}`}
                    className="h-11"
                    value={member.name}
                    autoComplete="off"
                    aria-invalid={Boolean(err('name'))}
                    onChange={(e) => update(member.key, { name: e.target.value })}
                  />
                  <FieldError>{err('name')}</FieldError>
                </Field>
                <Field data-invalid={Boolean(err('email') || taken[member.key])}>
                  <FieldLabel htmlFor={`m-email-${member.key}`}>Email (their login)</FieldLabel>
                  <Input
                    id={`m-email-${member.key}`}
                    className="h-11"
                    type="email"
                    value={member.email}
                    autoComplete="off"
                    aria-invalid={Boolean(err('email') || taken[member.key])}
                    onChange={(e) => {
                      update(member.key, { email: e.target.value });
                      setTaken((current) => ({ ...current, [member.key]: false }));
                    }}
                    onBlur={() => void checkEmail(member)}
                  />
                  <FieldError>
                    {err('email') ??
                      (taken[member.key] ? 'This email already has an account' : undefined)}
                  </FieldError>
                </Field>
                <Field data-invalid={Boolean(err('role'))}>
                  <FieldLabel htmlFor={`m-role-${member.key}`}>Role</FieldLabel>
                  <NativeSelect
                    className="w-full [&_select]:h-11"
                    id={`m-role-${member.key}`}
                    value={member.role}
                    onChange={(e) => update(member.key, { role: e.target.value })}
                  >
                    {ONBOARDING_TEAM_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {formatRoleLabel(role)}
                      </option>
                    ))}
                  </NativeSelect>
                  <FieldError>{err('role')}</FieldError>
                </Field>
                <Button
                  variant="ghost"
                  className="size-11 sm:mt-6"
                  aria-label={`Remove person ${index + 1}`}
                  disabled={members.length === 1 && !member.name && !member.email}
                  onClick={() => save(members.filter((m) => m.key !== member.key))}
                >
                  <X aria-hidden />
                </Button>
              </div>
            );
          })}
        </div>
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={members.length >= ONBOARDING_TEAM_MAX_MEMBERS}
          onClick={() => save([...members, newMember()])}
        >
          <Plus aria-hidden />
          Add person
        </Button>
      </Section>
    </Shell>
  );
}
