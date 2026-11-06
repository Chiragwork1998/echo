import { create } from 'zustand';

import type { ThemePreference } from '@/design/theme';
import type { SqlDb } from '@/storage/ports';

// Night is the owner's chosen default (docs/OWNER_DECISIONS.md, D-001).
const DEFAULT_THEME: ThemePreference = 'night';
const THEME_KEY = 'theme';

type Preferences = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

let database: SqlDb | null = null;

/** In memory until the gate has hydrated, and always on web, so a preview persists nothing. */
export const usePreferences = create<Preferences>((set) => ({
  theme: DEFAULT_THEME,
  setTheme: (theme) => {
    set({ theme });
    // A theme that fails to save costs one launch in the default. It must not disturb anything else.
    database
      ?.run(
        `INSERT INTO preferences (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [THEME_KEY, theme],
      )
      .catch(() => undefined);
  },
}));

const isTheme = (value: string | undefined): value is ThemePreference =>
  value === 'day' || value === 'night' || value === 'automatic';

export async function hydratePreferences(db: SqlDb): Promise<void> {
  const row = await db.first<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [
    THEME_KEY,
  ]);
  usePreferences.setState({ theme: isTheme(row?.value) ? row.value : DEFAULT_THEME });
  database = db;
}

export function resetPreferences(): void {
  database = null;
  usePreferences.setState({ theme: DEFAULT_THEME });
}
