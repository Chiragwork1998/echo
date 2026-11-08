import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { copy } from '@/content/copy';
import { ThemeProvider } from '@/design/theme';
import { useHomeSummary, type HomeSummary } from '@/features/journal';
import { usePreferences } from '@/state/preferences';

import { useStoneMemory } from '../today/stoneMemory';
import { HomeScreen } from './HomeScreen';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  usePathname: () => '/home',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/features/become/morning', () => ({
  ...jest.requireActual('@/features/become/morning'),
  useMorning: () => false,
}));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useHomeSummary: jest.fn(),
}));

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const summary: HomeSummary = {
  status: 'ready',
  rhythm: {
    today: '2026-11-05',
    week: WEEKDAYS.map((weekday, i) => ({
      day: `2026-11-0${2 + i}`,
      weekday,
      completed: i < 3,
      isToday: i === 3,
    })),
    weekReflections: 3,
    currentStreak: 3,
    totalDays: 3,
    totalReflections: 3,
  },
  recent: null,
  continueDraft: null,
  error: null,
  refresh: jest.fn(async () => undefined),
};

// A frame at a time, each in its own act, so that every draw is seen as it would be on a phone.
const wait = async (ms: number) => {
  for (let left = ms; left > 0; left -= 16) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(Math.min(16, left));
    });
  }
};
const night = () => screen.queryByTestId('home-begin-stone');
const day = () => screen.queryByRole('button', { name: copy.home.begin });
const dip = () =>
  (StyleSheet.flatten(screen.getByTestId('home-swap').props.style) as { opacity: number }).opacity;

beforeAll(() => {
  jest.useFakeTimers();
});
beforeEach(() => {
  useStoneMemory.getState().reset();
  jest.mocked(useHomeSummary).mockReturnValue(summary);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  usePreferences.setState({ theme: 'night', homeWelcomed: true });
});
afterEach(() => jest.restoreAllMocks());

describe('Home when the theme changes while it is in view', () => {
  it('fades the old composition out, changes over while nothing shows, and fades the new one in', async () => {
    await render(
      <ThemeProvider>
        <HomeScreen />
      </ThemeProvider>,
    );
    expect(night()).not.toBeNull();
    expect(dip()).toBe(1);

    await act(async () => usePreferences.getState().setTheme('day'));
    // The controls begin to move at 290 ms, which is the first draw after the swap was told to go
    // (the test double shows an animation's end on the next draw).
    await wait(320);
    // Nothing is cut: Night is still the composition, and it has gone.
    expect(night()).not.toBeNull();
    expect(day()).toBeNull();
    expect(dip()).toBe(0);

    await wait(160);
    // The plates are level, and Day has taken its place, while Home is still not showing.
    expect(night()).toBeNull();
    expect(day()).not.toBeNull();

    await wait(400);
    expect(dip()).toBe(1);
  });
});
