import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

import { themes, type EchoTheme, type EchoThemeName } from './themes';

/** Automatic (default) follows the device appearance; day/night are explicit. */
export type EchoThemeSetting = 'automatic' | 'day' | 'night';

export type EchoThemeContextValue = {
  /** Requested setting: `automatic` tracks the system color scheme. */
  setting: EchoThemeSetting;
  /** Concrete theme applied to the current screen. */
  name: EchoThemeName;
  theme: EchoTheme;
  /** Development-only entry point; see `setEchoTheme`. */
  setSetting: (setting: EchoThemeSetting) => void;
};

const EchoThemeContext = createContext<EchoThemeContextValue | null>(null);

type DevThemeSetter = (setting: EchoThemeSetting) => void;
type EchoDevGlobal = typeof globalThis & {
  __echoTheme?: { setTheme: DevThemeSetter };
};

let devThemeSetter: DevThemeSetter | null = null;

/**
 * Development-only setter with no visible control. From the dev console or a
 * debugger: `require('@/design/ThemeProvider').setEchoTheme('night')`, or
 * `globalThis.__echoTheme.setTheme('day')`. It is a no-op in production builds.
 */
export function setEchoTheme(setting: EchoThemeSetting): void {
  if (!__DEV__) {
    return;
  }
  devThemeSetter?.(setting);
}

function resolveThemeName(
  setting: EchoThemeSetting,
  systemScheme: ReturnType<typeof useColorScheme>,
): EchoThemeName {
  if (setting === 'day' || setting === 'night') {
    return setting;
  }
  return systemScheme === 'dark' ? 'night' : 'day';
}

export function EchoThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [setting, setSetting] = useState<EchoThemeSetting>('automatic');

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    devThemeSetter = setSetting;
    const devGlobal = globalThis as EchoDevGlobal;
    devGlobal.__echoTheme = { setTheme: setSetting };
    return () => {
      devThemeSetter = null;
      delete devGlobal.__echoTheme;
    };
  }, [setSetting]);

  const name = resolveThemeName(setting, systemScheme);

  const value = useMemo<EchoThemeContextValue>(
    () => ({ name, setSetting, setting, theme: themes[name] }),
    [name, setSetting, setting],
  );

  return <EchoThemeContext.Provider value={value}>{children}</EchoThemeContext.Provider>;
}

export function useEchoTheme(): EchoThemeContextValue {
  const value = useContext(EchoThemeContext);
  if (!value) {
    throw new Error('useEchoTheme must be used inside EchoThemeProvider');
  }
  return value;
}
