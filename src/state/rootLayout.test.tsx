import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, usePathname } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, Platform } from 'react-native';

import { clearToast, showToast } from '@/components/Toast';
import { copy } from '@/content/copy';
import { clearDialogs, showDialog } from '@/features/tab-pages/Dialog';
import { deleteAllLocal } from '@/services/deleteAllLocal';
import { getLockMethod } from '@/services/biometric';
import { startPlus } from '@/services/plus/engine';
import { markOffered, usePlusStore } from '@/services/plus/store';
import {
  backOutOfDialog,
  chooseInDialog,
  dialogChoices,
  dialogPrimary,
  openDialog,
  tapOutsideDialog,
} from '@/testing/dialogs';
import { withBillingForTests, withoutBillingForTests } from '@/testing/plus';

import RootLayout from '../../app/_layout';
import { noteShownPlate, PLATE_WAIT_MS, resetPlatesForTests } from '@/design/platePaint';
import { warmPlateThumbs } from '@/design/plateThumbs';

import { bootApp, RELOCK_AFTER_MS, resetGateForTests, unlock, useGate } from './gate';
import { gateCopy } from './gateCopy';
import { resetOnboarding, useOnboarding } from './onboarding';
import { openSystemPicker, ownWindowOpen } from './ownWindows';

// Lives here because Expo Router treats every file under app/ as a route.

const NAVIGATOR = 'the-navigator';

// The stack draws the route its pathname names, as the real one does: at launch that is Landing's
// route, before the root layout has had the chance to send anyone anywhere. `mockPlates` adds a
// screen with a plate to be drawn, which is what holds the splash.
let mockPlates = false;
let mockSettlePlate: (() => void) | undefined;
let mockStackOptions: { animation: string; contentStyle: { backgroundColor: string } } | undefined;
const mockLandingRenders = jest.fn();

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  const usePathname = jest.fn(() => '/');
  function PlateScreen() {
    const { usePlateTicket } = jest.requireActual('@/design/platePaint');
    mockSettlePlate = usePlateTicket();
    return null;
  }
  return {
    Stack: (props: { screenOptions: typeof mockStackOptions }) => {
      mockStackOptions = props.screenOptions;
      const Route = jest.requireActual('../../app/index').default;
      return (
        <>
          <Text testID="the-navigator">navigator</Text>
          {usePathname() === '/' ? <Route /> : null}
          {mockPlates ? <PlateScreen /> : null}
        </>
      );
    },
    router: { replace: jest.fn() },
    usePathname,
    ThemeProvider: ({ children }: { children: unknown }) => children,
    DefaultTheme: { colors: {} },
  };
});

jest.mock('@/features/onboarding/screens/LandingScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    LandingScreen: () => {
      mockLandingRenders();
      return <Text testID="landing">landing</Text>;
    },
  };
});

jest.mock('expo-font', () => ({ useFonts: () => [true, null], isLoaded: () => true }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: jest.requireActual('react-native').View,
}));
// The real provider renders nothing until native code reports the insets.
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaInsetsContext: jest.requireActual('react').createContext(null),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('./gate', () => ({
  ...jest.requireActual('./gate'),
  bootApp: jest.fn(async () => undefined),
  unlock: jest.fn(async () => undefined),
}));

jest.mock('@/services/deleteAllLocal', () => ({
  deleteAllLocal: jest.fn(async () => ({ ok: true })),
}));

jest.mock('@/services/biometric', () => ({
  getLockMethod: jest.fn(async () => 'passcode'),
  authenticate: jest.fn(),
}));

jest.mock('@/design/plateThumbs', () => ({
  ...jest.requireActual('@/design/plateThumbs'),
  warmPlateThumbs: jest.fn(async () => undefined),
}));

jest.mock('@/services/plus/engine', () => ({
  ...jest.requireActual('@/services/plus/engine'),
  startPlus: jest.fn(async () => undefined),
}));

const replace = jest.mocked(router.replace);
const pathname = jest.mocked(usePathname);
const hideSplash = jest.mocked(SplashScreen.hideAsync);
const preventCapture = jest.mocked(ScreenCapture.preventScreenCaptureAsync);
const allowCapture = jest.mocked(ScreenCapture.allowScreenCaptureAsync);

let appState: ((state: string) => void)[];
let windowFocus: Record<'blur' | 'focus', (() => void)[]>;

