import { create } from 'zustand';

import type { ThemePreference } from '@/design/theme';
import type { SqlDb, WriteQueue } from '@/storage/ports';

// Night is the owner's chosen default (docs/OWNER_DECISIONS.md, D-001).
const DEFAULT_THEME: ThemePreference = 'night';
const THEME_KEY = 'theme';
const PATTERNS_CONSENT_KEY = 'patternsConsent';
const VOICE_KEY = 'voiceConsent';
const MODE_KEY = 'sessionMode';
const TIDY_KEY = 'tidyWords';
const SHOWN_KEY = 'wordsShown';
const VOLUME_KEY = 'volume';
const OPENS_KEY = 'bookOpens';
const PRACTICE_KEY = 'practice';
const WELCOMED_KEY = 'homeWelcomed';

/**
 * The version of the words people agree to before their voice leaves the phone (D-005). Change what
 * the voice server or OpenAI does with a person's voice or words, and raise this: everyone is then
 * asked again before their next upload.
 *
 * 2: exact words by default (D-008), a second OpenAI step only for Hindi or Tidy my words, and live
 * words as a separate, plainly stated choice.
 * 3: a spoken entry is set out in paragraphs at OpenAI once it is kept (D-017), so every spoken
 * entry's words go through the second step, not only Hindi and Tidy my words.
 */
export const VOICE_POLICY_VERSION = 3;

/**
 * The version of the one agreement under which ECHO's server reads entries: pattern cards, today's
 * echo, and setting out what a person writes (D-017). `patternsConsent` holds the version agreed to.
 * Change what is read or why, and raise this: each person is asked again the next time it is needed,
 * and never in the middle of journaling.
 *
 * patterns-1: pattern cards alone.
 */
export const READING_CONSENT_VERSION = 'reading-2';

/** Whether ECHO may send entries to be read, under the words the person agreed to. */
export const readingAgreed = (consent: string | null): boolean =>
  consent === READING_CONSENT_VERSION;

export type VoiceChoice = 'allowed' | 'voice_only';
/**
 * `live` is the person's separate agreement to Show words: that their voice is streamed to OpenAI as
 * they speak, which OpenAI may keep for up to 30 days. It only means anything beside `allowed`.
 */
export type VoiceConsent = { choice: VoiceChoice; version: number; live?: boolean };
/** What may happen to the next recording. 'unset' means ask first, and nothing is sent. */
export type VoiceStatus = 'unset' | VoiceChoice;

/** Breathe's settings, and Become's Arrive. Choices only: nothing a person felt or said. */
export type PracticePrefs = {
  /** The length last chosen for each practice, by its id, in minutes. */
  minutes: Record<string, number>;
  /** Heart's pace, in breaths a minute. */
  pace: number;
  /** The breath sound and the bells. Off, haptics carry the rhythm. */
  sound: boolean;
  /** The spoken lines. Off, they show as text. */
  voice: boolean;
  /** Practices begun, so that only the first carries the safety line. */
  begun: number;
  /** Mornings in a row Arrive was skipped, and the last of them. At three it is no longer offered. */
  arriveSkips: number;
  arriveSkipDay: string | null;
};

export const DEFAULT_PRACTICE: PracticePrefs = {
  minutes: {},
  pace: 5.5,
  sound: true,
  voice: true,
  begun: 0,
  arriveSkips: 0,
  arriveSkipDay: null,
};

/** Voice is the default (D-006). The last mode the person chose is remembered. */
export type RememberedMode = 'speak' | 'write';
const DEFAULT_MODE: RememberedMode = 'speak';

