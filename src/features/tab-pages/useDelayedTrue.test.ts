import { act, renderHook } from '@testing-library/react-native';

import { useDelayedTrue } from './useDelayedTrue';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const wait = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

describe('useDelayedTrue', () => {
  it('says nothing before the delay, and true after it', async () => {
    const { result } = await renderHook(() => useDelayedTrue(true, 240));
    expect(result.current).toBe(false);
    await wait(239);
    expect(result.current).toBe(false);
    await wait(1);
    expect(result.current).toBe(true);
  });

  it('is false at once when the value is false, and never starts a timer for it', async () => {
    const { result } = await renderHook(() => useDelayedTrue(false, 240));
    await wait(1000);
    expect(result.current).toBe(false);
  });

  it('resets: a value that falls and rises again waits the whole delay again', async () => {
    const { result, rerender } = await renderHook((value: boolean) => useDelayedTrue(value, 240), {
      initialProps: true,
    });
    await wait(300);
    expect(result.current).toBe(true);
    await rerender(false);
    expect(result.current).toBe(false);
    await rerender(true);
    expect(result.current).toBe(false);
    await wait(200);
    expect(result.current).toBe(false);
    await wait(60);
    expect(result.current).toBe(true);
  });

  it('never fires for a value that fell before the delay', async () => {
    const { result, rerender } = await renderHook((value: boolean) => useDelayedTrue(value, 240), {
      initialProps: true,
    });
    await wait(100);
    await rerender(false);
    await wait(500);
    expect(result.current).toBe(false);
  });
});
