import { create } from 'zustand';

import type { ThemePreference } from '@/design/theme';
import type { SqlDb, WriteQueue } from '@/storage/ports';

// Night is the owner's chosen default (docs/OWNER_DECISIONS.md, D-001).
const DEFAULT_THEME: ThemePreference = 'night';
const THEME_KEY = 'theme';

type Preferences = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

let persist: ((theme: ThemePreference) => Promise<unknown>) | null = null;

/** In memory until the gate has hydrated, and always on web, so a preview persists nothing. */
export const usePreferences = create<Preferences>((set) => ({
  theme: DEFAULT_THEME,
  setTheme: (theme) => {
    set({ theme });
    // A theme that fails to save costs one launch in the default. It must not disturb anything else.
    persist?.(theme).catch(() => undefined);
  },
}));

const isTheme = (value: string | undefined): value is ThemePreference =>
  value === 'day' || value === 'night' || value === 'automatic';

export async function hydratePreferences(
  db: SqlDb,
  serial: WriteQueue = (task) => task(),
): Promise<void> {
  const row = await db.first<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [
    THEME_KEY,
  ]);
  usePreferences.setState({ theme: isTheme(row?.value) ? row.value : DEFAULT_THEME });
  persist = (theme) =>
    serial(() =>
      db.run(
        `INSERT INTO preferences (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [THEME_KEY, theme],
      ),
    );
}

export function resetPreferences(): void {
  persist = null;
  usePreferences.setState({ theme: DEFAULT_THEME });
}