type Preferences = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  /**
   * The version of the reading agreement the person agreed to, or null (READING_CONSENT_VERSION).
   * Sending entries to be read is separate from voice, and is asked before it is first needed. It
   * says that a person agreed, never what they wrote. A new version of the wording asks again.
   */
  patternsConsent: string | null;
  setPatternsConsent: (version: string | null) => void;
  voiceConsent: VoiceConsent | null;
  /** Allowing keeps an agreement to live words made under the same policy. Anything else drops it. */
  setVoiceConsent: (choice: VoiceChoice) => void;
  /** Agrees to the voice going to OpenAI as it is spoken, and to the voice being sent at all. */
  allowLiveWords: () => void;
  /** Tidy my words (D-008): off by default, so a journal keeps the exact words. */
  tidyWords: boolean;
  setTidyWords: (on: boolean) => void;
  /** Show words while speaking. Off by default, and remembered. */
  wordsShown: boolean;
  setWordsShown: (on: boolean) => void;
  lastMode: RememberedMode;
  setLastMode: (mode: RememberedMode) => void;
  /** The volume of the book the person chose on the shelf (D-004). Null until they choose. */
  volume: string | null;
  setVolume: (volume: string) => void;
  /**
   * How many times the book has opened for them. The opening ritual plays in full for the first few
   * and then shortens (D-008), so a thing that is lovely once does not become friction every morning.
   */
  bookOpens: number;
  countBookOpen: () => void;
  practice: PracticePrefs;
  updatePractice: (patch: Partial<PracticePrefs>) => void;
  /**
   * Home has had its first look since onboarding. The welcome (the loop waking slowly, the first
   * cairn built) plays once, and Delete everything plays it again for whoever begins afresh.
   */
  homeWelcomed: boolean;
  setHomeWelcomed: (on: boolean) => void;
};

let persist: ((key: string, value: string | null) => Promise<unknown>) | null = null;

// A preference that fails to save costs one launch in the default, and for either consent it costs
// one more question, which is the safe way round. It must not disturb anything else.
const save = (key: string, value: string | null) =>
  void persist?.(key, value).catch(() => undefined);

/** In memory until the gate has hydrated, and always on web, so a preview persists nothing. */
export const usePreferences = create<Preferences>((set, get) => ({
  theme: DEFAULT_THEME,
  setTheme: (theme) => {
    set({ theme });
    save(THEME_KEY, theme);
  },
  patternsConsent: null,
  setPatternsConsent: (version) => {
    set({ patternsConsent: version });
    save(PATTERNS_CONSENT_KEY, version);
  },
  voiceConsent: null,
  setVoiceConsent: (choice) => {
    const before = get().voiceConsent;
    const live = choice === 'allowed' && before?.version === VOICE_POLICY_VERSION && before.live;
    const voiceConsent: VoiceConsent = {
      choice,
      version: VOICE_POLICY_VERSION,
      ...(live ? { live: true } : {}),
    };
    set({ voiceConsent });
    save(VOICE_KEY, JSON.stringify(voiceConsent));
  },
  allowLiveWords: () => {
    const voiceConsent: VoiceConsent = {
      choice: 'allowed',
      version: VOICE_POLICY_VERSION,
      live: true,
    };
    set({ voiceConsent });
    save(VOICE_KEY, JSON.stringify(voiceConsent));
  },
  tidyWords: false,
  setTidyWords: (tidyWords) => {
    set({ tidyWords });
    save(TIDY_KEY, tidyWords ? 'true' : null);
  },
  wordsShown: false,
  setWordsShown: (wordsShown) => {
    set({ wordsShown });
    save(SHOWN_KEY, wordsShown ? 'true' : null);
  },
  lastMode: DEFAULT_MODE,
  setLastMode: (lastMode) => {
    set({ lastMode });
    save(MODE_KEY, lastMode);
  },
  volume: null,
  setVolume: (volume) => {
    set({ volume });
    save(VOLUME_KEY, volume);
  },
  bookOpens: 0,
  countBookOpen: () =>
    set((state) => {
      const bookOpens = state.bookOpens + 1;
      save(OPENS_KEY, String(bookOpens));
      return { bookOpens };
    }),
  practice: DEFAULT_PRACTICE,
  updatePractice: (patch) => {
    const practice = { ...get().practice, ...patch };
    set({ practice });
    save(PRACTICE_KEY, JSON.stringify(practice));
  },
  homeWelcomed: false,
  setHomeWelcomed: (homeWelcomed) => {
    set({ homeWelcomed });
    save(WELCOMED_KEY, homeWelcomed ? 'true' : null);
  },
}));

/**
 * Whether a voice may be sent. A choice made under an older policy no longer counts, so it reads as
 * unset and the person is asked again.
 */
export function voiceStatus(consent: VoiceConsent | null): VoiceStatus {
  if (!consent || consent.version !== VOICE_POLICY_VERSION) return 'unset';
  return consent.choice;
}

export const useVoiceStatus = (): VoiceStatus =>
  usePreferences((state) => voiceStatus(state.voiceConsent));

