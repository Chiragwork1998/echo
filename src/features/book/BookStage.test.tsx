// The book as it is drawn at a moment. The stand-in for Reanimated reads a shared value only when the
// screen is drawn, and resolves every animation to its end at once, so these prove which layers are
// there and which branch of the motion is chosen, never the curves. The curves are pure functions
// (./standing.test) and are judged by eye, frame by frame.
import { act, screen } from '@testing-library/react-native';
import type { ComponentProps, ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { render } from '@/testing/render';

import { BookStage } from './BookStage';
import type { ClosingState } from './useBookClosing';
import { FULL, SHORT } from './ritual';
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
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

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
});

describe('the unseating of the cover', () => {
  // The board starts from rest: it has left the page a little after the swing begins.
  const unseat = (ritual: typeof FULL, first: number) => first + Math.round(ritual.cover * 0.14);

  it('is felt once, as a tick, where the board first leaves the page and not before', async () => {
    await render(book({ start: true }));
    const at = unseat(FULL, FULL.rise);
    await tick(at - 1);
    expect(cue).not.toHaveBeenCalled();
    await tick(2);
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('tick');
    await tick(FULL.cover + 100);
    expect(cue).toHaveBeenCalledTimes(1);
  });

  it('follows the ritual: First Echo\u2019s swing starts after its own, shorter, arrival', async () => {
    await render(book({ start: true, entrance: 'forward', ritual: SHORT }));
    const at = unseat(SHORT, SHORT.forward);
    await tick(at - 2);
    expect(cue).not.toHaveBeenCalled();
    await tick(3);
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
