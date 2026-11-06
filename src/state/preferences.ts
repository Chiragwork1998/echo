import { create } from 'zustand';

import type { ThemePreference } from '@/design/theme';
import type { SqlDb, WriteQueue } from '@/storage/ports';

// Night is the owner's chosen default (docs/OWNER_DECISIONS.md, D-001).
const DEFAULT_THEME: ThemePreference = 'night';
const THEME_KEY = 'theme';
const PATTERNS_CONSENT_KEY = 'patternsConsent';

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
};

let persist: ((key: string, value: string | null) => Promise<unknown>) | null = null;

/** In memory until the gate has hydrated, and always on web, so a preview persists nothing. */
export const usePreferences = create<Preferences>((set) => ({
  theme: DEFAULT_THEME,
  setTheme: (theme) => {
    set({ theme });
    // A theme that fails to save costs one launch in the default. It must not disturb anything else.
    persist?.(THEME_KEY, theme).catch(() => undefined);
  },
  patternsConsent: null,
  setPatternsConsent: (version) => {
    set({ patternsConsent: version });
    // A consent that fails to save is asked for again next launch, which is the safe way to fail.
    persist?.(PATTERNS_CONSENT_KEY, version).catch(() => undefined);
  },
}));

const isTheme = (value: string | undefined): value is ThemePreference =>
  value === 'day' || value === 'night' || value === 'automatic';

export async function hydratePreferences(
  db: SqlDb,
  serial: WriteQueue = (task) => task(),
): Promise<void> {
  const rows = await db.all<{ key: string; value: string }>(
    'SELECT key, value FROM preferences WHERE key IN (?, ?)',
    [THEME_KEY, PATTERNS_CONSENT_KEY],
  );
  const stored = (key: string) => rows.find((row) => row.key === key)?.value;
  const theme = stored(THEME_KEY);
  usePreferences.setState({
    theme: isTheme(theme) ? theme : DEFAULT_THEME,
    patternsConsent: stored(PATTERNS_CONSENT_KEY) ?? null,
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
  usePreferences.setState({ theme: DEFAULT_THEME, patternsConsent: null });
}
