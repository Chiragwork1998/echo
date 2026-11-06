import { fireEvent, screen } from '@testing-library/react-native';
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
import { EchoesScreen } from './EchoesScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  usePathname: () => '/home/echoes',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
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
  mockedEntries.mockImplementation(actualEntries);
  usePreferences.setState({ theme: 'night' });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
});
afterEach(() => setJournal(null));

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

  it('says where the first echo will appear when there are none', async () => {
    seed();
    await render(<EchoesScreen />);
    expect(await screen.findByText(echoesCopy.empty)).toBeTruthy();
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
    seed();
    await render(<EchoesScreen />);
    const search = screen.getByLabelText(echoesCopy.searchLabel);
    expect(search.props.autoComplete).toBe('off');
    expect(search.props.importantForAutofill).toBe('no');
    expect(search.props.textContentType).toBe('none');
    expect(search.props.autoCorrect).toBe(false);
  });
});
