import { render as baseRender } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ThemeProvider } from '@/design/theme';

/** Renders inside the app's providers. Use this in every component and screen test. */
export function render(element: ReactElement) {
  return baseRender(<ThemeProvider>{element}</ThemeProvider>);
}
