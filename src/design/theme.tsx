import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { qa } from '@/testing/qa';

import { tokens, type ThemeColors, type ThemeName } from './tokens';

export type ThemePreference = ThemeName | 'automatic';

type ThemeValue = {
  name: ThemeName;
  colors: ThemeColors;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('automatic');
  const automatic: ThemeName = system === 'dark' ? 'night' : 'day';
  const name = qa.theme ?? (preference === 'automatic' ? automatic : preference);

  const value = useMemo(
    () => ({ name, colors: tokens.color[name], preference, setPreference }),
    [name, preference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
