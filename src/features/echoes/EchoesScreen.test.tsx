import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useEffect as mockUseEffect } from 'react';
import { router } from 'expo-router';
import { Dimensions } from 'react-native';

import {
  createMemoryJournal,
  setJournal,
  useEntries,
  type Entry,
  type EntrySummary,
} from '@/features/journal';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { echoesCopy } from './echoesCopy';
import { hideEcho, resetRemovedEchoes } from './removed';
import { EchoesScreen } from './EchoesScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() },
  usePathname: () => '/home/echoes',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
// Counts how many times a row is built from nothing, to prove a keystroke never rebuilds the list.
const mockMounts = { rows: 0 };
jest.mock('./EntryRow', () => {
  const actual = jest.requireActual('./EntryRow');
  return {
    ...actual,
    EntryRow: (props: object) => {
      mockUseEffect(() => {
        mockMounts.rows += 1;
      }, []);
      return <actual.EntryRow {...props} />;
    },
  };
});
jest.mock('@/features/journal', () => {
  const actual = jest.requireActual('@/features/journal');
  return { ...actual, useEntries: jest.fn(actual.useEntries) };
});

const actualEntries = jest.requireActual('@/features/journal').useEntries;
const mockedEntries = useEntries as jest.MockedFunction<typeof useEntries>;

const AT = new Date(2026, 10, 5, 9, 41).getTime();
const entry = (id: string, day: string, patch: Partial<Entry> = {}): Entry => ({
  id,
  status: 'committed',
  title: '',
  body: 'Some words',
  mode: 'text',
  durationSeconds: 360,
  createdAt: AT,
  updatedAt: AT,
  committedAt: AT,
  localDay: day,
  ...patch,
});

const seed = (...entries: Entry[]) => setJournal(createMemoryJournal({ entries }));
const unreadable: EntrySummary = {
  id: 'broken',
  status: 'committed',
  readable: false,
  title: '',
  preview: '',
  mode: 'text',
  durationSeconds: 0,
  hasAudio: false,
  recovered: false,
  createdAt: AT,
  updatedAt: AT,
  localDay: '2026-11-03',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMounts.rows = 0;
  mockedEntries.mockImplementation(actualEntries);
  usePreferences.setState({ theme: 'night' });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
});
afterEach(() => {
  setJournal(null);
  resetRemovedEchoes();
});

