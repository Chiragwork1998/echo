import { useSyncExternalStore } from 'react';

import type { JournalMode } from './journal';

/**
 * In-progress writing session state for First Echo.
 *
 * Both drafts are kept in memory so switching between Write and Speak
 * preserves the other mode's work, and the timer starts on the first typed
 * character or the start of recording (`specs/SCREEN_SPECS.md` § 07).
 */

export type SessionState = {
  active: boolean;
  mode: JournalMode;
  text: string;
  audioSeconds: number;
  recording: boolean;
  /** Epoch milliseconds of the first keystroke or recording start. */
  startedAt: number | null;
  elapsedSeconds: number;
};

const INITIAL: SessionState = {
  active: false,
  mode: 'text',
  text: '',
  audioSeconds: 0,
  recording: false,
  startedAt: null,
  elapsedSeconds: 0,
};

/** Reflect is enabled after 10 non-space characters or 3 seconds of audio. */
export const REFLECT_CHARACTER_THRESHOLD = 10;
export const REFLECT_AUDIO_SECONDS_THRESHOLD = 3;

export function nonSpaceLength(value: string): number {
  return value.replace(/\s/g, '').length;
}

export function canReflect(state: SessionState): boolean {
  return (
    nonSpaceLength(state.text) >= REFLECT_CHARACTER_THRESHOLD ||
    state.audioSeconds >= REFLECT_AUDIO_SECONDS_THRESHOLD
  );
}

type Listener = () => void;

let session: SessionState = INITIAL;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: Partial<SessionState>) {
  session = { ...session, ...next };
  listeners.forEach((listener) => listener());
}

export function startSession(mode: JournalMode): void {
  publish({ ...INITIAL, active: true, mode });
}

export function endSession(): void {
  session = INITIAL;
  listeners.forEach((listener) => listener());
}

export function setSessionMode(mode: JournalMode): void {
  if (session.recording && mode === 'text') {
    publish({ mode, recording: false });
    return;
  }
  publish({ mode });
}

export function setSessionText(text: string): void {
  const startedAt = session.startedAt ?? (text.length > 0 ? Date.now() : null);
  publish({ text, startedAt });
}

export function startRecordingSession(): void {
  publish({ recording: true, startedAt: session.startedAt ?? Date.now() });
}

export function stopRecordingSession(audioSeconds: number): void {
  publish({ recording: false, audioSeconds, elapsedSeconds: session.elapsedSeconds });
}

/** Advances the session timer; called once per second while a session is live. */
export function tickSession(): void {
  if (session.startedAt === null) {
    return;
  }
  publish({ elapsedSeconds: Math.floor((Date.now() - session.startedAt) / 1000) });
}

export function getSession(): SessionState {
  return session;
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
