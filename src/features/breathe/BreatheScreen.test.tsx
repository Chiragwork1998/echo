import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { BackHandler, Pressable, StyleSheet, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { ThemeProvider } from '@/design/theme';
import { useThemeHeld } from '@/design/themeHold';
import { tokens } from '@/design/tokens';
import {
  DISSOLVE_MS,
  HomeDissolveProvider,
  useHomeDissolve,
  useSessionEntry,
} from '@/features/home/dissolve';
import { fingerAway, fingerDown } from '@/testing/pressed';

import { DEFAULT_PRACTICE, usePreferences } from '@/state/preferences';
import { useRequirePlus, usePlus } from '@/services/plus';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { freeAtAll } from './access';
import { JOURNAL_AUDIO_MODE } from './audio';
import { breatheCopy } from './breatheCopy';
import { BreatheScreen } from './BreatheScreen';
import { recordPractice } from './feelingStore';
import { PRACTICES } from './library/practices';
import { supportCopy } from '@/features/patterns/supportResources';

const mockAudio = {
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn(() => ({
    loop: false,
    volume: 1,
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
};
let mockMorning = false;
let mockReduced = false;
let mockPath = '/home/breathe';

jest.mock('@/services/nativeModules', () => ({ loadAudio: () => mockAudio }));
jest.mock('@/design/haptics');
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), replace: jest.fn() },
    usePathname: () => mockPath,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/services/plus', () => ({ usePlus: jest.fn(), useRequirePlus: jest.fn() }));
jest.mock('@/features/become/morning', () => ({
  ...jest.requireActual('@/features/become/morning'),
  useMorning: () => mockMorning,
}));
jest.mock('./feelingStore', () => ({
  ...jest.requireActual('./feelingStore'),
  recordPractice: jest.fn(async () => ({ ok: true, value: null })),
}));

const requirePlus = jest.fn(() => false);

function as(plus: boolean) {
  jest.mocked(usePlus).mockReturnValue({ status: plus ? 'plus' : 'free', isPlus: plus });
  jest.mocked(useRequirePlus).mockReturnValue(requirePlus);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  animationClock.reset();
  mockMorning = false;
  mockReduced = false;
  mockPath = '/home/breathe';
  usePreferences.setState({ practice: { ...DEFAULT_PRACTICE, begun: 1 } });
  as(false);
});

const row = (id: string) => screen.getByTestId(`feeling-${id}`);

describe('What are you feeling?', () => {
  it('lists every feeling with its practice and length, marking Plus only for someone without it', async () => {
    await render(<BreatheScreen />);
    expect(screen.getByRole('header', { name: breatheCopy.title })).toBeTruthy();
    for (const practice of PRACTICES) {
      const plus = freeAtAll(practice) ? '' : ', Plus';
      expect(row(practice.id)).toHaveProp(
        'accessibilityLabel',
        `${practice.feeling}. ${practice.name}, ${practice.minutes} min${plus}`,
      );
    }
    const plusOnly = PRACTICES.filter((practice) => !freeAtAll(practice));
    expect(screen.getAllByText(/· Plus$/)).toHaveLength(plusOnly.length);
  });

  it('marks nothing for someone with Plus', async () => {
    as(true);
    await render(<BreatheScreen />);
    expect(screen.queryAllByText(/· Plus$/)).toHaveLength(0);
  });

  it('opens a free practice without asking, and asks for Plus before a Plus one', async () => {
    await render(<BreatheScreen />);
    await fireEvent.press(row('cool'));
    expect(requirePlus).toHaveBeenCalledWith('breath-library');
    expect(screen.getByRole('header', { name: breatheCopy.title })).toBeTruthy();

    requirePlus.mockClear();
    await fireEvent.press(row('soothe'));
    expect(requirePlus).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Soothe' })).toBeTruthy();
  });

  it('lets a Plus practice open when the gate says yes', async () => {
    requirePlus.mockReturnValueOnce(true);
    await render(<BreatheScreen />);
    await fireEvent.press(row('sleep'));
    expect(screen.getByRole('header', { name: 'Sleep' })).toBeTruthy();
  });

  it('goes back to Today from the list', async () => {
    await render(<BreatheScreen />);
    await fireEvent.press(screen.getByTestId('breathe-back'));
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });
});

describe('the page under the status bar', () => {
  // Seen on You and Patterns in the release walk: words scrolled up ran under the clock. Breathe's
  // list and its Before screen (long once "Why this helps" is open) scroll the same way, so their
  // scrolling begins below the status bar, as the onboarding screens' and the tab pages' do.
  it('begins its scrolling below the status bar, with the inset given once', async () => {
    await render(<BreatheScreen />);
    const scroll = screen.getByTestId('breathe-scroll');
    // The safe area mock has no inset, so the page keeps its 8 pt floor.
    expect(StyleSheet.flatten(scroll.props.style).marginTop).toBe(8);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop ?? 0).toBe(0);
  });
});

