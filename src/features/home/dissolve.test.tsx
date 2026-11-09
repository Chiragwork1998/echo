import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { BackHandler, Pressable, Text } from 'react-native';

import { render } from '@/testing/render';

import {
  ARRIVAL_AFTER_IDLE_MS,
  DISSOLVE_MS,
  HomeDissolveProvider,
  REDUCED_FADE_MS,
  RETURN_MS,
  useHomeDissolve,
  useSessionEntry,
  VEIL_CAP_MS,
} from './dissolve';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  usePathname: () => '/home',
}));
// Evening, whatever the hour the tests run: the morning question is tested in become.test.tsx.
jest.mock('@/features/become/morning', () => ({
  ...jest.requireActual('@/features/become/morning'),
  useMorning: () => false,
}));

function Probe() {
  const control = useHomeDissolve();
  const { begin, writeInstead, continueDraft } = useSessionEntry();
  return (
    <>
      <Text testID="phase">{control.phase}</Text>
      <Pressable testID="begin" onPress={begin} />
      <Pressable testID="write" onPress={writeInstead} />
      <Pressable testID="continue" onPress={() => continueDraft('d1')} />
      <Pressable testID="opened" onPress={control.sessionOpened} />
      <Pressable testID="closed" onPress={control.sessionClosed} />
      <Pressable testID="return" onPress={() => control.returnHome()} />
      <Pressable testID="unveil" onPress={control.unveil} />
      <Text testID="progress">{String(control.progress.get())}</Text>
      {/* Home partly gone, as it is a moment after the session gives it back. */}
      <Pressable testID="partly-gone" onPress={() => control.progress.set(0.64)} />
      <Pressable testID="nearly-gone" onPress={() => control.progress.set(0.99)} />
    </>
  );
}
const phase = () => screen.getByTestId('phase').props.children;
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const open = () =>
  render(
    <HomeDissolveProvider>
      <Probe />
    </HomeDissolveProvider>,
  );

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('the dissolve into the daily session', () => {
  it('melts Home first, and only then opens the session', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    expect(phase()).toBe('leaving');
    await tick(DISSOLVE_MS - 1);
    expect(router.push).not.toHaveBeenCalled();
    await tick(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    // Begin is the spoken session (D-006), whatever mode was used last.
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'voice' },
    });
  });

  it('hands the status bar over once most of Home is gone', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS * 0.5);
    expect(phase()).toBe('gone');
  });

  it('carries Write instead and Continue into the session the same way', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('write'));
    await tick(DISSOLVE_MS);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'write' },
    });
    // The session closes, Home returns, and Continue is open to use again.
    await fireEvent.press(screen.getByTestId('opened'));
    await fireEvent.press(screen.getByTestId('closed'));
    await tick(1000);
    expect(phase()).toBe('idle');
    await fireEvent.press(screen.getByTestId('continue'));
    await tick(DISSOLVE_MS);
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/home/session',
      params: { draftId: 'd1' },
    });
  });

  it('ignores a second press while it is dissolving', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('gives Home back when the session closes', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS);
    await fireEvent.press(screen.getByTestId('opened'));
    await tick(5000);
    expect(phase()).toBe('gone');
    await fireEvent.press(screen.getByTestId('closed'));
    await tick(1000);
    expect(phase()).toBe('idle');
  });

  it('never leaves Home empty if the session does not appear', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS + 2500);
    expect(phase()).toBe('idle');
  });
});

