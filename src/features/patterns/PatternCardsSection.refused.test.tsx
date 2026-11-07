import { fireEvent, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createMemoryJournal, setJournal, type Entry } from '@/features/journal';
import { deviceClock } from '@/features/journal/localDay';
import { readPatternCards, type PatternCard } from '@/services/patterns';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { patternsCopy } from './patternsCopy';
import { PatternsScreen } from './PatternsScreen';
import { loadReading, saveReading, clearReading, type SavedReading } from './readingStore';
import { CONSENT_VERSION } from './usePatternCards';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
  usePathname: () => '/home/patterns',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/services/patterns', () => ({
  ...jest.requireActual('@/services/patterns'),
  readPatternCards: jest.fn(),
}));
jest.mock('./readingStore');
// The Plus check: whether the person has Plus once the paywall has had its say.
const mockRequirePlus = jest.fn((_feature: string) => false);
jest.mock('@/services/plus', () => ({
  ...jest.requireActual('@/services/plus'),
  useRequirePlus: () => mockRequirePlus,
}));
jest.mock('./deviceRegion', () => ({ deviceRegion: () => 'IN' }));

const read = jest.mocked(readPatternCards);
const today = deviceClock.localDay(deviceClock.now());

const entry = (id: string, body: string): Entry => ({
  id,
  status: 'committed',
  title: '',
  body,
  mode: 'text',
  durationSeconds: 300,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  committedAt: Date.now(),
  localDay: today,
});

const card = (name: string): PatternCard => ({
  name,
  noticed: 'It seems that rest brings a little guilt with it.',
  evidence: [
    { quote: 'guilty about resting', date: today },
    { quote: 'the guilt arrive on schedule', date: today },
  ],
  lens: {
    text: 'One way to see this is as a loop.',
    source: 'Joe Dispenza · thoughts and feelings in a loop',
  },
  practice: 'Write two short lines.',
  question: 'What does enough mean on an ordinary day?',
});
const earlier: SavedReading = {
  readAt: Date.UTC(2026, 9, 30),
  entriesRead: 5,
  cards: [card('Quiet scoring')],
};

beforeEach(() => {
  usePreferences.setState({ theme: 'night', patternsConsent: null });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
  setJournal(
    createMemoryJournal({
      entries: Array.from({ length: 5 }, (_, i) => entry(`e${i}`, `Made-up words number ${i}`)),
    }),
  );
  jest.clearAllMocks();
  read.mockReset();
  jest.mocked(loadReading).mockResolvedValue({ ok: true, value: null });
  jest.mocked(saveReading).mockResolvedValue({ ok: true, value: null });
  jest.mocked(clearReading).mockResolvedValue({ ok: true, value: null });
});
afterEach(() => setJournal(null));

const press = async (name: string | RegExp) =>
  fireEvent.press(await screen.findByRole('button', { name }));

describe('a reading the server refused', () => {
  beforeEach(() => {
    mockRequirePlus.mockImplementation(() => false);
    jest.mocked(loadReading).mockResolvedValue({ ok: true, value: earlier });
    usePreferences.setState({ patternsConsent: CONSENT_VERSION });
  });

  it('says the free reading is used, keeps the earlier cards, and offers ECHO Plus', async () => {
    read.mockResolvedValue({ status: 'error', code: 'allowance_used', retryable: false });
    await render(<PatternsScreen />);
    // The phone's own gate lets this reading through (as it does once the person has Plus, or where
    // billing is unavailable). The server is what refuses it.
    mockRequirePlus.mockReturnValueOnce(true);
    await press(patternsCopy.cards.readAgain);
    const { allowanceUsed, keptEarlier, getPlus } = patternsCopy.cards;
    expect(await screen.findByText(`${allowanceUsed} ${keptEarlier}`)).toBeTruthy();
    expect(screen.getByText('Quiet scoring')).toBeTruthy();
    // Trying again would only be refused again.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

    // The paywall says no: nothing is sent.
    await press(getPlus);
    expect(mockRequirePlus).toHaveBeenCalledWith('patterns');
    expect(read).toHaveBeenCalledTimes(1);

    // With Plus, the reading is asked for at once: from here on every gate says yes, as it does for
    // someone who has Plus.
    mockRequirePlus.mockReturnValue(true);
    read.mockResolvedValue({
      status: 'cards',
      entriesRead: 5,
      cards: [card('Guilty about resting')],
    });
    await press(getPlus);
    expect(await screen.findByText('Guilty about resting')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('says plainly when Plus’s readings for the month are used, with nothing to press', async () => {
    read.mockResolvedValue({ status: 'error', code: 'reading_cap', retryable: false });
    await render(<PatternsScreen />);
    mockRequirePlus.mockReturnValueOnce(true);
    await press(patternsCopy.cards.readAgain);
    const { readingCap, keptEarlier, getPlus } = patternsCopy.cards;
    expect(await screen.findByText(`${readingCap} ${keptEarlier}`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: getPlus })).toBeNull();
  });
});
