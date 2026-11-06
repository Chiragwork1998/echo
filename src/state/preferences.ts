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

/**
 * The version of the words people agree to before their voice leaves the phone (D-005). Change what
 * the voice server or OpenAI does with a person's voice or words, and raise this: everyone is then
 * asked again before their next upload.
 *
 * 2: exact words by default (D-008), a second OpenAI step only for Hindi or Tidy my words, and live
 * words as a separate, plainly stated choice.
 */
export const VOICE_POLICY_VERSION = 2;

export type VoiceChoice = 'allowed' | 'voice_only';
/**
 * `live` is the person's separate agreement to Show words: that their voice is streamed to OpenAI as
 * they speak, which OpenAI may keep for up to 30 days. It only means anything beside `allowed`.
 */
export type VoiceConsent = { choice: VoiceChoice; version: number; live?: boolean };
/** What may happen to the next recording. 'unset' means ask first, and nothing is sent. */
export type VoiceStatus = 'unset' | VoiceChoice;

/** Voice is the default (D-006). The last mode the person chose is remembered. */
export type RememberedMode = 'speak' | 'write';
const DEFAULT_MODE: RememberedMode = 'speak';

type Preferences = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  /**
   * The version of the Pattern Cards consent the person agreed to, or null. Sending entries to be
   * read is separate from voice, and is asked before the first reading. It says that a person
   * agreed, never what they wrote. A new version of the wording asks again.
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

export async function hydratePreferences(
  db: SqlDb,
  serial: WriteQueue = (task) => task(),
): Promise<void> {
  const rows = await db.all<{ key: string; value: string }>(
    'SELECT key, value FROM preferences WHERE key IN (?, ?, ?, ?, ?, ?)',
    [THEME_KEY, PATTERNS_CONSENT_KEY, VOICE_KEY, MODE_KEY, TIDY_KEY, SHOWN_KEY],
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
  });
}
