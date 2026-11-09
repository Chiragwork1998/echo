import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions, StyleSheet } from 'react-native';

import { tokens } from '@/design/tokens';
import { createMemoryJournal, openEntryAudio, setJournal, type Entry } from '@/features/journal';
import { usePreferences } from '@/state/preferences';
import {
  backOutOfDialog,
  chooseInDialog,
  dialogChoices,
  dialogPrimary,
  openDialog,
  renderWithDialogs,
} from '@/testing/dialogs';
import { render } from '@/testing/render';

import { echoesCopy } from './echoesCopy';
import { resetRemovedEchoes, useRemovedEchoes } from './removed';
import { EntryReaderScreen } from './EntryReaderScreen';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), remove: jest.fn(), release: jest.fn() };
let mockStatus: (status: { didJustFinish: boolean }) => void = () => undefined;
const mockAudio = {
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn(() => ({
    ...mockPlayer,
    addListener: (_event: string, listener: typeof mockStatus) => {
      mockStatus = listener;
      return { remove: jest.fn() };
    },
  })),
};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  usePathname: () => '/home/entry',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/services/nativeModules', () => ({ loadAudio: () => mockAudio }));
jest.mock('@/features/journal', () => {
  const actual = jest.requireActual('@/features/journal');
  return { ...actual, openEntryAudio: jest.fn() };
});

const mockedOpen = openEntryAudio as jest.MockedFunction<typeof openEntryAudio>;
const AT = new Date(2026, 10, 5, 9, 41).getTime();
const base: Entry = {
  id: 'one',
  status: 'committed',
  title: 'The weight I didn’t name',
  body: 'Sometimes the heaviest things live in the quietest corners.',
  mode: 'text',
  moodBefore: 'steady',
  durationSeconds: 360,
  createdAt: AT,
  updatedAt: AT,
  committedAt: AT,
  localDay: '2026-11-05',
};
const seed = (...entries: Entry[]) => setJournal(createMemoryJournal({ entries }));

beforeEach(() => {
  jest.clearAllMocks();
  usePreferences.setState({ theme: 'night' });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
});
afterEach(() => setJournal(null));

