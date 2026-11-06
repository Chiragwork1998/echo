import { renderHook } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { useLayout } from './layout';

function setWindow(width: number, height: number, fontScale = 1) {
  const metrics = { width, height, scale: 2, fontScale };
  Dimensions.set({ window: metrics, screen: metrics });
}

const layout = async () => (await renderHook(() => useLayout())).result.current;

describe('useLayout on a tablet', () => {
  it('centres a 430 pt column and never lets it grow', async () => {
    setWindow(768, 1024);
    expect((await layout()).width).toBe(430);
    setWindow(1194, 834);
    expect((await layout()).width).toBe(430);
  });

  it('keeps type and buttons at their phone sizes', async () => {
    setWindow(1024, 1366);
    const { ctaWidth, gutter } = await layout();
    expect(gutter).toBe(28);
    expect(ctaWidth).toBe(374);
  });

  it('does not pin controls to the photograph', async () => {
    setWindow(768, 1024);
    expect((await layout()).sceneryFits).toBe(false);
    setWindow(601, 962);
    expect((await layout()).sceneryFits).toBe(false);
  });
});

describe('useLayout on a phone', () => {
  it.each([
    [320, 568],
    [360, 780],
    [393, 852],
    [430, 932],
    [440, 956],
  ])('pins controls to the photograph at %i x %i', async (width, height) => {
    setWindow(width, height);
    expect((await layout()).sceneryFits).toBe(true);
  });

  it('falls back to lists in landscape and at large text', async () => {
    setWindow(852, 393);
    expect((await layout()).sceneryFits).toBe(false);
    setWindow(393, 852, 1.25);
    expect((await layout()).sceneryFits).toBe(false);
    setWindow(393, 852, 1.2);
    expect((await layout()).sceneryFits).toBe(true);
  });
});
