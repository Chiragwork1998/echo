// The book as it is drawn at a moment. The stand-in for Reanimated reads a shared value only when the
// screen is drawn, and resolves every animation to its end at once, so these prove which layers are
// there and which branch of the motion is chosen, never the curves. The curves are pure functions
// (./standing.test) and are judged by eye, frame by frame.
//
// What the opening does when the animation is behind the clock is proved with the stand-in's own
// clock (src/testing/reanimatedMock): `lag` is a UI thread that finishes every animation late, and
// `stepped` walks the cover to where it is going, so that what follows its progress can be seen.
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { ComponentProps, ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { makeMutable } from 'react-native-reanimated';

import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { BookStage } from './BookStage';
import type { ClosingState } from './useBookClosing';
import { netAfterBegin } from './animationEnd';
import { ANIMATION_NET_MS, FULL, HURRY_MS, SHORT, UI_HANG_MS } from './ritual';
import { VOLUMES } from './volumes';

jest.mock('@/design/haptics');
jest.mock(
  'react-native-reanimated',
  () => jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
);
let mockReduced = false;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));

type Props = Partial<ComponentProps<typeof BookStage>>;

const book = (props: Props = {}): ReactElement => (
  <BookStage
    entrance="rise"
    start={false}
    riseFrom={600}
    ritual={FULL}
    hurry={false}
    volume={VOLUMES[0]!}
    surface="vellum"
    width={355}
    height={416}
    {...props}
  >
    {() => null}
  </BookStage>
);

const drawn = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true });
const style = () =>
  StyleSheet.flatten(screen.getByTestId('book-stage', { includeHiddenElements: true }).props.style);
const leaves = () => screen.queryAllByTestId(/^book-leaf-\d$/, { includeHiddenElements: true });
// The stand-in reads a shared value only when the screen is drawn, and the animation is begun by an
// effect after a draw: so a change shows at the second draw.
const redraw = async (props: Props) => {
  await screen.rerender(<ThemeProvider crossfade={false}>{book(props)}</ThemeProvider>);
  await screen.rerender(<ThemeProvider crossfade={false}>{book(props)}</ThemeProvider>);
};
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  mockReduced = false;
  animationClock.reset();
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => {
  animationClock.reset();
  jest.useRealTimers();
});

// Where a book that does not travel rests. Reduce Motion says it outright instead of saying nothing: a
// style that stops saying `transform` leaves the last one it said on the native view, and a book that
// had begun below the screen would go on resting there (see 'a Reduce Motion switched on while ...').
const AT_REST = [{ translateY: 0 }, { scale: 1 }];

describe('the book under Reduce Motion', () => {
  beforeEach(() => {
    mockReduced = true;
  });

  it.each(['rise', 'forward'] as const)(
    'is only ever a fade where it rests when it %ss in: nothing travels and nothing scales',
    async (entrance) => {
      await render(book({ entrance, riseFrom: 600 }));
      expect(style().opacity).toBe(0);
      expect(style().transform).toEqual(AT_REST);
      await redraw({ entrance, riseFrom: 600, start: true });
      expect(style().opacity).toBe(1);
      expect(style().transform).toEqual(AT_REST);
    },
  );

  it('mounts no hinge, no leaves and no light, however many echoes the book holds', async () => {
    await render(book({ start: true, echoes: 40 }));
    expect(drawn('book-hinge')).toBeNull();
    expect(leaves()).toHaveLength(0);
    expect(drawn('book-cover-shadow')).toBeNull();
    expect(drawn('book-page-sheen')).toBeNull();
  });

  it('keeps the ribbon, hanging at its full length, and makes no sound of its own', async () => {
    await render(book({ start: true }));
    expect(drawn('book-ribbon')).toBeTruthy();
    await tick(FULL.rise + FULL.cover + 100);
    expect(cue).not.toHaveBeenCalled();
  });
});

describe('the book arriving', () => {
  it('rises from below the screen with the lower edge of the page, and is not there until it does', async () => {
    await render(book());
    expect(style().opacity).toBe(0);
    expect(style().transform).toEqual([{ translateY: 600 }]);
    await redraw({ start: true });
    expect(style().transform).toEqual([{ translateY: 0 }]);
    expect(style().opacity).toBe(1);
  });

  it('comes forward from the shelf a little below its place and a little smaller, and settles', async () => {
    await render(book({ entrance: 'forward' }));
    expect(style().opacity).toBe(0);
    const [lift, grow] = style().transform as [{ translateY: number }, { scale: number }];
    expect(lift.translateY).toBeGreaterThan(0);
    expect(lift.translateY).toBeLessThan(40);
    expect(grow.scale).toBeGreaterThan(0.8);
    expect(grow.scale).toBeLessThan(1);
    await redraw({ entrance: 'forward', start: true });
    expect(style().opacity).toBe(1);
    expect(style().transform).toEqual([{ translateY: 0 }, { scale: 1 }]);
  });

  it('puts a contact shadow under First Echo’s book as it lands, and not under the daily one', async () => {
    await render(book({ entrance: 'forward', surface: 'paper' }));
    expect(drawn('book-contact-shadow')).toBeTruthy();
    await redraw({ entrance: 'rise' });
    expect(drawn('book-contact-shadow')).toBeNull();
  });
});

