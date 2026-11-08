import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { usePreferences } from '@/state/preferences';

import { ThemeProvider, useTheme } from './theme';
import { holdTheme } from './themeHold';
import { useThemeSwap } from './useThemeSwap';

/** What the swap read, in each draw, beside the theme the controls were drawn in. */
let log: { name: string; swap: number }[] = [];
function Probe() {
  const swap = useThemeSwap();
  const { name } = useTheme();
  log.push({ name, swap: swap.get() });
  return null;
}

// A frame at a time, each in its own act, so that every draw is seen as it would be on a phone.
const wait = async (ms: number) => {
  for (let left = ms; left > 0; left -= 16) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(Math.min(16, left));
    });
  }
};
const set = (theme: 'day' | 'night') => act(async () => usePreferences.getState().setTheme(theme));
const mount = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
const last = () => log[log.length - 1];

beforeAll(() => {
  jest.useFakeTimers();
});
beforeEach(() => {
  log = [];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  usePreferences.setState({ theme: 'night' });
});
afterEach(() => jest.restoreAllMocks());

describe('the swap of a screen’s two compositions', () => {
  it('is whole at rest', async () => {
    await mount();
    expect(last()).toEqual({ name: 'night', swap: 1 });
  });

  it('is gone before the composition changes over, and comes back after', async () => {
    await mount();
    await set('day');
    await wait(100);
    expect(last()?.name).toBe('night');
    expect(last()?.swap).toBe(0);
    await wait(600);
    const flipped = log.findIndex((draw) => draw.name === 'day');
    expect(flipped).toBeGreaterThan(0);
    // The first draw in the new composition is the one that reads nothing showing.
    expect(log[flipped]?.swap).toBe(0);
    // Every draw in the old composition, once the swap had been told to go, read nothing showing.
    // (The draw that tells it is the one before: it was still whole when it was drawn.)
    expect(log.slice(2, flipped).every((draw) => draw.swap === 0)).toBe(true);
    await wait(100);
    expect(last()).toMatchObject({ name: 'day', swap: 1 });
  });

  it('changes over at 450 ms, when the plates are level', async () => {
    await mount();
    await set('day');
    await wait(440);
    expect(last()?.name).toBe('night');
    await wait(40);
    expect(last()?.name).toBe('day');
  });

  it('is 90 ms out and 90 ms in with Reduce Motion, 180 ms in all', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    await mount();
    await act(async () => undefined);
    await set('day');
    await wait(80);
    expect(last()).toMatchObject({ name: 'night', swap: 0 });
    await wait(30);
    // The draw that changes over to Day read nothing showing, and the draws after it read it whole.
    expect(log.find((draw) => draw.name === 'day')?.swap).toBe(0);
    await wait(100);
    expect(last()).toMatchObject({ name: 'day', swap: 1 });
  });

  it('does not move at all while a session holds the theme', async () => {
    await mount();
    let release = () => {};
    await act(async () => {
      release = holdTheme();
    });
    await set('day');
    await wait(1000);
    expect(log.every((draw) => draw.name === 'night' && draw.swap === 1)).toBe(true);
    await act(async () => release());
  });
});
