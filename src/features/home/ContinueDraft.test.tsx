// Continue an echo, followed from Home's card into the session it opens. After ECHO was closed in the
// middle of a take, the rescued recording waits in a draft that has no words yet, and the card is how
// a person finds it again. It must open where that recording is offered, as Begin opens it, and an
// ordinary written draft must still open as it was.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, Dimensions } from 'react-native';

import { copy } from '@/content/copy';
import {
  createMemoryJournal,
  listDrafts,
  setJournal,
  useVoiceRecorder,
  type Entry,
} from '@/features/journal';
import { DailySessionScreen } from '@/features/journal-session/DailySessionScreen';
import { sessionCopy } from '@/features/journal-session/sessionCopy';
import { transcribeEntryAudio } from '@/services/transcription';
import { resetPreferences, usePreferences, VOICE_POLICY_VERSION } from '@/state/preferences';
import { render } from '@/testing/render';

import { HomeScreen } from './screens/HomeScreen';
import { useStoneMemory } from './today/stoneMemory';

let mockParams: Record<string, string> = {};

jest.mock('@/design/haptics');
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { navigate: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
    Stack: { Screen: () => null },
    usePathname: () => '/home',
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
  useAnimatedKeyboard: () => ({ height: { get: () => 0 }, state: { get: () => 0 } }),
}));
// Evening, whatever the hour the tests run: Begin's morning is tested in become.
jest.mock('@/features/become/morning', () => ({
  ...jest.requireActual('@/features/become/morning'),
  useMorning: () => false,
}));
// The book arrives and opens at once, as it does under Reduce Motion.
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => true }));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useVoiceRecorder: jest.fn(),
}));
jest.mock('@/services/permissions', () => ({
  requestMicrophonePermission: jest.fn(),
  getMicrophonePermission: jest.fn(async () => ({ status: 'granted' })),
  openAppSettings: jest.fn(),
}));
jest.mock('@/services/transcription', () => ({
  ...jest.requireActual('@/services/transcription'),
  transcribeEntryAudio: jest.fn(),
}));

const AT = Date.parse('2026-11-08T07:50:00Z');
const RESCUED = { id: 'rescued', extension: '.aac', durationSeconds: null, recovered: true };
const WRITTEN = 'Words written last night, waiting to be finished.';

const draft = (patch: Partial<Entry>): Entry => ({
  id: 'draft-1',
  status: 'draft',
  body: '',
  mode: 'text',
  durationSeconds: 0,
  createdAt: AT,
  updatedAt: AT,
  ...patch,
});

const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useStoneMemory.getState().reset();
  resetPreferences();
  mockParams = {};
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => false);
  jest.mocked(useVoiceRecorder).mockImplementation(
    () =>
      ({
        available: true,
        liveAvailable: false,
        state: 'idle',
        elapsedSeconds: 0,
        error: null,
        start: jest.fn(async () => null),
        stop: jest.fn(),
        cancel: jest.fn(),
      }) as unknown as ReturnType<typeof useVoiceRecorder>,
  );
  // As in the walk: this person last chose to write, and has allowed their voice to become words.
  usePreferences.setState({
    theme: 'night',
    lastMode: 'write',
    voiceConsent: { choice: 'allowed', version: VOICE_POLICY_VERSION },
  });
});
afterEach(() => {
  setJournal(null);
  jest.useRealTimers();
});

/** Home, then a press on Continue an echo, then the session that press opens. */
async function continueFromHome(entry: Entry, card: RegExp) {
  setJournal(createMemoryJournal({ entries: [entry] }));
  const home = await render(<HomeScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: card }));
  const opened = jest.mocked(router.push).mock.lastCall?.[0] as unknown as {
    pathname: string;
    params: Record<string, string>;
  };
  expect(opened.pathname).toBe('/home/session');
  await home.unmount();
  mockParams = opened.params;
  await render(<DailySessionScreen />);
  await tick(600);
}

describe('Continue an echo', () => {
  it('opens a rescued recording where it is offered as words, as Begin does', async () => {
    await continueFromHome(draft({ mode: 'voice', audio: RESCUED }), /Voice echo/);
    expect(await screen.findByText(sessionCopy.transcribe.untranscribed)).toBeTruthy();
    expect(screen.getByRole('button', { name: sessionCopy.transcribe.action })).toBeTruthy();
    expect(screen.getByRole('button', { name: sessionCopy.speak.writeInstead })).toBeTruthy();
  });

  it('loses nothing and sends nothing twice: the same draft, the same recording, sent once when asked', async () => {
    jest.mocked(transcribeEntryAudio).mockResolvedValue({
      ok: true,
      value: {
        text: 'What the rescued take said.',
        polished: false,
        languages: ['en'],
        seconds: 4,
      },
    });
    await continueFromHome(draft({ mode: 'voice', audio: RESCUED }), /Voice echo/);
    await screen.findByText(sessionCopy.transcribe.untranscribed);
    // Opening it sent nothing, and made no second draft.
    expect(transcribeEntryAudio).not.toHaveBeenCalled();
    const drafts = await listDrafts();
    expect(drafts.ok && drafts.value.map((entry) => entry.id)).toEqual(['draft-1']);

    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.transcribe.action }));
    await tick(600);
    expect(transcribeEntryAudio).toHaveBeenCalledTimes(1);
    expect(jest.mocked(transcribeEntryAudio).mock.calls[0]?.[0]).toBe('draft-1');
  });

  it('still opens an ordinary written draft with its words on the page', async () => {
    await continueFromHome(draft({ body: WRITTEN, durationSeconds: 120 }), /Words written/);
    await waitFor(() => expect(screen.getByLabelText(copy.home.prompt).props.value).toBe(WRITTEN));
    expect(screen.queryByText(sessionCopy.transcribe.untranscribed)).toBeNull();
  });
});
