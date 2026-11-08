import { act, fireEvent, screen } from '@testing-library/react-native';
import { AppState, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { cue } from '@/design/haptics';
import { fingerAway, fingerDown } from '@/testing/pressed';
import { render } from '@/testing/render';

import { PracticeView } from './PracticeView';
import { compile } from './timeline';
import type { Practice } from './types';

const mockAudio = {
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn(() => {
    throw new Error('no audio under test');
  }),
};
let mockReduced = false;

jest.mock('@/services/nativeModules', () => ({ loadAudio: () => mockAudio }));
jest.mock('@/design/haptics');
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));

const base = {
  feeling: 'Testing',
  name: 'Test',
  line: 'Made up.',
  why: 'Made up.',
  source: 'None',
};
/** Breaths of 3 in and 5 out: a round is 8 s, and no phase turns at 30 s. */
const BREATH = { kind: 'paced', inhale: 3, exhale: 5 } as const;

const plain: Practice = {
  ...base,
  id: 'plain',
  minutes: 2,
  free: true,
  steps: [{ kind: 'breath', pattern: BREATH, seconds: 120 }],
};
const minute: Practice = {
  ...base,
  id: 'minute',
  minutes: 1,
  free: true,
  steps: [{ kind: 'breath', pattern: { kind: 'paced', inhale: 4, exhale: 6 }, seconds: 60 }],
};
/** Counted breaths, then the screen goes to black over a minute, and the breaths go on in the dark. */
const goesDark: Practice = {
  ...base,
  id: 'goes-dark',
  minutes: 3,
  free: false,
  steps: [
    { kind: 'breath', pattern: { kind: 'paced', inhale: 4, exhale: 6 }, seconds: 50 },
    { kind: 'fade', seconds: 60 },
    { kind: 'breath', pattern: { kind: 'paced', inhale: 4, exhale: 6 }, seconds: 60 },
  ],
};
/** A line after the dark has begun, which with the voice off is shown as text. */
const goesDarkWithLine: Practice = {
  ...goesDark,
  id: 'goes-dark-line',
  steps: [
    { kind: 'breath', pattern: { kind: 'paced', inhale: 4, exhale: 6 }, seconds: 50 },
    { kind: 'fade', seconds: 60 },
    { kind: 'voice', line: 'made-up.line', text: 'A made-up line for the dark.' },
    { kind: 'breath', pattern: { kind: 'paced', inhale: 4, exhale: 6 }, seconds: 60 },
  ],
};
/** The same, in the light: a shown line lifts the dark so it can be read. */
const lineInLight: Practice = {
  ...base,
  id: 'line-in-light',
  minutes: 2,
  free: true,
  steps: [
    { kind: 'breath', pattern: BREATH, seconds: 40 },
    { kind: 'voice', line: 'made-up.line', text: 'A made-up line for the light.' },
    { kind: 'breath', pattern: BREATH, seconds: 60 },
  ],
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockReduced = false;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: () => undefined }) as never);
});

const advance = async (ms: number, step = 500) => {
  for (let at = 0; at < ms; at += step) await act(async () => void jest.advanceTimersByTime(step));
};

type Options = { first?: boolean; voice?: boolean; eased?: boolean; tapToEnd?: boolean };
function run(practice: Practice, onEnd = jest.fn(), options: Options = {}) {
  return render(
    <PracticeView
      timeline={compile(practice)}
      pace={5.5}
      sound={false}
      voice={options.voice ?? false}
      first={options.first ?? false}
      eased={options.eased}
      tapToEnd={options.tapToEnd}
      onEnd={onEnd}
    />,
  );
}

const opacity = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style).opacity as number;
const veil = () => opacity('breath-veil');
const layer = () => opacity('practice-layer');
/**
 * Holds the fade of this length at its start, as it is on the first frame: the mock otherwise runs
 * every animation to its end at once.
 */
const heldAtStart = (duration: number) =>
  jest
    .spyOn(Reanimated, 'withTiming')
    .mockImplementation(((to: number, options: { duration: number }) =>
      options.duration === duration ? 0 : to) as never);
