import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { copy } from '@/content/copy';
import { goldenCopy } from '@/content/goldenCopy';
import type { HomeSummary } from '@/features/journal';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { DayHome } from './DayHome';
import { NightHome } from './NightHome';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  usePathname: () => '/home',
}));
jest.mock('@/features/become/morning', () => ({
  ...jest.requireActual('@/features/become/morning'),
  useMorning: () => false,
}));

const summary: HomeSummary = {
  status: 'ready',
  rhythm: {
    today: '2026-11-05',
    week: [],
    weekReflections: 0,
    currentStreak: 0,
    totalDays: 0,
    totalReflections: 0,
  },
  recent: null,
  continueDraft: null,
  error: null,
  refresh: jest.fn(async () => undefined),
};

/** The style a control is drawn with while a finger is down on it. */
const pressedStyle = async (name: string) => {
  await fireEvent(screen.getByRole('button', { name }), 'responderGrant', {
    persist: () => undefined,
    nativeEvent: { touches: [], pageX: 0, pageY: 0 },
  });
  await act(async () => void jest.advanceTimersByTime(100));
  const style = screen.getByRole('button', { name }).props.style as unknown;
  return StyleSheet.flatten(style as never) as { opacity?: number; transform?: unknown };
};

beforeAll(() => {
  jest.useFakeTimers();
});

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  usePreferences.setState({ theme: 'night' });
});
afterEach(() => jest.restoreAllMocks());

describe('Reduce Motion: pressed is dimmer, and nothing else', () => {
  it('in Night, for Write instead and Breathe first', async () => {
    await render(<NightHome summary={summary} />);
    await act(async () => undefined);
    for (const name of [goldenCopy.nightWriteInstead, 'Breathe first']) {
      const style = await pressedStyle(name);
      expect(style.opacity).toBe(0.8);
      expect(style.transform).toBeUndefined();
    }
  });

  it('in Day, for the Begin button and the two links', async () => {
    usePreferences.setState({ theme: 'day' });
    await render(<DayHome summary={summary} />);
    await act(async () => undefined);
    for (const name of [copy.home.begin, goldenCopy.dayWriteInstead, 'Breathe first']) {
      const style = await pressedStyle(name);
      expect(style.opacity).toBe(0.9);
      expect(style.transform).toBeUndefined();
    }
  });

  it('still shrinks a little when motion is allowed', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
    await render(<NightHome summary={summary} />);
    await act(async () => undefined);
    const style = await pressedStyle(goldenCopy.nightWriteInstead);
    expect(style.transform).toEqual([{ scale: 0.98 }]);
  });
});
