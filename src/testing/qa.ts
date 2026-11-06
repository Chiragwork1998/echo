import { Platform } from 'react-native';

import type { ThemeName } from '@/design/tokens';

// Visual-harness switches. EXPO_PUBLIC_QA is only set by scripts/visual/compare.mjs, so this is
// compiled out of real app bundles.
type Qa = { enabled: boolean; theme?: ThemeName; fixture?: string };

function read(): Qa {
  if (process.env.EXPO_PUBLIC_QA !== '1' || Platform.OS !== 'web') return { enabled: false };
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme');
  return {
    enabled: true,
    theme: theme === 'day' || theme === 'night' ? theme : undefined,
    fixture: params.get('fixture') ?? undefined,
  };
}

export const qa = read();