const setGate = (state: Partial<ReturnType<typeof useGate.getState>>) =>
  act(async () => useGate.setState(state));

const send = (state: string) =>
  act(async () => {
    Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
    appState.forEach((handler) => handler(state));
  });

/** Android's window focus: 'blur' as anything takes the app window's focus, 'focus' as it returns. */
const windowEvent = (type: 'blur' | 'focus') =>
  act(async () => windowFocus[type].forEach((handler) => handler()));

/** What the privacy cover shows: the wordmark alone on the plate's colour. */
const cover = () => screen.queryByRole('header', { name: copy.landing.wordmark });

beforeAll(() => {
  jest.useFakeTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPlates = false;
  mockSettlePlate = undefined;
  mockStackOptions = undefined;
  resetPlatesForTests();
  resetGateForTests();
  resetOnboarding();
  clearDialogs();
  appState = [];
  windowFocus = { blur: [], focus: [] };
  pathname.mockReturnValue('/');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
    if (type === 'change') appState.push(handler as (state: string) => void);
    if (type === 'blur' || type === 'focus') windowFocus[type].push(handler as () => void);
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => jest.restoreAllMocks());

describe('before the gate resolves', () => {
  it('mounts nothing that could show journal content, and keeps the splash up', async () => {
    await render(<RootLayout />);
    expect(bootApp).toHaveBeenCalled();
    expect(screen.queryByTestId(NAVIGATOR)).toBeNull();
    expect(hideSplash).not.toHaveBeenCalled();
  });
});

describe('once ready', () => {
  it('mounts the navigator and lifts the splash once the first photograph is up', async () => {
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/' } });
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
    await act(async () => noteShownPlate('landing', 'night', 'landing'));
    expect(hideSplash).toHaveBeenCalled();
  });

  it('holds the splash until a resumed user has reached their step', async () => {
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/onboarding/voice' } });
    expect(replace).toHaveBeenCalledWith('/onboarding/voice');
    expect(hideSplash).not.toHaveBeenCalled();
  });

  it('lifts the splash regardless if navigation never lands', async () => {
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/onboarding/voice' } });
    expect(hideSplash).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(hideSplash).toHaveBeenCalled();
  });

  it('does not record Landing as the step while redirecting away from it', async () => {
    useOnboarding.setState({ step: 3 });
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/onboarding/voice' } });
    expect(useOnboarding.getState().step).toBe(3);
  });

  it('tracks the step as the route changes', async () => {
    pathname.mockReturnValue('/onboarding/rhythm');
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/onboarding/rhythm' } });
    expect(useOnboarding.getState().step).toBe(4);
  });

  it('sends a completed user Home when onboarding finishes', async () => {
    pathname.mockReturnValue('/onboarding/completion');
    useOnboarding.setState({ step: 8 });
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/onboarding/completion' } });
    await act(async () => useOnboarding.setState({ completedAt: 1 }));
    expect(replace).toHaveBeenLastCalledWith('/home');
  });

  // Home's card and avatar draw a thumbnail of the plate. Decoded ahead of time, it is whole in the
  // first frame they are asked for (src/design/plateThumbs.ts).
  it('decodes the thumbnails of Home’s plate once the gate is ready, the theme on show first', async () => {
    await render(<RootLayout />);
    expect(warmPlateThumbs).not.toHaveBeenCalled();
    await setGate({ status: { kind: 'ready', resume: '/' } });
    expect(warmPlateThumbs).toHaveBeenCalledWith('night');
  });

  it('starts ECHO Plus once, at launch', async () => {
    await render(<RootLayout />);
    expect(startPlus).toHaveBeenCalledTimes(1);
  });
});

describe('onboarding’s Landing never shows to someone who has finished', () => {
  const landing = () => screen.queryByTestId('landing');

  it('is not drawn before the state is known, while the gate resolves, or once it has', async () => {
    useOnboarding.setState({ step: 8, completedAt: 1 });
    await render(<RootLayout />);
    expect(landing()).toBeNull();
    await setGate({ status: { kind: 'ready', resume: '/home' } });
    // The stack is up and still on the route a launch opens on: Landing's. Nothing is drawn there.
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
    expect(replace).toHaveBeenCalledWith('/home');
    expect(mockLandingRenders).not.toHaveBeenCalled();
  });

  it('is sent on without a dissolve, which would show the screen it leaves, and dissolves again after', async () => {
    useOnboarding.setState({ step: 8, completedAt: 1 });
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/home' } });
    expect(mockStackOptions?.animation).toBe('none');
    pathname.mockReturnValue('/home');
    await setGate({ lock: { kind: 'unlocked' } });
    expect(mockStackOptions?.animation).toBe('fade');
  });

  it('is not drawn for someone who resumes part way through onboarding either', async () => {
    useOnboarding.setState({ step: 3 });
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/onboarding/voice' } });
    expect(replace).toHaveBeenCalledWith('/onboarding/voice');
    expect(mockLandingRenders).not.toHaveBeenCalled();
  });

  it('is drawn for someone who has not begun', async () => {
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/' } });
    expect(landing()).toBeTruthy();
  });

  it('is still drawn when someone mid-onboarding comes back to it later', async () => {
    useOnboarding.setState({ step: 3 });
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/onboarding/voice' } });
    pathname.mockReturnValue('/onboarding/voice');
    await setGate({ lock: { kind: 'unlocked' } });
    pathname.mockReturnValue('/');
    await setGate({ lock: { kind: 'unlocked' } });
    expect(landing()).toBeTruthy();
  });
});

describe('a flat colour is never what is on the screen', () => {
  const ready = { status: { kind: 'ready', resume: '/' } as const };
  const layers = () =>
    screen
      .getAllByTestId(/^(plate-backing|the-navigator)$/, { includeHiddenElements: true })
      .map((node) => node.props.testID as string);

  it('draws the plate backing beneath the whole navigator, which is drawn above it', async () => {
    await render(<RootLayout />);
    await setGate(ready);
    expect(layers()).toEqual(['plate-backing', 'the-navigator']);
  });

  it('leaves every screen of the navigator clear, so that the backing is what shows where a photograph is not drawn yet', async () => {
    await render(<RootLayout />);
    await setGate(ready);
    expect(mockStackOptions?.contentStyle).toEqual({ backgroundColor: 'transparent' });
  });

  it('keeps the backing through a lock and its release, so it never has to be drawn again', async () => {
    await render(<RootLayout />);
    await setGate(ready);
    const before = screen.getByTestId('plate-backing', { includeHiddenElements: true });
    await setGate({
      lock: { kind: 'locked', method: 'passcode', failure: null, canDisable: false },
    });
    await setGate({ lock: { kind: 'unlocked' } });
    expect(screen.getByTestId('plate-backing', { includeHiddenElements: true })).toBe(before);
  });

  it('has no backing while the gate has not resolved: there is no navigator to stand beneath', async () => {
    await render(<RootLayout />);
    expect(screen.queryByTestId('plate-backing', { includeHiddenElements: true })).toBeNull();
  });
});

describe('the splash waits for the first photograph', () => {
  const home = { status: { kind: 'ready', resume: '/home' } as const };
  const shown = () => act(async () => noteShownPlate('home', 'night', 'home'));

  beforeEach(() => {
    mockPlates = true;
    useOnboarding.setState({ step: 8, completedAt: 1 });
    pathname.mockReturnValue('/home');
  });

  it('stays up while a plate that has mounted is still being drawn, and lifts when it is', async () => {
    await render(<RootLayout />);
    await setGate(home);
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
    expect(hideSplash).not.toHaveBeenCalled();
    await act(async () => mockSettlePlate?.());
    await shown();
    expect(hideSplash).toHaveBeenCalledTimes(1);
  });

  // The walk (v10, runs 4 and 5) saw one flat frame inside the splash, and nothing of the screen in
  // it: the splash had been lifted before any plate had mounted, because nothing was pending yet.
  it('stays up before any plate has mounted at all, because nothing pending is not the same as drawn', async () => {
    mockPlates = false;
    await render(<RootLayout />);
    await setGate(home);
    expect(hideSplash).not.toHaveBeenCalled();
    await shown();
    expect(hideSplash).toHaveBeenCalledTimes(1);
  });

  it('stays up after the plate has settled its ticket, until it is the photograph on show', async () => {
    await render(<RootLayout />);
    await setGate(home);
    await act(async () => mockSettlePlate?.());
    expect(hideSplash).not.toHaveBeenCalled();
    await shown();
    expect(hideSplash).toHaveBeenCalledTimes(1);
  });

  it('lifts anyway if the plate never comes up', async () => {
    await render(<RootLayout />);
    await setGate(home);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PLATE_WAIT_MS);
    });
    expect(hideSplash).toHaveBeenCalledTimes(1);
  });

  it('lifts anyway if no plate ever mounts', async () => {
    mockPlates = false;
    await render(<RootLayout />);
    await setGate(home);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PLATE_WAIT_MS);
    });
    expect(hideSplash).toHaveBeenCalledTimes(1);
  });

  it('does not wait for a photograph when the gate stopped the launch: there is no screen to draw one', async () => {
    mockPlates = false;
    await render(<RootLayout />);
    await setGate({ status: { kind: 'key_lost', reason: 'missing' } });
    expect(hideSplash).toHaveBeenCalled();
  });
});