const timings = (spy: jest.SpyInstance) =>
  spy.mock.calls.map(([to, options]) => ({
    to: to as number,
    duration: (options as { duration: number }).duration,
  }));

describe('the light goes down with the breath', () => {
  it('draws the dark as three bands, the sky band keeping the veil’s name', async () => {
    await run(plain);
    expect(screen.getByTestId('breath-veil')).toBeTruthy();
    expect(screen.getByTestId('breath-veil-valley')).toBeTruthy();
    expect(screen.getByTestId('breath-veil-ground')).toBeTruthy();
  });

  it('under Reduce Motion draws one plain veil, and no bands', async () => {
    mockReduced = true;
    await run(plain);
    expect(screen.getAllByTestId(/^breath-veil/)).toHaveLength(1);
    await advance(31_000);
    expect(veil()).toBeCloseTo(0.9, 6);
  });

  it('comes down over 3 s, and lifts in 600 ms on a touch', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await run(plain);
    await advance(31_000);
    expect(timings(spy)).toContainEqual({ to: 0.9, duration: 3000 });
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    expect(timings(spy)).toContainEqual({ to: 0, duration: 600 });
  });

  it('gives the person a tick when they wake the screen, and none when it was awake already', async () => {
    await run(plain);
    await advance(5000);
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    expect(jest.mocked(cue).mock.calls.filter(([name]) => name === 'tick')).toHaveLength(0);
    await advance(31_000);
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    expect(jest.mocked(cue).mock.calls.filter(([name]) => name === 'tick')).toHaveLength(1);
  });

  it('under Reduce Motion, every fade is 180 ms at most, and the dark is a plain fade', async () => {
    mockReduced = true;
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await run(plain, jest.fn(), { first: true });
    await advance(31_000);
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    await advance(2000);
    const longest = Math.max(...timings(spy).map((timing) => timing.duration));
    expect(longest).toBeLessThanOrEqual(180);
  });

  it('keeps its lengths when motion is not reduced: the word in over 520 ms, End 700 in and 300 out', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await run(plain);
    await advance(31_000);
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    const durations = timings(spy).map((timing) => timing.duration);
    expect(durations).toEqual(expect.arrayContaining([520, 700, 300]));
  });
});

describe('the word goes with the dark', () => {
  const word = () => screen.queryByText(/^(In|Out)$/);

  it('is still there 300 ms after the dark begins to come down, and gone by 400', async () => {
    await run(plain);
    await advance(29_900, 100);
    expect(word()).toBeTruthy();
    await advance(100, 100);
    // The dark has begun (30 s). The word fades over 360 ms rather than vanishing in one frame.
    await advance(300, 100);
    expect(word()).toBeTruthy();
    await advance(100, 100);
    expect(word()).toBeNull();
  });

  it('under Reduce Motion fades over 180 ms and is gone by 250', async () => {
    mockReduced = true;
    await run(plain);
    await advance(30_000, 100);
    await advance(100, 100);
    expect(word()).toBeTruthy();
    await advance(150, 50);
    expect(word()).toBeNull();
  });

  it('lets the old word go before the next comes in, so a turn is never two words at once', async () => {
    await run(plain);
    // 3 s of breathing in: at 3 s the word turns from Breathe in to Breathe out.
    await advance(2900, 100);
    expect(screen.queryByText('Breathe in')).toBeTruthy();
    await advance(200, 100);
    expect(screen.queryByText('Breathe in')).toBeTruthy();
    expect(screen.queryByText('Breathe out')).toBeNull();
    await advance(300, 100);
    expect(screen.queryByText('Breathe in')).toBeNull();
    expect(screen.queryByText('Breathe out')).toBeTruthy();
  });

  it('fades the first practice’s safety line out over 320 ms with the word, rather than cutting it', async () => {
    await run(plain, jest.fn(), { first: true });
    await advance(1000);
    expect(screen.queryByText(/If you feel dizzy or unwell/)).toBeTruthy();
    await advance(29_000, 100);
    await advance(200, 100);
    expect(screen.queryByText(/If you feel dizzy or unwell/)).toBeTruthy();
    await advance(300, 100);
    expect(screen.queryByText(/If you feel dizzy or unwell/)).toBeNull();
  });
});