describe('Before it starts', () => {
  async function openHeart() {
    await render(<BreatheScreen />);
    await fireEvent.press(row('heart'));
  }
  const selected = (testID: string) =>
    screen.getByTestId(testID).props.accessibilityState?.selected === true;

  it('keeps Heart free at 3 and 5 minutes, and asks for Plus at 10', async () => {
    await openHeart();
    expect(selected('length-5')).toBe(true);
    await fireEvent.press(screen.getByTestId('length-3'));
    expect(requirePlus).not.toHaveBeenCalled();
    expect(selected('length-3')).toBe(true);
    expect(usePreferences.getState().practice.minutes.heart).toBe(3);

    await fireEvent.press(screen.getByTestId('length-10'));
    expect(requirePlus).toHaveBeenCalledWith('breath-library');
    expect(selected('length-3')).toBe(true);
  });

  it('keeps Your pace for Plus, and the default pace for everyone', async () => {
    await openHeart();
    expect(selected('pace-5.5')).toBe(true);
    await fireEvent.press(screen.getByTestId('pace-6'));
    expect(requirePlus).toHaveBeenCalledWith('breath-library');
    expect(selected('pace-5.5')).toBe(true);
    expect(screen.getByTestId('pace-6')).toHaveProp(
      'accessibilityLabel',
      '6 breaths a minute, Plus',
    );
  });

  it('lets someone with Plus choose any length and pace', async () => {
    as(true);
    await openHeart();
    await fireEvent.press(screen.getByTestId('length-20'));
    await fireEvent.press(screen.getByTestId('pace-4.5'));
    expect(requirePlus).not.toHaveBeenCalled();
    expect(usePreferences.getState().practice).toMatchObject({ minutes: { heart: 20 }, pace: 4.5 });
  });

  it('warns before a practice that holds the breath', async () => {
    requirePlus.mockReturnValueOnce(true);
    await render(<BreatheScreen />);
    await fireEvent.press(row('sleep'));
    expect(screen.getByTestId('breathe-caution')).toBeTruthy();
  });

  it('lays a patch behind the warning on either sky, so the moon and snow never wash it out', async () => {
    for (const theme of ['night', 'day'] as const) {
      usePreferences.setState({ theme });
      requirePlus.mockReturnValueOnce(true);
      const view = await render(<BreatheScreen />);
      await fireEvent.press(row('sleep'));
      expect(screen.getByTestId('breathe-caution')).toBeTruthy();
      expect(screen.getByTestId('breathe-heading-patch')).toBeTruthy();
      await view.unmount();
    }
  });

  it('gives no warning before a practice that does not hold the breath', async () => {
    await render(<BreatheScreen />);
    await fireEvent.press(row('heart'));
    expect(screen.queryByTestId('breathe-caution')).toBeNull();
  });

  it('opens why it helps on a tap, with its source', async () => {
    await openHeart();
    const heart = PRACTICES.find((practice) => practice.id === 'heart');
    const source = breatheCopy.source(heart?.source ?? '');
    expect(screen.queryByText(source)).toBeNull();
    await fireEvent.press(screen.getByTestId('breathe-why'));
    expect(screen.getByText(source)).toBeTruthy();
  });

  it('remembers the voice and the sound, and shows the lines to read when the voice is off', async () => {
    await openHeart();
    expect(screen.queryByText(breatheCopy.linesTitle)).toBeNull();
    await fireEvent.press(screen.getByRole('switch', { name: breatheCopy.voice }));
    await fireEvent.press(screen.getByRole('switch', { name: breatheCopy.sound }));
    expect(usePreferences.getState().practice).toMatchObject({ voice: false, sound: false });
    expect(screen.getByText(breatheCopy.linesTitle)).toBeTruthy();
  });
});

