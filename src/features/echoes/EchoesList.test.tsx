import { act, cleanup, fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';

import { mostFadedGlass } from '@/testing/glass';
import { animationClock, reanimatedMock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';
import type { EntrySummary } from '@/features/journal';

import { echoesCopy } from './echoesCopy';
import { EchoesList } from './EchoesList';

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));
const reduced = useReduceMotion as jest.Mock;

const realTiming = reanimatedMock.withTiming;
const delay = jest.spyOn(reanimatedMock, 'withDelay');
const timing = jest.spyOn(reanimatedMock, 'withTiming');

const wrap = (element: ReactElement) => <ThemeProvider crossfade={false}>{element}</ThemeProvider>;

const AT = new Date(2026, 10, 5, 9, 41).getTime();
const row = (id: string): EntrySummary => ({
  id,
  status: 'committed',
  readable: true,
  title: `Made-up ${id}`,
  preview: 'Made-up words',
  mode: 'text',
  durationSeconds: 300,
  hasAudio: false,
  recovered: false,
  createdAt: AT,
  updatedAt: AT,
  localDay: '2026-11-05',
});

beforeEach(() => {
  delay.mockClear();
  timing.mockClear();
  reduced.mockReturnValue(false);
});
afterEach(() => {
  timing.mockImplementation(realTiming as never);
  animationClock.reset();
});

describe('EchoesList while a search runs', () => {
  it('says the search is running, once, and hides the rows it is not offering', async () => {
    await render(<EchoesList rows={[row('a')]} onOpen={() => undefined} waiting />);
    const waiting = screen.getByLabelText(echoesCopy.searching);
    expect(waiting).toBeBusy();
    expect(screen.queryByTestId('echo-row-a')).toBeNull();
    expect(screen.getByTestId('echo-row-a', { includeHiddenElements: true })).toBeTruthy();
  });

  it('is not labelled, and its rows are there, when no search is running', async () => {
    await render(<EchoesList rows={[row('a')]} onOpen={() => undefined} />);
    expect(screen.queryByLabelText(echoesCopy.searching)).toBeNull();
    expect(screen.getByTestId('echo-row-a')).toBeTruthy();
  });

  it('dims to 0.6 only after 400 ms, over 320 ms, so a quick answer never dims it', async () => {
    await render(<EchoesList rows={[row('a')]} onOpen={() => undefined} waiting />);
    expect(delay).toHaveBeenCalledTimes(1);
    expect(delay.mock.calls[0]?.[0]).toBe(400);
    expect(timing).toHaveBeenCalledWith(0.6, expect.objectContaining({ duration: 320 }));
  });

  it('dims the rows on the glass and never the glass: a dimmed ancestor takes Android’s blur away', async () => {
    const view = await render(<EchoesList rows={[row('a')]} onOpen={() => undefined} waiting />);
    // Caught on the way to 0.6.
    timing.mockImplementation((() => 0.6) as never);
    await view.rerender(wrap(<EchoesList rows={[row('a')]} onOpen={() => undefined} waiting />));
    expect(mostFadedGlass()).toBe(1);
  });

  it('comes back over 180 ms when the answer lands', async () => {
    const view = await render(<EchoesList rows={[row('a')]} onOpen={() => undefined} waiting />);
    timing.mockClear();
    await view.rerender(wrap(<EchoesList rows={[row('a')]} onOpen={() => undefined} />));
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 180 }));
  });
});

