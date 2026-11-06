import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert, Text } from 'react-native';

import { copy } from '@/content/copy';
import { ThemeProvider, useTheme } from '@/design/theme';
import {
  createMemoryJournal,
  latestDraft,
  setJournal,
  useVoiceRecorder,
  type Journal,
} from '@/features/journal';
import { openAppSettings, requestMicrophonePermission } from '@/services/permissions';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { JournalSession, type SessionVariant } from './JournalSession';
import { sessionCopy } from './sessionCopy';

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

const BODY = 'something I have carried';
const alert = jest.spyOn(Alert, 'alert');

type Voice = ReturnType<typeof useVoiceRecorder>;
let voice: Voice;
let journal: Journal;
let commitFails: boolean;

beforeEach(() => {
  jest.clearAllMocks();
  useOnboarding.setState({ ...initialOnboarding, mode: undefined, mood: undefined });
  const inner = createMemoryJournal({ entries: [] });
  commitFails = false;
  journal = {
    ...inner,
    commitEntry: (id, content) =>
      commitFails
        ? Promise.resolve({ ok: false, error: { code: 'write_failed', retryable: true } })
        : inner.commitEntry(id, content),
  };
  setJournal(journal);
  voice = {
    available: true,
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
  await render(<JournalSession variant={variant} {...props} />);
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

  it.each([
    ['guide', 'write'],
    ['space', 'write'],
    ['speak', 'speak'],
  ] as const)('opens in %s mode as %s', async (chosen, expected) => {
    useOnboarding.setState({ mode: chosen });
    await render(<JournalSession variant="onboarding" />);
    const field = screen.queryByLabelText(copy.firstEcho.title);
    expect(tab(copy.firstEcho.write)).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: expected === 'write' }),
    );
    expect(field === null).toBe(expected === 'speak');
    // The prompt is the same in every mode.
    expect(screen.getByRole('header', { name: copy.firstEcho.title })).toBeTruthy();
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

  it('gives one gentle haptic when the first save lands, and none for the saves after it', async () => {
    const input = await open();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    await write(input);
    await screen.findByText(sessionCopy.saved, {}, { timeout: 2500 });
    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalledTimes(1));
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');

    await write(input, `${BODY}, and more`);
    await waitFor(async () =>
      expect(await journal.latestDraft()).toMatchObject({
        ok: true,
        value: { body: `${BODY}, and more` },
      }),
    );
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
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
});

describe('JournalSession Back', () => {
  const back = () => screen.getByRole('button', { name: 'Back' });
  const choose = async (label: string) => {
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => {
      await buttons.find((button) => button.text === label)?.onPress?.();
    });
  };

  it('leaves at once when there is nothing to keep', async () => {
    await open();
    await fireEvent.press(back());
    expect(alert).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/arrival');
  });

  it('returns the daily session to Home', async () => {
    const input = await open('daily');
    await fireEvent(input(), 'blur');
    await fireEvent.press(screen.getByTestId('quiet-back'));
    expect(router.navigate).toHaveBeenCalledWith('/home');
  });

  it('asks Keep draft, Discard or Stay when there is writing', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(back());
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((button) => button.text)).toEqual(['Keep draft', 'Discard', 'Stay']);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('Keep draft saves, then leaves', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(back());
    await choose(sessionCopy.leave.keep);
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/arrival');
    const saved = await latestDraft();
    expect(saved).toMatchObject({ ok: true, value: { body: BODY } });
  });

  it('Discard removes the draft, then leaves', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(back());
    await choose(sessionCopy.leave.discard);
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/arrival');
    expect(await latestDraft()).toMatchObject({ ok: true, value: null });
  });

  it('Stay changes nothing', async () => {
    const input = await open();
    await write(input);
    await fireEvent.press(back());
    await choose(sessionCopy.leave.stay);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(input().props.value).toBe(BODY);
  });
});

describe('JournalSession Speak', () => {
  const speak = async () => {
    useOnboarding.setState({ mode: 'speak' });
    await render(<JournalSession variant="onboarding" />);
    await screen.findByText(copy.firstEcho.title);
  };

  it('explains in the app before the system asks, and keeps Write available', async () => {
    voice.start = jest.fn(async () => 'permission_required' as const);
    await speak();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.record }));
    expect(await screen.findByText(sessionCopy.speak.explain)).toBeTruthy();
    expect(requestMicrophonePermission).not.toHaveBeenCalled();

    jest
      .mocked(requestMicrophonePermission)
      .mockResolvedValue({ status: 'granted', canAskAgain: true });
    voice.start = jest.fn(async () => null);
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.allow }));
    expect(requestMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(voice.start).toHaveBeenCalledTimes(1);
  });

  it('offers Settings and Write after a denial', async () => {
    voice.start = jest.fn(async () => 'permission_required' as const);
    jest
      .mocked(requestMicrophonePermission)
      .mockResolvedValue({ status: 'denied', canAskAgain: false });
    await speak();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.record }));
    await fireEvent.press(await screen.findByRole('button', { name: sessionCopy.speak.allow }));
    expect(await screen.findByText(sessionCopy.speak.denied)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.settings }));
    expect(openAppSettings).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.writeInstead }));
    expect(screen.getByLabelText(copy.firstEcho.title)).toBeTruthy();
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
    await speak();
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
