import { act, cleanup, fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';
import { glassAncestors, mostFadedGlass } from '@/testing/glass';
import { animationClock, reanimatedMock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { PanelSwap, type Face } from './PanelSwap';

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;
const timing = jest.spyOn(reanimatedMock, 'withTiming');
const durations = () =>
  timing.mock.calls.map((call) => ((call as unknown[])[1] as { duration: number }).duration);

const face = (key: string, strong = false): Face => ({
  key,
  strong,
  glass: <Text>{`${key} words`}</Text>,
  below: <Text>{`${key} action`}</Text>,
});
// `render` wraps its element once; every redraw wraps its own, to keep the tree the same shape.
const wrap = (element: ReactElement) => <ThemeProvider crossfade={false}>{element}</ThemeProvider>;
const panel = (shown: Face) => <PanelSwap face={shown} testID="panel" />;

/** How see-through some words are as drawn: the least opacity of them and all above them. */
const seen = (text: string) => {
  const words = screen.queryByText(text, { includeHiddenElements: true });
  if (!words) return 0;
  let least = 1;
  for (let node = words.parent; node; node = node.parent) {
    const opacity = (StyleSheet.flatten(node.props.style) as { opacity?: number } | undefined)
      ?.opacity;
    least = Math.min(least, opacity ?? 1);
  }
  return least;
};
const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
const laidOut = (id: string, height: number) =>
  fireEvent(screen.getByTestId(id, { includeHiddenElements: true }), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 345, height } },
  });
type Size = { height?: number; minHeight?: number; maxHeight?: number; overflow?: string };
const sizeOf = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style) as Size;

beforeEach(() => {
  jest.useFakeTimers();
  animationClock.stepped = true;
  reduced.mockReturnValue(false);
  timing.mockClear();
});
afterEach(async () => {
  await cleanup();
  animationClock.reset();
  jest.useRealTimers();
});

describe('PanelSwap', () => {
  it('draws the face it is given at rest: nothing arrives', async () => {
    await render(panel(face('intro')));
    expect(seen('intro words')).toBe(1);
    expect(seen('intro action')).toBe(1);
    expect(durations().filter((ms) => ms !== 320)).toEqual([]);
    expect(timing.mock.calls.every((call) => (call as unknown[])[0] === 0)).toBe(true);
  });

  it('cross-fades one face into the next on the same glass, which is whole throughout', async () => {
    const view = await render(panel(face('intro')));
    const pieces = glassAncestors().length;
    await view.rerender(wrap(panel(face('consent', true))));
    // The frame of the change: the old face whole, the new one not yet shown, and only the new one
    // to be touched or heard.
    expect(seen('intro words')).toBe(1);
    expect(seen('consent words')).toBe(0);
    expect(screen.queryByText('intro words')).toBeNull();
    expect(screen.getByText('consent words')).toBeTruthy();
    expect(mostFadedGlass()).toBe(1);
    const looks: [number, number][] = [];
    for (let at = 0; at < 320; at += 32) {
      await advance(32);
      await view.rerender(wrap(panel(face('consent', true))));
      looks.push([seen('intro words'), seen('consent words')]);
      expect(mostFadedGlass()).toBe(1);
      expect(glassAncestors()).toHaveLength(pieces);
    }
    // One goes as the other comes, the actions under the glass with them.
    const going = looks.map(([old]) => old);
    const coming = looks.map(([, next]) => next);
    expect(going).toEqual([...going].sort((a, b) => b - a));
    expect(coming).toEqual([...coming].sort((a, b) => a - b));
    expect(going.some((value) => value > 0 && value < 1)).toBe(true);
    expect(coming.some((value) => value > 0 && value < 1)).toBe(true);
    await advance(200);
    await view.rerender(wrap(panel(face('consent', true))));
    expect(screen.queryByText('intro words', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('intro action', { includeHiddenElements: true })).toBeNull();
    expect(seen('consent words')).toBe(1);
    expect(seen('consent action')).toBe(1);
  });

  it('follows a face whose words change without a change of face: nothing fades', async () => {
    const view = await render(panel(face('consent')));
    timing.mockClear();
    await view.rerender(
      wrap(panel({ ...face('consent'), glass: <Text>Six entries will be sent.</Text> })),
    );
    expect(seen('Six entries will be sent.')).toBe(1);
    expect(screen.queryByText('consent words', { includeHiddenElements: true })).toBeNull();
    expect(durations()).toEqual([]);
  });

  it('keeps its height in the commit that begins a change, eases it to the new face’s, and lets go', async () => {
    const view = await render(panel(face('intro')));
    await laidOut('panel-glass-intro', 120);
    await laidOut('panel-below-intro', 72);
    await view.rerender(wrap(panel(face('consent', true))));
    // Fixed at what it was, with nothing yet held on the UI thread.
    expect(sizeOf('panel-glass').height).toBe(120);
    expect(sizeOf('panel-below').height).toBe(72);
    // What is under the glass is cut at its edge while it is held.
    expect(sizeOf('panel-below').overflow).toBe('hidden');
    await laidOut('panel-glass-consent', 460);
    await laidOut('panel-below-consent', 120);
    await advance(160);
    await view.rerender(wrap(panel(face('consent', true))));
    const glass = sizeOf('panel-glass');
    expect(glass.maxHeight).toBeGreaterThan(120);
    expect(glass.maxHeight).toBeLessThan(460);
    expect(glass.minHeight).toBe(glass.maxHeight);
    const below = sizeOf('panel-below');
    expect(below.maxHeight).toBeGreaterThan(72);
    expect(below.maxHeight).toBeLessThan(120);
    await advance(400);
    await view.rerender(wrap(panel(face('consent', true))));
    // Let go: its own height again, held by nothing, and nothing cut.
    for (const id of ['panel-glass', 'panel-below']) {
      expect(sizeOf(id).height).toBeUndefined();
      expect(sizeOf(id).maxHeight).toBeGreaterThan(10000);
    }
    expect(sizeOf('panel-below').overflow).toBeUndefined();
  });

  it('under Reduce Motion cross-fades in 180 ms, and the height does not travel', async () => {
    reduced.mockReturnValue(true);
    const view = await render(panel(face('consent', true)));
    await laidOut('panel-glass-consent', 460);
    timing.mockClear();
    await view.rerender(wrap(panel(face('reading', true))));
    await laidOut('panel-glass-reading', 200);
    expect(durations()).toEqual(expect.arrayContaining([180, 180]));
    expect(durations()).not.toContain(320);
    // Held at the larger of the two while they cross, then the new face's own.
    await advance(16);
    await view.rerender(wrap(panel(face('reading', true))));
    expect(sizeOf('panel-glass').maxHeight).toBe(460);
    await advance(300);
    await view.rerender(wrap(panel(face('reading', true))));
    expect(sizeOf('panel-glass').maxHeight).toBeGreaterThan(10000);
  });

  it('changed again before the last change is over, lets every going face go together', async () => {
    const view = await render(panel(face('intro')));
    await view.rerender(wrap(panel(face('consent', true))));
    await advance(100);
    await view.rerender(wrap(panel(face('reading', true))));
    expect(screen.getByText('reading words')).toBeTruthy();
    await advance(500);
    await view.rerender(wrap(panel(face('reading', true))));
    expect(screen.queryByText('intro words', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('consent words', { includeHiddenElements: true })).toBeNull();
    expect(seen('reading words')).toBe(1);
  });
});
