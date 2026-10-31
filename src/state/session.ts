import { useSyncExternalStore } from "react";

import type { JournalEntry, JournalMode } from "./journal";
import type { MoodSelection } from "./onboardingSelections";
import { FIRST_PROMPT, type JournalPrompt } from "@/features/journal/prompts";

/**
 * In-progress writing session state for First Echo.
 *
 * Both drafts are kept in memory so switching between Write and Speak
 * preserves the other mode's work, and the timer starts on the first typed
 * character or the start of recording (`specs/SCREEN_SPECS.md` § 07).
 */

export type SessionState = {
  active: boolean;
  prompt: JournalPrompt;
  mood: MoodSelection | null;
  audioPath: string | null;
  baseSeconds: number;
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
  prompt: FIRST_PROMPT,
  mood: null,
  audioPath: null,
  baseSeconds: 0,
  mode: "text",
  text: "",
  audioSeconds: 0,
  recording: false,
  startedAt: null,
  elapsedSeconds: 0,
};

/** Reflect is enabled after 10 non-space characters or 3 seconds of audio. */
export const REFLECT_CHARACTER_THRESHOLD = 10;
export const REFLECT_AUDIO_SECONDS_THRESHOLD = 3;

export function nonSpaceLength(value: string): number {
  return value.replace(/\s/g, "").length;
}

export function canReflect(state: SessionState): boolean {
  if (state.recording) return false;
  return state.mode === "text"
    ? nonSpaceLength(state.text) >= REFLECT_CHARACTER_THRESHOLD
    : state.audioSeconds >= REFLECT_AUDIO_SECONDS_THRESHOLD &&
        Boolean(state.audioPath);
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

export function startSession(
  mode: JournalMode,
  prompt: JournalPrompt = FIRST_PROMPT,
  mood: MoodSelection | null = null,
  draft?: JournalEntry | null,
): void {
  publish({
    ...INITIAL,
    active: true,
    mode: draft?.mode ?? mode,
    prompt: draft
      ? {
          id: draft.promptId,
          text: draft.promptTextSnapshot,
          opening: prompt.opening,
        }
      : prompt,
    mood: draft?.moodBefore ?? mood,
    text: draft?.body ?? "",
    audioPath: draft?.audioPath ?? null,
    audioSeconds: draft?.audioPath ? draft.durationSeconds : 0,
    baseSeconds: draft?.durationSeconds ?? 0,
    elapsedSeconds: draft?.durationSeconds ?? 0,
  });
}

export function setSessionAudio(audioPath: string, audioSeconds: number): void {
  publish({ audioPath, audioSeconds, recording: false });
}

export function endSession(): void {
  session = INITIAL;
  listeners.forEach((listener) => listener());
}

export function setSessionMode(mode: JournalMode): void {
  if (session.recording) return;
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
  publish({
    recording: false,
    audioSeconds,
    elapsedSeconds: session.elapsedSeconds,
  });
}

/** Advances the session timer; called once per second while a session is live. */
export function tickSession(): void {
  if (session.startedAt === null) {
    return;
  }
  publish({
    elapsedSeconds:
      session.baseSeconds + Math.floor((Date.now() - session.startedAt) / 1000),
  });
}

export function getSession(): SessionState {
  return session;
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
