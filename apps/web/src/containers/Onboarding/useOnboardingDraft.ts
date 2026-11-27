'use client';

import {
  ONBOARDING_STEPS,
  onboardingDraftConflictErrorSchema,
  type OnboardingDraftData,
  onboardingDraftDataSchema,
  type OnboardingStateResponse,
  type OnboardingStep,
  onboardingStepSchema,
  type SkippableOnboardingStep,
  skippableOnboardingStepSchema,
} from '@rms/api-contract';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { getApiErrorBody } from '@/lib/api-error';
import { saveOnboardingDraft, saveOnboardingDraftOnExit } from '@/services/api/requests/onboarding';

const AUTOSAVE_INTERVAL_MS = 15_000;
const LOCAL_WRITE_DEBOUNCE_MS = 300;

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'error';

export type DraftState = {
  currentStep: OnboardingStep | null;
  skippedSteps: SkippableOnboardingStep[];
  data: OnboardingDraftData;
  /** Server version this copy is based on. */
  version: number;
  /** When this copy last changed (ISO), locally or on the server. */
  updatedAt: string | null;
  /** Changed since the last successful server save. */
  dirty: boolean;
};

const localDraftSchema = z.object({
  currentStep: onboardingStepSchema.nullable(),
  skippedSteps: z.array(skippableOnboardingStepSchema),
  data: onboardingDraftDataSchema,
  version: z.number().int().nonnegative(),
  updatedAt: z.string().nullable(),
  dirty: z.boolean(),
});

export function localDraftKey(restaurantId: string): string {
  return `rms.onboarding.${restaurantId}.v1`;
}

function readLocal(key: string): DraftState | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (localDraftSchema.safeParse(JSON.parse(raw)).data ?? null) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, draft: DraftState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage full or blocked (private mode): the server copy is still the source of truth.
  }
}

export function clearLocalDraft(restaurantId: string): void {
  try {
    window.localStorage.removeItem(localDraftKey(restaurantId));
  } catch {
    // Nothing to clear.
  }
}

function fromServer(state: OnboardingStateResponse): DraftState {
  return {
    currentStep: state.currentStep,
    skippedSteps: state.skippedSteps,
    data: state.data,
    version: state.version,
    updatedAt: state.updatedAt,
    dirty: false,
  };
}

/**
 * Load rule: a local copy wins only if it has unsaved changes made on top of the same server
 * version, and is newer. Otherwise the server copy wins and replaces the local one.
 */
function initialDraft(key: string, server: OnboardingStateResponse): DraftState {
  const local = readLocal(key);
  const serverTime = server.updatedAt ? Date.parse(server.updatedAt) : 0;
  if (
    local?.dirty &&
    local.version === server.version &&
    local.updatedAt &&
    Date.parse(local.updatedAt) > serverTime
  ) {
    return local;
  }
  return fromServer(server);
}

export type OnboardingDraft = {
  draft: DraftState;
  saveStatus: SaveStatus;
  /** When the server last confirmed a save in this session (or the loaded draft's time). */
  lastSavedAt: Date | null;
  setStepData: <K extends keyof OnboardingDraftData>(
    step: K,
    value: NonNullable<OnboardingDraftData[K]>,
  ) => void;
  /** Records leaving `from` (skipped or done) for `to`, and saves right away. */
  advance: (from: OnboardingStep | null, to: OnboardingStep, skip?: boolean) => Promise<void>;
  /** Saves now if there are unsaved changes; resolves false if the save failed. */
  flush: () => Promise<boolean>;
};

/**
 * The owner's draft, kept in two places: the server (source of truth; saved on Continue/Skip,
 * every 15s while dirty, when the tab is hidden, and with keepalive as the page unloads) and
 * localStorage (every change, so nothing typed is lost if the network drops). A stale save gets a
 * 409 with the latest draft, which replaces this copy.
 */
