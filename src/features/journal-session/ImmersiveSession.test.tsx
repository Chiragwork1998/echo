import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, Alert } from 'react-native';

import { copy } from '@/content/copy';
import {
  createMemoryJournal,
  setJournal,
  useVoiceRecorder,
  type Journal,
} from '@/features/journal';
import { emptyContent } from '@/features/journal/content';
import { requestMicrophonePermission } from '@/services/permissions';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { usePreferences, VOICE_POLICY_VERSION } from '@/state/preferences';
import { transcribeEntryAudio } from '@/services/transcription';
import { render } from '@/testing/render';

import { JournalSession } from './JournalSession';
import { sessionCopy } from './sessionCopy';
import { QUIET_MS } from './sky';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { navigate: jest.fn() },
    Stack: { Screen: () => null },
    usePathname: () => '/home/session',
    // The screen is always focused here: run the effect on mount, and clean it up on unmount.
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
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useVoiceRecorder: jest.fn(),
}));
jest.mock('@/services/permissions', () => ({
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));
jest.mock('@/services/transcription', () => ({
  ...jest.requireActual('@/services/transcription'),
  transcribeEntryAudio: jest.fn(),
}));

const BODY = 'something I have carried';
type Voice = ReturnType<typeof useVoiceRecorder>;
let voice: Voice;
let journal: Journal;
let saveFails: boolean;
let commitFails: boolean;
let screenReader: boolean;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useOnboarding.setState({ ...initialOnboarding, mode: undefined, mood: undefined });
  // Speak is the default (D-006). These tests start from a person who last wrote.
  usePreferences.setState({ lastMode: 'write', voiceConsent: null });
  const inner = createMemoryJournal({ entries: [] });
  saveFails = false;
  commitFails = false;
  screenReader = false;
  journal = {
    ...inner,
    saveDraft: (id, content) =>
      saveFails
        ? Promise.resolve({ ok: false, error: { code: 'write_failed', retryable: true } })
        : inner.saveDraft(id, content),
    commitEntry: (id, content) =>
      commitFails
        ? Promise.resolve({ ok: false, error: { code: 'write_failed', retryable: true } })
        : inner.commitEntry(id, content),
  };
  setJournal(journal);
  jest
    .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
    .mockImplementation(async () => screenReader);
  voice = {
    available: true,
    state: 'idle',
    elapsedSeconds: 0,
    error: null,
    start: jest.fn(async () => null),
    stop: jest.fn(async () => ({ ok: true, value: { durationSeconds: 3 } })),
    cancel: jest.fn(),
  } as unknown as Voice;
  jest.mocked(useVoiceRecorder).mockImplementation(() => voice);
});
afterEach(() => {
  setJournal(null);
  jest.useRealTimers();
});

async function open(props = {}) {
  // The open sky: D-003 as first built, and what DAILY_PAGE = 'sky' returns to.
  await render(<JournalSession variant="daily" plain {...props} />);
  const input = () => screen.getByLabelText(copy.home.prompt);
  // The draft has opened once the scenery can be touched.
  await waitFor(() =>
    expect(screen.getByTestId('session-scenery').props.accessibilityState.disabled).toBe(false),
  );
  return input;
}
const write = (input: () => ReturnType<typeof screen.getByLabelText>, text = BODY) =>
  fireEvent.changeText(input(), text);
/** Controls are in the tree always, and reachable only when they have come. */
const controls = () => screen.queryByRole('button', { name: sessionCopy.quiet.back });
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

