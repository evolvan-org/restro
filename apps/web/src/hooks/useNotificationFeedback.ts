'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'restro.notifications.muted';
const CHANGE_EVENT = 'restro:notification-mute';
let fallbackMuted = false;
let storageWriteFailed = false;

function readMuted(): boolean {
  if (storageWriteFailed) return fallbackMuted;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return fallbackMuted;
  }
}

function subscribe(listener: () => void): () => void {
  const storageListener = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY || event.key === null) {
      storageWriteFailed = false;
      listener();
    }
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', storageListener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', storageListener);
  };
}

/**
 * Chime patterns: `bell` (two short 880 Hz beeps, existing alerts), `order` (rising two-tone for a
 * new guest QR order) and `escalation` (the order chime played twice, for managers). Vibration
 * accompanies `order` and `escalation` where the device supports it.
 */
export type ChimePattern = 'bell' | 'order' | 'escalation';

const PATTERNS: Record<ChimePattern, { offset: number; frequency: number }[]> = {
  bell: [
    { offset: 0, frequency: 880 },
    { offset: 0.14, frequency: 880 },
  ],
  order: [
    { offset: 0, frequency: 660 },
    { offset: 0.16, frequency: 990 },
  ],
  escalation: [
    { offset: 0, frequency: 660 },
    { offset: 0.16, frequency: 990 },
    { offset: 0.5, frequency: 660 },
    { offset: 0.66, frequency: 990 },
  ],
};

const VIBRATION: Record<ChimePattern, number[] | null> = {
  bell: null,
  order: [200, 100, 200],
  escalation: [200, 100, 200, 100, 400],
};

export default function useNotificationFeedback(): {
  muted: boolean;
  toggleMuted: () => void;
  play: (pattern?: ChimePattern) => void;
} {
  const muted = useSyncExternalStore(subscribe, readMuted, () => false);
  const context = useRef<AudioContext | null>(null);

  useEffect(() => {
    const unlock = (): void => {
      try {
        if (!context.current && window.AudioContext) context.current = new AudioContext();
        void context.current?.resume().catch(() => undefined);
      } catch {
        // Audio is best effort; the bell remains usable when a browser blocks it.
      }
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      void context.current?.close().catch(() => undefined);
      context.current = null;
    };
  }, []);

  const toggleMuted = useCallback((): void => {
    fallbackMuted = !readMuted();
    try {
      localStorage.setItem(STORAGE_KEY, fallbackMuted ? '1' : '0');
      storageWriteFailed = false;
    } catch {
      storageWriteFailed = true;
      // Keep the control working in memory when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const play = useCallback((pattern: ChimePattern = 'bell'): void => {
    if (readMuted()) return;
    const vibration = VIBRATION[pattern];
    if (vibration && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(vibration);
      } catch {
        // Vibration is best effort.
      }
    }
    const audio = context.current;
    if (!audio || audio.state !== 'running') return;
    try {
      for (const { offset, frequency } of PATTERNS[pattern]) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.frequency.value = frequency;
        const start = audio.currentTime + offset;
        gain.gain.setValueAtTime(0.1, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
        oscillator.start(start);
        oscillator.stop(start + 0.1);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      }
    } catch {
      // Unsupported/blocked audio must not prevent reading notifications.
    }
  }, []);

  return { muted, toggleMuted, play };
}