export function useOnboardingDraft(server: OnboardingStateResponse): OnboardingDraft {
  const key = localDraftKey(server.restaurantId);
  const [draft, setDraft] = useState<DraftState>(() => initialDraft(key, server));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    server.updatedAt ? new Date(server.updatedAt) : null,
  );

  // The latest draft for callbacks that must not re-subscribe on every keystroke.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Bumped on every edit, so a save knows whether more changes arrived while it was in flight.
  const revisionRef = useRef(0);
  const inFlightRef = useRef<Promise<boolean> | null>(null);

  /** Updates the ref immediately so a save queued right after sees the new version. */
  const commit = useCallback((next: DraftState): void => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => writeLocal(key, draft), LOCAL_WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key, draft]);

  const save = useCallback(async (): Promise<boolean> => {
    const snapshot = draftRef.current;
    if (!snapshot.dirty) return true;
    const revision = revisionRef.current;
    setSaveStatus('saving');
    try {
      const saved = await saveOnboardingDraft({
        currentStep: snapshot.currentStep,
        skippedSteps: snapshot.skippedSteps,
        data: snapshot.data,
        version: snapshot.version,
      });
      const unchanged = revisionRef.current === revision;
      commit({
        ...draftRef.current,
        version: saved.version,
        updatedAt: unchanged ? saved.updatedAt : draftRef.current.updatedAt,
        dirty: !unchanged,
      });
      setLastSavedAt(new Date(saved.updatedAt));
      setSaveStatus('saved');
      return true;
    } catch (error) {
      const conflict = getApiErrorBody(error, onboardingDraftConflictErrorSchema);
      if (conflict) {
        revisionRef.current += 1;
        const latest = fromServer(conflict.draft);
        commit(latest);
        writeLocal(key, latest);
        setLastSavedAt(conflict.draft.updatedAt ? new Date(conflict.draft.updatedAt) : null);
        setSaveStatus('saved');
        toast.info('Setup was updated in another tab. We loaded the latest version.');
        return false;
      }
      setSaveStatus(axios.isAxiosError(error) && !error.response ? 'offline' : 'error');
      return false;
    }
  }, [key, commit]);

  const flush = useCallback(async (): Promise<boolean> => {
    // One save at a time: a second save would reuse the version the first is about to bump.
    while (inFlightRef.current) await inFlightRef.current;
    if (!draftRef.current.dirty) return true;
    const pending = save();
    inFlightRef.current = pending;
    try {
      return await pending;
    } finally {
      inFlightRef.current = null;
    }
  }, [save]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (draftRef.current.dirty) void flush();
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [flush]);

  useEffect(() => {
    function onVisibilityChange(): void {
      if (document.visibilityState === 'hidden') void flush();
    }
    // The page is going away: a normal request may be cancelled, so use keepalive.
    function onPageHide(): void {
      const current = draftRef.current;
      writeLocal(key, current);
      if (!current.dirty) return;
      saveOnboardingDraftOnExit({
        currentStep: current.currentStep,
        skippedSteps: current.skippedSteps,
        data: current.data,
        version: current.version,
      });
    }
    // Another tab in this browser changed the draft: follow it.
    function onStorage(event: StorageEvent): void {
      if (event.key !== key || !event.newValue) return;
      const incoming = readLocal(key);
      const current = draftRef.current;
      if (!incoming || incoming.updatedAt === current.updatedAt) return;
      if (
        incoming.version > current.version ||
        (incoming.updatedAt && Date.parse(incoming.updatedAt) > Date.parse(current.updatedAt ?? ''))
      ) {
        revisionRef.current += 1;
        commit(incoming);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('storage', onStorage);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('storage', onStorage);
    };
  }, [key, flush, commit]);

  // Push a local copy that won the load rule.
  useEffect(() => {
    if (draftRef.current.dirty) void flush();
  }, [flush]);

  const setStepData = useCallback<OnboardingDraft['setStepData']>(
    (step, value) => {
      revisionRef.current += 1;
      const current = draftRef.current;
      commit({
        ...current,
        data: { ...current.data, [step]: value },
        updatedAt: new Date().toISOString(),
        dirty: true,
      });
    },
    [commit],
  );

  const advance = useCallback<OnboardingDraft['advance']>(
    async (from, to, skip = false) => {
      revisionRef.current += 1;
      const current = draftRef.current;
      const skipped = new Set(current.skippedSteps);
      if (from && from !== 'review') {
        if (skip) skipped.add(from);
        else skipped.delete(from);
      }
      // The resume point only moves forward: editing an earlier step doesn't lose later progress.
      const furthest =
        current.currentStep &&
        ONBOARDING_STEPS.indexOf(current.currentStep) > ONBOARDING_STEPS.indexOf(to)
          ? current.currentStep
          : to;
      const deferred = current.data.deferred?.filter((step) => step !== from);
      const data =
        current.data.deferred && from && deferred?.length !== current.data.deferred.length
          ? { ...current.data, deferred }
          : current.data;
      const next: DraftState = {
        ...current,
        data,
        currentStep: furthest,
        skippedSteps: [...skipped],
        updatedAt: new Date().toISOString(),
        dirty: true,
      };
      commit(next);
      await flush();
    },
    [flush, commit],
  );

  return useMemo(
    () => ({ draft, saveStatus, lastSavedAt, setStepData, advance, flush }),
    [draft, saveStatus, lastSavedAt, setStepData, advance, flush],
  );
}
