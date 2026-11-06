import { act, renderHook } from '@testing-library/react-native';

import { SESSION_SECONDS, formatClock } from './geometry';
import { useSessionTimer } from './useSessionTimer';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

describe('useSessionTimer', () => {
  it('rests at seven minutes until it is started', async () => {
    const { result } = await renderHook(() => useSessionTimer());
    await advance(5000);
    expect(result.current.remaining).toBe(SESSION_SECONDS);
    expect(result.current.state).toBe('idle');
  });

  it('counts down from the first start', async () => {
    const { result } = await renderHook(() => useSessionTimer());
    await act(async () => result.current.start());
    await advance(3000);
    expect(result.current.remaining).toBe(SESSION_SECONDS - 3);
    expect(result.current.state).toBe('active');
  });

  it('carries on from time already spent on a continued draft', async () => {
    const { result } = await renderHook(() => useSessionTimer(120));
    expect(result.current.remaining).toBe(300);
  });

  it('rests at zero without stopping the count of elapsed time', async () => {
    const { result } = await renderHook(() => useSessionTimer(SESSION_SECONDS - 1));
    await act(async () => result.current.start());
    await advance(4000);
    expect(result.current.remaining).toBe(0);
    expect(result.current.state).toBe('complete');
    expect(result.current.elapsed).toBe(SESSION_SECONDS + 3);
  });
});

describe('formatClock', () => {
  it('writes minutes and padded seconds', () => {
    expect(formatClock(420)).toBe('7:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});
