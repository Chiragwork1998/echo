import { act, renderHook } from '@testing-library/react-native';

import { useSettledText } from './useSettledText';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

describe('useSettledText', () => {
  it('shows the first text at once', async () => {
    const { result } = await renderHook(() => useSettledText('a made-up word', 300));
    expect(result.current).toMatchObject({ text: 'a made-up word', visible: true, back: false });
  });

  it('lets the old text fade out first, and takes the new one in after it has gone', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string | null }) => useSettledText(value, 300),
      { initialProps: { value: 'first' } },
    );
    await rerender({ value: 'second' });
    expect(result.current).toMatchObject({ text: 'first', visible: false });
    await settle(299);
    expect(result.current).toMatchObject({ text: 'first', visible: false });
    await settle(1);
    expect(result.current).toMatchObject({ text: 'second', visible: true, back: false });
  });

  it('keeps text that is going away on screen while it fades, then lets it go', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string | null }) => useSettledText(value, 300),
      { initialProps: { value: 'first' as string | null } },
    );
    await rerender({ value: null });
    expect(result.current).toMatchObject({ text: 'first', visible: false });
    await settle(300);
    expect(result.current).toMatchObject({ text: null, visible: false });
  });

  it('shows text that comes from nothing at once, and says it is coming back once something was shown', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string | null }) => useSettledText(value, 300),
      { initialProps: { value: null as string | null } },
    );
    expect(result.current).toMatchObject({ text: null, visible: false });
    await rerender({ value: 'first' });
    expect(result.current).toMatchObject({ text: 'first', visible: true, back: false });
    await rerender({ value: null });
    await settle(300);
    await rerender({ value: 'second' });
    // It came back after the screen had been away: a person wakes it, and it can wait for the light.
    expect(result.current).toMatchObject({ text: 'second', visible: true, back: true });
  });

  it('ends visible when the text changes and changes back within the fade', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string | null }) => useSettledText(value, 300),
      { initialProps: { value: 'a' as string | null } },
    );
    await rerender({ value: 'b' });
    await settle(100);
    await rerender({ value: 'a' });
    expect(result.current).toMatchObject({ text: 'a', visible: true });
    await settle(1000);
    expect(result.current).toMatchObject({ text: 'a', visible: true });
  });

  it('comes back after being away again within the fade, without any of it being lost', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string | null }) => useSettledText(value, 300),
      { initialProps: { value: 'a' as string | null } },
    );
    await rerender({ value: null });
    await settle(100);
    await rerender({ value: 'a' });
    expect(result.current).toMatchObject({ text: 'a', visible: true });
  });
});
