// The keys as the session sees them, which the page, the book and the quiet row all follow. A keyboard
// seen moving is followed frame for frame, late frames too; keys that come up are followed at once;
// only keys that are gone in one jump are followed over an ease. And only a keyboard this screen has
// seen come is believed: Reanimated holds a keyboard open that vanished under a sheet, for this screen
// and the next (the walk, v11). The stand-in walks the ease a frame at a time.
import { act, renderHook } from '@testing-library/react-native';
import { DeviceEventEmitter, Keyboard } from 'react-native';
import { KeyboardState } from 'react-native-reanimated';

import { animationClock, keyboard, keyboardState } from '@/testing/reanimatedMock';

import { KEYS_EASE_MS, KEYS_JUMP, KEYS_STALE_MS, useEasedKeys } from './useEasedKeys';

jest.mock(
  'react-native-reanimated',
  () => jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
);

beforeEach(() => {
  animationClock.reset();
  animationClock.stepped = true;
  jest.useFakeTimers();
});
afterEach(async () => {
  // React Native's own record of the keys outlives a test: it is told they went.
  await say('keyboardDidHide');
  keyboard.set(0);
  keyboardState.set(KeyboardState.UNKNOWN);
  animationClock.reset();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const frames = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

/** What Reanimated reports, as its keyboard listener sets both at once. */
const report = (state: KeyboardState, height: number) =>
  act(() => {
    keyboardState.set(state);
    keyboard.set(height);
  });

/** React Native's keyboard events, from the screen's own insets. */
const say = (event: 'keyboardDidShow' | 'keyboardDidHide') =>
  act(() => {
    DeviceEventEmitter.emit(event, {
      endCoordinates: { height: event === 'keyboardDidShow' ? 312 : 0, screenY: 600 },
    });
  });

async function keys(floor = 0) {
  const view = await renderHook(() => useEasedKeys(floor));
  return view.result.current;
}

/** A keyboard rising as an animating one does: 22 points a frame, then open. */
async function rise(to = 336) {
  for (let height = 0; height < to; height += 22) await report(KeyboardState.OPENING, height);
  await report(KeyboardState.OPEN, to);
}

describe('the keys as the session sees them', () => {
  it('follow a keyboard seen moving, one to one, with no lag of their own', async () => {
    const eased = await keys();
    for (let height = 22; height <= 330; height += 22) {
      await report(KeyboardState.OPENING, height);
      expect(eased.get()).toBe(height);
    }
    await report(KeyboardState.OPEN, 336);
    expect(eased.get()).toBe(336);
    for (let height = 314; height >= 0; height -= 22) {
      await report(KeyboardState.CLOSING, height);
      expect(eased.get()).toBe(height);
    }
    await report(KeyboardState.CLOSED, 0);
    expect(eased.get()).toBe(0);
  });

  it('keep up with a late frame of a keyboard seen moving: the keys are drawn there, and so is the page', async () => {
    // The walk (v11): the page eased behind a keyboard whose frames came late, and the row rode the
    // keys over it for five frames.
    const eased = await keys();
    await report(KeyboardState.OPENING, 0);
    await report(KeyboardState.OPENING, KEYS_JUMP * 3);
    expect(eased.get()).toBe(KEYS_JUMP * 3);
    await report(KeyboardState.OPEN, 336);
    expect(eased.get()).toBe(336);
    await report(KeyboardState.CLOSING, 100);
    expect(eased.get()).toBe(100);
  });

  it('follow keys that come up without being seen to move at once: nothing is left under them', async () => {
    const eased = await keys();
    await rise();
    // The keyboard grows a row of suggestions, and says so only as its new height.
    await report(KeyboardState.OPEN, 336 + KEYS_JUMP * 2);
    expect(eased.get()).toBe(336 + KEYS_JUMP * 2);
  });

  it('follow keys that are gone in one jump over an ease: there is nothing left for them to cover', async () => {
    const eased = await keys();
    await rise();
    await report(KeyboardState.CLOSED, 0);
    expect(eased.get()).toBeGreaterThan(300);
    await frames(KEYS_EASE_MS / 2);
    expect(eased.get()).toBeGreaterThan(0);
    expect(eased.get()).toBeLessThan(336);
    await frames(KEYS_EASE_MS);
    expect(eased.get()).toBe(0);
  });

  it('are never lower than the harness’s stand-in keyboard, which is only there to look at', async () => {
    const eased = await keys(300);
    expect(eased.get()).toBe(300);
    await report(KeyboardState.OPENING, 100);
    await report(KeyboardState.OPEN, 100);
    await frames(KEYS_EASE_MS + 100);
    expect(eased.get()).toBe(300);
  });
});

// The walk (v11), the high book: a session was left through "Keep your draft?", raised with the keys
// up. The keys vanished under its sheet, and Reanimated, which hears of the keyboard only from the
// animations of the page's own window, never saw them go: it held them open at 336 points. The next
// session subscribed and was told at once that a keyboard was open (state 0, then 2, with no 1 before
// it), and its book rose to the keys' place with no keys on the screen.
describe('a keyboard the session has not seen', () => {
  it('is not believed when it is held open from before the session began', async () => {
    const eased = await keys();
    await report(KeyboardState.OPEN, 336);
    await frames(KEYS_EASE_MS + 100);
    expect(eased.get()).toBe(0);
  });

  it('gives way to a real keyboard, which is followed from its first frame', async () => {
    const eased = await keys();
    await report(KeyboardState.OPEN, 336);
    // Reanimated, still holding the old keyboard, calls the next one's opening a closing.
    await report(KeyboardState.CLOSING, 40);
    expect(eased.get()).toBe(40);
    await report(KeyboardState.CLOSING, 200);
    expect(eased.get()).toBe(200);
    await report(KeyboardState.OPEN, 336);
    expect(eased.get()).toBe(336);
  });

  it('is believed when React Native says the keys are up as the session opens', async () => {
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    await report(KeyboardState.OPEN, 336);
    const eased = await keys();
    expect(eased.get()).toBe(336);
  });

  it('is believed once React Native says the keys have come up', async () => {
    const eased = await keys();
    await report(KeyboardState.OPEN, 336);
    expect(eased.get()).toBe(0);
    await say('keyboardDidShow');
    expect(eased.get()).toBe(336);
  });
});

// The same keyboard, gone under a sheet while the session that raised it is still open: after Stay,
// the page and its row must not stay up for keys that have gone.
describe('keys that go under a sheet', () => {
  it('are let go of once React Native has seen them go and Reanimated has not, and the page eases down', async () => {
    const eased = await keys();
    await rise();
    await say('keyboardDidHide');
    // A moment's grace: a keyboard really going is seen moving within a frame or two.
    await frames(KEYS_STALE_MS - 50);
    expect(eased.get()).toBe(336);
    await frames(50);
    expect(eased.get()).toBeGreaterThan(KEYS_JUMP);
    await frames(KEYS_EASE_MS + 100);
    expect(eased.get()).toBe(0);
  });

  it('do not cut short a keyboard that is really going: it is followed to the end', async () => {
    const eased = await keys();
    await rise();
    // React Native can say the keys have gone as they begin to go.
    await say('keyboardDidHide');
    for (let height = 314; height >= 0; height -= 22) {
      await report(KeyboardState.CLOSING, height);
      expect(eased.get()).toBe(height);
    }
    await report(KeyboardState.CLOSED, 0);
    await frames(KEYS_STALE_MS + KEYS_EASE_MS);
    expect(eased.get()).toBe(0);
  });

  it('are believed again when the keys come back before the grace is out', async () => {
    const eased = await keys();
    await rise();
    await say('keyboardDidHide');
    await frames(KEYS_STALE_MS / 2);
    await say('keyboardDidShow');
    await frames(KEYS_STALE_MS + KEYS_EASE_MS);
    expect(eased.get()).toBe(336);
  });
});