describe('the ECHO Plus offer after onboarding', () => {
  beforeEach(() => withBillingForTests({ status: 'free', source: 'live' }));
  afterEach(() => act(async () => withoutBillingForTests()));

  async function finishOnboarding() {
    pathname.mockReturnValue('/onboarding/completion');
    useOnboarding.setState({ step: 8 });
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/onboarding/completion' } });
    await act(async () => useOnboarding.setState({ completedAt: 1 }));
  }

  it('shows the paywall in place of Home, once, as Completion finishes', async () => {
    await finishOnboarding();
    expect(replace).toHaveBeenLastCalledWith('/plus?from=onboarding');
  });

  it('stays out of the way once seen: the paywall stays put, and nothing sends it back', async () => {
    await finishOnboarding();
    replace.mockClear();
    // The paywall marks itself seen as it appears, and the root layout looks again.
    pathname.mockReturnValue('/plus');
    await act(async () => markOffered());
    expect(usePlusStore.getState().offered).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    // The lock coming and going does not move anyone either.
    await setGate({
      lock: { kind: 'locked', method: 'passcode', failure: null, canDisable: false },
    });
    await setGate({ lock: { kind: 'unlocked' } });
    expect(replace).not.toHaveBeenCalled();
  });

  it('goes straight Home for someone who has already seen it', async () => {
    usePlusStore.setState({ offered: true });
    await finishOnboarding();
    expect(replace).toHaveBeenLastCalledWith('/home');
  });

  it('goes straight Home for someone who already has Plus', async () => {
    usePlusStore.setState({ status: 'plus' });
    await finishOnboarding();
    expect(replace).toHaveBeenLastCalledWith('/home');
  });

  it('is not shown to a finished user on a later launch', async () => {
    useOnboarding.setState({ step: 8, completedAt: 1 });
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/home' } });
    expect(replace).toHaveBeenLastCalledWith('/home');
    expect(replace).not.toHaveBeenCalledWith('/plus?from=onboarding');
  });
});

