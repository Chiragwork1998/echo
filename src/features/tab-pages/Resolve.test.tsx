import { act, render, screen } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';
import { reanimatedMock } from '@/testing/reanimatedMock';

import { Notice } from './parts';
import { ArriveInOrder, Bars, Resolve } from './Resolve';

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;
const timing = jest.spyOn(reanimatedMock, 'withTiming');
const delay = jest.spyOn(reanimatedMock, 'withDelay');

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

const asked = () =>
  timing.mock.calls.map((call) => ((call as unknown[])[1] as { duration: number }).duration);
const waits = () => delay.mock.calls.map(([ms]) => ms as number);

const Skeleton = () => <Text>Skeleton</Text>;

const resolve = (ready: boolean, children = <Text>Arrived</Text>, props = {}) => (
  <Resolve ready={ready} skeleton={<Skeleton />} {...props}>
    {children}
  </Resolve>
);

beforeEach(() => {
  jest.useFakeTimers();
  reduced.mockReturnValue(false);
  timing.mockClear();
  delay.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Resolve', () => {
  it('shows the skeleton, and not the content, until it is ready', async () => {
    await render(resolve(false));
    expect(screen.getByText('Skeleton')).toBeTruthy();
    expect(screen.queryByText('Arrived')).toBeNull();
  });

  it('shows the content, and no skeleton, once it is ready', async () => {
    const view = await render(resolve(false));
    await view.rerender(resolve(true));
    expect(screen.getByText('Arrived')).toBeTruthy();
    await advance(1000);
    expect(screen.queryByText('Skeleton', { includeHiddenElements: true })).toBeNull();
  });

  it('draws content that was ready from the first moment at rest: it did not arrive', async () => {
    await render(resolve(true));
    expect(screen.getByText('Arrived')).toBeTruthy();
    expect(screen.queryByText('Skeleton')).toBeNull();
    expect(timing).not.toHaveBeenCalled();
  });

  it('fades the content in over 240 ms when the skeleton never showed', async () => {
    const view = await render(resolve(false));
    await advance(100);
    await view.rerender(resolve(true));
    expect(asked()).toEqual([240]);
    // And there is no skeleton left to take away.
    expect(screen.queryByText('Skeleton', { includeHiddenElements: true })).toBeNull();
  });

  it('arrives over 320 ms where the bars were, and takes the skeleton away over 180, once they showed', async () => {
    const view = await render(resolve(false));
    await advance(300);
    timing.mockClear();
    await view.rerender(resolve(true));
    expect(asked().sort((a, b) => a - b)).toEqual([180, 320]);
    // The skeleton is still there, hidden from everyone, while it fades under the words.
    expect(screen.getByText('Skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Skeleton')).toBeNull();
    await advance(240);
    expect(screen.queryByText('Skeleton', { includeHiddenElements: true })).toBeNull();
  });

  it('under Reduce Motion cross-fades in 180 ms, with no wait', async () => {
    reduced.mockReturnValue(true);
    const view = await render(resolve(false));
    await advance(300);
    timing.mockClear();
    delay.mockClear();
    await view.rerender(resolve(true));
    expect(asked()).toContain(180);
    expect(waits().every((ms) => ms === 0)).toBe(true);
  });

  it('goes back to the skeleton if what it waited on is waited on again', async () => {
    const view = await render(resolve(true));
    await view.rerender(resolve(false));
    expect(screen.getByText('Skeleton')).toBeTruthy();
    expect(screen.queryByText('Arrived')).toBeNull();
  });
});

