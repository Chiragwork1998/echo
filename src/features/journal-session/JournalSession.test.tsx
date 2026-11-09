import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { AppState, Text } from 'react-native';

import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { ThemeProvider, useTheme } from '@/design/theme';
import {
  createMemoryJournal,
  latestDraft,
  setJournal,
  useVoiceRecorder,
  type Journal,
} from '@/features/journal';
import { queueFormat } from '@/services/formatQueue';
import {
  getMicrophonePermission,
  openAppSettings,
  requestMicrophonePermission,
} from '@/services/permissions';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
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

import { JournalSession as Session, type SessionVariant } from './JournalSession';
import { sessionCopy } from './sessionCopy';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { navigate: jest.fn(), dismissTo: jest.fn() },
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
  getMicrophonePermission: jest.fn(),
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));
jest.mock('@/services/formatQueue', () => ({
  ...jest.requireActual('@/services/formatQueue'),
  queueFormat: jest.fn(),
}));

/** These tests are of the session itself, on the surfaces it had before the book. */
function JournalSession(props: ComponentProps<typeof Session>) {
  return <Session plain {...props} />;
}

const BODY = 'something I have carried';
/** The handlers the session gave the app's foreground/background events, so a test can fire them. */
let appStateHandlers: ((state: string) => void)[] = [];
const appState = (state: string) => appStateHandlers.forEach((handler) => handler(state));

type Voice = ReturnType<typeof useVoiceRecorder>;
let voice: Voice;
let journal: Journal;
let commitFails: boolean;
let commitGone: boolean;

beforeEach(() => {
  jest.clearAllMocks();
  appStateHandlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    type: string,
    handler: (state: string) => void,
  ) => {
    if (type === 'change') appStateHandlers.push(handler);
    return { remove: () => undefined };
  }) as never);
  useOnboarding.setState({ ...initialOnboarding, mode: undefined, mood: undefined });
  // Speak is the default (D-006). The writing tests below start from a person who last wrote.
  usePreferences.setState({ lastMode: 'write', voiceConsent: null });
  const inner = createMemoryJournal({ entries: [] });
  commitFails = false;
  commitGone = false;
  journal = {
    ...inner,
    commitEntry: (id, content) =>
      commitGone
        ? Promise.resolve({ ok: false, error: { code: 'not_found', retryable: false } })
        : commitFails
          ? Promise.resolve({ ok: false, error: { code: 'write_failed', retryable: true } })
          : inner.commitEntry(id, content),
  };
  setJournal(journal);
  voice = {
    available: true,
    liveAvailable: false,
    state: 'idle',
    elapsedSeconds: 0,
    error: null,
    start: jest.fn(async () => null),
    stop: jest.fn(),
    cancel: jest.fn(),
  } as Voice;
  jest.mocked(useVoiceRecorder).mockImplementation(() => voice);
});
afterEach(() => setJournal(null));

async function open(variant: SessionVariant = 'onboarding', props = {}) {
  await renderWithDialogs(<JournalSession variant={variant} {...props} />);
  const input = () =>
    screen.getByLabelText(variant === 'daily' ? copy.home.prompt : copy.firstEcho.title);
  await waitFor(() => expect(input().props.editable).toBe(true));
  return input;
}
const reflect = () => screen.getByRole('button', { name: copy.firstEcho.cta });
const tab = (name: string) => screen.getByRole('tab', { name });
const write = (input: () => ReturnType<typeof screen.getByLabelText>, text = BODY) =>
  fireEvent.changeText(input(), text);

