import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { createMemoryJournal, setJournal, type Entry } from '@/features/journal';
import { deviceClock } from '@/features/journal/localDay';
import { readPatternCards, type PatternCard } from '@/services/patterns';
import { usePlusStore } from '@/services/plus/store';
import { usePreferences } from '@/state/preferences';
import { withBillingForTests, withoutBillingForTests } from '@/testing/plus';
import { animationClock } from '@/testing/reanimatedMock';
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
afterEach(() => {
  setJournal(null);
  animationClock.reset();
});

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

  it('hands the reading over: the skeleton stands under the cards as they arrive, and goes only when they are in', async () => {
    // The walk (c2): the skeleton went, the sky was bare, and the card popped in. A hand-over has
    // no gap: the skeleton is still there when the card begins to arrive, and is taken away under it.
    read.mockResolvedValue({
      status: 'cards',
      entriesRead: 5,
      cards: [card('Guilty about resting')],
    });
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.read);
    await press(patternsCopy.consent.agree);
    expect(await screen.findByText('Guilty about resting')).toBeTruthy();
    const skeleton = () =>
      screen.queryByText(patternsCopy.cards.reading, { includeHiddenElements: true });
    // Still there, hidden from everyone, under the arrival.
    expect(skeleton()).toBeTruthy();
    expect(screen.queryByText(patternsCopy.cards.reading)).toBeNull();
    // And gone once the card has arrived.
    await waitFor(() => expect(skeleton()).toBeNull(), { timeout: 3000 });
  });

  it('has the reading skeleton on the glass in the very frame the consent leaves: no bare sky between', async () => {
    // The walk (v9): the consent went, the sky was bare for a frame, and the skeleton came. The
    // consent is cut when the person agrees, so what takes its place is there in that frame, at rest,
    // not arriving from nothing.
    animationClock.stepped = true;
    read.mockReturnValue(new Promise(() => undefined));
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.read);
    expect(await screen.findByText(patternsCopy.consent.title)).toBeTruthy();
    // The page and the consent have finished arriving.
    await act(async () => new Promise((done) => setTimeout(done, 900)));
    await press(patternsCopy.consent.agree);
    // Nothing has been advanced: this is the frame the tap was drawn in.
    expect(screen.queryByText(patternsCopy.consent.title)).toBeNull();
    // How whole the skeleton is, as it is drawn: the least opacity of it and everything above it.
    let seen = 1;
    for (
      let node = screen.getByText(patternsCopy.cards.reading, {
        includeHiddenElements: true,
      }).parent;
      node;
      node = node.parent
    ) {
      const opacity = (StyleSheet.flatten(node.props.style) as { opacity?: number } | undefined)
        ?.opacity;
      seen = Math.min(seen, opacity ?? 1);
    }
    expect(seen).toBe(1);
  });

  it('has the consent on the glass, whole with its words, in the very frame the page it replaces leaves', async () => {
    // The walk (v9, again in v10): on "Read my patterns" the glass of the page went, the sky was bare
    // (a frame, and on a busy phone a tenth of a second), the consent's glass came empty, and then its
    // words. The consent replaces the page's own glass in one commit, so it is drawn at rest in that
    // commit, not arriving from nothing.
    animationClock.stepped = true;
    await render(<PatternsScreen />);
    await screen.findByRole('button', { name: patternsCopy.cards.read });
    // The page has finished arriving.
    await act(async () => new Promise((done) => setTimeout(done, 900)));
    await press(patternsCopy.cards.read);
    // Nothing has been advanced: this is the frame the tap was drawn in.
    const title = screen.getByText(patternsCopy.consent.title, { includeHiddenElements: true });
    // How whole the consent is, as it is drawn: the least opacity of it and everything above it.
    let seen = 1;
    for (let node = title.parent; node; node = node.parent) {
      const opacity = (StyleSheet.flatten(node.props.style) as { opacity?: number } | undefined)
        ?.opacity;
      seen = Math.min(seen, opacity ?? 1);
    }
    expect(seen).toBe(1);
    // And nothing of what it replaced is left beside it, so no frame has two of them or none.
    expect(screen.queryByText(patternsCopy.cards.intro)).toBeNull();
  });

  it('keeps no frame empty when the consent is turned down: the page is back at once, whole', async () => {
    animationClock.stepped = true;
    await render(<PatternsScreen />);
    await screen.findByRole('button', { name: patternsCopy.cards.read });
    await act(async () => new Promise((done) => setTimeout(done, 900)));
    await press(patternsCopy.cards.read);
    await press(patternsCopy.consent.notNow);
    const intro = screen.getByText(patternsCopy.cards.intro, { includeHiddenElements: true });
    let seen = 1;
    for (let node = intro.parent; node; node = node.parent) {
      const opacity = (StyleSheet.flatten(node.props.style) as { opacity?: number } | undefined)
        ?.opacity;
      seen = Math.min(seen, opacity ?? 1);
    }
    expect(seen).toBe(1);
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
    expect(screen.queryByRole('header', { name: /^Pattern card \d/ })).toBeNull();

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

  it('hands nothing over when no card came: the skeleton does not linger over the cards that were there', async () => {
    jest.mocked(loadReading).mockResolvedValue({ ok: true, value: earlier });
    usePreferences.setState({ patternsConsent: CONSENT_VERSION });
    read.mockResolvedValue({ status: 'none', entriesRead: 5 });
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.readAgain);
    expect(
      await screen.findByText(`${patternsCopy.cards.none} ${patternsCopy.cards.keptEarlier}`),
    ).toBeTruthy();
    expect(
      screen.queryByText(patternsCopy.cards.reading, { includeHiddenElements: true }),
    ).toBeNull();
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

// The walk (v10): the reading's notice arrived half scrolled off the top of the screen. The page keeps
// its scroll position while the tall skeleton above the notice goes and a short notice takes its
// place, so the notice lands above the top. It is scrolled into view, once, when it arrives.
describe('a notice that arrives from a reading', () => {
  type Native = { props: { testID?: string } };
  /** Where the screen puts a view: [top, height] in the window, by the view's test id. */
  let windowAt: Record<string, [number, number]>;
  /** Where the notice is in the page's own content. */
  let contentY: number;
  const measureInWindow = jest.spyOn(View.prototype, 'measureInWindow');
  const measureLayout = jest.spyOn(View.prototype, 'measureLayout');
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  // ScrollView's own copies of the same native methods, which the page asks too.
  const scrollerInWindow = jest.spyOn(ScrollView.prototype, 'measureInWindow');

  beforeEach(() => {
    windowAt = { 'tab-page-scroll': [40, 700], 'bring-into-view': [200, 90] };
    contentY = 410;
    const inWindow = function (this: Native, done: (...n: number[]) => void) {
      const [top, height] = windowAt[this.props.testID ?? ''] ?? [0, 0];
      done(0, top, 330, height);
    };
    measureInWindow.mockImplementation(inWindow as never);
    scrollerInWindow.mockImplementation(inWindow as never);
    measureLayout.mockImplementation(((_relative: unknown, done: (...n: number[]) => void) =>
      done(0, contentY, 330, 90)) as never);
    scrollTo.mockClear();
  });
  afterEach(() => {
    measureInWindow.mockReset();
    measureLayout.mockReset();
    scrollerInWindow.mockReset();
  });

  async function arrive() {
    jest.mocked(loadReading).mockResolvedValue({ ok: true, value: earlier });
    usePreferences.setState({ patternsConsent: CONSENT_VERSION });
    read.mockResolvedValue({ status: 'none', entriesRead: 5 });
    await render(<PatternsScreen />);
    await press(patternsCopy.cards.readAgain);
    await screen.findByText(`${patternsCopy.cards.none} ${patternsCopy.cards.keptEarlier}`);
    await fireEvent(screen.getByTestId('bring-into-view'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 410, width: 330, height: 90 } },
    });
  }

  it('is scrolled into view when it lands half above the top of the screen', async () => {
    windowAt['bring-into-view'] = [-45, 90];
    await arrive();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // Its place in the page, and a little air above it.
    expect(scrollTo).toHaveBeenCalledWith({ y: 410 - 16, animated: true });
  });

  it('is scrolled into view when it lands below the bottom of the screen', async () => {
    windowAt['bring-into-view'] = [760, 90];
    await arrive();
    expect(scrollTo).toHaveBeenCalledWith({ y: 410 - 16, animated: true });
  });

  it('is left alone when it is already on the screen: nothing moves for no reason', async () => {
    windowAt['bring-into-view'] = [200, 90];
    await arrive();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('never scrolls above the top of the page', async () => {
    windowAt['bring-into-view'] = [-45, 90];
    contentY = 6;
    await arrive();
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
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