describe('a line shown as text', () => {
  const caption = (text: string) => screen.queryByText(new RegExp(text));

  it('fades out over 320 ms after its nine seconds, rather than cutting', async () => {
    await run(lineInLight);
    const text = 'made-up line for the light';
    // The line falls at the first breath out of the second stretch.
    let shownAt = 0;
    for (let at = 0; at < 60_000 && shownAt === 0; at += 100) {
      await advance(100, 100);
      if (caption(text)) shownAt = at + 100;
    }
    expect(shownAt).toBeGreaterThan(0);
    // Nine seconds on screen, still there as it begins to go, and gone once its fade is done.
    await advance(8900, 100);
    expect(caption(text)).toBeTruthy();
    await advance(300, 100);
    expect(caption(text)).toBeTruthy();
    await advance(300, 100);
    expect(caption(text)).toBeNull();
  });

  it('lifts the dark so it can be read, in a practice that is not going to sleep', async () => {
    await run(lineInLight);
    await advance(35_000);
    expect(veil()).toBeCloseTo(0.9, 6);
    // The line is up from 43 s to 52 s, and the screen is drawn again at the breath in at 48 s.
    await advance(14_000);
    expect(caption('made-up line for the light')).toBeTruthy();
    expect(veil()).toBe(0);
  });

  it('is read over the dark in Sleep, and never lights the screen', async () => {
    await run(goesDarkWithLine);
    await advance(40_000);
    expect(veil()).toBeCloseTo(0.9, 6);
    // The line falls with the fade, at the next breath out after 50 s.
    let seen = false;
    for (let at = 0; at < 30_000; at += 500) {
      await advance(500);
      if (caption('made-up line for the dark')) seen = true;
      expect(veil()).toBeGreaterThanOrEqual(0.9 - 1e-9);
    }
    expect(seen).toBe(true);
  });
});

describe('Sleep goes to black', () => {
  it('begins its fade at the cue, wherever the person has touched, and ends in true black', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    const onEnd = jest.fn();
    await run(goesDark, onEnd);
    await advance(40_000);
    expect(veil()).toBeCloseTo(0.9, 6);
    // Crossing the cue, and a later phase change that renders the screen again.
    await advance(20_000);
    expect(veil()).toBeCloseTo(1, 6);
    expect(timings(spy)).toContainEqual({ to: 1, duration: 60_000 });
    // It stays dark to the end of the practice, and waits to be touched.
    await advance(130_000, 1000);
    expect(onEnd).not.toHaveBeenCalled();
    expect(veil()).toBeCloseTo(1, 6);
  });

  it('puts every band at full black, and takes the tide line out, at the end', async () => {
    await run(goesDark);
    await advance(75_000);
    for (const id of ['breath-veil', 'breath-veil-valley', 'breath-veil-ground']) {
      expect(opacity(id)).toBeCloseTo(1, 6);
    }
    expect(opacity('breath-tide')).toBeCloseTo(0, 6);
  });

  it('keeps its minute-long fade under Reduce Motion: it is the practice’s own content', async () => {
    mockReduced = true;
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await run(goesDark);
    await advance(70_000);
    expect(timings(spy)).toContainEqual({ to: 1, duration: 60_000 });
    expect(veil()).toBeCloseTo(1, 6);
  });
});

