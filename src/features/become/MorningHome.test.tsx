import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions } from 'react-native';

import { copy } from '@/content/copy';
import { breatheCopy } from '@/features/breathe/breatheCopy';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { useHomeSummary, type HomeSummary } from '@/features/journal';
import { DEFAULT_PRACTICE, usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { becomeCopy } from './becomeCopy';

let mockMorning = true;

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));
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
  useMorning: () => mockMorning,
}));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useHomeSummary: jest.fn(),
}));

const summary: HomeSummary = {
  status: 'ready',
  rhythm: {
    today: '2026-11-08',
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

beforeEach(() => {
  jest.clearAllMocks();
  mockMorning = true;
  jest.mocked(useHomeSummary).mockReturnValue(summary);
  usePreferences.setState({ theme: 'night', practice: DEFAULT_PRACTICE });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
});

describe('Today in the morning', () => {
  it('asks who the person will be, on Night', async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole('header', { name: becomeCopy.question })).toBeTruthy();
    expect(screen.queryByText(copy.home.nightHeadline)).toBeNull();
  });

  it('opens the morning session with Arrive from Begin and from Write instead', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /^Begin\./ }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/home/session',
      params: { mode: 'voice', prompt: 'become', arrive: '1' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Write instead' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/home/session',
      params: { mode: 'write', prompt: 'become', arrive: '1' },
    });
  });

  it('stops offering Arrive after three mornings skipped in a row', async () => {
    usePreferences.setState({ practice: { ...DEFAULT_PRACTICE, arriveSkips: 3 } });
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /^Begin\./ }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/home/session',
      params: { mode: 'voice', prompt: 'become' },
    });
  });

  it('asks the same question in Day’s card', async () => {
    usePreferences.setState({ theme: 'day' });
    await render(<HomeScreen />);
    expect(screen.getByText(becomeCopy.question)).toBeTruthy();
    expect(screen.queryByText(copy.home.prompt)).toBeNull();
  });
});

describe('Breathe first', () => {
  it.each(['night', 'day'] as const)(
    'sits beside Write instead on %s, and opens Breathe',
    async (theme) => {
      mockMorning = false;
      usePreferences.setState({ theme });
      await render(<HomeScreen />);
      expect(screen.getByRole('button', { name: 'Write instead' })).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: breatheCopy.breatheFirst }));
      expect(router.push).toHaveBeenCalledWith('/home/breathe');
    },
  );
});
