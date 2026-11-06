import { create } from 'zustand';

import type { ThemePreference } from '@/design/theme';
import type { SqlDb, WriteQueue } from '@/storage/ports';

// Night is the owner's chosen default (docs/OWNER_DECISIONS.md, D-001).
const DEFAULT_THEME: ThemePreference = 'night';
const THEME_KEY = 'theme';
const PATTERNS_CONSENT_KEY = 'patternsConsent';
const VOICE_KEY = 'voiceConsent';
const MODE_KEY = 'sessionMode';

/**
 * The version of the words people agree to before their voice leaves the phone (D-005). Change what
 * the voice server or OpenAI does with a person's voice or words, and raise this: everyone is then
 * asked again before their next upload.
 */
export const VOICE_POLICY_VERSION = 1;

export type VoiceChoice = 'allowed' | 'voice_only';
export type VoiceConsent = { choice: VoiceChoice; version: number };
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
  setVoiceConsent: (choice: VoiceChoice) => void;
  lastMode: RememberedMode;
  setLastMode: (mode: RememberedMode) => void;
};

let persist: ((key: string, value: string | null) => Promise<unknown>) | null = null;

// A preference that fails to save costs one launch in the default, and for either consent it costs
// one more question, which is the safe way round. It must not disturb anything else.
const save = (key: string, value: string | null) =>
  void persist?.(key, value).catch(() => undefined);

/** In memory until the gate has hydrated, and always on web, so a preview persists nothing. */
export const usePreferences = create<Preferences>((set) => ({
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
    const voiceConsent = { choice, version: VOICE_POLICY_VERSION };
    set({ voiceConsent });
    save(VOICE_KEY, JSON.stringify(voiceConsent));
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

const isTheme = (value: string | undefined): value is ThemePreference =>
  value === 'day' || value === 'night' || value === 'automatic';

function parseConsent(value: string | undefined): VoiceConsent | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { choice, version } = parsed as Record<string, unknown>;
    if ((choice !== 'allowed' && choice !== 'voice_only') || typeof version !== 'number') {
      return null;
    }
    return { choice, version };
  } catch {
    return null;
  }
}

export async function hydratePreferences(
  db: SqlDb,
  serial: WriteQueue = (task) => task(),
): Promise<void> {
  const rows = await db.all<{ key: string; value: string }>(
    'SELECT key, value FROM preferences WHERE key IN (?, ?, ?, ?)',
    [THEME_KEY, PATTERNS_CONSENT_KEY, VOICE_KEY, MODE_KEY],
  );
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const theme = stored.get(THEME_KEY);
  const mode = stored.get(MODE_KEY);
  usePreferences.setState({
    theme: isTheme(theme) ? theme : DEFAULT_THEME,
    patternsConsent: stored.get(PATTERNS_CONSENT_KEY) ?? null,
    voiceConsent: parseConsent(stored.get(VOICE_KEY)),
    lastMode: mode === 'write' || mode === 'speak' ? mode : DEFAULT_MODE,
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
  });
}