describe('EntryReaderScreen', () => {
  it('shows the echo’s title, words, date, length and mood', async () => {
    seed(base);
    await render(<EntryReaderScreen id="one" />);
    expect(await screen.findByText(base.body)).toBeTruthy();
    expect(screen.getByText(base.title as string)).toBeTruthy();
    expect(screen.getByText(/6 min · Mood: Steady/)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('heads an echo with no title by its day, so its words are read once, in place', async () => {
    seed({ ...base, title: '', promptText: 'What is asking for your attention?' });
    await render(<EntryReaderScreen id="one" />);
    expect(await screen.findByText(base.body)).toBeTruthy();
    expect(screen.getAllByText(base.body)).toHaveLength(1);
    expect(screen.getByRole('header', { name: /November 5|5 November/ })).toBeTruthy();
    // The question it answered sits once, quietly, above the words.
    expect(screen.getByText('What is asking for your attention?')).toBeTruthy();
  });

  it('marks a morning echo', async () => {
    seed({ ...base, promptId: 'become' });
    await render(<EntryReaderScreen id="one" />);
    expect(await screen.findByText(/Morning · 6 min/)).toBeTruthy();
  });

  it.each(['night', 'day'] as const)(
    'sets Delete in the page’s ink with the plate’s shadow on the %s sky, never orange',
    async (theme) => {
      usePreferences.setState({ theme });
      seed(base);
      await render(<EntryReaderScreen id="one" />);
      const button = await screen.findByRole('button', { name: echoesCopy.delete });
      const word = StyleSheet.flatten(within(button).getByText(echoesCopy.delete).props.style);
      expect(word.color).toBe(tokens.color[theme].textPrimary);
      expect(word.color).not.toBe(tokens.color[theme].danger);
      expect(word.textShadowColor).toBeTruthy();
    },
  );

  it('goes back from the Back button', async () => {
    seed(base);
    await render(<EntryReaderScreen id="one" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('leaves for the archive when there is nothing behind it to go back to', async () => {
    seed();
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await render(<EntryReaderScreen id="missing" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home/echoes'));
  });

  it('leaves when the id is missing or the echo no longer exists', async () => {
    seed();
    await render(<EntryReaderScreen id={null} />);
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });

  it('asks before deleting, deletes only on Delete, and leaves exactly once', async () => {
    seed(base);
    await renderWithDialogs(<EntryReaderScreen id="one" />);
    await fireEvent.press(await screen.findByRole('button', { name: echoesCopy.delete }));
    expect(screen.getByRole('header', { name: echoesCopy.deleteTitle })).toBeTruthy();
    expect(screen.getByText(echoesCopy.deleteBody)).toBeTruthy();
    expect(echoesCopy.deleteBody).toMatch(/can’t be undone/);
    // Deleting is never the inviting button: both are quiet words, and Cancel comes last.
    expect(dialogChoices()).toEqual([echoesCopy.deleteConfirm, echoesCopy.deleteCancel]);
    expect(dialogPrimary()).toBeNull();
    expect(router.back).not.toHaveBeenCalled();

    await chooseInDialog(echoesCopy.deleteConfirm);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('tells the archive the echo is gone as it leaves, so the list never shows it again', async () => {
    seed(base);
    resetRemovedEchoes();
    await renderWithDialogs(<EntryReaderScreen id="one" />);
    await fireEvent.press(await screen.findByRole('button', { name: echoesCopy.delete }));
    expect(useRemovedEchoes.getState().deleted.has('one')).toBe(false);
    await chooseInDialog(echoesCopy.deleteConfirm);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    // Said before the person is taken back to the list, not after it has been read again.
    expect(useRemovedEchoes.getState().deleted.has('one')).toBe(true);
  });

  it('says nothing of an echo that was kept', async () => {
    seed(base);
    resetRemovedEchoes();
    await renderWithDialogs(<EntryReaderScreen id="one" />);
    await fireEvent.press(await screen.findByRole('button', { name: echoesCopy.delete }));
    await chooseInDialog(echoesCopy.deleteCancel);
    expect(useRemovedEchoes.getState().deleted.size).toBe(0);
  });

  it.each([
    ['Cancel', () => chooseInDialog(echoesCopy.deleteCancel)],
    ['Back', backOutOfDialog],
  ])('keeps the echo on %s', async (_way, leave) => {
    seed(base);
    await renderWithDialogs(<EntryReaderScreen id="one" />);
    await fireEvent.press(await screen.findByRole('button', { name: echoesCopy.delete }));
    await leave();
    expect(openDialog()).toBeNull();
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByText(base.body)).toBeTruthy();
  });
});

describe('EntryReaderScreen audio', () => {
  const voice: Entry = {
    ...base,
    body: '',
    mode: 'voice',
    audio: { id: 'au', extension: '.m4a', durationSeconds: 125, recovered: false },
  };

  it('plays a recording, and releases the decrypted copy when it finishes', async () => {
    const release = jest.fn();
    mockedOpen.mockResolvedValue({ ok: true, value: { uri: 'file:///x.m4a', release } });
    seed(voice);
    await render(<EntryReaderScreen id="one" />);
    await fireEvent.press(await screen.findByRole('button', { name: /Play recording/ }));
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
    expect(mockedOpen).toHaveBeenCalledWith('one');
    expect(release).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Pause recording/ })).toBeTruthy();

    await act(async () => mockStatus({ didJustFinish: true }));
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    expect(mockPlayer.release).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /Play recording/ })).toBeTruthy();
  });

  it('releases the decrypted copy when the page is left mid-playback', async () => {
    const release = jest.fn();
    mockedOpen.mockResolvedValue({ ok: true, value: { uri: 'file:///x.m4a', release } });
    seed(voice);
    const view = await render(<EntryReaderScreen id="one" />);
    await fireEvent.press(await screen.findByRole('button', { name: /Play recording/ }));
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
    await view.unmount();
    expect(release).toHaveBeenCalledTimes(1);
    // On Android remove() alone leaves the recording playing after the page has gone.
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(mockPlayer.release).toHaveBeenCalledTimes(1);
    expect(mockPlayer.pause.mock.invocationCallOrder.at(-1) ?? 0).toBeLessThan(
      mockPlayer.release.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('says so, and offers another try, when the recording cannot be opened', async () => {
    mockedOpen.mockResolvedValue({ ok: false, error: { code: 'audio_failed', retryable: true } });
    seed(voice);
    await render(<EntryReaderScreen id="one" />);
    await fireEvent.press(await screen.findByRole('button', { name: /Play recording/ }));
    expect(await screen.findByText(echoesCopy.audioError)).toBeTruthy();
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('notes a recording that was recovered and may be cut short', async () => {
    seed({
      ...voice,
      audio: { id: 'au', extension: '.m4a', durationSeconds: null, recovered: true },
    });
    await render(<EntryReaderScreen id="one" />);
    expect(await screen.findByText(echoesCopy.recovered)).toBeTruthy();
  });
});