describe('JournalSession layout and states', () => {
  it('shows the prompt, placeholder, caption, timer and step 7 of 8 on First Echo', async () => {
    await open();
    expect(screen.getByRole('header', { name: copy.firstEcho.title })).toBeTruthy();
    expect(screen.getByPlaceholderText(copy.firstEcho.placeholder)).toBeTruthy();
    expect(screen.getByText(copy.firstEcho.caption)).toBeTruthy();
    expect(screen.getByRole('timer', { name: `${sessionCopy.timer} 7:00` })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Step 7 of 8' })).toBeTruthy();
  });

  it('has no onboarding progress in the daily session, and asks the daily prompt', async () => {
    const input = await open('daily');
    expect(input().props.accessibilityLabel).toBe(copy.home.prompt);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('header')).toBeNull();
  });

  it('turns off autofill, which sits outside encryption', async () => {
    const input = await open();
    expect(input().props.autoComplete).toBe('off');
    expect(input().props.importantForAutofill).toBe('no');
    expect(input().props.textContentType).toBe('none');
  });

  it('keeps Reflect disabled, with a hint, until ten characters', async () => {
    const input = await open();
    expect(reflect()).toBeDisabled();
    expect(reflect().props.accessibilityHint).toBe(sessionCopy.reflectHint);
    await write(input, 'too short');
    expect(reflect()).toBeDisabled();
    await write(input, BODY);
    expect(reflect()).toBeEnabled();
  });

  it('opens in Speak when nothing has been chosen yet, whatever onboarding said', async () => {
    usePreferences.setState({ lastMode: 'speak' });
    useOnboarding.setState({ mode: 'guide' });
    await render(<JournalSession variant="onboarding" />);
    expect(screen.queryByLabelText(copy.firstEcho.title)).toBeNull();
    expect(tab(copy.firstEcho.speak)).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    expect(await screen.findByRole('button', { name: sessionCopy.speak.record })).toBeTruthy();
  });

  it('opens in Write for a person who last chose to write', async () => {
    await render(<JournalSession variant="onboarding" />);
    expect(await screen.findByLabelText(copy.firstEcho.title)).toBeTruthy();
    expect(tab(copy.firstEcho.write)).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
  });

  it('lets an explicit mode win over the remembered one', async () => {
    await render(<JournalSession variant="onboarding" initialMode="speak" />);
    expect(await screen.findByRole('button', { name: sessionCopy.speak.record })).toBeTruthy();
    expect(usePreferences.getState().lastMode).toBe('write');
  });

  it('remembers the mode the person chooses, for next time', async () => {
    await open();
    await fireEvent.press(tab(copy.firstEcho.speak));
    expect(usePreferences.getState().lastMode).toBe('speak');
    await fireEvent.press(tab(copy.firstEcho.write));
    expect(usePreferences.getState().lastMode).toBe('write');
  });

  it('cues a tick for each mode the person chooses', async () => {
    await open();
    await fireEvent.press(tab(copy.firstEcho.speak));
    expect(jest.mocked(cue).mock.calls).toEqual([['tick']]);
    await fireEvent.press(tab(copy.firstEcho.write));
    expect(jest.mocked(cue).mock.calls).toEqual([['tick'], ['tick']]);
  });

  it('opens in Write where there is no microphone to speak into', async () => {
    usePreferences.setState({ lastMode: 'speak' });
    voice = { ...voice, available: false };
    await render(<JournalSession variant="onboarding" />);
    expect(await screen.findByLabelText(copy.firstEcho.title)).toBeTruthy();
  });

  it('opens the daily session in Speak for mode=voice', async () => {
    await render(<JournalSession variant="daily" initialMode="speak" />);
    expect(await screen.findByRole('button', { name: sessionCopy.speak.record })).toBeTruthy();
  });

  it('keeps what was written when switching to Speak and back', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(tab(copy.firstEcho.speak));
    expect(screen.getByRole('button', { name: sessionCopy.speak.record })).toBeTruthy();
    await fireEvent.press(tab(copy.firstEcho.write));
    expect(input().props.value).toBe(BODY);
  });

  it('says "Saved on this device" once the draft is saved', async () => {
    const input = await open();
    await write(input);
    expect(await screen.findByText(sessionCopy.saved, {}, { timeout: 2500 })).toBeTruthy();
  });

  it('cues one tick when the first save lands, and none for the saves after it', async () => {
    const input = await open();
    expect(cue).not.toHaveBeenCalled();
    await write(input);
    await screen.findByText(sessionCopy.saved, {}, { timeout: 2500 });
    await waitFor(() => expect(cue).toHaveBeenCalledTimes(1));
    expect(cue).toHaveBeenCalledWith('tick');

    await write(input, `${BODY}, and more`);
    await waitFor(async () =>
      expect(await journal.latestDraft()).toMatchObject({
        ok: true,
        value: { body: `${BODY}, and more` },
      }),
    );
    expect(cue).toHaveBeenCalledTimes(1);
  });

  it('offers a retry when the draft cannot be opened, and none when it is unreadable', async () => {
    setJournal({
      ...journal,
      latestDraft: async () => ({ ok: false, error: { code: 'not_ready', retryable: true } }),
    });
    await render(<JournalSession variant="onboarding" />);
    expect(await screen.findByText(sessionCopy.errors.open)).toBeTruthy();
    expect(screen.getByRole('button', { name: sessionCopy.errors.retry })).toBeTruthy();
    expect(reflect()).toBeDisabled();
  });
});