describe('the cover as an object', () => {
  it('has a board with a shadow, a sheen on the page and a hinge once the book has arrived', async () => {
    await render(book({ start: true }));
    expect(drawn('book-hinge')).toBeTruthy();
    expect(drawn('book-lining')).toBeTruthy();
    expect(drawn('book-cover-shadow')).toBeTruthy();
    expect(drawn('book-page-sheen')).toBeTruthy();
  });

  it('is gone, with its shadow, its sheen and its leaves, once the book is open', async () => {
    const onOpened = jest.fn();
    await render(book({ start: true, echoes: 9, onOpened }));
    expect(leaves().length).toBeGreaterThan(0);
    await tick(FULL.rise + FULL.cover + 50);
    expect(onOpened).toHaveBeenCalledTimes(1);
    await redraw({ start: true, echoes: 9, onOpened });
    expect(drawn('book-hinge')).toBeNull();
    expect(drawn('book-cover-shadow')).toBeNull();
    expect(drawn('book-page-sheen')).toBeNull();
    expect(leaves()).toHaveLength(0);
    // The ribbon stays: it is the book's.
    expect(drawn('book-ribbon')).toBeTruthy();
  });

  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [5, 3],
    [500, 3],
  ])('lets a book with %i echoes riffle %i leaves', async (echoes, count) => {
    await render(book({ start: true, echoes }));
    expect(leaves()).toHaveLength(count);
  });

  it('does not riffle while the book waits unseen', async () => {
    await render(book({ start: false, echoes: 9 }));
    expect(leaves()).toHaveLength(0);
  });

  describe('as the cover is walked', () => {
    beforeEach(() => {
      animationClock.stepped = true;
    });

    it('keeps the count of leaves it had when the cover began to swing', async () => {
      await render(book({ start: true, echoes: 1 }));
      expect(leaves()).toHaveLength(1);
      await tick(FULL.rise + 50);
      // The count arrives late, while the cover is swinging: the leaves already turning stay as they are.
      await redraw({ start: true, echoes: 9 });
      expect(leaves()).toHaveLength(1);
    });

    it('takes the count as it is until the cover begins to swing', async () => {
      await render(book({ start: true, echoes: 1 }));
      await redraw({ start: true, echoes: 9 });
      expect(leaves()).toHaveLength(3);
    });

    it('takes it when the cover begins to move, however late that is', async () => {
      animationClock.lag = 800;
      await render(book({ start: true, echoes: 1 }));
      // The clock says the swing has begun; the cover has not moved: the count is still free.
      await tick(FULL.rise + 400);
      await redraw({ start: true, echoes: 9 });
      expect(leaves()).toHaveLength(3);
      await tick(600);
      await redraw({ start: true, echoes: 1 });
      expect(leaves()).toHaveLength(3);
    });
  });

  it('draws the board and its leaves without a texture of their own', async () => {
    await render(book({ start: true, echoes: 9 }));
    expect(drawn('book-hinge')?.props.renderToHardwareTextureAndroid).toBeUndefined();
    for (const leaf of leaves()) expect(leaf.props.renderToHardwareTextureAndroid).toBeUndefined();
  });
});

describe('the unseating of the cover', () => {
  // Felt where the cover itself first leaves the page, read from the cover and not from the clock:
  // the stand-in walks it there, a frame at a time.
  beforeEach(() => {
    animationClock.stepped = true;
  });

  it('is felt once, as a tick, where the board first leaves the page and not before', async () => {
    await render(book({ start: true }));
    await tick(FULL.rise - 1);
    expect(cue).not.toHaveBeenCalled();
    await tick(40);
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('tick');
    await tick(FULL.cover + 100);
    expect(cue).toHaveBeenCalledTimes(1);
  });

  it('follows the ritual: First Echo\u2019s swing starts after its own, shorter, arrival', async () => {
    await render(book({ start: true, entrance: 'forward', ritual: SHORT }));
    await tick(SHORT.forward - 1);
    expect(cue).not.toHaveBeenCalled();
    await tick(40);
    expect(cue).toHaveBeenCalledWith('tick');
  });

  it('is as late as the cover is: a UI thread that is behind the clock is not felt before it moves', async () => {
    animationClock.lag = 600;
    await render(book({ start: true }));
    await tick(FULL.rise + 500);
    expect(cue).not.toHaveBeenCalled();
    await tick(200);
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('tick');
  });

  it('is not felt when a tap says enough, because there is no unseating to feel', async () => {
    await render(book({ start: true }));
    await tick(300);
    await redraw({ start: true, hurry: true });
    await tick(FULL.rise + FULL.cover);
    expect(cue).not.toHaveBeenCalled();
  });

  it('is not felt for a book that was told to hurry from the start', async () => {
    await render(book({ start: true, hurry: true }));
    await tick(FULL.rise + FULL.cover);
    expect(cue).not.toHaveBeenCalled();
  });
});

