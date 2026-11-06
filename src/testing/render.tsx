import { render as baseRender } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ThemeProvider } from '@/design/theme';

/**
 * Renders inside the app's providers. Use this in every component and screen test. A theme change
 * is complete the moment it is made here: the cross-fade that carries it on a device is tested in
 * src/design/themeMotion.test.tsx.
 */
export function render(element: ReactElement) {
  return baseRender(<ThemeProvider crossfade={false}>{element}</ThemeProvider>);
}