describe('Back while Home is melting', () => {
  // Without this, a Back pressed just after Begin reached the stack and ECHO closed to the launcher.
  type Handler = Parameters<typeof BackHandler.addEventListener>[1];
  const handlers: Handler[] = [];
  beforeEach(() => {
    handlers.length = 0;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler);
      return { remove: () => void handlers.splice(handlers.indexOf(handler), 1) };
    });
  });
  afterEach(() => jest.restoreAllMocks());
  const pressBack = () => act(() => void handlers.at(-1)?.({} as never));

  it('brings Home back and opens nothing, before the session has opened', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('write'));
    await tick(DISSOLVE_MS * 0.3);
    expect(handlers).toHaveLength(1);
    let answered: ReturnType<Handler> | undefined;
    await act(() => void (answered = handlers.at(-1)?.({} as never)));
    expect(answered).toBe(true);
    expect(phase()).toBe('idle');
    await tick(DISSOLVE_MS * 2);
    expect(router.push).not.toHaveBeenCalled();
    // Nothing is left listening once Home is back.
    expect(handlers).toHaveLength(0);
  });

  it('leaves Back to the session once it has opened', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS);
    await fireEvent.press(screen.getByTestId('opened'));
    let answered: ReturnType<Handler> | undefined;
    await act(() => void (answered = handlers.at(-1)?.({} as never)));
    expect(answered).toBe(false);
    expect(phase()).toBe('gone');
  });

  it('is not listened for on a Home at rest', async () => {
    await open();
    expect(handlers).toHaveLength(0);
    await pressBack();
    expect(phase()).toBe('idle');
  });
});

describe('pressing Begin while Home is still coming back', () => {
  it('dissolves what is left of Home, not the whole of it again', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('partly-gone'));
    await fireEvent.press(screen.getByTestId('begin'));
    const left = Math.round(DISSOLVE_MS * 0.36);
    await tick(left - 1);
    expect(router.push).not.toHaveBeenCalled();
    await tick(1);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('never takes less than the Reduce Motion fade, even with almost nothing left to do', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('nearly-gone'));
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(REDUCED_FADE_MS - 1);
    expect(router.push).not.toHaveBeenCalled();
    await tick(1);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('waits for Home to be whole before anything is set on it', () => {
    expect(ARRIVAL_AFTER_IDLE_MS).toBe(920);
    expect(ARRIVAL_AFTER_IDLE_MS).toBeGreaterThan(RETURN_MS);
  });
});

describe('giving Home back before the session has closed', () => {
  // The walk (E5): after Enter your space the bare photograph came in and Home's interface 0.6 s
  // later. Home's return was only started once the session had been unmounted, after the pop; it is
  // started here from the card that follows the session, which is on show for some time first.
  const returns = () => {
    const reanimated = jest.requireMock('react-native-reanimated');
    const toZero: number[] = [];
    jest.spyOn(reanimated, 'withTiming').mockImplementation(((
      to: number,
      options: { duration: number },
    ) => {
      if (to === 0) toZero.push(options.duration);
      return to;
    }) as never);
    return toZero;
  };

  async function inSession() {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS);
    await fireEvent.press(screen.getByTestId('opened'));
    await tick(DISSOLVE_MS);
    expect(phase()).toBe('gone');
  }

  it('brings Home’s interface back while the session is still in the stack', async () => {
    await inSession();
    await fireEvent.press(screen.getByTestId('return'));
    expect(phase()).toBe('idle');
  });

  it('is the one return: the session closing after it does not start another', async () => {
    const toZero = returns();
    await inSession();
    await fireEvent.press(screen.getByTestId('return'));
    expect(toZero).toEqual([RETURN_MS]);
    await fireEvent.press(screen.getByTestId('closed'));
    await tick(1000);
    // A second return would start Home's interface over again, 120 ms later and from where it had got to.
    expect(toZero).toEqual([RETURN_MS]);
    expect(phase()).toBe('idle');
  });

  it('still gives Home back when the session closes and nothing gave it back before', async () => {
    const toZero = returns();
    await inSession();
    await fireEvent.press(screen.getByTestId('closed'));
    await tick(1000);
    expect(toZero).toEqual([RETURN_MS]);
    expect(phase()).toBe('idle');
  });

  it('does nothing when Home was never dissolved', async () => {
    const toZero = returns();
    await open();
    await fireEvent.press(screen.getByTestId('return'));
    expect(toZero).toEqual([]);
    expect(phase()).toBe('idle');
  });

  it('lets Begin dissolve Home again afterwards, as it does after any return', async () => {
    await inSession();
    await fireEvent.press(screen.getByTestId('return'));
    await fireEvent.press(screen.getByTestId('closed'));
    await tick(1000);
    await fireEvent.press(screen.getByTestId('begin'));
    expect(phase()).toBe('leaving');
  });
});

