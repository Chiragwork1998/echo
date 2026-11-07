import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createMemoryJournal, setJournal, type Entry } from '@/features/journal';
import { deviceClock } from '@/features/journal/localDay';
import { APP_VERSION } from '@/features/you/support';
import type { PatternCard } from '@/services/patterns';
import { reportCard, sendWaitingReports, type ReportResult } from '@/services/reportCard';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { patternsCopy } from './patternsCopy';
import { PatternsScreen } from './PatternsScreen';
import { loadReading, type SavedReading } from './readingStore';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  usePathname: () => '/home/patterns',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/services/reportCard', () => ({
  ...jest.requireActual('@/services/reportCard'),
  reportCard: jest.fn(),
  sendWaitingReports: jest.fn(async () => undefined),
}));
jest.mock('./readingStore');

const { report: words } = patternsCopy;
const today = deviceClock.localDay(deviceClock.now());
const QUOTE = 'a made-up line the report must never carry';

const card = (name: string, lens?: string): PatternCard => ({
  name,
  noticed: 'It seems that rest brings a little guilt with it.',
  evidence: [
    { quote: QUOTE, date: today },
    { quote: 'another made-up line', date: today },
  ],
  lens: {
    ...(lens ? { id: lens } : {}),
    text: 'One way to see this is as a loop.',
    source: 'Joe Dispenza · thoughts and feelings in a loop',
  },
  practice: 'Write two short lines.',
  question: 'What does enough mean on an ordinary day?',
});

const reading: SavedReading = {
  readAt: Date.UTC(2026, 9, 30),
  entriesRead: 5,
  model: 'gpt-6.1-sol',
  cards: [card('Quiet scoring', 'dispenza_loop'), card('Guilty about resting')],
};

const entry = (id: string): Entry => ({
  id,
  status: 'committed',
  title: '',
  body: 'Made-up words',
  mode: 'text',
  durationSeconds: 300,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  committedAt: Date.now(),
  localDay: today,
});

const sent = jest.mocked(reportCard);

beforeEach(() => {
  jest.clearAllMocks();
  usePreferences.setState({ theme: 'night', patternsConsent: null });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
  setJournal(createMemoryJournal({ entries: Array.from({ length: 5 }, (_, i) => entry(`e${i}`)) }));
  jest.mocked(loadReading).mockResolvedValue({ ok: true, value: reading });
});
afterEach(() => setJournal(null));

async function openReport(name = 'Quiet scoring') {
  await render(<PatternsScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: words.actionSpoken(name) }));
}

describe('reporting a pattern card', () => {
  it('offers four reasons, and sends nothing until one is chosen', async () => {
    await openReport();
    expect(screen.getByRole('header', { name: words.title })).toBeTruthy();
    for (const reason of Object.values(words.reasons)) {
      expect(screen.getByRole('radio', { name: reason })).toBeTruthy();
    }
    expect(screen.getByText(words.privacy)).toBeTruthy();
    expect(screen.getByRole('button', { name: words.send })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: words.send }));
    expect(sent).not.toHaveBeenCalled();
  });

  it('sends only the reason, the lens, the model and the app’s version, never the card', async () => {
    sent.mockResolvedValue('sent');
    await openReport();
    await fireEvent.press(screen.getByRole('radio', { name: words.reasons.wrong }));
    expect(screen.getByRole('radio', { name: words.reasons.wrong })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: words.send }));

    await waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
    const report = sent.mock.calls[0]?.[0];
    expect(report).toEqual({
      reason: 'wrong',
      lens: 'dispenza_loop',
      model: 'gpt-6.1-sol',
      appVersion: APP_VERSION || null,
    });
    const said = JSON.stringify(report);
    for (const text of [QUOTE, 'Quiet scoring', 'loop.', 'Write two short lines']) {
      expect(said).not.toContain(text);
    }
  });

  it('thanks the person, then marks the card as reported', async () => {
    sent.mockResolvedValue('sent');
    await openReport();
    await fireEvent.press(screen.getByRole('radio', { name: words.reasons.harmful }));
    await fireEvent.press(screen.getByRole('button', { name: words.send }));

    expect(await screen.findByRole('header', { name: words.sentTitle })).toBeTruthy();
    expect(screen.getByText(words.sentBody)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: words.done }));
    await waitFor(() => expect(screen.queryByText(words.sentBody)).toBeNull());
    // The reported card says so; the other can still be reported.
    expect(screen.getByText(words.reported)).toBeTruthy();
    expect(screen.queryByRole('button', { name: words.actionSpoken('Quiet scoring') })).toBeNull();
    expect(
      screen.getByRole('button', { name: words.actionSpoken('Guilty about resting') }),
    ).toBeTruthy();
  });

  it('names no lens when the card did not say which it used', async () => {
    sent.mockResolvedValue('sent');
    await openReport('Guilty about resting');
    await fireEvent.press(screen.getByRole('radio', { name: words.reasons.other }));
    await fireEvent.press(screen.getByRole('button', { name: words.send }));
    await waitFor(() => expect(sent).toHaveBeenCalled());
    expect(sent.mock.calls[0]?.[0]).toMatchObject({ reason: 'other', lens: null });
  });

  it.each([
    ['kept' as const, words.keptTitle, words.keptBody],
    ['failed' as const, words.failedTitle, words.failedBody],
  ])('says plainly what happened when the report is %s', async (result, title, body) => {
    sent.mockResolvedValue(result satisfies ReportResult);
    await openReport();
    await fireEvent.press(screen.getByRole('radio', { name: words.reasons.upsetting }));
    await fireEvent.press(screen.getByRole('button', { name: words.send }));
    expect(await screen.findByRole('header', { name: title })).toBeTruthy();
    expect(screen.getByText(body)).toBeTruthy();
  });

  it('can try again after a report that could not go', async () => {
    sent.mockResolvedValueOnce('failed').mockResolvedValueOnce('sent');
    await openReport();
    await fireEvent.press(screen.getByRole('radio', { name: words.reasons.upsetting }));
    await fireEvent.press(screen.getByRole('button', { name: words.send }));
    await fireEvent.press(await screen.findByRole('button', { name: words.tryAgain }));
    expect(await screen.findByRole('header', { name: words.sentTitle })).toBeTruthy();
    expect(sent).toHaveBeenCalledTimes(2);
  });

  it('closes with Cancel and sends nothing', async () => {
    await openReport();
    await fireEvent.press(screen.getByRole('radio', { name: words.reasons.harmful }));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: words.cancel })));
    await waitFor(() => expect(screen.queryByText(words.privacy)).toBeNull());
    expect(sent).not.toHaveBeenCalled();
  });

  it('sends any report kept from before when Patterns opens', async () => {
    await render(<PatternsScreen />);
    await screen.findByText('Quiet scoring');
    expect(sendWaitingReports).toHaveBeenCalled();
  });
});
