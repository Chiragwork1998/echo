import { act, render, screen } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Text } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';
import { reanimatedMock } from '@/testing/reanimatedMock';

import { Swap } from './Swap';

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;
const timing = jest.spyOn(reanimatedMock, 'withTiming');
const durations = () =>
  timing.mock.calls.map((call) => ((call as unknown[])[1] as { duration: number }).duration);

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

const swap = (contentKey: string, words: ReactNode) => (
  <ThemeProvider crossfade={false}>
    <Swap contentKey={contentKey}>{typeof words === 'string' ? <Text>{words}</Text> : words}</Swap>
  </ThemeProvider>
);

beforeEach(() => {
  jest.useFakeTimers();
  reduced.mockReturnValue(false);
  timing.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Swap', () => {
  it('shows what it is given, at rest: nothing arrives', async () => {
    await render(swap('recent', 'From your path'));
    expect(screen.getByText('From your path')).toBeTruthy();
    expect(timing).not.toHaveBeenCalled();
  });

  it('follows the same words as they change, without swapping: only a different key is a different thing', async () => {
    const view = await render(swap('draft-1', 'Seven minutes left'));
    await view.rerender(swap('draft-1', 'Six minutes left'));
    expect(screen.getByText('Six minutes left')).toBeTruthy();
    expect(screen.queryByText('Seven minutes left', { includeHiddenElements: true })).toBeNull();
    expect(timing).not.toHaveBeenCalled();
  });

  it('cross-fades one thing into another, in place: the old fades out as the new fades in', async () => {
    const view = await render(swap('recent', 'From your path'));
    await view.rerender(swap('draft-1', 'Continue an echo'));
    // Both are there while it happens: the new ready for everyone, the old hidden and untouchable.
    expect(screen.getByText('Continue an echo')).toBeTruthy();
    expect(screen.getByText('From your path', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('From your path')).toBeNull();
    expect(durations().sort((a, b) => a - b)).toEqual([200, 200]);
    await advance(300);
    expect(screen.queryByText('From your path', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('Continue an echo')).toBeTruthy();
  });

  it('under Reduce Motion cross-fades in 180 ms', async () => {
    reduced.mockReturnValue(true);
    const view = await render(swap('recent', 'From your path'));
    await view.rerender(swap('draft-1', 'Continue an echo'));
    expect(durations()).toEqual([180, 180]);
  });

  it('goes back and forth: a thing that changes twice in a row never leaves two of the old behind', async () => {
    const view = await render(swap('a', 'First'));
    await view.rerender(swap('b', 'Second'));
    await advance(100);
    await view.rerender(swap('c', 'Third'));
    expect(screen.getByText('Third')).toBeTruthy();
    await advance(400);
    expect(screen.queryByText('First', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('Second', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('Third')).toBeTruthy();
  });

  it('does not tear the new words down and draw them again when the old has gone', async () => {
    const mounted = jest.fn();
    function Words({ text }: { text: string }) {
      useEffect(() => mounted(text), [text]);
      return <Text>{text}</Text>;
    }
    const view = await render(swap('recent', <Words text="From your path" />));
    await view.rerender(swap('draft-1', <Words text="Continue an echo" />));
    await advance(400);
    expect(mounted.mock.calls.map(([text]) => text)).toEqual([
      'From your path',
      'Continue an echo',
    ]);
  });
});