describe('EchoesScreen', () => {
  it('lists committed echoes newest first with a calm fallback title', async () => {
    seed(
      entry('old', '2026-11-01', { title: 'Older', committedAt: AT - 1000 }),
      entry('new', '2026-11-05', { title: '', body: 'The newest words', committedAt: AT }),
      entry('voice', '2026-11-04', { body: '', mode: 'voice', committedAt: AT - 500 }),
    );
    await render(<EchoesScreen />);
    const rows = await screen.findAllByTestId(/^echo-row-/);
    expect(rows.map((row) => row.props.testID)).toEqual([
      'echo-row-new',
      'echo-row-voice',
      'echo-row-old',
    ]);
    expect(screen.getByText('The newest words')).toBeTruthy();
    expect(screen.getByText(echoesCopy.voiceEcho)).toBeTruthy();
    expect(screen.getByRole('header', { name: echoesCopy.title })).toBeTruthy();
  });

  it('says where the first echo will appear when there are none, and what to do', async () => {
    seed();
    await render(<EchoesScreen />);
    expect(await screen.findByText(echoesCopy.empty)).toBeTruthy();
    expect(screen.getByText(echoesCopy.emptyBody)).toBeTruthy();
    // Nothing to search yet.
    expect(screen.queryByLabelText(echoesCopy.searchLabel)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: echoesCopy.goToday }));
    // Back to the Today at the foot of Home's stack, never a second one pushed over it.
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('names an untitled echo by its first words, cut at a word, never by its question', async () => {
    seed(
      entry('a', '2026-11-05', {
        body: 'I keep saying yes before I have even heard the whole question, and then I spend the evening resenting it.',
        promptText: 'What is asking for your attention?',
      }),
      entry('b', '2026-11-04', {
        body: 'Short and whole.',
        promptText: 'What is asking for your attention?',
      }),
    );
    await render(<EchoesScreen />);
    expect(
      await screen.findByText('I keep saying yes before I have even heard the whole…'),
    ).toBeTruthy();
    expect(screen.getByText('Short and whole.')).toBeTruthy();
    expect(screen.queryByText('What is asking for your attention?')).toBeNull();
  });

  it('marks a morning echo quietly, and gathers echoes under their month', async () => {
    seed(
      entry('m', '2026-11-05', { promptId: 'become', body: 'Calm, honest, unhurried.' }),
      entry('e', '2026-10-30', { body: 'An evening in October.' }),
    );
    await render(<EchoesScreen />);
    expect(await screen.findByText(echoesCopy.morning)).toBeTruthy();
    expect(screen.getAllByText(echoesCopy.morning)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Calm, honest, unhurried\..*Morning/ })).toBeTruthy();
    const months = screen.getAllByRole('header').map((header) => header.props.accessibilityLabel);
    expect(months).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^November/),
        expect.stringMatching(/^October/),
      ]),
    );
  });

  it('keeps an unreadable echo in the list, says it cannot be opened, and still lets it be opened to delete', async () => {
    seed();
    mockedEntries.mockReturnValue({
      status: 'ready',
      data: [unreadable],
      error: null,
      refresh: async () => undefined,
    });
    await render(<EchoesScreen />);
    const row = screen.getByRole('button', { name: new RegExp(echoesCopy.unreadable) });
    expect(screen.getByText(echoesCopy.unreadable)).toBeTruthy();
    await fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/home/entry', params: { id: 'broken' } });
  });

  it('opens a readable echo in the reader', async () => {
    seed(entry('one', '2026-11-05', { title: 'Open me' }));
    await render(<EchoesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /Open me/ }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/home/entry', params: { id: 'one' } });
  });

  it('shows an inline error with a retry when the archive cannot be read', async () => {
    const refresh = jest.fn(async () => undefined);
    mockedEntries.mockReturnValue({
      status: 'error',
      data: null,
      error: { code: 'read_failed', retryable: true },
      refresh,
    });
    await render(<EchoesScreen />);
    expect(screen.getByText(echoesCopy.loadError)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('searches across title, body and date, and says when nothing returns', async () => {
    seed(
      entry('a', '2026-11-05', { title: 'River', body: 'Walking by the water' }),
      entry('b', '2026-10-02', { title: 'Quiet', body: 'An ordinary day' }),
    );
    await render(<EchoesScreen />);
    const search = screen.getByLabelText(echoesCopy.searchLabel);

    await fireEvent.changeText(search, 'water');
    expect(await screen.findByTestId('echo-row-a')).toBeTruthy();
    expect(screen.queryByTestId('echo-row-b')).toBeNull();

    await fireEvent.changeText(search, 'october');
    expect(await screen.findByTestId('echo-row-b')).toBeTruthy();
    expect(screen.queryByTestId('echo-row-a')).toBeNull();

    await fireEvent.changeText(search, 'zzzz');
    expect(await screen.findByText(echoesCopy.noMatches)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: echoesCopy.clearSearch }));
    expect(await screen.findByTestId('echo-row-a')).toBeTruthy();
  });

  it('turns autofill and suggestions off on the search field', async () => {
    seed(entry('one', '2026-11-05'));
    await render(<EchoesScreen />);
    const search = await screen.findByLabelText(echoesCopy.searchLabel);
    expect(search.props.autoComplete).toBe('off');
    expect(search.props.importantForAutofill).toBe('no');
    expect(search.props.textContentType).toBe('none');
    expect(search.props.autoCorrect).toBe(false);
  });

  it('does not tear the list down and build it again for a keystroke', async () => {
    seed(
      entry('a', '2026-11-05', { title: 'River', body: 'Walking by the water' }),
      entry('b', '2026-11-04', { title: 'Quiet', body: 'An ordinary day' }),
    );
    await render(<EchoesScreen />);
    await screen.findByTestId('echo-row-b');
    expect(mockMounts.rows).toBe(2);

    await fireEvent.changeText(screen.getByLabelText(echoesCopy.searchLabel), 'water');
    // While the search runs the rows already on screen stay, quietly, and are the same rows.
    expect(
      screen.getByLabelText(echoesCopy.searching, { includeHiddenElements: true }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByLabelText(echoesCopy.searching, { includeHiddenElements: true }),
      ).toBeNull(),
    );
    expect(screen.queryByTestId('echo-row-b')).toBeNull();
    expect(screen.getByTestId('echo-row-a')).toBeTruthy();
    expect(mockMounts.rows).toBe(2);
  });

  it('keeps saying nothing returned while a longer query waits for its answer, with no skeleton', async () => {
    seed(entry('a', '2026-11-05', { title: 'River', body: 'Walking by the water' }));
    await render(<EchoesScreen />);
    const search = await screen.findByLabelText(echoesCopy.searchLabel);

    await fireEvent.changeText(search, 'zzzz');
    expect(await screen.findByText(echoesCopy.noMatches)).toBeTruthy();

    await fireEvent.changeText(search, 'zzzzz');
    expect(screen.getByText(echoesCopy.noMatches)).toBeTruthy();
    expect(screen.queryByLabelText(echoesCopy.loading, { includeHiddenElements: true })).toBeNull();
    expect(await screen.findByText(echoesCopy.noMatches)).toBeTruthy();
  });
});

describe('EchoesScreen when an echo is deleted', () => {
  // The walk (v10): the list kept the deleted echo for a moment, then the rows jumped up. The list
  // lets go of it when the deletion is known, before it has read the archive again, and the row leaves.
  const rowsNow = () => screen.queryAllByTestId(/^echo-row-[a-z]+$/).map((row) => row.props.testID);

  it('stops listing it at once, and then the row is gone', async () => {
    seed(
      entry('one', '2026-11-05', { title: 'First', committedAt: AT }),
      entry('two', '2026-11-04', { title: 'Second', committedAt: AT - 1000 }),
      entry('three', '2026-11-03', { title: 'Third', committedAt: AT - 2000 }),
    );
    await render(<EchoesScreen />);
    await screen.findByTestId('echo-row-two');
    // No journal change is announced here: only the deletion is known.
    await act(async () => hideEcho('two'));
    expect(rowsNow()).toEqual(['echo-row-one', 'echo-row-three']);
    await waitFor(
      () =>
        expect(screen.queryByTestId('echo-row-two', { includeHiddenElements: true })).toBeNull(),
      { timeout: 3000 },
    );
    expect(rowsNow()).toEqual(['echo-row-one', 'echo-row-three']);
  });

  it('says there are no echoes when the last one is deleted', async () => {
    seed(entry('one', '2026-11-05', { title: 'Only' }));
    await render(<EchoesScreen />);
    await screen.findByTestId('echo-row-one');
    await act(async () => hideEcho('one'));
    expect(await screen.findByText(echoesCopy.empty)).toBeTruthy();
  });
});
