import { screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { recordPractice, type Feeling } from '@/features/breathe/feelingStore';
import { createMemoryJournal, setJournal, type Entry } from '@/features/journal';
import { addDays, deviceClock } from '@/features/journal/localDay';
import { usePreferences } from '@/state/preferences';
import { installRuntime } from '@/storage/runtime';
import { createTestRuntime } from '@/storage/testing/nodePorts';
import { glassAncestors, mostFadedGlass } from '@/testing/glass';
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

jest.mock('./readingStore', () => ({
  loadReading: async () => ({ ok: true, value: null }),
  saveReading: async () => ({ ok: true, value: null }),
  clearReading: async () => ({ ok: true, value: null }),
}));

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

/** Practices as Breathe records them, sealed on the test phone: one each, with its answer or none. */
async function practise(day: string, id: string, answers: (Feeling | 'skip')[]) {
  for (const answer of answers) {
    await recordPractice(day, id, {
      practice: true,
      feeling: answer === 'skip' ? undefined : answer,
    });
  }
}

/** Six practices this week, four of them calmer, and Settle answered three times. */
async function aWeekOfBreathing() {
  await practise(today, 'settle', ['calmer', 'calmer', 'same']);
  await practise(today, 'ground', ['calmer', 'skip']);
  await practise(today, 'heart', ['calmer']);
}

beforeEach(async () => {
  usePreferences.setState({ theme: 'night' });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
  installRuntime(await createTestRuntime());
});
afterEach(() => {
  setJournal(null);
  installRuntime(null);
});

describe('PatternsScreen', () => {
  it('has its skeleton on glass beside the heading from the first frame: the heading is never alone on the sky', async () => {
    // The walk (v11): Patterns, reached by a quick tap, was its heading on bare sky for a quarter of
    // a second before its glass came. The echoes have not been counted yet here, and may never be.
    const base = createMemoryJournal({ entries: [entry('e0')] });
    setJournal({ ...base, listEntries: () => new Promise(() => undefined) });
    await render(<PatternsScreen />);
    expect(screen.getByRole('header', { name: patternsCopy.title })).toBeTruthy();
    expect(screen.getByLabelText(patternsCopy.loading)).toBeTruthy();
    expect(glassAncestors().length).toBeGreaterThan(0);
    expect(mostFadedGlass()).toBe(1);
  });

  it('shows only the waiting line below five reflections', async () => {
    seed(4);
    await render(<PatternsScreen />);
    expect(await screen.findByText(patternsCopy.locked)).toBeTruthy();
    expect(screen.queryByText(patternsCopy.intro)).toBeNull();
    expect(screen.queryByText(patternsCopy.weekTitle.toUpperCase())).toBeNull();
  });

  it('shows how far along the person is, one cairn built for each reflection', async () => {
    seed(4);
    await render(<PatternsScreen />);
    expect(await screen.findByLabelText(patternsCopy.lockedSpoken(4, 5))).toBeTruthy();
    expect(screen.getByText(patternsCopy.lockedSoFar(4, 5))).toBeTruthy();
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

  it('offers the pattern cards first, and keeps the plain facts beneath them', async () => {
    seed(5);
    await render(<PatternsScreen />);
    expect(await screen.findByRole('button', { name: patternsCopy.cards.read })).toBeTruthy();
    expect(screen.getByText(patternsCopy.cards.intro)).toBeTruthy();
    expect(screen.getByText(patternsCopy.intro)).toBeTruthy();
  });

  it('offers no pattern cards below five reflections', async () => {
    seed(4);
    await render(<PatternsScreen />);
    expect(await screen.findByText(patternsCopy.locked)).toBeTruthy();
    expect(screen.queryByRole('button', { name: patternsCopy.cards.read })).toBeNull();
  });
});

describe('the breath line in Your rhythm', () => {
  it('shows this week’s practices, how many ended calmer, and the practice that helps most', async () => {
    seed(5);
    await aWeekOfBreathing();
    await render(<PatternsScreen />);
    expect(await screen.findByRole('header', { name: patternsCopy.breathTitle })).toBeTruthy();
    expect(screen.getByText('6 practices this week. Calmer after 4.')).toBeTruthy();
    expect(screen.getByText('Settle helps you most often.')).toBeTruthy();
    expect(screen.getByText(patternsCopy.introWithBreath)).toBeTruthy();
    expect(screen.queryByText(patternsCopy.intro)).toBeNull();
  });

  it('shows nothing of Breathe when there are no practices', async () => {
    seed(5);
    await render(<PatternsScreen />);
    expect(await screen.findByText(patternsCopy.intro)).toBeTruthy();
    expect(screen.queryByRole('header', { name: patternsCopy.breathTitle })).toBeNull();
    expect(screen.queryByText(/practices? this week/)).toBeNull();
    expect(screen.queryByText(/helps you most often/)).toBeNull();
  });

  it('names no practice until it has three answers', async () => {
    seed(5);
    await practise(today, 'settle', ['calmer', 'calmer', 'skip']);
    await practise(addDays(today, -7), 'ground', ['calmer']);
    await render(<PatternsScreen />);
    expect(await screen.findByText('3 practices this week. Calmer after 2.')).toBeTruthy();
    expect(screen.queryByText(/helps you most often/)).toBeNull();
  });

  it('leaves the locked page as it is, however much someone has practised', async () => {
    seed(4);
    await aWeekOfBreathing();
    await render(<PatternsScreen />);
    expect(await screen.findByText(patternsCopy.locked)).toBeTruthy();
    expect(screen.getByLabelText(patternsCopy.lockedSpoken(4, 5))).toBeTruthy();
    expect(screen.getByText(patternsCopy.lockedSoFar(4, 5))).toBeTruthy();
    expect(screen.queryByRole('header', { name: patternsCopy.breathTitle })).toBeNull();
    expect(screen.queryByText(/practices? this week/)).toBeNull();
    expect(screen.queryByText(/helps you most often/)).toBeNull();
  });
});
