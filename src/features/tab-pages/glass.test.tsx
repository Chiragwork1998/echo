import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { ThemeProvider } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';
import { glassAncestors, mostFadedGlass } from '@/testing/glass';
import { animationClock, reanimatedMock } from '@/testing/reanimatedMock';

import { Notice, Surface } from './parts';
import { ArriveInOrder, Bars, Resolve } from './Resolve';
import { Reveal } from './Reveal';

// Android's BlurView loses its blur while any ancestor's opacity is under 1, and the glass shows as
// a pale slab with no frost until the fade is over (the walk, E5). So nothing that arrives may fade
// over a piece of glass: the glass is whole from the first moment, the arrival rises, and only what
// is written on the glass fades.

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;
const realTiming = reanimatedMock.withTiming;
const timing = jest.spyOn(reanimatedMock, 'withTiming');

/** Every animation is caught part of the way: at 0.4, going in or coming out. */
const midway = () => timing.mockImplementation((() => 0.4) as never);

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

const themed = (element: React.ReactElement) => (
  <ThemeProvider crossfade={false}>{element}</ThemeProvider>
);

/**
 * Lets the time pass and draws the screen again. A real animated style follows its animation by
 * itself; the stand-in under jest reads it each time the thing is drawn.
 */
async function pass(
  view: Awaited<ReturnType<typeof render>>,
  tree: () => React.ReactElement,
  ms = 700,
) {
  await advance(ms);
  await view.rerender(themed(tree()));
}

/** The opacity of the nearest ancestor of an element that has one set. */
function fadeOf(text: string): number {
  let node = screen.getByText(text, { includeHiddenElements: true }).parent;
  while (node) {
    const opacity = (StyleSheet.flatten(node.props.style) as { opacity?: number } | undefined)
      ?.opacity;
    if (opacity !== undefined && opacity !== 1) return opacity;
    node = node.parent;
  }
  return 1;
}

beforeEach(() => {
  jest.useFakeTimers();
  reduced.mockReturnValue(false);
  timing.mockClear();
});
afterEach(() => {
  timing.mockImplementation(realTiming as never);
  jest.useRealTimers();
});

describe('what arrives over glass', () => {
  const surface = () => (
    <Surface>
      <Text>On the glass</Text>
    </Surface>
  );
  const revealed = () => <Reveal>{surface()}</Reveal>;

  it('a Reveal around a Surface never fades the glass: the words on it do', async () => {
    midway();
    const view = await render(themed(revealed()));
    await pass(view, revealed);
    expect(glassAncestors()).toHaveLength(1);
    expect(mostFadedGlass()).toBe(1);
    expect(fadeOf('On the glass')).toBeCloseTo(0.4);
  });

  it('a Reveal around plain words still fades them, as it always did', async () => {
    midway();
    const plain = () => (
      <Reveal>
        <Text>Plain words</Text>
      </Reveal>
    );
    const view = await render(themed(plain()));
    await pass(view, plain);
    expect(fadeOf('Plain words')).toBeCloseTo(0.4);
  });

  it('a Notice arrives without fading its glass', async () => {
    midway();
    const notice = () => <Notice message="Nothing clear enough to name yet." />;
    const view = await render(themed(notice()));
    await pass(view, notice);
    expect(glassAncestors()).toHaveLength(1);
    expect(mostFadedGlass()).toBe(1);
    expect(fadeOf('Nothing clear enough to name yet.')).toBeCloseTo(0.4);
  });

  it('a glass block still rises as it arrives, with no fade: it is whole where it is, a few points low', async () => {
    midway();
    const view = await render(themed(revealed()));
    await pass(view, revealed);
    // Its ancestors move: nothing else about the block says it is arriving.
    let node = screen.getByText('On the glass').parent;
    let lift = 0;
    while (node) {
      const transform = (
        StyleSheet.flatten(node.props.style) as
          { transform?: { translateY?: number }[] } | undefined
      )?.transform;
      lift += transform?.reduce((sum, step) => sum + (step.translateY ?? 0), 0) ?? 0;
      node = node.parent;
    }
    expect(lift).toBeCloseTo((1 - 0.4) * 10);
  });

  it('Resolve brings glass in without fading it, one item after another', async () => {
    const page = (ready: boolean) => (
      <Resolve ready={ready} skeleton={<Text>Skeleton</Text>} each>
        <Surface key="a">
          <Text>First</Text>
        </Surface>
        <Surface key="b">
          <Text>Second</Text>
        </Surface>
      </Resolve>
    );
    const view = await render(themed(page(false)));
    await advance(400);
    midway();
    await view.rerender(themed(page(true)));
    await pass(view, () => page(true));
    expect(glassAncestors()).toHaveLength(2);
    expect(mostFadedGlass()).toBe(1);
    expect(fadeOf('First')).toBeCloseTo(0.4);
  });

  it('the skeleton leaving does not fade its glass: its bars fade, and the glass is cut when they are gone', async () => {
    const page = (ready: boolean) => (
      <Resolve
        ready={ready}
        skeleton={
          <Surface>
            <Text>Bars</Text>
          </Surface>
        }
      >
        <Text>Arrived</Text>
      </Resolve>
    );
    const view = await render(themed(page(false)));
    await advance(400);
    midway();
    await view.rerender(themed(page(true)));
    await pass(view, () => page(true), 100);
    expect(screen.getByText('Bars', { includeHiddenElements: true })).toBeTruthy();
    expect(mostFadedGlass()).toBe(1);
    expect(fadeOf('Bars')).toBeCloseTo(0.4);
  });

  it('a skeleton’s bars arrive over glass that is whole, once the wait has outlasted the pause', async () => {
    midway();
    const bars = () => (
      <Bars>
        <Surface>
          <Text>Bars</Text>
        </Surface>
      </Bars>
    );
    const view = await render(themed(bars()));
    // Before the pause it is not drawn at all: a quick answer never flashes it.
    expect(fadeOf('Bars')).toBe(0);
    await pass(view, bars, 300);
    expect(mostFadedGlass()).toBe(1);
    expect(fadeOf('Bars')).toBeCloseTo(0.4);
  });

  it('a GlassCard in a skeleton, as Home’s is, keeps its glass whole too', async () => {
    midway();
    const card = () => (
      <Bars>
        <GlassCard>
          <Text>Card bars</Text>
        </GlassCard>
      </Bars>
    );
    const view = await render(themed(card()));
    await pass(view, card, 300);
    expect(glassAncestors()).toHaveLength(1);
    expect(mostFadedGlass()).toBe(1);
    expect(fadeOf('Card bars')).toBeCloseTo(0.4);
  });

  it('rows arriving in order are not over glass of their own, so they fade as before', async () => {
    midway();
    await render(
      themed(
        <ArriveInOrder index={0} step={50} cap={6}>
          <Text>A row</Text>
        </ArriveInOrder>,
      ),
    );
    // Not arriving from a skeleton, a row is simply there.
    expect(fadeOf('A row')).toBe(1);
  });

  it('plain glass, arriving nowhere, is drawn as it always was', async () => {
    await render(
      themed(
        <Surface>
          <Text>At rest</Text>
        </Surface>,
      ),
    );
    expect(mostFadedGlass()).toBe(1);
    expect(screen.getByText('At rest')).toBeTruthy();
  });
});