describe('the open sky', () => {
  it('shows only the field: no header, timer, mode switch, saved mark or prompt', async () => {
    await open();
    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(sessionCopy.saved)).toBeNull();
    expect(screen.queryByText(copy.home.prompt)).toBeNull();
    expect(screen.queryByText(copy.firstEcho.placeholder)).toBeNull();
    expect(screen.queryByPlaceholderText(copy.firstEcho.placeholder)).toBeNull();
    expect(controls()).toBeNull();
  });

  it('keeps autofill off and labels the field for a screen reader', async () => {
    const input = await open();
    expect(input().props.autoComplete).toBe('off');
    expect(input().props.importantForAutofill).toBe('no');
    expect(input().props.textContentType).toBe('none');
    expect(input().props.accessibilityLabel).toBe(copy.home.prompt);
  });

  it('does not open the keyboard by itself', async () => {
    const input = await open();
    expect(input().props.autoFocus).toBeFalsy();
  });

  it('shows the continued words straight away', async () => {
    const inner = createMemoryJournal({ entries: [] });
    const saved = await inner.saveDraft('d1', emptyContent({ body: BODY }));
    expect(saved.ok).toBe(true);
    setJournal(inner);
    const input = await open({ draftId: 'd1' });
    await waitFor(() => expect(input().props.value).toBe(BODY));
  });
});

describe('the quiet controls', () => {
  it('come after four quiet seconds of writing, and leave the moment writing resumes', async () => {
    const input = await open();
    await fireEvent(input(), 'focus');
    await write(input);
    await tick(QUIET_MS - 1);
    expect(controls()).toBeNull();
    await tick(1);
    expect(controls()).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.firstEcho.speak })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.firstEcho.cta })).toBeTruthy();

    await write(input, `${BODY} and more`);
    expect(controls()).toBeNull();
    await tick(QUIET_MS);
    expect(controls()).toBeTruthy();
  });

  it('offer Reflect only once there is enough to reflect on', async () => {
    const input = await open();
    await fireEvent(input(), 'blur');
    expect(controls()).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.firstEcho.cta })).toBeNull();
    await write(input);
    await fireEvent(input(), 'blur');
    expect(screen.getByRole('button', { name: copy.firstEcho.cta })).toBeTruthy();
  });

  it('stay in view for a screen reader, with no timing at all', async () => {
    screenReader = true;
    await open();
    await waitFor(() => expect(controls()).toBeTruthy());
  });

  it('come back to Home through Keep draft, Discard and Stay when there is writing', async () => {
    const input = await open();
    await write(input);
    await fireEvent(input(), 'blur');
    const alert = jest.spyOn(Alert, 'alert');
    await fireEvent.press(controls()!);
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((button: { text?: string }) => button.text)).toEqual([
      'Keep draft',
      'Discard',
      'Stay',
    ]);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('safety', () => {
  it('always says so when a save fails, even with no controls on screen', async () => {
    const input = await open();
    saveFails = true;
    await write(input);
    expect(await screen.findByText(sessionCopy.errors.save, {}, { timeout: 3000 })).toBeTruthy();
    expect(controls()).toBeNull();
    expect(input().props.value).toBe(BODY);
  });

  it('navigates to Completion only after the entry is committed, and pins Reflect when it fails', async () => {
    const input = await open();
    await write(input);
    await fireEvent(input(), 'blur');
    commitFails = true;
    await fireEvent.press(screen.getByRole('button', { name: copy.firstEcho.cta }));
    expect(await screen.findByText(sessionCopy.errors.commit)).toBeTruthy();
    expect(router.navigate).not.toHaveBeenCalled();

    // Typing again takes the controls away, but a failed Reflect keeps its way to try again.
    await write(input, `${BODY}!`);
    expect(screen.getByRole('button', { name: copy.firstEcho.cta })).toBeTruthy();

    commitFails = false;
    await fireEvent.press(screen.getByRole('button', { name: copy.firstEcho.cta }));
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/home/complete'));
  });
});

describe('speaking', () => {
  it('starts recording from a tap on the scenery', async () => {
    await open({ initialMode: 'speak' });
    await fireEvent.press(screen.getByTestId('session-scenery'));
    expect(voice.start).toHaveBeenCalledTimes(1);
  });

  it('keeps Stop in the quiet row while recording, and stops from a tap on the scenery too', async () => {
    voice = { ...voice, state: 'recording' } as Voice;
    await open({ initialMode: 'speak' });
    // The light is the only thing on the sky, and Stop is one glance away.
    expect(controls()).not.toBeNull();
    expect(screen.getByRole('button', { name: sessionCopy.quiet.stop })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.firstEcho.cta })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.quiet.stop }));
    expect(voice.stop).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('session-scenery'));
    expect(voice.stop).toHaveBeenCalledTimes(2);
  });

  it('explains the microphone in plain words before the system asks', async () => {
    jest.mocked(requestMicrophonePermission).mockResolvedValue({ status: 'granted' } as never);
    (voice.start as jest.Mock).mockResolvedValueOnce('permission_required');
    await open({ initialMode: 'speak' });
    await fireEvent.press(screen.getByTestId('session-scenery'));
    expect(await screen.findByText(sessionCopy.speak.explain)).toBeTruthy();
    expect(requestMicrophonePermission).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: sessionCopy.speak.writeInstead })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.allow }));
    await waitFor(() => expect(requestMicrophonePermission).toHaveBeenCalled());
    await waitFor(() => expect(voice.start).toHaveBeenCalledTimes(2));
  });
});