describe('Resolve on a page’s first wait (atOnce)', () => {
  // The walk (v11): tabs tapped quickly showed Echoes, then Patterns, as a heading on bare sky for
  // half a second before any glass came. The page's first wait draws its skeleton with the heading.
  const barred = (ready: boolean, atOnce = true) => (
    <Resolve
      ready={ready}
      skeleton={
        <Bars>
          <Text>Bar</Text>
        </Bars>
      }
      atOnce={atOnce}
    >
      <Text>Arrived</Text>
    </Resolve>
  );
  /** How see-through the bars are as drawn: the least opacity of them and everything above them. */
  const barsSeen = () => {
    let seen = 1;
    for (
      let node = screen.getByText('Bar', { includeHiddenElements: true }).parent;
      node;
      node = node.parent
    ) {
      const opacity = (StyleSheet.flatten(node.props.style) as { opacity?: number } | undefined)
        ?.opacity;
      seen = Math.min(seen, opacity ?? 1);
    }
    return seen;
  };

  it('draws the skeleton whole from the first frame, with nothing to fade in', async () => {
    await render(barred(false));
    expect(barsSeen()).toBe(1);
    expect(asked()).toEqual([]);
  });

  it('without it, keeps the skeleton undrawn for a quarter of a second', async () => {
    await render(barred(false, false));
    expect(barsSeen()).toBe(0);
  });

  it('hands a quick answer over as one: it arrives over the skeleton, which goes under it', async () => {
    const view = await render(barred(false));
    await advance(100);
    await view.rerender(barred(true));
    expect(screen.getByText('Arrived')).toBeTruthy();
    expect(screen.getByText('Bar', { includeHiddenElements: true })).toBeTruthy();
    expect(asked().sort((a, b) => a - b)).toEqual([180, 240]);
    await advance(1000);
    expect(screen.queryByText('Bar', { includeHiddenElements: true })).toBeNull();
  });

  it('lets what comes after a long first wait arrive in its own order, as after any long wait', async () => {
    const rowsOf = (ready: boolean) => (
      <Resolve ready={ready} skeleton={<Skeleton />} rows atOnce>
        <ArriveInOrder index={0} step={40} cap={8}>
          <Text>First</Text>
        </ArriveInOrder>
        <ArriveInOrder index={2} step={40} cap={8}>
          <Text>Third</Text>
        </ArriveInOrder>
      </Resolve>
    );
    const quick = await render(rowsOf(false));
    await advance(100);
    delay.mockClear();
    await quick.rerender(rowsOf(true));
    // Quick: one block, no row waits its turn.
    expect(waits()).toEqual([0]);
    await quick.unmount();

    const slow = await render(rowsOf(false));
    await advance(300);
    delay.mockClear();
    await slow.rerender(rowsOf(true));
    expect(waits()).toEqual([0, 80]);
  });

  it('keeps the pause for every later wait: only the first is the page’s', async () => {
    const view = await render(barred(true));
    await view.rerender(barred(false));
    expect(barsSeen()).toBe(0);
    await advance(300);
    await view.rerender(barred(false));
    expect(barsSeen()).toBe(1);
  });
});

describe('Resolve staggering', () => {
  const lines = (count: number) =>
    Array.from({ length: count }, (_, i) => <Text key={i}>{`Line ${i}`}</Text>);

  it('waits 0, 50, 100 … 250 ms and never longer, whatever the count', async () => {
    const wrapped = (ready: boolean) => (
      <Resolve ready={ready} skeleton={<Skeleton />} each>
        {lines(9)}
      </Resolve>
    );
    const view = await render(wrapped(false));
    await advance(300);
    delay.mockClear();
    await view.rerender(wrapped(true));
    expect(waits()).toEqual([0, 50, 100, 150, 200, 250, 250, 250, 250]);
  });
});

describe('ArriveInOrder', () => {
  const rows = (ready: boolean) => (
    <Resolve ready={ready} skeleton={<Skeleton />} rows>
      <ArriveInOrder index={0} step={40} cap={8}>
        <Text>First</Text>
      </ArriveInOrder>
      <ArriveInOrder index={9} step={40} cap={8}>
        <Text>Ninth</Text>
      </ArriveInOrder>
    </Resolve>
  );

  it('waits its turn, 40 ms a place and never past the eighth, only when arriving from a seen skeleton', async () => {
    const view = await render(rows(false));
    await advance(300);
    delay.mockClear();
    await view.rerender(rows(true));
    expect(waits()).toEqual([0, 280]);
  });

  it('is simply there when the skeleton never showed: the whole arrives as one', async () => {
    const view = await render(rows(false));
    await advance(100);
    delay.mockClear();
    await view.rerender(rows(true));
    // One block fade, no per-row wait.
    expect(waits()).toEqual([0]);
  });

  it('is simply there when it is drawn without a Resolve', async () => {
    await render(
      <ArriveInOrder index={3} step={40} cap={8}>
        <Text>Alone</Text>
      </ArriveInOrder>,
    );
    expect(screen.getByText('Alone')).toBeTruthy();
    expect(delay).not.toHaveBeenCalled();
  });
});