describe('without a provider', () => {
  it('simply navigates', async () => {
    await render(<Probe />);
    await fireEvent.press(screen.getByTestId('begin'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'voice' },
    });
  });
});

// Home's first look after onboarding (the welcome) begins with its interface gone, over the photograph
// that comes up after Completion's, and its interface rises by the usual return once Home is ready.
describe('a Home that begins veiled', () => {
  /** Every return Home's interface is given: how long it waits, and how long it takes. */
  const returns = () => {
    const reanimated = jest.requireMock('react-native-reanimated');
    const toZero: { duration: number; after: number }[] = [];
    const RETURNING = Symbol('a return');
    jest
      .spyOn(reanimated, 'withTiming')
      .mockImplementation(((to: number, options: { duration: number }) =>
        to === 0 ? { [RETURNING]: options.duration } : to) as never);
    jest.spyOn(reanimated, 'withDelay').mockImplementation(((ms: number, value: unknown) => {
      const duration = (value as Record<symbol, number> | null)?.[RETURNING];
      if (duration !== undefined) toZero.push({ duration, after: ms });
      return 0;
    }) as never);
    return toZero;
  };
  const veiled = () =>
    render(
      <HomeDissolveProvider veiled>
        <Probe />
      </HomeDissolveProvider>,
    );
  const progress = () => Number(screen.getByTestId('progress').props.children);

  afterEach(() => jest.restoreAllMocks());

  it('begins with only the photograph: its interface gone, its tab bar waiting, its status bar left alone', async () => {
    await veiled();
    expect(phase()).toBe('veiled');
    expect(progress()).toBe(1);
    // Begin cannot dissolve what is not there.
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('rises by the usual return once Home says it is ready, and only once', async () => {
    const toZero = returns();
    await veiled();
    await fireEvent.press(screen.getByTestId('unveil'));
    expect(phase()).toBe('idle');
    expect(toZero).toEqual([{ duration: RETURN_MS, after: ARRIVAL_AFTER_IDLE_MS - RETURN_MS }]);
    await fireEvent.press(screen.getByTestId('unveil'));
    await tick(VEIL_CAP_MS * 2);
    expect(toZero).toHaveLength(1);
  });

  it('is never left veiled: the cap gives Home its interface whatever it waits for', async () => {
    const toZero = returns();
    await veiled();
    await tick(VEIL_CAP_MS - 1);
    expect(phase()).toBe('veiled');
    await tick(1);
    expect(phase()).toBe('idle');
    expect(toZero).toEqual([{ duration: RETURN_MS, after: ARRIVAL_AFTER_IDLE_MS - RETURN_MS }]);
    expect(VEIL_CAP_MS).toBe(1500);
  });

  it('is Home as it always was otherwise: whole from the start, and nothing to unveil', async () => {
    const toZero = returns();
    await open();
    expect(phase()).toBe('idle');
    expect(progress()).toBe(0);
    await fireEvent.press(screen.getByTestId('unveil'));
    await tick(VEIL_CAP_MS * 2);
    expect(toZero).toEqual([]);
    expect(phase()).toBe('idle');
  });

  it('lets Begin dissolve Home as usual once it has risen', async () => {
    await veiled();
    await fireEvent.press(screen.getByTestId('unveil'));
    await tick(ARRIVAL_AFTER_IDLE_MS);
    await fireEvent.press(screen.getByTestId('begin'));
    expect(phase()).toBe('leaving');
  });
});