describe('JournalSession and the theme', () => {
  function Theme() {
    return <Text testID="theme">{useTheme().target}</Text>;
  }

  it('holds the theme while the session is on screen, and lets it change once it closes', async () => {
    usePreferences.setState({ theme: 'night' });
    const view = await render(
      <>
        <Theme />
        <JournalSession variant="daily" />
      </>,
    );
    await act(async () => usePreferences.getState().setTheme('day'));
    expect(screen.getByTestId('theme')).toHaveTextContent('night');

    await view.rerender(
      <ThemeProvider crossfade={false}>
        <Theme />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('day');
    usePreferences.setState({ theme: 'night' });
  });
});

describe('JournalSession Reflect', () => {
  it('navigates to Completion only after the entry is committed', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(reflect());
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/completion'));
    expect(await journal.latestEntry()).toMatchObject({ ok: true });
  });

  it('goes to /home/complete from the daily session', async () => {
    const input = await open('daily');
    await write(input);
    // The controls come after a quiet moment: leaving the field is one.
    await fireEvent(input(), 'blur');
    await fireEvent.press(screen.getByTestId('quiet-reflect'));
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/home/complete'));
  });

  it('stays, keeps the draft, and lets the person retry when the commit fails', async () => {
    const input = await open();
    await write(input);
    commitFails = true;
    await fireEvent.press(reflect());
    expect(await screen.findByText(sessionCopy.errors.commit)).toBeTruthy();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(input().props.value).toBe(BODY);
    expect(reflect()).toBeEnabled();

    commitFails = false;
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.errors.retry }));
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/completion'));
  });

  // D-017: set out in the background, by a queue that outlives the session, and never waited on.
  it('hands the kept entry over to be set out once it is committed, and never a failed one', async () => {
    const input = await open();
    await write(input);
    commitFails = true;
    await fireEvent.press(reflect());
    await screen.findByText(sessionCopy.errors.commit);
    expect(queueFormat).not.toHaveBeenCalled();

    commitFails = false;
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.errors.retry }));
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/completion'));
    expect(queueFormat).toHaveBeenCalledTimes(1);
    expect(jest.mocked(queueFormat).mock.calls[0]?.[0]).toMatchObject({
      status: 'committed',
      body: BODY,
    });
    expect(jest.mocked(queueFormat).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(router.navigate).mock.invocationCallOrder[0]!,
    );
  });
});