describe('after a practice', () => {
  async function breatheThrough(id: string) {
    await render(<BreatheScreen />);
    await fireEvent.press(row(id));
    await fireEvent.press(screen.getByRole('button', { name: breatheCopy.begin }));
    // The Before screen lets go (320 ms) and the practice comes up over the plate.
    await act(async () => void jest.advanceTimersByTime(400));
    // The whole practice, on its own clock: there is no sound to follow under test.
    for (let i = 0; i < 40; i += 1) await act(async () => void jest.advanceTimersByTime(10_000));
  }

  it('asks how the person feels, keeps the answer as a count, and offers the ways on', async () => {
    await breatheThrough('settle');
    expect(screen.getByRole('header', { name: breatheCopy.check.title })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('feeling-check-calmer'));
    expect(recordPractice).toHaveBeenCalledWith(expect.any(String), 'settle', {
      practice: true,
      feeling: 'calmer',
    });
    expect(screen.getByRole('button', { name: breatheCopy.actions.echo })).toBeTruthy();
    expect(screen.getByRole('button', { name: breatheCopy.actions.more })).toBeTruthy();
    expect(screen.getByRole('button', { name: breatheCopy.actions.done })).toBeTruthy();
  });

  it('offers support after Ground when the person is still unsettled', async () => {
    await breatheThrough('ground');
    await fireEvent.press(screen.getByTestId('feeling-check-unsettled'));
    expect(screen.getByRole('header', { name: supportCopy.title })).toBeTruthy();
  });

  it('does not offer support after a practice that does not ask for it', async () => {
    await breatheThrough('settle');
    await fireEvent.press(screen.getByTestId('feeling-check-unsettled'));
    expect(screen.queryByRole('header', { name: supportCopy.title })).toBeNull();
  });

  it('puts the journal’s audio back before Begin your echo opens today’s session', async () => {
    await breatheThrough('settle');
    await fireEvent.press(screen.getByTestId('feeling-check-skip'));
    mockAudio.setAudioModeAsync.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: breatheCopy.actions.echo }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith(JOURNAL_AUDIO_MODE);
    const restored = mockAudio.setAudioModeAsync.mock.invocationCallOrder.at(-1) ?? 0;
    expect(restored).toBeLessThan(jest.mocked(router.push).mock.invocationCallOrder[0] ?? 0);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'voice' },
    });
  });

  it('asks the morning question when Begin your echo is pressed in the morning', async () => {
    mockMorning = true;
    await breatheThrough('settle');
    await fireEvent.press(screen.getByTestId('feeling-check-skip'));
    await fireEvent.press(screen.getByRole('button', { name: breatheCopy.actions.echo }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/home/session',
        params: { mode: 'voice', prompt: 'become' },
      }),
    );
  });

  it('carries on for one more minute, then offers the ways on without asking again', async () => {
    await breatheThrough('settle');
    await fireEvent.press(screen.getByTestId('feeling-check-same'));
    await fireEvent.press(screen.getByTestId('after-more'));
    expect(screen.getByTestId('practice-sky', { includeHiddenElements: true })).toBeTruthy();
    for (let i = 0; i < 10; i += 1) await act(async () => void jest.advanceTimersByTime(10_000));
    expect(screen.queryByRole('header', { name: breatheCopy.check.title })).toBeNull();
    expect(screen.getByRole('button', { name: breatheCopy.actions.done })).toBeTruthy();
    expect(recordPractice).toHaveBeenCalledTimes(1);
  });

  it('goes back to Today on Done', async () => {
    await breatheThrough('settle');
    await fireEvent.press(screen.getByTestId('feeling-check-skip'));
    await fireEvent.press(screen.getByTestId('after-done'));
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });
});

const timings = (spy: jest.SpyInstance) =>
  spy.mock.calls.map(([, options]) => (options as { duration: number }).duration);

describe('motion between the stages', () => {
  afterEach(() => jest.restoreAllMocks());

  it('settles each stage in over 600 ms', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await render(<BreatheScreen />);
    expect(timings(spy)).toContain(600);
  });

  it('under Reduce Motion, settles in over 180 ms: a plain fade', async () => {
    mockReduced = true;
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await render(<BreatheScreen />);
    expect(timings(spy)).toContain(180);
    expect(timings(spy)).not.toContain(600);
  });
});

