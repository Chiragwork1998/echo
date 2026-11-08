import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';
import { ownWindowOpen } from '@/state/ownWindows';
import { reanimatedMock } from '@/testing/reanimatedMock';

import { Sheet, SheetAction, SheetButton } from './Sheet';

jest.mock('@/design/haptics');
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;
const timing = jest.spyOn(reanimatedMock, 'withTiming');

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

type Shape = { visible: boolean; animated?: boolean; contentKey?: string; label?: string };

const sheet = ({ visible, animated, contentKey, label = 'Words on the sheet' }: Shape) => (
  <ThemeProvider crossfade={false}>
    <SafeAreaInsetsContext.Provider value={NO_INSETS}>
      <Sheet
        visible={visible}
        animated={animated}
        contentKey={contentKey}
        onClose={() => undefined}
        testID="sheet"
        footer={<SheetButton label="Keep it" onPress={() => undefined} />}
      >
        <Text>{label}</Text>
      </Sheet>
    </SafeAreaInsetsContext.Provider>
  </ThemeProvider>
);

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

/** What the timing calls asked for, by duration: [duration, easing was given]. */
const durations = () =>
  timing.mock.calls.map((call) => ((call as unknown[])[1] as { duration: number }).duration);

beforeEach(() => {
  jest.useFakeTimers();
  reduced.mockReturnValue(false);
  timing.mockClear();
  jest.mocked(cue).mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Sheet arriving', () => {
  it('dims the page over 320 ms and settles the sheet over 520 ms, its fade in 240', async () => {
    await render(sheet({ visible: true }));
    expect(durations().sort((a, b) => a - b)).toEqual([240, 320, 520]);
  });

  it('is live from the first frame: the words and the button are there and can be pressed', async () => {
    await render(sheet({ visible: true }));
    expect(screen.getByText('Words on the sheet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeEnabled();
  });

  it('under Reduce Motion only fades, 180 ms, and never travels', async () => {
    reduced.mockReturnValue(true);
    await render(sheet({ visible: true }));
    expect(durations().filter((ms) => ms > 0)).toEqual([180, 180]);
    expect(durations()).not.toContain(520);
  });
});

describe('Sheet leaving', () => {
  it('stays for the length of its exit, and then unmounts', async () => {
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false }));
    // Still drawn, and still one of ECHO’s own windows, while it fades.
    const stage = () => screen.queryByTestId('sheet-stage', { includeHiddenElements: true });
    expect(stage()).toBeTruthy();
    expect(ownWindowOpen()).toBe(true);
    // It no longer answers to the sheet’s name, or to Back.
    expect(screen.queryByTestId('sheet')).toBeNull();
    await advance(279);
    expect(stage()).toBeTruthy();
    expect(ownWindowOpen()).toBe(true);
    await advance(1);
    expect(stage()).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });

  it('lifts away over 240 ms, with the scrim 260', async () => {
    const view = await render(sheet({ visible: true }));
    timing.mockClear();
    await view.rerender(sheet({ visible: false }));
    expect(durations().sort((a, b) => a - b)).toEqual([240, 240, 260]);
  });

  it('is hidden from everyone and cannot be touched while it leaves', async () => {
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false }));
    expect(screen.queryByRole('button', { name: 'Keep it' })).toBeNull();
    expect(
      screen.getByTestId('sheet-stage', { includeHiddenElements: true }).props.pointerEvents,
    ).toBe('none');
  });

  it('a re-open inside the exit cancels the unmount and carries on', async () => {
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false }));
    await advance(120);
    await view.rerender(sheet({ visible: true }));
    await advance(2000);
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeEnabled();
    expect(ownWindowOpen()).toBe(true);
  });

  it('is gone at once, with no animation at all, when told not to animate', async () => {
    const view = await render(sheet({ visible: true, animated: false }));
    expect(timing).not.toHaveBeenCalled();
    await view.rerender(sheet({ visible: false, animated: false }));
    expect(screen.queryByTestId('sheet-stage', { includeHiddenElements: true })).toBeNull();
    expect(ownWindowOpen()).toBe(false);
    expect(timing).not.toHaveBeenCalled();
  });

  it('under Reduce Motion fades out in 140 ms and is gone in 160', async () => {
    reduced.mockReturnValue(true);
    const view = await render(sheet({ visible: true }));
    timing.mockClear();
    await view.rerender(sheet({ visible: false }));
    expect(durations()).toEqual([140, 140]);
    await advance(159);
    expect(screen.queryByTestId('sheet-stage', { includeHiddenElements: true })).toBeTruthy();
    await advance(1);
    expect(screen.queryByTestId('sheet-stage', { includeHiddenElements: true })).toBeNull();
  });
});

describe('a sheet handing its words to the next', () => {
  it('stays open, counted once, and fades the new words in over 200 ms instead of rising again', async () => {
    const view = await render(sheet({ visible: true, contentKey: 'one', label: 'First' }));
    timing.mockClear();
    await view.rerender(sheet({ visible: true, contentKey: 'two', label: 'Second' }));
    expect(screen.getByText('Second')).toBeTruthy();
    expect(screen.queryByText('First')).toBeNull();
    expect(ownWindowOpen()).toBe(true);
    expect(durations()).toEqual([200]);
  });

  it('does not fade words that arrive with the sheet', async () => {
    const view = await render(sheet({ visible: false, contentKey: 'one' }));
    timing.mockClear();
    await view.rerender(sheet({ visible: true, contentKey: 'two' }));
    expect(durations().sort((a, b) => a - b)).toEqual([240, 320, 520]);
  });
});

describe('the sheet’s actions', () => {
  it('commit is felt once when the primary button confirms, and nothing for a quiet word', async () => {
    await render(
      <ThemeProvider crossfade={false}>
        <SafeAreaInsetsContext.Provider value={NO_INSETS}>
          <Sheet
            visible
            onClose={() => undefined}
            footer={
              <>
                <SheetButton label="Keep draft" onPress={() => undefined} />
                <SheetAction label="Cancel" onPress={() => undefined} />
              </>
            }
          >
            <Text>Words</Text>
          </Sheet>
        </SafeAreaInsetsContext.Provider>
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(cue).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep draft' }));
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('commit');
  });
});