// The walk (v10): a deleted echo stayed in the list for a moment, and then the rows below jumped up in
// one frame. A deleted row is held in its place while it leaves: it fades, and the rows below close
// the gap as it narrows to nothing, on the UI thread, in 240 ms.
describe('EchoesList when an echo is deleted', () => {
  const FRAME = 16;
  const three = [row('a'), row('b'), row('c')];
  const none: ReadonlySet<string> = new Set();
  // `render` wraps its element once; every redraw wraps its own, to keep the tree the same shape.
  const list = (rows: EntrySummary[], deleted = none, inView = true) =>
    wrap(<EchoesList rows={rows} onOpen={() => undefined} deleted={deleted} inView={inView} />);
  const first = (rows: EntrySummary[], inView = true) => (
    <EchoesList rows={rows} onOpen={() => undefined} inView={inView} />
  );
  const advance = (ms: number) =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  type Look = { opacity?: number; maxHeight?: number };
  const leaving = (id: string) =>
    screen.queryByTestId(`echo-row-${id}-leaving`, { includeHiddenElements: true });
  const lookOf = (id: string) => StyleSheet.flatten(leaving(id)?.props.style) as Look;
  const measured = (id: string, height: number) =>
    fireEvent(leaving(id)!, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 330, height } },
    });
  const deletedB = new Set(['b']);
  const withoutB = [three[0]!, three[2]!];

  beforeEach(() => {
    jest.useFakeTimers();
    animationClock.stepped = true;
  });
  afterEach(async () => {
    // Unmounts while the fake timers are still the clock: their timers are cleared with them.
    await cleanup();
    jest.useRealTimers();
  });

  it('holds the row in its place, hidden from everyone and untouchable, while it leaves', async () => {
    const view = await render(first(three));
    await view.rerender(list(withoutB, deletedB));
    // Still drawn, for the length of its exit: the rows below have not jumped up.
    expect(leaving('b')).toBeTruthy();
    expect(screen.queryByTestId('echo-row-b')).toBeNull();
    expect(leaving('b')?.props.pointerEvents).toBe('none');
    expect(screen.getByTestId('echo-row-a')).toBeTruthy();
    expect(screen.getByTestId('echo-row-c')).toBeTruthy();
  });

  it('fades and narrows to nothing, in step, and is gone when it has', async () => {
    const view = await render(first(three));
    await view.rerender(list(withoutB, deletedB));
    await measured('b', 68);
    const seen: Look[] = [];
    for (let at = 0; at < 300; at += FRAME) {
      await advance(FRAME);
      await view.rerender(list(withoutB, deletedB));
      if (leaving('b')) seen.push(lookOf('b'));
    }
    // Whole at 68 and fading as it narrows: neither goes back, and both reach nothing together.
    const heights = seen.map(({ maxHeight }) => maxHeight ?? 0);
    const opacity = seen.map((look) => look.opacity ?? 0);
    expect(heights[0]).toBeGreaterThan(40);
    expect(heights).toEqual([...heights].sort((a, b) => b - a));
    expect(opacity).toEqual([...opacity].sort((a, b) => b - a));
    expect(Math.max(...heights)).toBeLessThanOrEqual(68);
    // Gone, and what remains stays.
    expect(leaving('b')).toBeNull();
    expect(screen.getByTestId('echo-row-a')).toBeTruthy();
    expect(screen.getByTestId('echo-row-c')).toBeTruthy();
  });

  it('waits whole in its place while the page is not in view, and leaves once it is', async () => {
    // The walk (v11): the echo is deleted in the reader, above the list, and the row had faded and
    // narrowed away under the reader before the list was seen again. It waits for the page.
    const view = await render(first(three, false));
    await view.rerender(list(withoutB, deletedB, false));
    await measured('b', 68);
    for (let at = 0; at < 1000; at += 100) {
      await advance(100);
      await view.rerender(list(withoutB, deletedB, false));
      expect(lookOf('b').opacity ?? 1).toBe(1);
      expect(lookOf('b').maxHeight ?? 68).toBeGreaterThanOrEqual(68);
    }
    // The page is in view again: now it goes, and is seen going.
    await view.rerender(list(withoutB, deletedB, true));
    await advance(5 * FRAME);
    await view.rerender(list(withoutB, deletedB, true));
    expect(lookOf('b').opacity).toBeLessThan(1);
    expect(lookOf('b').opacity).toBeGreaterThan(0);
    expect(lookOf('b').maxHeight).toBeLessThan(68);
    await advance(400);
    await view.rerender(list(withoutB, deletedB, true));
    expect(leaving('b')).toBeNull();
  });

  it('never comes back once it has begun to leave, whatever the list is given while it goes', async () => {
    // The list is read again while the row leaves: an answer from before the deletion still names
    // it, one from after does not. The row is leaving either way, once, and then gone for good.
    const view = await render(first(three));
    await view.rerender(list(withoutB, deletedB));
    await measured('b', 68);
    await advance(3 * FRAME);
    await view.rerender(list(withoutB, none));
    expect(screen.queryByTestId('echo-row-b')).toBeNull();
    expect(leaving('b')).toBeTruthy();
    await advance(400);
    await view.rerender(list(withoutB, none));
    expect(leaving('b')).toBeNull();
    expect(screen.queryByTestId('echo-row-b', { includeHiddenElements: true })).toBeNull();
  });

  it('finishes leaving if the page goes out of view part of the way through', async () => {
    const view = await render(first(three));
    await view.rerender(list(withoutB, deletedB));
    await measured('b', 68);
    await advance(3 * FRAME);
    await view.rerender(list(withoutB, deletedB, false));
    await advance(400);
    await view.rerender(list(withoutB, deletedB, false));
    expect(leaving('b')).toBeNull();
  });

  it('still leaves if its size is never reported: it fades, and is taken away', async () => {
    const view = await render(first(three));
    await view.rerender(list(withoutB, deletedB));
    // Nothing says how big it is: it waits a little, and then goes anyway.
    await advance(300);
    await view.rerender(list(withoutB, deletedB));
    await advance(400);
    await view.rerender(list(withoutB, deletedB));
    expect(leaving('b')).toBeNull();
  });

  it('does not hold a row that left for any other reason: a search changes the rows, it deletes none', async () => {
    const view = await render(first(three));
    await view.rerender(list([three[0]!]));
    expect(leaving('b')).toBeNull();
    expect(leaving('c')).toBeNull();
    expect(screen.queryByTestId('echo-row-b', { includeHiddenElements: true })).toBeNull();
  });

  it('keeps the hairlines right: the first row that remains has none above it', async () => {
    const view = await render(first(three));
    const deletedA = new Set(['a']);
    await view.rerender(list([three[1]!, three[2]!], deletedA));
    await measured('a', 68);
    await advance(400);
    await view.rerender(list([three[1]!, three[2]!], deletedA));
    expect(leaving('a')).toBeNull();
    expect(screen.getByTestId('echo-row-b')).toBeTruthy();
  });

  it('rolls up a whole month when its only echo is deleted, glass and all, and does not fade the glass', async () => {
    const october = { ...row('old'), localDay: '2026-10-05' };
    const rows = [row('a'), october];
    const deletedOld = new Set(['old']);
    const view = await render(first(rows));
    await view.rerender(list([rows[0]!], deletedOld));
    expect(
      screen.queryByTestId('echo-month-2026-10-leaving', { includeHiddenElements: true }),
    ).toBeTruthy();
    // Glass loses its blur under a fading ancestor: the month narrows, it never fades.
    expect(mostFadedGlass()).toBe(1);
    await advance(300);
    await view.rerender(list([rows[0]!], deletedOld));
    await advance(400);
    await view.rerender(list([rows[0]!], deletedOld));
    expect(
      screen.queryByTestId('echo-month-2026-10-leaving', { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.getByTestId('echo-row-a')).toBeTruthy();
  });

  it('under Reduce Motion fades only: nothing narrows, and the gap closes when it has faded', async () => {
    reduced.mockReturnValue(true);
    const view = await render(first(three));
    await view.rerender(list(withoutB, deletedB));
    await measured('b', 68);
    await advance(96);
    await view.rerender(list(withoutB, deletedB));
    expect(lookOf('b').opacity).toBeLessThan(1);
    expect(lookOf('b').maxHeight ?? 68).toBeGreaterThanOrEqual(68);
    await advance(400);
    await view.rerender(list(withoutB, deletedB));
    expect(leaving('b')).toBeNull();
  });
});