describe('Begin into the practice, and the practice into what follows', () => {
  it('comes up over the bare plate: nothing of it is there on the first frame, and all of it after 900 ms', async () => {
    const held = heldAtStart(900);
    await run(plain, jest.fn(), { eased: true });
    expect(layer()).toBe(0);
    expect(timings(held)).toContainEqual({ to: 1, duration: 900 });
    held.mockRestore();
    await run(plain, jest.fn(), { eased: true });
    await advance(1000);
    expect(layer()).toBe(1);
  });

  it('comes up over 180 ms under Reduce Motion', async () => {
    mockReduced = true;
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await run(plain, jest.fn(), { eased: true });
    expect(timings(spy)).toContainEqual({ to: 1, duration: 180 });
  });

  it('lifts away over 900 ms before it hands on when it finishes, so the check does not meet a cut', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    const onEnd = jest.fn();
    await run(minute, onEnd, { eased: true });
    await advance(59_000, 1000);
    expect(onEnd).not.toHaveBeenCalled();
    let liftedAt: number | null = null;
    let calledAt: number | null = null;
    for (let i = 0; i < 40 && calledAt === null; i += 1) {
      await advance(100, 100);
      if (liftedAt === null && layer() === 0) liftedAt = Date.now();
      if (onEnd.mock.calls.length > 0) calledAt = Date.now();
    }
    expect(liftedAt).not.toBeNull();
    expect(calledAt).not.toBeNull();
    expect((calledAt ?? 0) - (liftedAt ?? 0)).toBeGreaterThanOrEqual(800);
    expect((calledAt ?? 0) - (liftedAt ?? 0)).toBeLessThanOrEqual(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith({ finished: true, rounds: 6, dark: expect.any(Number) });
    expect(timings(spy)).toContainEqual({ to: 0, duration: 900 });
  });

  it('lifts away when End is pressed, hands on once even if it is pressed twice, and takes no touch while it goes', async () => {
    const onEnd = jest.fn();
    await run(plain, onEnd, { eased: true });
    await advance(10_000);
    await fireEvent.press(screen.getByTestId('practice-end', { includeHiddenElements: true }));
    await fireEvent.press(screen.getByTestId('practice-end', { includeHiddenElements: true }));
    expect(layer()).toBe(0);
    expect(screen.getByTestId('practice-layer').props.pointerEvents).toBe('none');
    await advance(800, 100);
    expect(onEnd).not.toHaveBeenCalled();
    await advance(200, 100);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ finished: false }));
  });

  it('lifts in 180 ms under Reduce Motion', async () => {
    mockReduced = true;
    const onEnd = jest.fn();
    await run(plain, onEnd, { eased: true });
    await advance(5000);
    await fireEvent.press(screen.getByTestId('practice-end', { includeHiddenElements: true }));
    await advance(100, 100);
    expect(onEnd).not.toHaveBeenCalled();
    await advance(100, 100);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('never hands on if it goes away while it lifts', async () => {
    const onEnd = jest.fn();
    const view = await run(plain, onEnd, { eased: true });
    await advance(5000);
    await fireEvent.press(screen.getByTestId('practice-end', { includeHiddenElements: true }));
    await view.unmount();
    await advance(2000);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('lifts from Sleep’s black over the same 900 ms after the tap', async () => {
    const onEnd = jest.fn();
    await run(goesDark, onEnd, { eased: true });
    await advance(190_000, 1000);
    expect(onEnd).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    expect(layer()).toBe(0);
    await advance(900, 100);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('comes up over 650 ms for Arrive, which hands on at once: its dark is lifted over the book', async () => {
    const held = heldAtStart(650);
    const onEnd = jest.fn();
    await run(plain, onEnd, { tapToEnd: true });
    expect(layer()).toBe(0);
    expect(timings(held)).toContainEqual({ to: 1, duration: 650 });
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('the ground shade goes as slowly as the dark comes', () => {
  it('leaves over 3 s, not 600 ms, so the lower half never brightens on Day', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await run(plain);
    await advance(31_000);
    expect(timings(spy)).toContainEqual({ to: 0, duration: 3000 });
  });
});

describe('End and the quiet controls', () => {
  const end = () => screen.getByTestId('practice-end', { includeHiddenElements: true });
  const endOpacity = () => StyleSheet.flatten(end().props.style).opacity;

  it('dims on a press, like every other quiet word, and comes back when the finger lifts', async () => {
    await run(plain);
    expect(endOpacity()).toBe(1);
    await fingerDown(end());
    expect(endOpacity()).toBe(0.6);
    await fingerAway(end(), () => advance(200, 100));
    expect(endOpacity()).toBe(1);
  });
});
