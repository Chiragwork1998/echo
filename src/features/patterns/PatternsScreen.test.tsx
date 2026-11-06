import { screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createMemoryJournal, setJournal, type Entry } from '@/features/journal';
import { deviceClock } from '@/features/journal/localDay';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { patternsCopy } from './patternsCopy';
import { PatternsScreen } from './PatternsScreen';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
  usePathname: () => '/home/patterns',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const today = deviceClock.localDay(deviceClock.now());
const entry = (id: string, patch: Partial<Entry> = {}): Entry => ({
  id,
  status: 'committed',
  title: '',
  body: 'Some words',
  mode: 'text',
  durationSeconds: 300,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  committedAt: Date.now(),
  localDay: today,
  ...patch,
});
const seed = (count: number, patch: Partial<Entry> = {}) =>
  setJournal(
    createMemoryJournal({
      entries: Array.from({ length: count }, (_, i) => entry(`e${i}`, patch)),
    }),
  );

beforeEach(() => {
  usePreferences.setState({ theme: 'night' });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
});
afterEach(() => setJournal(null));

describe('PatternsScreen', () => {
  it('shows only the waiting line below five reflections', async () => {
    seed(4);
    await render(<PatternsScreen />);
    expect(await screen.findByText(patternsCopy.locked)).toBeTruthy();
    expect(screen.queryByText(patternsCopy.intro)).toBeNull();
    expect(screen.queryByText(patternsCopy.weekTitle.toUpperCase())).toBeNull();
  });

  it('shows plain counts from five reflections: this week, total minutes and moods', async () => {
    seed(5, { moodBefore: 'light' });
    await render(<PatternsScreen />);
    expect(await screen.findByText(patternsCopy.intro)).toBeTruthy();
    expect(screen.getByRole('header', { name: patternsCopy.title })).toBeTruthy();
    expect(screen.getByText(patternsCopy.minutesTotal(25))).toBeTruthy();
    expect(screen.getAllByText(patternsCopy.reflections(5)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(patternsCopy.moodCount('Light', 5))).toBeTruthy();
    expect(screen.getByLabelText(patternsCopy.moodCount('Heavy', 0))).toBeTruthy();
    expect(screen.queryByText(patternsCopy.locked)).toBeNull();
  });
});