describe('Bars', () => {
  it('stays mounted from the first moment but draws nothing for a quarter of a second', async () => {
    await render(
      <Bars>
        <Text>Bar</Text>
      </Bars>,
    );
    expect(screen.getByText('Bar')).toBeTruthy();
    expect(asked()).toEqual([]);
    timing.mockClear();
    await advance(239);
    expect(asked()).toEqual([]);
    await advance(1);
    expect(asked()).toEqual([200]);
  });

  it('appears by opacity alone in 180 ms under Reduce Motion', async () => {
    reduced.mockReturnValue(true);
    await render(
      <Bars>
        <Text>Bar</Text>
      </Bars>,
    );
    timing.mockClear();
    await advance(240);
    expect(asked()).toEqual([180]);
  });

  it('draws at once when it is known to be a long wait: there is nothing to wait for', async () => {
    await render(
      <Bars immediate>
        <Text>Bar</Text>
      </Bars>,
    );
    expect(screen.getByText('Bar')).toBeTruthy();
    expect(asked()).toEqual([]);
  });
});

describe('Resolve keeps its container’s rhythm', () => {
  it('gives each wrapper the container’s gap, so siblings in a fragment do not touch', async () => {
    const view = await render(
      <Resolve ready={false} skeleton={<Skeleton />} style={{ gap: 24 }}>
        <Text>Placeholder</Text>
      </Resolve>,
    );
    await advance(100);
    await view.rerender(
      <Resolve ready skeleton={<Skeleton />} style={{ gap: 24 }}>
        <>
          <Text>One</Text>
          <Text>Two</Text>
        </>
      </Resolve>,
    );
    const wrapper = screen.getByText('One').parent;
    expect(StyleSheet.flatten(wrapper?.props.style)).toMatchObject({ gap: 24 });
  });

  it('adds no gap of its own when the container has none', async () => {
    const view = await render(resolve(false));
    await advance(100);
    await view.rerender(resolve(true));
    const wrapper = screen.getByText('Arrived').parent;
    expect(StyleSheet.flatten(wrapper?.props.style)).not.toHaveProperty('gap');
  });
});

describe('Resolve keeps what it holds, by key', () => {
  it('does not rebuild an item when an optional one before it comes and goes', async () => {
    let mounts = 0;
    const Counted = () => {
      const [id] = useState(() => ++mounts);
      return <Text>{`Card ${id}`}</Text>;
    };
    const page = (error: boolean) => (
      <Resolve ready skeleton={<Skeleton />} each>
        {error && <Text key="error">Error</Text>}
        <Counted key="card" />
      </Resolve>
    );
    const view = await render(page(false));
    expect(screen.getByText('Card 1')).toBeTruthy();
    await view.rerender(page(true));
    await view.rerender(page(false));
    expect(mounts).toBe(1);
  });
});

describe('Resolve and a Notice, which arrives by itself', () => {
  const themed = (element: ReactElement) => (
    <ThemeProvider crossfade={false}>{element}</ThemeProvider>
  );
  const notice = (ready: boolean) =>
    themed(
      <Resolve ready={ready} skeleton={<Skeleton />}>
        <Notice message="Something went quietly wrong." />
      </Resolve>,
    );

  it('arrives once, not twice: the outer arrival is the only one', async () => {
    const view = await render(notice(false));
    await advance(100);
    timing.mockClear();
    await view.rerender(notice(true));
    expect(asked()).toEqual([240]);
  });

  it('still arrives by itself when it appears on its own, outside any Resolve', async () => {
    timing.mockClear();
    await render(themed(<Notice message="Something went quietly wrong." />));
    expect(asked()).toEqual([320]);
  });

  it('still arrives by itself when it appears long after the page has settled', async () => {
    const view = await render(
      themed(
        <Resolve ready skeleton={<Skeleton />}>
          <Text>Page</Text>
        </Resolve>,
      ),
    );
    await advance(2000);
    timing.mockClear();
    await view.rerender(
      themed(
        <Resolve ready skeleton={<Skeleton />}>
          <>
            <Text>Page</Text>
            <Notice message="Something went quietly wrong." />
          </>
        </Resolve>,
      ),
    );
    expect(asked()).toEqual([320]);
  });
});
