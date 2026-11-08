// The book as it is drawn at a moment. The stand-in for Reanimated reads a shared value only when the
// screen is drawn, and resolves every animation to its end at once, so these prove which layers are
// there and which branch of the motion is chosen, never the curves. The curves are pure functions
// (./standing.test) and are judged by eye, frame by frame.
//
// What the opening does when the animation is behind the clock is proved with the stand-in's own
// clock (src/testing/reanimatedMock): `lag` is a UI thread that finishes every animation late, and
// `stepped` walks the cover to where it is going, so that what follows its progress can be seen.
import { act, screen } from '@testing-library/react-native';
import type { ComponentProps, ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { BookStage } from './BookStage';
import type { ClosingState } from './useBookClosing';
import { FULL, HURRY_MS, SHORT } from './ritual';
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

describe('the book under Reduce Motion', () => {
  beforeEach(() => {
    mockReduced = true;
  });

  it.each(['rise', 'forward'] as const)(
    'is only ever a fade where it rests when it %ss in: nothing travels and nothing scales',
    async (entrance) => {
      await render(book({ entrance, riseFrom: 600 }));
      expect(style().opacity).toBe(0);
      expect(style().transform).toBeUndefined();
      await redraw({ entrance, riseFrom: 600, start: true });
      expect(style().opacity).toBe(1);
      expect(style().transform).toBeUndefined();
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

  it('opens by itself, a little after the ritual is over, if the animation never says it is done', async () => {
    animationClock.lag = 1_000_000;
    const onOpened = jest.fn();
    await render(book({ start: true, onOpened }));
    await tick(total + 1400);
    expect(onOpened).not.toHaveBeenCalled();
    await tick(200);
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
    expect(style().transform).toBeUndefined();
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

  it('says the book is gone when it has sunk half way, however late that is', async () => {
    const onGone = jest.fn();
    await open();
    animationClock.lag = 500;
    await redraw({
      start: true,
      closing: shutting({ contact: true, sinking: true }),
      onGone,
    });
    await tick(FULL.close.sink / 2 + 300);
    expect(onGone).not.toHaveBeenCalled();
    await tick(400);
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('says it at half way, and not when the sink is only begun', async () => {
    const onGone = jest.fn();
    await open();
    await redraw({
      start: true,
      closing: shutting({ contact: true, sinking: true }),
      onGone,
    });
    await tick(FULL.close.sink / 2 - 40);
    expect(onGone).not.toHaveBeenCalled();
    await tick(80);
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('says it when the hurried book has sunk, all the way, and the cover has landed with it', async () => {
    const onGone = jest.fn();
    const onLanded = jest.fn();
    await open();
    await redraw({ start: true, closing: shutting(), onLanded, onGone });
    await tick(100);
    await redraw({
      start: true,
      closing: shutting({ hurry: true, contact: true, sinking: true }),
      onLanded,
      onGone,
    });
    await tick(HURRY_MS / 2);
    expect(onGone).not.toHaveBeenCalled();
    await tick(HURRY_MS / 2 + 40);
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });
});