describe('the spoken daily echo (D-006)', () => {
  const send = jest.mocked(transcribeEntryAudio);
  const said = (text: string) => ({
    ok: true as const,
    value: { text, polished: true, languages: ['en'], seconds: 2 },
  });
  const scenery = () => screen.getByTestId('session-scenery');

  beforeEach(() => {
    usePreferences.setState({
      lastMode: 'speak',
      voiceConsent: { choice: 'allowed', version: VOICE_POLICY_VERSION },
    });
  });

  it('opens on the light, in Speak, and never starts recording by itself', async () => {
    await open();
    expect(screen.getByRole('button', { name: sessionCopy.speak.record })).toBeTruthy();
    await tick(10_000);
    expect(voice.start).not.toHaveBeenCalled();
    await fireEvent.press(scenery());
    expect(voice.start).toHaveBeenCalledTimes(1);
  });

  it('shows ...listening on the sky, then lets the words in, and the light is ready for another take', async () => {
    let arrive: (value: ReturnType<typeof said>) => void = () => undefined;
    send.mockReturnValue(new Promise((resolve) => (arrive = resolve)));
    voice = { ...voice, state: 'recording' } as Voice;
    voice.stop = jest.fn(async () => {
      voice.state = 'idle';
      return {
        ok: true,
        value: { id: 'a1', extension: '.m4a', durationSeconds: 5, recovered: false },
      };
    }) as never;
    const input = await open();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.quiet.stop }));
    expect(await screen.findByText(sessionCopy.transcribe.listening)).toBeTruthy();
    // The quiet row stays; nothing traps the person while the words come.
    expect(controls()).toBeTruthy();

    await act(async () => arrive(said('Something I have been avoiding.')));
    await waitFor(() => expect(input().props.value).toBe('Something I have been avoiding.'));
    expect(screen.queryByText(sessionCopy.transcribe.listening)).toBeNull();

    // A second take: a tap on the sky begins it, whether or not the first has landed.
    await fireEvent.press(scenery());
    expect(voice.start).toHaveBeenCalledTimes(1);
  });

  it('says the recording is safe when the words do not come, with Try again', async () => {
    send.mockResolvedValueOnce({ ok: false, error: { code: 'offline', retryable: true } });
    voice = { ...voice, state: 'recording' } as Voice;
    voice.stop = jest.fn(async () => {
      voice.state = 'idle';
      return {
        ok: true,
        value: { id: 'a1', extension: '.m4a', durationSeconds: 5, recovered: false },
      };
    }) as never;
    await open();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.quiet.stop }));
    expect(await screen.findByText(sessionCopy.transcribe.failed.offline)).toBeTruthy();
    send.mockResolvedValueOnce(said('Back online.'));
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.errors.retry }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  });

  it('brings Back and Write after a few quiet seconds on the light, and remembers Write', async () => {
    await open();
    expect(controls()).toBeNull();
    await tick(QUIET_MS);
    expect(controls()).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: copy.firstEcho.write }));
    expect(usePreferences.getState().lastMode).toBe('write');
  });
});