describe('JournalSession, when its entry has gone', () => {
  it('leaves First Echo by popping back to Arrival', async () => {
    const input = await open();
    await write(input);
    commitGone = true;
    await fireEvent.press(reflect());
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/onboarding/arrival'));
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('JournalSession Back', () => {
  const back = () => screen.getByRole('button', { name: 'Back' });

  // First Echo is pushed over Arrival in the onboarding stack. `navigate` would push a second
  // Arrival over it; going back pops to the one that is already there, as the daily session does.
  it('leaves at once when there is nothing to keep, by popping back to Arrival', async () => {
    await open();
    await fireEvent.press(back());
    expect(openDialog()).toBeNull();
    expect(router.dismissTo).toHaveBeenCalledWith('/onboarding/arrival');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  // The daily session is pushed above Home in the same stack. `navigate` would push a second Home
  // over it and leave the session mounted behind a Home that is still dissolved, so the person sees
  // only the photograph. Returning pops to the Home that is already there.
  it('returns the daily session to Home by popping to it', async () => {
    const input = await open('daily');
    await fireEvent(input(), 'blur');
    await fireEvent.press(screen.getByTestId('quiet-back'));
    // The page fades out first, and the screen is popped when it has gone (./ImmersiveSession.leave.test).
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/home'));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it.each([
    ['Keep draft', sessionCopy.leave.keep],
    ['Discard', sessionCopy.leave.discard],
  ])('%s also pops the daily session back to Home', async (_name, label) => {
    const input = await open('daily');
    await write(input);
    await fireEvent(input(), 'blur');
    await fireEvent.press(screen.getByTestId('quiet-back'));
    await chooseInDialog(label);
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/home'));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('asks Keep draft, Discard or Stay when there is writing', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(back());
    expect(screen.getByRole('header', { name: sessionCopy.leave.title })).toBeTruthy();
    expect(screen.getByText(sessionCopy.leave.message)).toBeTruthy();
    // Keeping is what it offers. Discard destroys, so it is a quiet word, and Stay is the way out.
    expect(dialogChoices()).toEqual(['Keep draft', 'Discard', 'Stay']);
    expect(dialogPrimary()).toBe('Keep draft');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('Keep draft saves, then leaves', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(back());
    await chooseInDialog(sessionCopy.leave.keep);
    expect(router.dismissTo).toHaveBeenCalledWith('/onboarding/arrival');
    expect(router.navigate).not.toHaveBeenCalled();
    const saved = await latestDraft();
    expect(saved).toMatchObject({ ok: true, value: { body: BODY } });
  });

  it('Discard removes the draft, then leaves', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(back());
    await chooseInDialog(sessionCopy.leave.discard);
    expect(router.dismissTo).toHaveBeenCalledWith('/onboarding/arrival');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(await latestDraft()).toMatchObject({ ok: true, value: null });
  });

  it('Stay changes nothing', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(back());
    await chooseInDialog(sessionCopy.leave.stay);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(input().props.value).toBe(BODY);
  });

  it('Back on the question is Stay', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(back());
    await backOutOfDialog();
    expect(openDialog()).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(input().props.value).toBe(BODY);
  });
});

describe('JournalSession Speak', () => {
  const speak = async () => {
    await render(<JournalSession variant="onboarding" initialMode="speak" />);
    await screen.findByText(copy.firstEcho.title);
  };

  it('lets the system ask at once, with no note of its own first, and begins the take when allowed', async () => {
    // Not yet allowed the first time; allowed once the system has asked.
    voice.start = jest
      .fn()
      .mockResolvedValueOnce('permission_required')
      .mockResolvedValue(null) as typeof voice.start;
    jest
      .mocked(requestMicrophonePermission)
      .mockResolvedValue({ status: 'granted', canAskAgain: true });
    await speak();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.record }));
    await waitFor(() => expect(voice.start).toHaveBeenCalledTimes(2));
    expect(requestMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(sessionCopy.speak.explain)).toBeNull();
  });

  it('offers Settings and Write after a denial', async () => {
    voice.start = jest.fn(async () => 'permission_required' as const);
    jest
      .mocked(requestMicrophonePermission)
      .mockResolvedValue({ status: 'denied', canAskAgain: false });
    await speak();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.record }));
    expect(await screen.findByText(sessionCopy.speak.denied)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.settings }));
    expect(openAppSettings).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.writeInstead }));
    expect(screen.getByLabelText(copy.firstEcho.title)).toBeTruthy();
  });

  // The person leaves for Settings, allows the microphone, and comes back. A note that still says it
  // is off, over a page that does nothing when touched, strands them: they would have to leave and
  // begin again. So coming back checks, and the note goes if it was allowed.
  it('clears the denial when the app comes back with the microphone allowed', async () => {
    voice.start = jest.fn(async () => 'permission_required' as const);
    jest
      .mocked(requestMicrophonePermission)
      .mockResolvedValue({ status: 'denied', canAskAgain: false });
    await speak();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.record }));
    expect(await screen.findByText(sessionCopy.speak.denied)).toBeTruthy();

    // Still off when the app comes back from somewhere else: the note stays.
    jest
      .mocked(getMicrophonePermission)
      .mockResolvedValue({ status: 'denied', canAskAgain: false });
    await act(async () => appState('active'));
    expect(screen.getByText(sessionCopy.speak.denied)).toBeTruthy();

    // Allowed in Settings: back to the page that can record.
    jest
      .mocked(getMicrophonePermission)
      .mockResolvedValue({ status: 'granted', canAskAgain: true });
    await act(async () => appState('active'));
    await waitFor(() => expect(screen.queryByText(sessionCopy.speak.denied)).toBeNull());
    expect(screen.getByRole('button', { name: sessionCopy.speak.record })).toBeTruthy();
  });

  it('shows one stop control, the time, and holds the mode switch while recording', async () => {
    voice = { ...voice, state: 'recording', elapsedSeconds: 42 };
    await speak();
    expect(screen.getByRole('button', { name: sessionCopy.speak.stop })).toBeTruthy();
    expect(screen.getByText('0:42')).toBeTruthy();
    expect(screen.getByText(sessionCopy.speak.recording)).toBeTruthy();
    expect(tab(copy.firstEcho.write)).toBeDisabled();
    expect(reflect()).toBeDisabled();
  });

  it('offers Write when recording is unavailable', async () => {
    voice = { ...voice, available: false };
    await render(<JournalSession variant="onboarding" initialMode="speak" />);
    await screen.findByText(copy.firstEcho.title);
    expect(screen.getByText(sessionCopy.speak.unavailable)).toBeTruthy();
    expect(screen.queryByRole('button', { name: sessionCopy.speak.record })).toBeNull();
    expect(screen.getByRole('button', { name: sessionCopy.speak.writeInstead })).toBeTruthy();
  });

  it('says a recording is kept when it could not be encrypted', async () => {
    voice = { ...voice, state: 'error', error: 'save_failed' };
    await speak();
    expect(screen.getByText(sessionCopy.speak.kept)).toBeTruthy();
  });
});