describe('when the key is lost', () => {
  const lost = { status: { kind: 'key_lost', reason: 'missing' } as const };

  it('explains, keeps content unmounted, and lifts the splash', async () => {
    await render(<RootLayout />);
    await setGate(lost);
    expect(screen.getByText(gateCopy.keyLost.title)).toBeTruthy();
    expect(screen.queryByTestId(NAVIGATOR)).toBeNull();
    expect(hideSplash).toHaveBeenCalled();
  });

  it('retries without erasing anything', async () => {
    await render(<RootLayout />);
    await setGate(lost);
    jest.mocked(bootApp).mockClear();
    await fireEvent.press(screen.getByRole('button', { name: gateCopy.keyLost.retry }));
    expect(bootApp).toHaveBeenCalled();
    expect(deleteAllLocal).not.toHaveBeenCalled();
  });

  it('erases only after an explicit confirmation', async () => {
    const { startOver, confirmTitle, confirmErase, confirmCancel } = gateCopy.keyLost;
    await render(<RootLayout />);
    await setGate(lost);
    await fireEvent.press(screen.getByRole('button', { name: startOver }));
    expect(screen.getByRole('header', { name: confirmTitle })).toBeTruthy();
    expect(screen.getByText(gateCopy.keyLost.confirmBody)).toBeTruthy();
    // Erasing is never the inviting button: both are quiet words, and Cancel comes last.
    expect(dialogChoices()).toEqual([confirmErase, confirmCancel]);
    expect(dialogPrimary()).toBeNull();
    expect(deleteAllLocal).not.toHaveBeenCalled();

    await chooseInDialog(confirmErase);
    expect(deleteAllLocal).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Cancel', () => chooseInDialog(gateCopy.keyLost.confirmCancel)],
    ['Back', backOutOfDialog],
    ['a tap outside', tapOutsideDialog],
  ])('erases nothing on %s', async (_way, leave) => {
    await render(<RootLayout />);
    await setGate(lost);
    await fireEvent.press(screen.getByRole('button', { name: gateCopy.keyLost.startOver }));
    await leave();
    expect(openDialog()).toBeNull();
    expect(deleteAllLocal).not.toHaveBeenCalled();
    expect(screen.getByText(gateCopy.keyLost.title)).toBeTruthy();
  });
});

