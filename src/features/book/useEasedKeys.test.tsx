// The book follows the keys it makes room for. Where the keys move a long way between one frame and the
// next (a keyboard that goes without animating its way down, or a frame that came late), the book
// follows over a short ease rather than jumping with them; where they move a little at a time, as a
// keyboard that animates does, it follows them one to one. The stand-in walks the ease a frame at a time.
import { act, renderHook } from '@testing-library/react-native';
import { useSharedValue } from 'react-native-reanimated';

import { animationClock } from '@/testing/reanimatedMock';

import { KEYS_EASE_MS, KEYS_JUMP, useEasedKeys } from './useEasedKeys';

jest.mock(
  'react-native-reanimated',
  () => jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
);

beforeEach(() => {
  animationClock.reset();
  animationClock.stepped = true;
  jest.useFakeTimers();
});
afterEach(() => {
  animationClock.reset();
  jest.useRealTimers();
});

const frames = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function keys(floor = 0) {
  const view = await renderHook(() => {
    const raw = useSharedValue(0);
    return { raw, eased: useEasedKeys(raw, floor) };
  });
  const { raw, eased } = view.result.current;
  const move = (to: number) => act(() => raw.set(to));
  return { raw, eased, move };
}

describe('the keys as the book sees them', () => {
  it('follow a keyboard that animates, one to one, with no lag of their own', async () => {
    const { eased, move } = await keys();
    // 22 points a frame: a keyboard that animates up in a quarter of a second at 60 frames.
    for (let height = 22; height <= 330; height += 22) {
      await move(height);
      expect(eased.get()).toBe(height);
    }
    for (let height = 308; height >= 0; height -= 22) {
      await move(height);
      expect(eased.get()).toBe(height);
    }
  });

  it('do not jump with a keyboard that goes in one frame: the book follows over an ease', async () => {
    const { eased, move } = await keys();
    await move(336);
    await frames(KEYS_EASE_MS + 100);
    expect(eased.get()).toBe(336);
    // The keys go in a single frame, and the book is where it was.
    await move(0);
    expect(eased.get()).toBeGreaterThan(300);
    await frames(KEYS_EASE_MS / 2);
    expect(eased.get()).toBeGreaterThan(0);
    expect(eased.get()).toBeLessThan(336);
    await frames(KEYS_EASE_MS);
    expect(eased.get()).toBe(0);
  });

  it('come up over an ease too, when the keyboard is already there', async () => {
    const { eased, move } = await keys();
    await move(336);
    expect(eased.get()).toBeLessThan(KEYS_JUMP + 1);
    await frames(KEYS_EASE_MS + 100);
    expect(eased.get()).toBe(336);
  });

  it('take a late frame as the jump it is: a quarter of the keyboard at once is eased', async () => {
    const { eased, move } = await keys();
    await move(KEYS_JUMP + 20);
    expect(eased.get()).toBeLessThan(KEYS_JUMP + 20);
    await frames(KEYS_EASE_MS + 100);
    expect(eased.get()).toBe(KEYS_JUMP + 20);
  });

  it('are never lower than the harness’s stand-in keyboard, which is only there to look at', async () => {
    const { eased, move } = await keys(300);
    expect(eased.get()).toBe(300);
    await move(100);
    await frames(KEYS_EASE_MS + 100);
    expect(eased.get()).toBe(300);
  });
});
