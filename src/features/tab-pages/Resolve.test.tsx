import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useReduceMotion } from '@/design/useReduceMotion';
import { reanimatedMock } from '@/testing/reanimatedMock';

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