describe('the theme under a practice', () => {
  function Held() {
    return <Text testID="held">{String(useThemeHeld())}</Text>;
  }

  it('is held while Breathe is open, so a phone that follows the sun cannot swap the plate mid-breath', async () => {
    const view = await render(
      <>
        <Held />
        <BreatheScreen />
      </>,
    );
    expect(screen.getByTestId('held')).toHaveTextContent('true');
    await view.unmount();
    const after = await render(<Held />);
    expect(screen.getByTestId('held')).toHaveTextContent('false');
    await after.unmount();
  });
});

describe('the quiet words on Before', () => {
  async function openHeart() {
    await render(<BreatheScreen />);
    await fireEvent.press(row('heart'));
  }
  const opacityOf = (testID: string) =>
    StyleSheet.flatten(screen.getByTestId(testID).props.style).opacity;

  it('dim on a press, Back and Why this helps alike, and come back when the finger lifts', async () => {
    await openHeart();
    for (const testID of ['breathe-back', 'breathe-why']) {
      expect(opacityOf(testID) ?? 1).toBe(1);
      await fingerDown(screen.getByTestId(testID));
      expect(opacityOf(testID)).toBe(0.6);
      await fingerAway(screen.getByTestId(testID), () =>
        act(async () => void jest.advanceTimersByTime(200)),
      );
      expect(opacityOf(testID) ?? 1).toBe(1);
    }
  });

  it('crosses the switch’s fill and its outline over, instead of swapping them in one frame', async () => {
    await openHeart();
    const fill = () => opacityOf('setting-voice-fill');
    const rim = () => opacityOf('setting-voice-rim');
    expect([fill(), rim()]).toEqual([1, 0]);
    // The knob and both layers travel together, on one value; the track itself is never a border.
    await fireEvent.press(screen.getByRole('switch', { name: breatheCopy.voice }));
    // Another render, so the mock applies the value the press set.
    await fireEvent.press(screen.getByTestId('length-3'));
    expect([fill(), rim()]).toEqual([0, 1]);
    expect(screen.getByRole('switch', { name: breatheCopy.voice })).toHaveProp(
      'accessibilityState',
      { checked: false },
    );
    // Where the knob rests is the golden's, to the half point: 1.5 in from the track's edge when off and
    // 0.5 in when on, so the track is 44 wide, padded 1.5, and the knob 24 travels 18.
    const knob = (id: string) =>
      JSON.stringify(screen.getByTestId(`setting-${id}-knob`).props.style);
    expect(knob('sound')).toContain('"translateX":18');
    expect(knob('voice')).toContain('"translateX":0');
    const track = screen.getByTestId('setting-voice-fill').parent;
    expect(JSON.stringify(track?.props.style)).not.toContain('borderWidth');
  });

  it('brings the reasons and the lines up over 320 ms, and over 180 under Reduce Motion', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await openHeart();
    spy.mockClear();
    await fireEvent.press(screen.getByTestId('breathe-why'));
    expect(timings(spy)).toEqual([320]);
    spy.mockClear();
    await fireEvent.press(screen.getByRole('switch', { name: breatheCopy.voice }));
    expect(timings(spy)).toContain(320);

    mockReduced = true;
    spy.mockClear();
    await fireEvent.press(screen.getByRole('switch', { name: breatheCopy.voice }));
    await fireEvent.press(screen.getByRole('switch', { name: breatheCopy.voice }));
    expect(timings(spy).every((ms) => ms <= 180)).toBe(true);
  });
});

describe('Begin', () => {
  afterEach(() => jest.restoreAllMocks());
  const begin = () => screen.getByRole('button', { name: breatheCopy.begin });
  const practice = () => screen.queryByTestId('practice-sky', { includeHiddenElements: true });

  async function openHeart() {
    await render(<BreatheScreen />);
    await fireEvent.press(row('heart'));
  }

  it('lets the Before screen fade away over 320 ms, takes no touch while it goes, and begins once', async () => {
    await openHeart();
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await fireEvent.press(begin());
    // Not a cut: the screen is still there, going.
    expect(practice()).toBeNull();
    expect(
      spy.mock.calls.some(([to, o]) => to === 0 && (o as { duration: number }).duration === 320),
    ).toBe(true);
    await fireEvent.press(begin());
    await act(async () => void jest.advanceTimersByTime(300));
    expect(practice()).toBeNull();
    await act(async () => void jest.advanceTimersByTime(40));
    expect(practice()).toBeTruthy();
    expect(usePreferences.getState().practice.begun).toBe(2);
  });

  it('under Reduce Motion lets go in 180 ms', async () => {
    mockReduced = true;
    await openHeart();
    await fireEvent.press(begin());
    await act(async () => void jest.advanceTimersByTime(150));
    expect(practice()).toBeNull();
    await act(async () => void jest.advanceTimersByTime(50));
    expect(practice()).toBeTruthy();
  });

  it('does not begin if the screen goes away while it lets go', async () => {
    const view = await render(<BreatheScreen />);
    await fireEvent.press(row('heart'));
    await fireEvent.press(begin());
    await view.unmount();
    await act(async () => void jest.advanceTimersByTime(500));
    expect(practice()).toBeNull();
  });
});