// The walk (v9): glass that arrived was seen empty, gone for one frame, then back with its words
// (a locked card, the consent panel). Reanimated gives a view the first values of the animated styles
// it has when it mounts; a style that is swapped in afterwards brings none, so the view is drawn plain
// (full opacity) until the UI thread's first word, then hidden by it, then shown. An arrival finds
// out that there is glass in it a moment after it mounts, and used to swap one style for another then.
describe('glass arriving, frame by frame', () => {
  const FRAME = 16;
  beforeEach(() => {
    animationClock.stepped = true;
  });
  afterEach(() => animationClock.reset());

  /** What is seen of the glass each frame: whole (W), not there (.), or part of the way (?). */
  async function timeline(
    tree: (ready: boolean) => React.ReactElement,
    frames = 50,
    first = true,
    start = false,
  ) {
    const view = await render(themed(tree(start)));
    if (!start) await view.rerender(themed(tree(first)));
    const seen: string[] = [];
    const look = () => {
      const glass = glassAncestors();
      const fade = glass.length ? mostFadedGlass() : 0;
      seen.push(fade === 1 ? 'W' : fade === 0 ? '.' : '?');
    };
    // The first frame, as it was committed, and then each frame after it.
    look();
    for (let frame = 0; frame < frames; frame += 1) {
      await advance(FRAME);
      await view.rerender(themed(tree(first)));
      look();
    }
    return seen.join('');
  }

  it('a Reveal brings glass in whole, once, and it never blinks: not there, then whole', async () => {
    const tree = () => (
      <Reveal>
        <Surface>
          <Text>On the glass</Text>
        </Surface>
      </Reveal>
    );
    expect(await timeline(tree, 50, true, true)).toMatch(/^\.*W+$/);
  });

  it('Resolve brings a glass block in whole, one item after another, with no blink', async () => {
    const page = (ready: boolean) => (
      <Resolve ready={ready} skeleton={<Text>Skeleton</Text>} each>
        <Surface key="a">
          <Text>First</Text>
        </Surface>
      </Resolve>
    );
    expect(await timeline(page, 50, true, false)).toMatch(/^\.*W+$/);
  });

  it('a skeleton’s glass is whole once its bars begin, and stays whole', async () => {
    const bars = () => (
      <Bars immediate>
        <Surface>
          <Text>Bars</Text>
        </Surface>
      </Bars>
    );
    expect(await timeline(bars, 20, true, true)).toMatch(/^\.*W+$/);
  });

  it('the words on the glass fade in as it arrives, and only they', async () => {
    const tree = () => (
      <Reveal>
        <Surface>
          <Text>On the glass</Text>
        </Surface>
      </Reveal>
    );
    const view = await render(themed(tree()));
    const fades: number[] = [];
    for (let frame = 0; frame < 40; frame += 1) {
      await advance(FRAME);
      await view.rerender(themed(tree()));
      fades.push(fadeOf('On the glass'));
    }
    expect(fades.at(-1)).toBe(1);
    expect(fades).toEqual([...fades].sort((a, b) => a - b));
  });
});