describe('storage faults', () => {
  it('offers a retry', async () => {
    await render(<RootLayout />);
    await setGate({ status: { kind: 'storage_error', reason: 'database' } });
    expect(screen.getByText(gateCopy.storage.database.title)).toBeTruthy();
    jest.mocked(bootApp).mockClear();
    await fireEvent.press(screen.getByRole('button', { name: gateCopy.storage.retry }));
    expect(bootApp).toHaveBeenCalled();
  });
});

describe('the lock', () => {
  const locked = {
    status: { kind: 'ready', resume: '/' } as const,
    lock: { kind: 'locked', method: 'biometric', failure: null, canDisable: false } as const,
  };

  it('covers the app and prompts once', async () => {
    await render(<RootLayout />);
    await setGate(locked);
    expect(screen.getByText(gateCopy.lock.title)).toBeTruthy();
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('keeps the navigator mounted, so unsaved writing is not torn down', async () => {
    await render(<RootLayout />);
    await setGate({ status: locked.status });
    await setGate({ lock: locked.lock });
    expect(screen.queryByTestId(NAVIGATOR, { includeHiddenElements: true })).toBeTruthy();
  });

  it('hides content from screen readers while covered', async () => {
    await render(<RootLayout />);
    await setGate(locked);
    expect(screen.queryByTestId(NAVIGATOR)).toBeNull();
  });

  it('hides the toast from screen readers with everything else', async () => {
    await render(<RootLayout />);
    await setGate({ status: locked.status });
    await act(async () => showToast('We’ll meet you at 9:30 PM.'));
    expect(screen.getByText('We’ll meet you at 9:30 PM.')).toBeTruthy();
    await setGate({ lock: locked.lock });
    expect(screen.queryByText('We’ll meet you at 9:30 PM.')).toBeNull();
    expect(
      screen.queryByText('We’ll meet you at 9:30 PM.', { includeHiddenElements: true }),
    ).toBeTruthy();
    await act(async () => clearToast());
  });

  it('does not re-prompt after a failure, so nobody is trapped in a loop', async () => {
    await render(<RootLayout />);
    await setGate(locked);
    await setGate({ lock: { ...locked.lock, failure: 'cancelled' } });
    expect(unlock).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: gateCopy.lock.unlock }));
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it('shows no way to turn it off while a credential exists', async () => {
    await render(<RootLayout />);
    await setGate(locked);
    expect(screen.queryByText(gateCopy.lock.disable)).toBeNull();
  });

  it('holds an open dialog until it is unlocked, so nothing is answered from behind it', async () => {
    const erase = jest.fn();
    await render(<RootLayout />);
    await setGate({ status: locked.status });
    await act(async () =>
      showDialog(gateCopy.keyLost.confirmTitle, gateCopy.keyLost.confirmBody, [
        { text: gateCopy.keyLost.confirmCancel, style: 'cancel' },
        { text: gateCopy.keyLost.confirmErase, style: 'destructive', onPress: erase },
      ]),
    );
    expect(openDialog()).toBeTruthy();

    await setGate({ lock: locked.lock });
    expect(screen.queryByTestId('dialog', { includeHiddenElements: true })).toBeNull();

    await setGate({ lock: { kind: 'unlocked' } });
    await chooseInDialog(gateCopy.keyLost.confirmErase);
    expect(erase).toHaveBeenCalledTimes(1);
  });

  it('with no credential left, offers only turning it off', async () => {
    jest.mocked(getLockMethod).mockResolvedValue('none');
    await render(<RootLayout />);
    await setGate({
      status: locked.status,
      lock: { kind: 'locked', method: 'none', failure: null, canDisable: true },
    });
    expect(screen.getByText(gateCopy.lock.disable)).toBeTruthy();
    expect(screen.queryByText(gateCopy.lock.unlock)).toBeNull();
    expect(unlock).not.toHaveBeenCalled();
  });
});

describe('Android screen capture', () => {
  const lockOn = { privacy: { biometricLock: true, privateBackup: false } };
  const lockOff = { privacy: { biometricLock: false, privateBackup: false } };
  const onboarding = (state: typeof lockOn) => act(async () => useOnboarding.setState(state));

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('is prevented while the lock is on, so recents has no thumbnail to show', async () => {
    useOnboarding.setState(lockOn);
    await render(<RootLayout />);
    expect(preventCapture).toHaveBeenCalledTimes(1);
    expect(allowCapture).not.toHaveBeenCalled();
  });

  it('starts as soon as the lock is turned on', async () => {
    await render(<RootLayout />);
    await onboarding(lockOn);
    expect(preventCapture).toHaveBeenCalledTimes(1);
  });

  it('is allowed again once the lock is turned off', async () => {
    useOnboarding.setState(lockOn);
    await render(<RootLayout />);
    await onboarding(lockOff);
    expect(allowCapture).toHaveBeenCalledTimes(1);
  });

  it('changes nothing with the lock off', async () => {
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/' } });
    expect(preventCapture).not.toHaveBeenCalled();
    expect(allowCapture).not.toHaveBeenCalled();
  });

  it('does not bring the app down if the native call fails', async () => {
    preventCapture.mockRejectedValueOnce(new Error('no activity'));
    useOnboarding.setState(lockOn);
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/' } });
    expect(screen.queryByTestId(NAVIGATOR)).toBeTruthy();
  });

  it('does not bring the app down on a build without the native module', async () => {
    preventCapture.mockImplementationOnce(() => {
      throw new Error("Cannot find native module 'ExpoScreenCapture'");
    });
    useOnboarding.setState(lockOn);
    await render(<RootLayout />);
    await setGate({ status: { kind: 'ready', resume: '/' } });
    expect(screen.queryByTestId(NAVIGATOR)).toBeTruthy();
  });

  it('is never touched on iOS, whatever the lock says', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    useOnboarding.setState(lockOn);
    await render(<RootLayout />);
    await onboarding(lockOff);
    expect(preventCapture).not.toHaveBeenCalled();
    expect(allowCapture).not.toHaveBeenCalled();
  });
});