// On Android the daily session is presented over Breathe, which stays up beneath it. The walk (v11)
// opened the session from the ways on after a practice: Begin your echo, One more minute and Done stood
// under the session for the whole of it, dimmed beneath its own Back, Write and Show words.
describe('Begin your echo, and the session over Breathe', () => {
  const FADE_MS = tokens.motion.standard;
  const echo = () => screen.getByRole('button', { name: breatheCopy.actions.echo });
  const layer = () => screen.getByTestId('breathe-screen', { includeHiddenElements: true });
  const advance = (ms: number) =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  /** Draws the screen again, as the path now says, and says how much of it is drawn. */
  const drawn = async (view: Awaited<ReturnType<typeof render>>) => {
    await view.rerender(
      <ThemeProvider crossfade={false}>
        <BreatheScreen />
      </ThemeProvider>,
    );
    return StyleSheet.flatten(layer().props.style).opacity as number;
  };

  /** Settle, breathed through, and the ways on after it. */
  async function toTheWaysOn() {
    const view = await render(<BreatheScreen />);
    await fireEvent.press(row('settle'));
    await fireEvent.press(screen.getByRole('button', { name: breatheCopy.begin }));
    await act(async () => void jest.advanceTimersByTime(400));
    for (let i = 0; i < 40; i += 1) await act(async () => void jest.advanceTimersByTime(10_000));
    await fireEvent.press(screen.getByTestId('feeling-check-calmer'));
    // From here the fades are walked a frame at a time, so that how much is drawn can be seen.
    animationClock.stepped = true;
    return view;
  }

  /** The system's Back: the listener registered last is asked first, and the first to say yes has it. */
  function backButton() {
    const listeners: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      const listener = handler as () => boolean;
      listeners.push(listener);
      return {
        remove: () => {
          const at = listeners.indexOf(listener);
          if (at >= 0) listeners.splice(at, 1);
        },
      };
    });
    const press = () => {
      for (let i = listeners.length - 1; i >= 0; i -= 1) if (listeners[i]!()) return true;
      return false;
    };
    return { listeners, press };
  }

  afterEach(() => jest.restoreAllMocks());

  it('lets the ways on fade away first, takes no touch while they go, and opens the session once they have gone', async () => {
    const view = await toTheWaysOn();
    expect(await drawn(view)).toBe(1);
    await fireEvent.press(echo());
    expect(layer().props.pointerEvents).toBe('none');
    await advance(FADE_MS / 2);
    // Half way: the screen is half there, going. It is not cut.
    const half = await drawn(view);
    expect(half).toBeGreaterThan(0.1);
    expect(half).toBeLessThan(0.9);
    expect(router.push).not.toHaveBeenCalled();
    await advance(FADE_MS / 2 + 3 * 16);
    expect(await drawn(view)).toBe(0);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'voice' },
    });
  });

  it('opens the session only when the fade has really ended, however late the UI thread begins it', async () => {
    await toTheWaysOn();
    animationClock.lag = 1200;
    await fireEvent.press(echo());
    await advance(FADE_MS + 1000);
    expect(router.push).not.toHaveBeenCalled();
    await advance(400);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('draws nothing beneath the session, and is reached by neither a touch nor TalkBack, for the whole of it', async () => {
    const view = await toTheWaysOn();
    await fireEvent.press(echo());
    await advance(FADE_MS + 100);
    mockPath = '/home/session';
    expect(await drawn(view)).toBe(0);
    expect(layer().props.pointerEvents).toBe('none');
    // Nothing of it is left under the session, not even hidden: no view a dump of the window could list.
    for (const name of Object.values(breatheCopy.actions)) {
      expect(screen.queryByRole('button', { name, includeHiddenElements: true })).toBeNull();
    }
    for (const path of ['/home/rehearse', '/home/complete']) {
      mockPath = path;
      await advance(30_000);
      expect(await drawn(view)).toBe(0);
      expect(layer().props.pointerEvents).toBe('none');
    }
  });

  it('stays out of sight beneath the session while a paywall the session opens comes and goes', async () => {
    const view = await toTheWaysOn();
    await fireEvent.press(echo());
    await advance(FADE_MS + 100);
    for (const path of ['/home/session', '/plus', '/home/session']) {
      mockPath = path;
      await drawn(view);
      expect(await drawn(view)).toBe(0);
      expect(layer().props.pointerEvents).toBe('none');
    }
  });

  it('leaves Back to the session: its own listener stays beneath the session’s, and passes Back on', async () => {
    const back = backButton();
    const view = await toTheWaysOn();
    await fireEvent.press(echo());
    await advance(FADE_MS + 100);
    const breathe = [...back.listeners];
    expect(breathe).toHaveLength(1);
    // The session comes, and registers its own.
    mockPath = '/home/session';
    await drawn(view);
    const session = jest.fn(() => true);
    back.listeners.push(session);
    // Nothing Breathe does beneath it puts its listener back above the session's.
    await advance(5000);
    await drawn(view);
    expect(back.listeners).toEqual([...breathe, session]);
    expect(back.press()).toBe(true);
    expect(session).toHaveBeenCalledTimes(1);
    // Asked while the session is on show, Breathe's own passes Back on, and goes nowhere.
    expect(breathe[0]!()).toBe(false);
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('hears nothing of Back while it fades for the session', async () => {
    const back = backButton();
    await toTheWaysOn();
    await fireEvent.press(echo());
    await act(async () => void back.press());
    await advance(FADE_MS + 100);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('under Reduce Motion lets go in 180 ms', async () => {
    mockReduced = true;
    await toTheWaysOn();
    await fireEvent.press(echo());
    await advance(tokens.motion.fast - 2 * 16);
    expect(router.push).not.toHaveBeenCalled();
    await advance(4 * 16);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('opens nothing if it is left while it fades', async () => {
    const view = await toTheWaysOn();
    await fireEvent.press(echo());
    await view.unmount();
    await advance(FADE_MS + 500);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('is left drawn under the paywall, which covers the whole of Home, but takes no touch there', async () => {
    const view = await render(<BreatheScreen />);
    mockPath = '/plus';
    expect(await drawn(view)).toBe(1);
    expect(layer().props.pointerEvents).toBe('none');
    mockPath = '/home/breathe';
    expect(await drawn(view)).toBe(1);
    expect(layer().props.pointerEvents).toBe('auto');
  });

  it('is itself again should it be the screen on show once more', async () => {
    const view = await toTheWaysOn();
    await fireEvent.press(echo());
    await advance(FADE_MS + 100);
    mockPath = '/home/session';
    await drawn(view);
    mockPath = '/home/breathe';
    await drawn(view);
    // A draw later, as the screen has put itself back.
    expect(await drawn(view)).toBe(1);
    expect(layer().props.pointerEvents).toBe('auto');
    expect(echo()).toBeTruthy();
  });
});

describe('Home beneath Breathe', () => {
  function Home() {
    const { phase } = useHomeDissolve();
    const { breathe } = useSessionEntry();
    return (
      <>
        <Text testID="phase">{phase}</Text>
        <Pressable testID="breathe-first" onPress={breathe} />
      </>
    );
  }
  const stack = (breathing: boolean) => (
    <HomeDissolveProvider>
      <Home />
      {breathing && <BreatheScreen />}
    </HomeDissolveProvider>
  );
  /** The same tree as `render` draws, so that Home and its dissolve are the same ones throughout. */
  const again = (breathing: boolean) => (
    <ThemeProvider crossfade={false}>{stack(breathing)}</ThemeProvider>
  );
  const phase = () => screen.getByTestId('phase').props.children;
  const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

  it('stays dissolved while Breathe is open, and comes back when Breathe goes', async () => {
    const view = await render(stack(false));
    await fireEvent.press(screen.getByTestId('breathe-first'));
    await advance(DISSOLVE_MS);
    expect(router.push).toHaveBeenCalledWith('/home/breathe');
    await view.rerender(again(true));
    // Long past the moment a Home whose session never came would give itself back.
    await advance(10_000);
    expect(phase()).toBe('gone');
    await view.rerender(again(false));
    await advance(100);
    expect(phase()).toBe('idle');
  });
});
