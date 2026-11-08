// The walk (E5): after Keep draft, Home's card came back showing the last echo ("From your path"),
// and partway through arriving it changed to "Continue an echo". The draft is read a moment after
// the card is drawn. What is written on the glass must dissolve from one to the other, in place,
// and the glass itself must never fade.
import { act, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { copy } from '@/content/copy';
import { createMemoryJournal, setJournal, type Entry } from '@/features/journal';
import { notifyJournalChanged } from '@/features/journal/api';
import { resetPreferences, usePreferences } from '@/state/preferences';
import { mostFadedGlass } from '@/testing/glass';
import { render } from '@/testing/render';

import { HomeScreen } from './screens/HomeScreen';
import { useStoneMemory } from './today/stoneMemory';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { navigate: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
    Stack: { Screen: () => null },
    usePathname: () => '/home',
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
  useAnimatedKeyboard: () => ({ height: { get: () => 0 }, state: { get: () => 0 } }),
}));
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => false }));
jest.mock('@/features/become/morning', () => ({
  ...jest.requireActual('@/features/become/morning'),
  useMorning: () => false,
}));

const AT = Date.parse('2026-11-08T07:50:00Z');
const entry = (patch: Partial<Entry>): Entry => ({
  id: 'echo-1',
  status: 'committed',
  title: '',
  body: 'Words from an echo kept before.',
  mode: 'text',
  durationSeconds: 300,
  createdAt: AT,
  updatedAt: AT,
  committedAt: AT,
  localDay: '2026-11-08',
  ...patch,
});
const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

const label = (text: string) =>
  screen.queryByText(text.toUpperCase(), { includeHiddenElements: true });
const shown = (text: string) => screen.queryByText(text.toUpperCase());

/** A journal that keeps its drafts to itself until it is let go, as the first read after a save does. */

beforeEach(() => {
  jest.useFakeTimers();
  useStoneMemory.getState().reset();
  resetPreferences();
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
  usePreferences.setState({ theme: 'night' });
});
afterEach(() => {
  setJournal(null);
  jest.useRealTimers();
});

it('dissolves from the last echo to the draft in place, without a cut and without fading the glass', async () => {
  const base = createMemoryJournal({ entries: [entry({})] });
  setJournal(base);
  await render(<HomeScreen />);
  await advance(1500);
  // First the card knows only the last echo.
  expect(shown(copy.home.recentTitle)).toBeTruthy();
  expect(shown(copy.home.continueEcho)).toBeNull();

  // Keep draft: a draft is saved, and Home is told.
  await act(async () => {
    await base.saveDraft('draft-1', {
      body: 'Words written just now, to be finished.',
      mode: 'text',
      durationSeconds: 0,
    });
    notifyJournalChanged();
  });
  await advance(50);

  // Both are there for the length of the dissolve: the new for everyone, the old hidden and untouchable.
  expect(shown(copy.home.continueEcho)).toBeTruthy();
  expect(label(copy.home.recentTitle)).toBeTruthy();
  expect(shown(copy.home.recentTitle)).toBeNull();
  expect(mostFadedGlass()).toBe(1);

  await advance(400);
  expect(label(copy.home.recentTitle)).toBeNull();
  expect(shown(copy.home.continueEcho)).toBeTruthy();
});