describe('the privacy cover', () => {
  const ready = { status: { kind: 'ready', resume: '/' } as const };

  it('appears on inactive, in time for the iOS app switcher snapshot', async () => {
    await render(<RootLayout />);
    await setGate(ready);
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
    await send('inactive');
    // Everything beneath is hidden from accessibility once the cover is up.
    expect(screen.queryByTestId(NAVIGATOR)).toBeNull();
  });

  it('stays through the background and lifts on return', async () => {
    await render(<RootLayout />);
    await setGate(ready);
    await send('background');
    expect(screen.queryByTestId(NAVIGATOR)).toBeNull();
    await send('active');
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
  });

  it('never lifts onto content the re-lock has not reached yet', async () => {
    // The capability check is a native round trip. Here it has not come back at all.
    jest.mocked(getLockMethod).mockReturnValueOnce(new Promise(() => undefined));
    useOnboarding.setState({ privacy: { biometricLock: true, privateBackup: false } });
    await render(<RootLayout />);
    await setGate(ready);
    await send('background');
    jest.setSystemTime(Date.now() + RELOCK_AFTER_MS);
    await send('active');
    expect(screen.getByText(gateCopy.lock.title)).toBeTruthy();
    expect(screen.queryByTestId(NAVIGATOR)).toBeNull();
  });
});

