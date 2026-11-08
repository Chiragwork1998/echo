import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { EntrySummary } from '@/features/journal';
import { readPatternCards, type PatternCard } from '@/services/patterns';
import { usePreferences } from '@/state/preferences';

import { gatherEntries } from './gatherEntries';
import { loadReading, saveReading } from './readingStore';
import { CONSENT_VERSION, usePatternCards } from './usePatternCards';

jest.mock('@/services/patterns', () => ({
  ...jest.requireActual('@/services/patterns'),
  readPatternCards: jest.fn(),
}));
jest.mock('./readingStore');
jest.mock('./gatherEntries');
jest.mock('@/services/plus', () => ({
  usePlus: () => ({ isPlus: true }),
  useRequirePlus: () => () => true,
}));

const card: PatternCard = {
  name: 'Quiet scoring',
  noticed: 'Made-up notice.',
  evidence: [{ quote: 'a made-up line', date: '2026-11-05' }],
  lens: { text: 'A made-up lens.', source: 'Made up' },
  practice: 'A made-up practice.',
  question: 'A made-up question?',
};

beforeEach(() => {
  jest.clearAllMocks();
  usePreferences.setState({ patternsConsent: CONSENT_VERSION });
  jest.mocked(loadReading).mockResolvedValue({ ok: true, value: null });
  jest.mocked(gatherEntries).mockResolvedValue([{ id: 'e1' }] as never);
  jest.mocked(readPatternCards).mockResolvedValue({
    status: 'cards',
    cards: [card],
    entriesRead: 1,
  } as never);
});

describe('a reading arriving', () => {
  it('takes the skeleton away in the same commit the cards arrive, not after the save', async () => {
    let finishSaving: (value: { ok: true; value: null }) => void = () => undefined;
    jest.mocked(saveReading).mockReturnValue(new Promise((resolve) => (finishSaving = resolve)));
    const { result } = await renderHook(() => usePatternCards([] as readonly EntrySummary[]));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => result.current.read());
    // The cards are in, the skeleton is out, and the encrypted save is still going.
    await waitFor(() => expect(result.current.saved).not.toBeNull());
    expect(result.current.reading).toBe(false);
    expect(saveReading).toHaveBeenCalledTimes(1);

    await act(async () => finishSaving({ ok: true, value: null }));
    expect(result.current.reading).toBe(false);
    expect(result.current.saved?.cards).toHaveLength(1);
    expect(result.current.notice).toBeNull();
  });

  it('still shows the skeleton while the reading is being made', async () => {
    let finishReading: (value: never) => void = () => undefined;
    jest
      .mocked(readPatternCards)
      .mockReturnValue(new Promise((resolve) => (finishReading = resolve as never)));
    jest.mocked(saveReading).mockResolvedValue({ ok: true, value: null });
    const { result } = await renderHook(() => usePatternCards([] as readonly EntrySummary[]));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => result.current.read());
    await waitFor(() => expect(result.current.reading).toBe(true));
    expect(result.current.saved).toBeNull();
    await act(async () =>
      finishReading({ status: 'cards', cards: [card], entriesRead: 1 } as never),
    );
    expect(result.current.reading).toBe(false);
  });
});
