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

export default function useNotificationFeedback(): {
  muted: boolean;
  toggleMuted: () => void;
  play: () => void;
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

  const play = useCallback((): void => {
    const audio = context.current;
    if (readMuted() || !audio || audio.state !== 'running') return;
    try {
      for (const offset of [0, 0.14]) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.frequency.value = 880;
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
