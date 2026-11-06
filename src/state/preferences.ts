import { create } from 'zustand';

import type { ThemePreference } from '@/design/theme';
import type { SqlDb, WriteQueue } from '@/storage/ports';

// Night is the owner's chosen default (docs/OWNER_DECISIONS.md, D-001).
const DEFAULT_THEME: ThemePreference = 'night';
const THEME_KEY = 'theme';
const VOLUME_KEY = 'volume';

type Preferences = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  /** The volume of the book the person chose on the shelf (D-004). Empty until they choose. */
  volume: string | null;
  setVolume: (volume: string) => void;
};

let persist: ((key: string, value: string) => Promise<unknown>) | null = null;

/** In memory until the gate has hydrated, and always on web, so a preview persists nothing. */
export const usePreferences = create<Preferences>((set) => ({
  theme: DEFAULT_THEME,
  setTheme: (theme) => {
    set({ theme });
    // A theme that fails to save costs one launch in the default. It must not disturb anything else.
    persist?.(THEME_KEY, theme).catch(() => undefined);
  },
  volume: null,
  setVolume: (volume) => {
    set({ volume });
    persist?.(VOLUME_KEY, volume).catch(() => undefined);
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
  const chosen = await db.first<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [
    VOLUME_KEY,
  ]);
  usePreferences.setState({
    theme: isTheme(row?.value) ? row.value : DEFAULT_THEME,
    volume: chosen?.value ?? null,
  });
  persist = (key, value) =>
    serial(() =>
      db.run(
        `INSERT INTO preferences (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [key, value],
      ),
    );
}

export function resetPreferences(): void {
  persist = null;
  usePreferences.setState({ theme: DEFAULT_THEME, volume: null });
}
