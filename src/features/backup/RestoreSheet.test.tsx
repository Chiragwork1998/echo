import { render as baseRender, screen } from '@testing-library/react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/design/theme';

import { restoreCopy } from './restoreCopy';
import { RestoreSheet, typeset } from './RestoreSheet';
import type { RestoreState } from './useRestore';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

const sheet = (state: RestoreState, visible = true) => (
  <ThemeProvider crossfade={false}>
    <SafeAreaInsetsContext.Provider value={NO_INSETS}>
      <RestoreSheet
        state={state}
        visible={visible}
        thisYear={2026}
        onRestore={() => undefined}
        onChoose={() => undefined}
        onClose={() => undefined}
      />
    </SafeAreaInsetsContext.Provider>
  </ThemeProvider>
);

const failed: RestoreState = { kind: 'failed', problem: 'unavailable' };
const message = typeset(restoreCopy.failed.unavailable);

describe('RestoreSheet leaving', () => {
  it('goes on saying what it said, with its button, while it fades, rather than shrinking to its title', async () => {
    const view = await baseRender(sheet(failed));
    expect(screen.getByText(message)).toBeTruthy();
    // Close, Not now and Done all set the state to idle at once; the sheet is still on screen.
    await view.rerender(sheet({ kind: 'idle' }));
    expect(screen.getByText(message, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: restoreCopy.close, hidden: true })).toBeTruthy();
  });

  it('shows a fresh result in place of the one it held', async () => {
    const view = await baseRender(sheet(failed));
    await view.rerender(sheet({ kind: 'idle' }));
    await view.rerender(sheet({ kind: 'failed', problem: 'newer' }));
    expect(screen.getByText(typeset(restoreCopy.failed.newer))).toBeTruthy();
    expect(screen.queryByText(message, { includeHiddenElements: true })).toBeNull();
  });

  it('says nothing at all when it never had anything to say', async () => {
    await baseRender(sheet({ kind: 'idle' }, false));
    expect(screen.queryByText(message, { includeHiddenElements: true })).toBeNull();
  });
});