// On Android, 'blur' is the app window losing focus. It comes as recents opens, ahead of the pause,
// and also as every window of ECHO's own opens: each sheet and dialog is a window, and takes focus.
describe('the privacy cover and ECHO’s own windows', () => {
  const ready = { status: { kind: 'ready', resume: '/' } as const };
  const ask = () =>
    act(async () =>
      showDialog(gateCopy.keyLost.confirmTitle, gateCopy.keyLost.confirmBody, [
        { text: gateCopy.keyLost.confirmCancel, style: 'cancel' },
        { text: gateCopy.keyLost.confirmErase, style: 'destructive' },
      ]),
    );

  beforeEach(async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    await render(<RootLayout />);
    await setGate(ready);
  });

  it('covers on blur when no window of ECHO’s own is open, as recents opens', async () => {
    await windowEvent('blur');
    expect(cover()).toBeTruthy();
    expect(screen.queryByTestId(NAVIGATOR)).toBeNull();
  });

  it('lifts again on focus', async () => {
    await windowEvent('blur');
    await windowEvent('focus');
    expect(cover()).toBeNull();
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
  });

  it('does not cover on blur while one of ECHO’s own windows is open: the page shows, dimmed', async () => {
    await ask();
    await windowEvent('blur');
    expect(cover()).toBeNull();
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
    expect(openDialog()).toBeTruthy();
  });

  it('covers on blur again once that window has closed', async () => {
    await ask();
    await windowEvent('blur');
    await chooseInDialog(gateCopy.keyLost.confirmCancel);
    // The window is still ECHO’s own while it fades away, and stops being once it has gone.
    await waitFor(() => expect(ownWindowOpen()).toBe(false));
    await windowEvent('focus');
    await windowEvent('blur');
    expect(cover()).toBeTruthy();
    expect(screen.queryByTestId(NAVIGATOR)).toBeNull();
  });

  it('still covers on background with one of ECHO’s own windows open', async () => {
    await ask();
    await windowEvent('blur');
    await send('background');
    expect(cover()).toBeTruthy();
    expect(screen.queryByTestId(NAVIGATOR)).toBeNull();
  });
});

// The system's file picker is another Activity: opening it takes the app out of the active state, as
// well as the window's focus, and nothing of ECHO's own is in the recents thumbnail while it is on top.
// The walk (v10) saw the cover held for 3.6 s after the picker closed, over a restore that was reading
// the file it had been given. The cover is not raised for the picker at all, so there is none to lift,
// and what lifts it when the picker is done does not wait on any event or on a busy thread.
describe('the privacy cover and the system file picker', () => {
  const ready = { status: { kind: 'ready', resume: '/' } as const };

  beforeEach(async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    await render(<RootLayout />);
    await setGate(ready);
  });

  it('is not raised when the picker takes the window’s focus', async () => {
    const closePicker = openSystemPicker();
    await windowEvent('blur');
    expect(cover()).toBeNull();
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
    closePicker();
  });

  it('is not raised when the picker takes the app out of the active state', async () => {
    const closePicker = openSystemPicker();
    await windowEvent('blur');
    await send('background');
    expect(cover()).toBeNull();
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
    await send('active');
    closePicker();
  });

  it('lifts a cover that was raised on the way in the moment the picker is done, before the system has said the app is active again', async () => {
    // The activity result reaches JavaScript ahead of the resume, so the app still reads as away.
    await send('background');
    expect(cover()).toBeTruthy();
    const closePicker = openSystemPicker();
    await act(async () => closePicker());
    expect(cover()).toBeNull();
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
  });

  it('is raised again for the app switcher once the picker has closed', async () => {
    const closePicker = openSystemPicker();
    await windowEvent('blur');
    await act(async () => closePicker());
    await send('active');
    await send('background');
    expect(cover()).toBeTruthy();
    expect(screen.queryByTestId(NAVIGATOR)).toBeNull();
  });
});

// Android reports a window gaining focus before it has said the app is active, on a cold launch, where
// AppState has not yet answered. A focus is never a reason to hide the page; only a blur and a change
// away from active are.
describe('the privacy cover during a launch', () => {
  const ready = { status: { kind: 'ready', resume: '/' } as const };

  it('is not raised by a focus that comes before the app has said it is active', async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    await render(<RootLayout />);
    await setGate(ready);
    await windowEvent('focus');
    expect(cover()).toBeNull();
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
  });

  it('is not raised by a blur while the app has not yet said it is active either', async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    await render(<RootLayout />);
    await setGate(ready);
    await windowEvent('blur');
    expect(cover()).toBeNull();
    expect(screen.getByTestId(NAVIGATOR)).toBeTruthy();
  });

  it('still covers on a blur once the app is active: that is the app switcher opening', async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    await render(<RootLayout />);
    await setGate(ready);
    await windowEvent('blur');
    expect(cover()).toBeTruthy();
  });
});
