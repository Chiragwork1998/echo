import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert, Dimensions } from 'react-native';

import { createMemoryJournal, openEntryAudio, setJournal, type Entry } from '@/features/journal';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { echoesCopy } from './echoesCopy';
import { EntryReaderScreen } from './EntryReaderScreen';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), remove: jest.fn() };
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

function confirmDelete() {
  const [, , buttons] = jest.mocked(Alert.alert).mock.calls[0] ?? [];
  return buttons?.find((button) => button.style === 'destructive');
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
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

  it('asks before deleting, deletes only on the destructive button, and leaves exactly once', async () => {
    seed(base);
    await render(<EntryReaderScreen id="one" />);
    await fireEvent.press(await screen.findByRole('button', { name: echoesCopy.delete }));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(Alert.alert).mock.calls[0]?.[0]).toBe(echoesCopy.deleteTitle);
    expect(jest.mocked(Alert.alert).mock.calls[0]?.[1]).toMatch(/can’t be undone/);
    expect(router.back).not.toHaveBeenCalled();

    await act(async () => confirmDelete()?.onPress?.());
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('keeps the echo when the confirmation is cancelled', async () => {
    seed(base);
    await render(<EntryReaderScreen id="one" />);
    await fireEvent.press(await screen.findByRole('button', { name: echoesCopy.delete }));
    const cancel = jest.mocked(Alert.alert).mock.calls[0]?.[2]?.find((b) => b.style === 'cancel');
    await act(async () => cancel?.onPress?.());
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
    expect(mockPlayer.remove).toHaveBeenCalled();
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