describe('the opening, when the page goes without its entry being kept', () => {
  // Back while the book opens: the page fades out by its own animation (../journal-session), and `going` is
  // that fade. From its first frame the opening stops where it is. The walk (v11, S4) felt the unseating tick
  // 120 ms into the fade, the swing going on beneath it with nothing seen to lift.
  beforeEach(() => {
    animationClock.stepped = true;
  });
  const angle = () => {
    const hinge = drawn('book-hinge');
    const turn = StyleSheet.flatten(hinge!.props.style).transform as { rotateY?: string }[];
    return turn.find((part) => part.rotateY !== undefined)?.rotateY;
  };

  it('is not felt once the page has begun to go: no unseating tick outlives the opening', async () => {
    const going = makeMutable(0);
    await render(book({ start: true, going }));
    // All but risen, and the board about to swing: it has not yet left the page (S4 was 0.11 s after the rise).
    await tick(FULL.rise - 20);
    expect(cue).not.toHaveBeenCalled();
    // The page's fade draws its first frame.
    await act(async () => going.set(0.05));
    await tick(FULL.cover + 500);
    expect(cue).not.toHaveBeenCalled();
  });

  it('stops the cover where it is, and does not tell the page it has opened', async () => {
    const going = makeMutable(0);
    const onOpened = jest.fn();
    await render(book({ start: true, going, onOpened }));
    await tick(FULL.rise + FULL.cover / 2);
    await act(async () => going.set(0.05));
    await redraw({ start: true, going, onOpened });
    const stopped = angle();
    await tick(FULL.cover + 2000);
    await redraw({ start: true, going, onOpened });
    expect(angle()).toBe(stopped);
    expect(onOpened).not.toHaveBeenCalled();
  });

  it('does not begin to open on a page that has already begun to go', async () => {
    const going = makeMutable(0.3);
    await render(book({ start: false, going }));
    await redraw({ start: true, going });
    await tick(FULL.rise + FULL.cover + 200);
    await redraw({ start: true, going });
    expect(cue).not.toHaveBeenCalled();
    expect(style().opacity).toBe(0);
  });

  it('still opens, and is felt, on a page that stays', async () => {
    const going = makeMutable(0);
    const onOpened = jest.fn();
    await render(book({ start: true, going, onOpened }));
    await tick(FULL.rise + FULL.cover + 100);
    expect(cue).toHaveBeenCalledWith('tick');
    expect(onOpened).toHaveBeenCalledTimes(1);
  });
});