export const useReadingAgreed = (): boolean =>
  usePreferences((state) => readingAgreed(state.patternsConsent));

/**
 * Whether a take may be streamed while it is spoken: the person allowed their voice to be sent, and
 * separately agreed to live words, under the current policy. Without both, nothing is streamed.
 */
export const liveAllowed = (consent: VoiceConsent | null): boolean =>
  voiceStatus(consent) === 'allowed' && consent?.live === true;

export const useLiveAllowed = (): boolean =>
  usePreferences((state) => liveAllowed(state.voiceConsent));

const isTheme = (value: string | undefined): value is ThemePreference =>
  value === 'day' || value === 'night' || value === 'automatic';

function parseConsent(value: string | undefined): VoiceConsent | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { choice, version, live } = parsed as Record<string, unknown>;
    if ((choice !== 'allowed' && choice !== 'voice_only') || typeof version !== 'number') {
      return null;
    }
    return { choice, version, ...(live === true ? { live: true } : {}) };
  } catch {
    return null;
  }
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** Anything unreadable falls back to the default, one setting at a time. */
export function parsePractice(value: string | undefined): PracticePrefs {
  if (!value) return DEFAULT_PRACTICE;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PRACTICE;
    const raw = parsed as Record<string, unknown>;
    const minutes: Record<string, number> = {};
    if (typeof raw.minutes === 'object' && raw.minutes !== null) {
      for (const [id, length] of Object.entries(raw.minutes as Record<string, unknown>)) {
        if (typeof length === 'number' && Number.isFinite(length) && length > 0)
          minutes[id] = length;
      }
    }
    const pace = typeof raw.pace === 'number' && raw.pace >= 4 && raw.pace <= 7 ? raw.pace : null;
    return {
      minutes,
      pace: pace ?? DEFAULT_PRACTICE.pace,
      sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULT_PRACTICE.sound,
      voice: typeof raw.voice === 'boolean' ? raw.voice : DEFAULT_PRACTICE.voice,
      begun: count(raw.begun),
      arriveSkips: count(raw.arriveSkips),
      arriveSkipDay: typeof raw.arriveSkipDay === 'string' ? raw.arriveSkipDay : null,
    };
  } catch {
    return DEFAULT_PRACTICE;
  }
}

export async function hydratePreferences(
  db: SqlDb,
  serial: WriteQueue = (task) => task(),
): Promise<void> {
  const rows = await db.all<{ key: string; value: string }>(
    'SELECT key, value FROM preferences WHERE key IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      THEME_KEY,
      PATTERNS_CONSENT_KEY,
      VOICE_KEY,
      MODE_KEY,
      TIDY_KEY,
      SHOWN_KEY,
      VOLUME_KEY,
      OPENS_KEY,
      PRACTICE_KEY,
      WELCOMED_KEY,
    ],
  );
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const theme = stored.get(THEME_KEY);
  const mode = stored.get(MODE_KEY);
  usePreferences.setState({
    theme: isTheme(theme) ? theme : DEFAULT_THEME,
    patternsConsent: stored.get(PATTERNS_CONSENT_KEY) ?? null,
    voiceConsent: parseConsent(stored.get(VOICE_KEY)),
    lastMode: mode === 'write' || mode === 'speak' ? mode : DEFAULT_MODE,
    tidyWords: stored.get(TIDY_KEY) === 'true',
    wordsShown: stored.get(SHOWN_KEY) === 'true',
    volume: stored.get(VOLUME_KEY) ?? null,
    bookOpens: Math.max(0, Math.floor(Number(stored.get(OPENS_KEY))) || 0),
    practice: parsePractice(stored.get(PRACTICE_KEY)),
    homeWelcomed: stored.get(WELCOMED_KEY) === 'true',
  });
  persist = (key, value) =>
    serial(() =>
      value === null
        ? db.run('DELETE FROM preferences WHERE key = ?', [key])
        : db.run(
            `INSERT INTO preferences (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
            [key, value],
          ),
    );
}

export function resetPreferences(): void {
  persist = null;
  usePreferences.setState({
    theme: DEFAULT_THEME,
    patternsConsent: null,
    voiceConsent: null,
    lastMode: DEFAULT_MODE,
    tidyWords: false,
    wordsShown: false,
    volume: null,
    bookOpens: 0,
    practice: DEFAULT_PRACTICE,
    homeWelcomed: false,
  });
}
