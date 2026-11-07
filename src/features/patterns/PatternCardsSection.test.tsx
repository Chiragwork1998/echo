import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions, Linking } from 'react-native';

import { createMemoryJournal, setJournal, type Entry } from '@/features/journal';
import { deviceClock } from '@/features/journal/localDay';
import { readPatternCards, type PatternCard } from '@/services/patterns';
import { usePlusStore } from '@/services/plus/store';
import { usePreferences } from '@/state/preferences';
import { withBillingForTests, withoutBillingForTests } from '@/testing/plus';
import { render } from '@/testing/render';

import { patternsCopy } from './patternsCopy';
import { PatternsScreen } from './PatternsScreen';
import { loadReading, saveReading, clearReading, type SavedReading } from './readingStore';
import { supportCopy } from './supportResources';
import { CONSENT_VERSION } from './usePatternCards';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
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

describe('pattern cards', () => {
  it('shows the cards kept on the phone, and when they were read, without calling the server', async () => {
    jest.mocked(loadReading).mockResolvedValue({ ok: true, value: earlier });
    await render(<PatternsScreen />);
    expect(await screen.findByText('Quiet scoring')).toBeTruthy();
    expect(screen.getByText(/Read on .*2026 · from your latest 5 entries/)).toBeTruthy();
    expect(screen.getByRole('button', { name: patternsCopy.cards.readAgain })).toBeTruthy();
    // The plain facts remain beneath.
    expect(screen.getByText(patternsCopy.intro)).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
  });

  it('asks for agreement before the first reading, and sends nothing until it is given', async () => {
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.read);
    expect(await screen.findByText(patternsCopy.consent.title)).toBeTruthy();
    expect(screen.getByText('ECHO will send your 5 entries.')).toBeTruthy();
    for (const fact of patternsCopy.consent.facts) expect(screen.getByText(fact)).toBeTruthy();
    expect(read).not.toHaveBeenCalled();

    await press(patternsCopy.consent.notNow);
    expect(read).not.toHaveBeenCalled();
    expect(usePreferences.getState().patternsConsent).toBeNull();
    expect(screen.queryByText(patternsCopy.consent.title)).toBeNull();
  });

  it('reads after agreement, keeps the cards sealed, and does not ask again', async () => {
    read.mockResolvedValue({
      status: 'cards',
      entriesRead: 5,
      cards: [card('Guilty about resting')],
    });
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.read);
    await press(patternsCopy.consent.agree);

    expect(await screen.findByText('Guilty about resting')).toBeTruthy();
    expect(usePreferences.getState().patternsConsent).toBe(CONSENT_VERSION);
    const sent = read.mock.calls[0]?.[0] ?? [];
    expect(sent).toHaveLength(5);
    expect(sent[0]).toEqual({ date: today, text: expect.stringContaining('Made-up words') });
    await waitFor(() => expect(saveReading).toHaveBeenCalledTimes(1));
    expect(jest.mocked(saveReading).mock.calls[0]?.[0].cards[0]?.name).toBe('Guilty about resting');

    await press(patternsCopy.cards.readAgain);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(patternsCopy.consent.title)).toBeNull();
  });

  it('keeps the earlier cards and says so calmly when the reader cannot be reached', async () => {
    jest.mocked(loadReading).mockResolvedValue({ ok: true, value: earlier });
    usePreferences.setState({ patternsConsent: CONSENT_VERSION });
    read.mockResolvedValue({ status: 'error', code: 'offline', retryable: true });
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.readAgain);

    expect(
      await screen.findByText(`${patternsCopy.cards.offline} ${patternsCopy.cards.keptEarlier}`),
    ).toBeTruthy();
    expect(screen.getByText('Quiet scoring')).toBeTruthy();
    expect(saveReading).not.toHaveBeenCalled();
  });

  it('answers language about self-harm with care and helplines, and makes no cards', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue();
    usePreferences.setState({ patternsConsent: CONSENT_VERSION });
    read.mockResolvedValue({ status: 'support' });
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.read);

    expect(await screen.findByText(supportCopy.title)).toBeTruthy();
    expect(screen.getByText(supportCopy.body)).toBeTruthy();
    expect(saveReading).not.toHaveBeenCalled();
    expect(screen.queryByText(patternsCopy.cards.eyebrow.toUpperCase())).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: /Call Tele-MANAS, 14416/ }));
    expect(Linking.openURL).toHaveBeenCalledWith('tel:14416');
    await fireEvent.press(screen.getByRole('link', { name: /Find a Helpline/ }));
    expect(Linking.openURL).toHaveBeenCalledWith('https://findahelpline.com');

    await press(supportCopy.close);
    expect(screen.queryByText(supportCopy.title)).toBeNull();
  });

  it('lets a person withdraw, after which ECHO asks again', async () => {
    usePreferences.setState({ patternsConsent: CONSENT_VERSION });
    await render(<PatternsScreen />);
    await press(/^Stop sending my entries/);

    expect(usePreferences.getState().patternsConsent).toBeNull();
    expect(await screen.findByText(patternsCopy.choices.withdrawn)).toBeTruthy();
    await press(patternsCopy.cards.read);
    expect(await screen.findByText(patternsCopy.consent.title)).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
  });

  it('can delete the cards it kept', async () => {
    jest.mocked(loadReading).mockResolvedValue({ ok: true, value: earlier });
    await render(<PatternsScreen />);
    expect(await screen.findByText('Quiet scoring')).toBeTruthy();
    await press(/^Delete these cards/);
    await waitFor(() => expect(screen.queryByText('Quiet scoring')).toBeNull());
    expect(clearReading).toHaveBeenCalled();
  });

  it('says nothing clear came up, and still keeps what was there', async () => {
    jest.mocked(loadReading).mockResolvedValue({ ok: true, value: earlier });
    usePreferences.setState({ patternsConsent: CONSENT_VERSION });
    read.mockResolvedValue({ status: 'none', entriesRead: 5 });
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.readAgain);
    expect(
      await screen.findByText(`${patternsCopy.cards.none} ${patternsCopy.cards.keptEarlier}`),
    ).toBeTruthy();
    expect(screen.getByText('Quiet scoring')).toBeTruthy();
  });
});

