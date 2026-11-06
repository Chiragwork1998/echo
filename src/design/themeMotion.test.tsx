import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { usePreferences } from '@/state/preferences';

import { parseColor } from './mixColor';
import { ThemeProvider, useTheme } from './theme';
import { holdTheme } from './themeHold';
import { tokens } from './tokens';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const mount = () => renderHook(() => useTheme(), { wrapper: ThemeProvider });
const wait = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
const set = (theme: 'day' | 'night' | 'automatic') =>
  act(async () => usePreferences.getState().setTheme(theme));

beforeAll(() => {
  jest.useFakeTimers();
});

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.mocked(useColorScheme).mockReturnValue('light');
  usePreferences.setState({ theme: 'night' });
});

afterEach(() => jest.restoreAllMocks());

describe('the controls when the theme changes', () => {
  it('sit exactly on the theme’s own tokens at rest', async () => {
    const view = await mount();
    expect(view.result.current.name).toBe('night');
    expect(view.result.current.colors).toBe(tokens.color.night);
  });

  it('ask for the new plates at once, and hold the old controls for 290 ms', async () => {
    const view = await mount();
    await set('day');
    expect(view.result.current.target).toBe('day');
    await wait(289);
    expect(view.result.current.name).toBe('night');
    expect(view.result.current.colors).toBe(tokens.color.night);
  });

  it('then move their colours over 320 ms, and land exactly on the new tokens', async () => {
    const view = await mount();
    await set('day');
    await wait(290 + 160);
    expect(view.result.current.name).toBe('day');
    const mid = parseColor(view.result.current.colors.textInk);
    const from = parseColor(tokens.color.night.textInk);
    const to = parseColor(tokens.color.day.textInk);
    expect(view.result.current.colors).not.toBe(tokens.color.day);
    for (const i of [0, 1, 2] as const) {
      const lo = Math.min(from?.[i] ?? 0, to?.[i] ?? 0);
      const hi = Math.max(from?.[i] ?? 0, to?.[i] ?? 0);
      expect(mid?.[i]).toBeGreaterThanOrEqual(lo);
      expect(mid?.[i]).toBeLessThanOrEqual(hi);
    }
    await wait(200);
    expect(view.result.current.colors).toBe(tokens.color.day);
  });

  it('go in 180 ms and no more with Reduce Motion, with no wait before it', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const view = await mount();
    await act(async () => undefined);
    await set('day');
    await wait(180);
    expect(view.result.current.name).toBe('day');
    await wait(20);
    expect(view.result.current.colors).toBe(tokens.color.day);
  });

  it('start from wherever they have reached when the theme changes again', async () => {
    const view = await mount();
    await set('day');
    await wait(290 + 160);
    await set('night');
    await wait(290 + 320 + 50);
    expect(view.result.current.name).toBe('night');
    expect(view.result.current.colors).toBe(tokens.color.night);
  });
});

describe('the theme during a writing session', () => {
  it('waits until the session closes, whoever asks for the change', async () => {
    const view = await mount();
    const release = holdTheme();
    await set('day');
    expect(view.result.current.target).toBe('night');
    await wait(2000);
    expect(view.result.current.name).toBe('night');
    expect(view.result.current.colors).toBe(tokens.color.night);
    // The choice itself is kept at once, so You shows what was picked.
    expect(view.result.current.preference).toBe('day');

    await act(async () => release());
    expect(view.result.current.target).toBe('day');
    await wait(290 + 320 + 50);
    expect(view.result.current.name).toBe('day');
  });

  it('holds back the phone’s own change of appearance too', async () => {
    await set('automatic');
    jest.mocked(useColorScheme).mockReturnValue('dark');
    const view = await mount();
    expect(view.result.current.target).toBe('night');
    const release = holdTheme();
    jest.mocked(useColorScheme).mockReturnValue('light');
    await view.rerender(undefined);
    expect(view.result.current.target).toBe('night');
    await act(async () => release());
    expect(view.result.current.target).toBe('day');
  });

  it('stays held until every session has let go, and a second release changes nothing', async () => {
    const view = await mount();
    const first = holdTheme();
    const second = holdTheme();
    await set('day');
    await act(async () => first());
    await act(async () => first());
    expect(view.result.current.target).toBe('night');
    await act(async () => second());
    expect(view.result.current.target).toBe('day');
  });
});
