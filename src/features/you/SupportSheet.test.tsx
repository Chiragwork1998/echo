// "If you are struggling", from You. The walk (v10): the sheet and its scrim came onto the screen in
// one frame, with no rise. Its first drawn frame is its start, whenever the system draws its window.
import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/design/theme';
import { layOutSheet } from '@/testing/dialogs';
import { animationClock } from '@/testing/reanimatedMock';

import { SupportSheet } from './SupportSheet';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const element = (visible: boolean) => (
  <ThemeProvider crossfade={false}>
    <SafeAreaInsetsContext.Provider value={NO_INSETS}>
      <SupportSheet visible={visible} onClose={() => undefined} />
    </SafeAreaInsetsContext.Provider>
  </ThemeProvider>
);
type Look = { opacity?: number; transform?: { translateY: number }[] };
const look = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style) as Look;
const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  jest.useFakeTimers();
  animationClock.stepped = true;
});
afterEach(() => {
  animationClock.reset();
  jest.useRealTimers();
});

describe('the support sheet opening from You', () => {
  it('is drawn first as its start (invisible, low, the page undimmed) and then rises', async () => {
    const view = await render(element(false));
    await view.rerender(element(true));
    // The sheet is a tall one and the system is slow to put its window up: half a second.
    await advance(500);
    await view.rerender(element(true));
    expect(look('support-sheet-paper').opacity).toBe(0);
    expect(look('support-sheet-paper').transform?.[0]?.translateY).toBe(24);
    expect(look('support-sheet-scrim').opacity).toBe(0);

    await layOutSheet('support-sheet');
    await advance(16);
    await view.rerender(element(true));
    expect(look('support-sheet-paper').opacity).toBeLessThan(1);
    expect(look('support-sheet-scrim').opacity).toBeLessThan(0.3);
    await advance(700);
    await view.rerender(element(true));
    expect(look('support-sheet-paper').opacity).toBe(1);
    expect(look('support-sheet-paper').transform?.[0]?.translateY).toBe(0);
    expect(look('support-sheet-scrim').opacity).toBe(1);
  });
});