describe('pattern cards and ECHO Plus', () => {
  const cards = {
    status: 'cards' as const,
    entriesRead: 5,
    cards: [card('Guilty about resting')],
  };
  const paywall = { pathname: '/plus', params: { feature: 'patterns' } };

  beforeEach(() => {
    withBillingForTests({ status: 'free', source: 'live' });
    usePreferences.setState({ patternsConsent: CONSENT_VERSION });
  });
  afterEach(() => withoutBillingForTests());

  it('gives the first reading free, without a word about Plus', async () => {
    read.mockResolvedValue(cards);
    await render(<PatternsScreen />);
    expect(screen.queryByText(patternsCopy.cards.plusNote)).toBeNull();
    await press(patternsCopy.cards.read);
    expect(await screen.findByText('Guilty about resting')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    expect(usePlusStore.getState().readingUsed).toBe(true);
  });

  it('after the free reading, "Read again" opens the paywall and reads nothing', async () => {
    jest.mocked(loadReading).mockResolvedValue({ ok: true, value: earlier });
    await render(<PatternsScreen />);
    expect(await screen.findByText(patternsCopy.cards.plusNote)).toBeTruthy();
    await press(patternsCopy.cards.readAgain);
    expect(router.push).toHaveBeenCalledWith(paywall);
    expect(read).not.toHaveBeenCalled();
  });

  it('still counts the free reading as used once its cards are deleted', async () => {
    usePlusStore.setState({ readingUsed: true });
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.read);
    expect(router.push).toHaveBeenCalledWith(paywall);
    expect(read).not.toHaveBeenCalled();
  });

  it('asks for Plus before asking for agreement, so nobody agrees to a reading they cannot have', async () => {
    usePreferences.setState({ patternsConsent: null });
    jest.mocked(loadReading).mockResolvedValue({ ok: true, value: earlier });
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.readAgain);
    expect(router.push).toHaveBeenCalledWith(paywall);
    expect(screen.queryByText(patternsCopy.consent.title)).toBeNull();
  });

  it('reads every time for someone with Plus', async () => {
    usePlusStore.setState({ status: 'plus' });
    jest.mocked(loadReading).mockResolvedValue({ ok: true, value: earlier });
    read.mockResolvedValue(cards);
    await render(<PatternsScreen />);
    expect(screen.queryByText(patternsCopy.cards.plusNote)).toBeNull();
    await press(patternsCopy.cards.readAgain);
    expect(await screen.findByText('Guilty about resting')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps a reading that did not finish free: trying again is not a second reading', async () => {
    read.mockResolvedValueOnce({ status: 'error', code: 'offline', retryable: true });
    read.mockResolvedValueOnce(cards);
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.read);
    await press(patternsCopy.cards.read);
    expect(await screen.findByText('Guilty about resting')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });
});