describe('the opening ends when the cover has swung, not when the clock says so', () => {
  const total = FULL.rise + FULL.cover;
  const layers = ['book-hinge', 'book-lining', 'book-cover-shadow', 'book-page-sheen'];

  it('keeps the hinge, its lining, its shadow, the sheen and the leaves until the cover has finished', async () => {
    // A UI thread that is 900 ms behind: the clock says the ritual is over, and the cover is still swinging.
    animationClock.lag = 900;
    const onOpened = jest.fn();
    await render(book({ start: true, echoes: 9, onOpened }));
    await tick(total + 600);
    await redraw({ start: true, echoes: 9, onOpened });
    expect(onOpened).not.toHaveBeenCalled();
    for (const id of layers) expect(drawn(id)).toBeTruthy();
    expect(leaves().length).toBeGreaterThan(0);
    // The cover lands, and only then is it taken away.
    await tick(400);
    await redraw({ start: true, echoes: 9, onOpened });
    expect(onOpened).toHaveBeenCalledTimes(1);
    for (const id of layers) expect(drawn(id)).toBeNull();
    expect(leaves()).toHaveLength(0);
  });

  it('is told of it once, and not before the page has been uncovered', async () => {
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    await tick(total - 1);
    expect(onOpened).not.toHaveBeenCalled();
    await tick(20);
    expect(onOpened).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('opens by itself only when the UI thread has stopped answering altogether: a very long time after it', async () => {
    // The UI thread never begins what it was asked: no clock the opening can hold may stand in for that
    // until it is plain that nothing is coming.
    animationClock.lag = 1_000_000;
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    await tick(total + 1500 + ANIMATION_NET_MS + 100);
    expect(onOpened).not.toHaveBeenCalled();
    expect(drawn('book-hinge')).toBeTruthy();
    await tick(UI_HANG_MS - 1500 - ANIMATION_NET_MS - 101);
    expect(onOpened).not.toHaveBeenCalled();
    await tick(2);
    expect(onOpened).toHaveBeenCalledTimes(1);
    await redraw({ start: true, onOpened });
    expect(drawn('book-hinge')).toBeNull();
  });

  it('keeps the cover while a tap hurries it, until the hurried swing has finished', async () => {
    animationClock.lag = 500;
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    await tick(300);
    await redraw({ start: true, hurry: true, onOpened });
    await tick(HURRY_MS + 200);
    expect(onOpened).not.toHaveBeenCalled();
    expect(drawn('book-hinge')).toBeTruthy();
    await tick(400);
    // The swing that was cancelled by the tap did not count as finished: once, and softly.
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(cue).not.toHaveBeenCalled();
  });

  it('under Reduce Motion is open when its fade has finished', async () => {
    mockReduced = true;
    animationClock.lag = 500;
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    await tick(tokens.motion.fast + 200);
    expect(onOpened).not.toHaveBeenCalled();
    await tick(400);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });
});

describe('the opening can never be cut by a clock (a UI thread that begins the swing 2 s late)', () => {
  // The walk measured the emulator's UI thread beginning the opening's animations 1.8 to 2.1 s after
  // JS asked for them. Every clock the opening holds ran on JS time and went off a third of the way into
  // the swing: the board was taken away in the air. The hinge leaves when the cover says it has landed.
  const LATE = 2000;
  const total = FULL.rise + FULL.cover;
  const layers = ['book-hinge', 'book-lining', 'book-cover-shadow', 'book-page-sheen'];

  it.each([
    ['rises', 'rise', FULL.rise],
    ['comes forward', 'forward', FULL.forward],
  ] as const)(
    'keeps the whole board, frame by frame, until the cover has landed, when the book %s',
    async (_, entrance, first) => {
      animationClock.lag = LATE;
      const onOpened = jest.fn();
      await render(book({ start: true, entrance, echoes: 9, onOpened }));
      const lands = LATE + first + FULL.cover;
      // The old net went off at the ritual's length plus 1500 ms, which is a third of the way through.
      for (let at = 0; at < lands - 1; at += 50) {
        await tick(Math.min(50, lands - 1 - at));
        expect(onOpened).not.toHaveBeenCalled();
        for (const id of layers) expect(drawn(id)).toBeTruthy();
      }
      await tick(1);
      expect(onOpened).toHaveBeenCalledTimes(1);
      await redraw({ start: true, entrance, echoes: 9, onOpened });
      for (const id of layers) expect(drawn(id)).toBeNull();
      await tick(UI_HANG_MS * 2);
      expect(onOpened).toHaveBeenCalledTimes(1);
    },
  );

  it('does not let the page be uncovered, or the head arrive, before the cover has swung', async () => {
    animationClock.stepped = true;
    animationClock.lag = LATE;
    const seen: { open: boolean; headed: boolean }[] = [];
    await render(
      <ThemeProvider crossfade={false}>
        <BookStage
          entrance="rise"
          start
          riseFrom={600}
          ritual={FULL}
          hurry={false}
          volume={VOLUMES[0]!}
          surface="vellum"
          width={355}
          height={416}
        >
          {(open, headed) => {
            seen.push({ open, headed });
            return null;
          }}
        </BookStage>
      </ThemeProvider>,
    );
    // Where the old net went off, a little before the cover (walked from LATE + rise) is past edge-on.
    await tick(FULL.rise + FULL.cover + 1500 + 100);
    expect(seen.every(({ headed }) => !headed)).toBe(true);
    await tick(LATE);
    expect(seen.at(-1)).toEqual({ open: true, headed: true });
  });

  it('is felt, and the leaves are counted, only once the cover has really begun to move', async () => {
    animationClock.stepped = true;
    animationClock.lag = LATE;
    await render(book({ start: true, echoes: 9 }));
    await tick(LATE + FULL.rise);
    expect(cue).not.toHaveBeenCalled();
    await tick(200);
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('tick');
  });

  it('is told once the cover has landed, and not by a net, when the UI thread starts late but is alive', async () => {
    animationClock.lag = LATE;
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    await tick(LATE + total);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('goes on, a net after the swing was due and no sooner, if the UI thread began it and then went quiet', async () => {
    // The net is measured from the animation's first frame, on the UI thread: it began LATE ms after it
    // was asked, and a UI thread that never reports its end is let go of ANIMATION_NET_MS after it ought to have.
    animationClock.lag = LATE;
    animationClock.silent = true;
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    await tick(LATE + netAfterBegin(total) - 1);
    expect(onOpened).not.toHaveBeenCalled();
    expect(drawn('book-hinge')).toBeTruthy();
    await tick(2);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('keeps the hurried cover until it has landed, however late, when a tap hurries it', async () => {
    animationClock.lag = LATE;
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    await tick(300);
    await redraw({ start: true, hurry: true, onOpened });
    // The tap's own animations begin LATE ms after the tap, and take HURRY_MS.
    await tick(LATE + HURRY_MS - 2);
    expect(onOpened).not.toHaveBeenCalled();
    expect(drawn('book-hinge')).toBeTruthy();
    await tick(4);
    // The swing the tap cancelled said it had not finished, and was not taken for the end of the opening.
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(cue).not.toHaveBeenCalled();
  });

  it('ends with an animation that something else has cancelled, since nothing else is coming to say so', async () => {
    // The first swing is replaced by the tap's: only the tap's end counts, and only once.
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    await tick(FULL.rise + 200);
    await redraw({ start: true, hurry: true, onOpened });
    expect(onOpened).not.toHaveBeenCalled();
    await tick(HURRY_MS + 10);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });
});

describe('Reduce Motion switched on while ECHO is running', () => {
  // The first draw of a session reads Reduce Motion as it was when the app began; the system's answer
  // comes after, and the book is drawn again under it. The first draw had begun the book below the
  // screen, which is where it had been told it started: the second must put it back where it rests,
  // and not simply stop mentioning where it is, or nothing moves it and the sky is all there is.
  it.each(['rise', 'forward'] as const)(
    'brings the book that %ss in to where it rests, and not where it began',
    async (entrance) => {
      await render(book({ entrance, riseFrom: 600 }));
      const began = style().transform as { translateY: number }[];
      expect(began[0]!.translateY).toBeGreaterThan(0);
      mockReduced = true;
      await redraw({ entrance, riseFrom: 600, start: true });
      expect(style().opacity).toBe(1);
      expect(style().transform).toEqual(AT_REST);
    },
  );

  it('opens at the end of its fade, once, when it is switched on while the book is arriving', async () => {
    animationClock.lag = 400;
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    await tick(500);
    mockReduced = true;
    await redraw({ start: true, onOpened });
    expect(onOpened).not.toHaveBeenCalled();
    await tick(400 + tokens.motion.fast + 20);
    expect(onOpened).toHaveBeenCalledTimes(1);
    await tick(UI_HANG_MS * 2);
    expect(onOpened).toHaveBeenCalledTimes(1);
    // No hinge, no riffle, nothing of the swing is left behind.
    await redraw({ start: true, onOpened });
    expect(drawn('book-hinge')).toBeNull();
    expect(leaves()).toHaveLength(0);
    expect(style().transform).toEqual(AT_REST);
  });

  it('keeps an open book where it is, and whole, when it is switched on while the book is open', async () => {
    await render(book({ start: true }));
    await tick(FULL.rise + FULL.cover + 100);
    mockReduced = true;
    await redraw({ start: true });
    expect(style().opacity).toBe(1);
    expect(style().transform).toEqual(AT_REST);
    expect(drawn('book-hinge')).toBeNull();
  });

  it('shows the next book as soon as it is mounted under it, whatever was switched before', async () => {
    // Between sessions: this session's book is the next one, and is mounted under Reduce Motion.
    mockReduced = true;
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    expect(style().opacity).toBe(1);
    await tick(tokens.motion.fast + 20);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('is switched off again in the middle of a session without stranding the book', async () => {
    mockReduced = true;
    await render(book({ start: true }));
    mockReduced = false;
    await redraw({ start: true, entrance: 'rise', riseFrom: 600 });
    // Not reduced any more, and already open: it rests where it is, with nothing begun again.
    expect(style().opacity).toBe(1);
    expect(style().transform).toEqual([{ translateY: 0 }]);
  });
});

describe('the book fades in as one picture', () => {
  // A book that arrives with an opacity is a page, a cover and boards one over another: each faded
  // by itself, the words show through the cloth. On Android a view's children are faded one by one
  // unless it is told they overlap.
  it('is composited as a whole while it fades, so the page does not show through the cover', async () => {
    await render(book({ start: true, entrance: 'forward', surface: 'paper' }));
    const stage = screen.getByTestId('book-stage', { includeHiddenElements: true });
    expect(stage.props.needsOffscreenAlphaCompositing).toBe(true);
  });

  it.each(['rise', 'forward'] as const)(
    'does the same for a book that %ss in, waiting',
    async (entrance) => {
      await render(book({ entrance }));
      expect(
        screen.getByTestId('book-stage', { includeHiddenElements: true }).props
          .needsOffscreenAlphaCompositing,
      ).toBe(true);
    },
  );
});

describe('the head of the page', () => {
  beforeEach(() => {
    animationClock.stepped = true;
  });
  const watched = (seen: boolean[], lag = 0) => {
    animationClock.lag = lag;
    return (
      <ThemeProvider crossfade={false}>
        <BookStage
          entrance="rise"
          start
          riseFrom={600}
          ritual={FULL}
          hurry={false}
          volume={VOLUMES[0]!}
          surface="vellum"
          width={355}
          height={416}
        >
          {(_open, headed) => {
            seen.push(headed);
            return null;
          }}
        </BookStage>
      </ThemeProvider>
    );
  };

  it('arrives once the cover has swung well off the page', async () => {
    const seen: boolean[] = [];
    await render(watched(seen));
    await tick(FULL.rise + FULL.cover * 0.6);
    expect(seen.at(-1)).toBe(false);
    await tick(FULL.cover * 0.2);
    expect(seen.at(-1)).toBe(true);
  });

  it('is as late as the cover is, however late that is', async () => {
    const seen: boolean[] = [];
    await render(watched(seen, 700));
    await tick(FULL.rise + FULL.cover * 0.8);
    expect(seen.at(-1)).toBe(false);
    await tick(700);
    expect(seen.at(-1)).toBe(true);
  });
});

describe('the light on the cloth', () => {
  it('crosses the cover of a book that rises, and not of one that is brought forward from a shelf', async () => {
    // Brought forward, the book arrives in a fraction of a second: a light would be a flash.
    await render(book({ start: true, entrance: 'forward' }));
    expect(drawn('book-cloth-light')).toBeNull();
    await redraw({ start: true, entrance: 'rise' });
    expect(drawn('book-cloth-light')).toBeTruthy();
  });
});

describe('the book shutting', () => {
  const shutting = (patch: Partial<ClosingState> = {}): ClosingState => ({
    ritual: FULL,
    hurry: false,
    contact: false,
    sinking: false,
    reduced: false,
    asking: false,
    ...patch,
  });

  it('has its cover ready, unseen, from the moment the entry is being kept, and not before', async () => {
    await render(book({ start: true }));
    await tick(FULL.rise + FULL.cover + 100);
    // Open: the board has gone, and the hinge with it.
    expect(drawn('book-hinge')).toBeNull();
    await redraw({ start: true, preparing: true });
    expect(drawn('book-hinge')).toBeTruthy();
    // It is the open book's cover, which is not seen: the board is let go of as the book opens.
    expect(StyleSheet.flatten(drawn('book-hinge')!.props.style).opacity).toBe(0);
  });

  it('gives its page to the closing as an open one, and takes no touches while it shuts', async () => {
    const seen: boolean[] = [];
    const watch = (closing: ClosingState | null) => (
      <ThemeProvider crossfade={false}>
        <BookStage
          entrance="rise"
          start
          riseFrom={600}
          ritual={FULL}
          hurry={false}
          volume={VOLUMES[0]!}
          surface="vellum"
          width={355}
          height={416}
          closing={closing}
        >
          {(open) => {
            seen.push(open);
            return null;
          }}
        </BookStage>
      </ThemeProvider>
    );
    await render(watch(null));
    await tick(FULL.rise + FULL.cover + 100);
    seen.length = 0;
    await screen.rerender(watch(shutting()));
    expect(seen.at(-1)).toBe(true);
    expect(
      screen.getByTestId('book-stage', { includeHiddenElements: true }).props.pointerEvents,
    ).toBe('none');
  });

  it('lets a light catch the board\u2019s top edge as it lands', async () => {
    await render(book({ start: true, closing: shutting() }));
    expect(drawn('book-edge-light')).toBeTruthy();
  });

  it('sinks a little, settles a little smaller, and is gone', async () => {
    await render(book({ start: true }));
    await tick(FULL.rise + FULL.cover + 100);
    expect(style().transform).toEqual([{ translateY: 0 }]);
    await redraw({ start: true, closing: shutting({ sinking: true }) });
    expect(style().opacity).toBe(0);
    expect(style().transform).toEqual([{ translateY: 26 }, { scale: 0.985 }]);
  });

  it('sinks when it is told to, and not before', async () => {
    await render(book({ start: true }));
    await tick(FULL.rise + FULL.cover + 100);
    await redraw({ start: true, closing: shutting({ sinking: false }) });
    expect(style().opacity).toBe(1);
    expect(style().transform).toEqual([{ translateY: 0 }]);
  });

  it('under Reduce Motion fades where it is: no cover, no light, nothing that moves', async () => {
    mockReduced = true;
    await render(book({ start: true }));
    await redraw({ start: true, closing: shutting({ reduced: true, sinking: true }) });
    expect(style().opacity).toBe(0);
    expect(style().transform).toEqual(AT_REST);
    expect(drawn('book-hinge')).toBeNull();
    expect(drawn('book-edge-light')).toBeNull();
  });

  it('is not felt by the stage itself: the one cue is the closing\u2019s, where the cover lands', async () => {
    await render(book({ start: true }));
    await tick(FULL.rise + FULL.cover + 100);
    jest.mocked(cue).mockClear();
    await redraw({ start: true, closing: shutting({ contact: true, sinking: true }) });
    await tick(3000);
    expect(cue).not.toHaveBeenCalled();
  });
});

describe('the book shutting follows its own animations, not the clock', () => {
  // The cover is walked down and the book is walked out, a frame at a time, so that what the stage
  // reports from them is seen at the moment it is true.
  beforeEach(() => {
    animationClock.stepped = true;
  });
  const shutting = (patch: Partial<ClosingState> = {}): ClosingState => ({
    ritual: FULL,
    hurry: false,
    contact: false,
    sinking: false,
    reduced: false,
    asking: false,
    ...patch,
  });
  const landing = FULL.close.coverAt + FULL.close.cover;
  const open = async (props: Props = {}) => {
    await render(book({ start: true, ...props }));
    await tick(FULL.rise + FULL.cover + 100);
  };

  it('says the cover has landed when its own descent has ended', async () => {
    const onLanded = jest.fn();
    await open();
    await redraw({ start: true, closing: shutting(), onLanded });
    await tick(landing - 40);
    expect(onLanded).not.toHaveBeenCalled();
    await tick(80);
    expect(onLanded).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it('says it later when the UI thread is late: the clock does not land the cover', async () => {
    const onLanded = jest.fn();
    await open();
    animationClock.lag = 700;
    await redraw({ start: true, closing: shutting(), onLanded });
    await tick(landing + 400);
    expect(onLanded).not.toHaveBeenCalled();
    await tick(400);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it('says the book has begun to sink from the sink\u2019s own first frame, however late that is', async () => {
    const onSinkBegun = jest.fn();
    await open();
    animationClock.lag = 2000;
    // A closed book that was asked something, and has been answered: JS tells it to sink, and it rests first.
    await redraw({
      start: true,
      closing: shutting({ asking: true, contact: true, sinking: true }),
      onSinkBegun,
    });
    await tick(2000 + FULL.close.gap - 1);
    expect(onSinkBegun).not.toHaveBeenCalled();
    // The first frame the UI thread draws once the rest is over (the stand-in draws one every 16 ms).
    await tick(1 + 2 * 16);
    expect(onSinkBegun).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(onSinkBegun).toHaveBeenCalledTimes(1);
  });

  it('says it once, as the sink begins, and neither before it is asked for nor again as it ends', async () => {
    const onSinkBegun = jest.fn();
    await open();
    // A closed book that is asked something sinks when JS says so (a sink of the cover's own is only for one that is not).
    const asking = { asking: true };
    await redraw({ start: true, closing: shutting(asking), onSinkBegun });
    await tick(landing + 200);
    expect(onSinkBegun).not.toHaveBeenCalled();
    await redraw({
      start: true,
      closing: shutting({ ...asking, contact: true, sinking: true }),
      onSinkBegun,
    });
    // The answered book rests before it sinks, as one that was asked nothing does.
    await tick(FULL.close.gap - 20);
    expect(onSinkBegun).not.toHaveBeenCalled();
    await tick(60);
    expect(onSinkBegun).toHaveBeenCalledTimes(1);
    await tick(FULL.close.sink + 300);
    expect(onSinkBegun).toHaveBeenCalledTimes(1);
  });

  it('says the cover has landed by its own net, measured from its first frame and no sooner, if its end is never heard', async () => {
    const onLanded = jest.fn();
    await open();
    animationClock.lag = 2000;
    animationClock.silent = true;
    await redraw({ start: true, closing: shutting(), onLanded });
    await tick(2000 + netAfterBegin(landing) - 2);
    expect(onLanded).not.toHaveBeenCalled();
    await tick(4 + 16);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it('says the cover has landed a very long time after it was due, if the UI thread never begins it', async () => {
    const onLanded = jest.fn();
    await open();
    animationClock.lag = 1_000_000;
    await redraw({ start: true, closing: shutting(), onLanded });
    await tick(landing + 1500 + ANIMATION_NET_MS + 200);
    expect(onLanded).not.toHaveBeenCalled();
    await tick(UI_HANG_MS);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it('still says the cover has landed, and the sink has begun, when Reduce Motion is switched on in the middle of the closing', async () => {
    // The closing was begun as the full ritual and waits for the cover; the book drawing itself as a fade
    // must not leave it waiting for ever.
    const onLanded = jest.fn();
    const onSinkBegun = jest.fn();
    await open();
    await redraw({ start: true, closing: shutting(), onLanded, onSinkBegun });
    await tick(200);
    mockReduced = true;
    await redraw({ start: true, closing: shutting(), onLanded, onSinkBegun });
    await tick(landing + 100);
    expect(onLanded).toHaveBeenCalledTimes(1);
    await redraw({
      start: true,
      closing: shutting({ contact: true, sinking: true }),
      onLanded,
      onSinkBegun,
    });
    await tick(60);
    expect(onSinkBegun).toHaveBeenCalledTimes(1);
    expect(style().transform).toEqual(AT_REST);
  });

  it('says the hurried book has begun to sink, and the cover has landed with it', async () => {
    const onSinkBegun = jest.fn();
    const onLanded = jest.fn();
    await open();
    await redraw({ start: true, closing: shutting(), onLanded, onSinkBegun });
    await tick(100);
    await redraw({
      start: true,
      closing: shutting({ hurry: true, contact: true, sinking: true }),
      onLanded,
      onSinkBegun,
    });
    await tick(60);
    expect(onSinkBegun).toHaveBeenCalledTimes(1);
    expect(onLanded).not.toHaveBeenCalled();
    await tick(HURRY_MS + 40);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });
});

describe('the book sinks from the landing, on the UI thread, whatever JS is doing', () => {
  // The sink used to be asked for by JS, a timer after the landing, and so it waited behind whatever JS was
  // doing (mounting the next screen, above all): the walked emulator rested the shut book for 0.4 to 1 s, where
  // the ritual means 40 to 80 ms. The UI thread that lands the cover begins the sink itself, after the rest,
  // and says so from the sink's first frame; the next screen is asked for only then (./useBookClosing).
  beforeEach(() => {
    animationClock.stepped = true;
  });
  const shutting = (patch: Partial<ClosingState> = {}): ClosingState => ({
    ritual: FULL,
    hurry: false,
    contact: false,
    sinking: false,
    reduced: false,
    asking: false,
    ...patch,
  });
  const landing = FULL.close.coverAt + FULL.close.cover;
  const { gap, sink } = FULL.close;
  const open = async (props: Props = {}) => {
    await render(book({ start: true, ...props }));
    await tick(FULL.rise + FULL.cover + 100);
  };
  /** How much of the book is drawn now: the stand-in reads a shared value when the screen is drawn. */
  const shown = async (props: Props) => {
    await redraw(props);
    return style().opacity as number;
  };

  it('begins the sink as the cover rests, though JS has not yet heard that the cover is down', async () => {
    const onLanded = jest.fn();
    await open();
    // What the UI thread says to JS arrives two seconds late: JS is busy mounting the next screen.
    animationClock.jsLag = 2000;
    const props = { start: true, closing: shutting(), onLanded };
    await redraw(props);
    await tick(landing + gap + sink / 2);
    expect(onLanded).not.toHaveBeenCalled();
    const half = await shown(props);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
  });

  it('begins to sink within its rest of the landing with nothing asked of JS, and says so from that frame', async () => {
    const heard: string[] = [];
    const onLanded = jest.fn(() => heard.push('landed'));
    const onSinkBegun = jest.fn(() => heard.push('sinking'));
    await open();
    // JS has no turn in all this time: whatever the UI thread hands it arrives five seconds late, and the
    // closing it was given never changes.
    animationClock.jsLag = 5000;
    const props = { start: true, closing: shutting(), onLanded, onSinkBegun };
    await redraw(props);
    await tick(landing + gap - 20);
    expect(await shown(props)).toBe(1);
    await tick(20 + 2 * 16);
    expect(await shown(props)).toBeLessThan(1);
    expect(heard).toEqual([]);
    // JS hears of both once it is free, in the order they were drawn.
    await tick(5000);
    expect(heard).toEqual(['landed', 'sinking']);
  });

  it('has sunk from sight when the sink was due, with no word from JS, however late JS is', async () => {
    await open();
    animationClock.jsLag = 5000;
    const props = { start: true, closing: shutting() };
    await redraw(props);
    await tick(landing + gap + sink + 60);
    expect(await shown(props)).toBe(0);
  });

  it('rests for the ritual’s gap and not a moment longer: the cover is down, the book is whole, and then it goes', async () => {
    await open();
    animationClock.jsLag = 2000;
    const props = { start: true, closing: shutting() };
    await redraw(props);
    await tick(landing - 40);
    expect(await shown(props)).toBe(1);
    // Just after the rest, the sink has begun: not a second later, as it did when JS asked for it.
    await tick(40 + gap + 3 * 16);
    expect(await shown(props)).toBeLessThan(1);
  });

  it('rests for the practised ritual’s shorter gap, too', async () => {
    await open({ ritual: SHORT });
    animationClock.jsLag = 2000;
    const quick = SHORT.close.coverAt + SHORT.close.cover;
    const props = { start: true, ritual: SHORT, closing: shutting({ ritual: SHORT }) };
    await redraw(props);
    await tick(quick + SHORT.close.gap + 3 * 16);
    expect(await shown(props)).toBeLessThan(1);
    await tick(SHORT.close.sink + 60);
    expect(await shown(props)).toBe(0);
  });

  it('follows the cover, not the clock: a UI thread that begins late, sinks late, and after the landing', async () => {
    await open();
    const LATE = 700;
    animationClock.lag = LATE;
    const props = { start: true, closing: shutting() };
    await redraw(props);
    // The cover is not down yet, so the book is not sinking, though the clock says it should be.
    await tick(landing + gap + 400);
    expect(await shown(props)).toBe(1);
    // (The stand-in's lag is for every animation it is given, the sink's own among them.)
    await tick(LATE + landing + LATE + gap + 3 * 16 - (landing + gap + 400));
    expect(await shown(props)).toBeLessThan(1);
  });

  it('is not begun a second time when JS catches up and says it is sinking: it goes on, on its own schedule', async () => {
    await open();
    animationClock.jsLag = 1500;
    const props = { start: true, closing: shutting() };
    await redraw(props);
    await tick(landing + gap + sink - 60);
    expect(await shown(props)).toBeGreaterThan(0);
    // JS has now heard, and has said the book is sinking. A sink begun again would start from here and take
    // another 460 ms; the one that is running is due in 60.
    const caught = { start: true, closing: shutting({ contact: true, sinking: true }) };
    await redraw(caught);
    await tick(60 + 16 * 3);
    expect(await shown(caught)).toBe(0);
  });

  it('is not begun at all while the closed book is being asked something: it waits for the answer', async () => {
    await open();
    const props = { start: true, closing: shutting({ asking: true }) };
    await redraw(props);
    await tick(landing + gap + sink + 5000);
    expect(await shown(props)).toBe(1);
    // The answer is given, JS says the book sinks, and it rests for its gap on the UI thread, then sinks.
    const answered = {
      start: true,
      closing: shutting({ asking: true, contact: true, sinking: true }),
    };
    await redraw(answered);
    await tick(gap - 20);
    expect(await shown(answered)).toBe(1);
    await tick(20 + sink + 60);
    expect(await shown(answered)).toBe(0);
  });

  it('is begun by JS when the UI thread never says the cover is down, so a lost callback cannot keep the book', async () => {
    animationClock.silent = true;
    await open();
    const props = { start: true, closing: shutting() };
    await redraw(props);
    await tick(landing + gap + sink + 400);
    // Nothing was heard from the cover's end, so nothing chained: the book is still there until JS says so.
    expect(await shown(props)).toBe(1);
    const told = { start: true, closing: shutting({ contact: true, sinking: true }) };
    await redraw(told);
    await tick(gap + sink + 60);
    expect(await shown(told)).toBe(0);
  });

  it('is not begun by a descent that a tap cut short: a hurried book sinks when it is told to', async () => {
    await open();
    const props = { start: true, closing: shutting() };
    await redraw(props);
    await tick(200);
    // The tap cancels the descent (which says it did not finish) and hurries the cover down.
    const hurried = { start: true, closing: shutting({ hurry: true, contact: true }) };
    await redraw(hurried);
    await tick(HURRY_MS + gap + 3 * 16 + 200);
    expect(await shown(hurried)).toBe(1);
    const told = { start: true, closing: shutting({ hurry: true, contact: true, sinking: true }) };
    await redraw(told);
    await tick(HURRY_MS + 60);
    expect(await shown(told)).toBe(0);
  });
});

describe('the book says when it has drawn its first frame', () => {
  // The shelf stays until it does (./Shelf): the walked emulator showed an empty navy frame for half a second
  // between the shelf's last light and the book's first, because the shelf's own fade, on the UI thread, ended
  // while JS was still mounting the book.
  const layout = () =>
    fireEvent(screen.getByTestId('book-stage', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 355, height: 416 } },
    });

  it('says nothing until it has been laid out, however long that takes', async () => {
    const onDrawn = jest.fn();
    await render(book({ start: true, entrance: 'forward', onDrawn }));
    await tick(30_000);
    expect(onDrawn).not.toHaveBeenCalled();
  });

  it('says so once, when it has been laid out and the UI thread has run a frame', async () => {
    const onDrawn = jest.fn();
    await render(book({ start: true, entrance: 'forward', onDrawn }));
    await layout();
    await tick(40);
    expect(onDrawn).toHaveBeenCalledTimes(1);
    await layout();
    await tick(5000);
    expect(onDrawn).toHaveBeenCalledTimes(1);
  });

  it('does not say so on the layout alone: a frame the UI thread has not run is not drawn', async () => {
    animationClock.lag = 1500;
    const onDrawn = jest.fn();
    await render(book({ start: true, entrance: 'forward', onDrawn }));
    await layout();
    await tick(1400);
    expect(onDrawn).not.toHaveBeenCalled();
    await tick(200);
    expect(onDrawn).toHaveBeenCalledTimes(1);
  });

  it('says so under Reduce Motion, where the book is only a fade', async () => {
    mockReduced = true;
    const onDrawn = jest.fn();
    await render(book({ start: true, entrance: 'forward', onDrawn }));
    await layout();
    await tick(40);
    expect(onDrawn).toHaveBeenCalledTimes(1);
  });
});
