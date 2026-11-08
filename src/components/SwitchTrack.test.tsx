import { act, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { reanimatedMock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { KNOB_OFF_X, KNOB_ON_X, SwitchTrack, TRACK, TRAVEL, warm } from './SwitchTrack';

jest.mock('@/design/haptics');
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;
const timing = jest.spyOn(reanimatedMock, 'withTiming');
const wrap = (element: ReactElement) => <ThemeProvider crossfade={false}>{element}</ThemeProvider>;

type Drawn = {
  opacity?: number;
  width?: number;
  height?: number;
  borderWidth?: number;
  transform?: ({ translateX: number } | { scale: number })[];
};
const drawn = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style) as Drawn;
const x = (id: string) =>
  (drawn(id).transform?.find((part) => 'translateX' in part) as { translateX: number }).translateX;
const scale = (id: string) =>
  (drawn(id).transform?.find((part) => 'scale' in part) as { scale: number }).scale;

const wait = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  reduced.mockReturnValue(false);
  timing.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('SwitchTrack, as the Privacy golden draws it', () => {
  it('puts the knob at 1.5 off and 19.5 on, 24 across in a 44 by 25 track', async () => {
    expect([KNOB_OFF_X, KNOB_ON_X, TRAVEL]).toEqual([1.5, 19.5, 18]);
    expect(TRACK).toEqual({ width: 44, height: 25 });
    const off = await render(<SwitchTrack value={false} />);
    expect(x('switch-knob')).toBe(1.5);
    expect(drawn('switch-knob')).toMatchObject({ width: 24, height: 24 });
    await off.unmount();
    await render(<SwitchTrack value />);
    expect(x('switch-knob')).toBe(19.5);
  });

  it('shows the 1 pt ring off and the warm fill on, and never both', async () => {
    const off = await render(<SwitchTrack value={false} />);
    expect(drawn('switch-ring').opacity).toBe(1);
    expect(drawn('switch-fill').opacity).toBe(0);
    await off.unmount();
    await render(<SwitchTrack value />);
    expect(drawn('switch-ring').opacity).toBe(0);
    expect(drawn('switch-fill').opacity).toBe(1);
    expect(scale('switch-fill')).toBe(1);
  });

  it('keeps the track the same size, with no border of its own, in both states', async () => {
    for (const value of [false, true]) {
      const view = await render(<SwitchTrack value={value} />);
      const track = drawn('switch-track');
      expect(track).toMatchObject({ width: 44, height: 25 });
      expect(track.borderWidth).toBeUndefined();
      await view.unmount();
    }
  });

  it('draws the ring as a permanent 1 pt layer, so the knob has nothing to hop over', async () => {
    await render(<SwitchTrack value={false} />);
    expect(drawn('switch-ring').borderWidth).toBe(1);
  });

  it('gathers its warmth from a fifth of its size, at rest centred on the knob when off', async () => {
    await render(<SwitchTrack value={false} />);
    expect(scale('switch-fill')).toBeCloseTo(0.2, 5);
    expect(x('switch-fill')).toBe(0);
    expect(drawn('switch-fill')).toMatchObject({ width: 66, height: 66 });
  });

  it('fills with accentWarm at 70 percent, as an rgba() so it survives a theme that is changing', () => {
    expect(warm('#E8CCA0', 0.7)).toBe('rgba(232, 204, 160, 0.7)');
    expect(warm('rgba(232, 204, 160, 0.5)', 0.7)).toBe('rgba(232, 204, 160, 0.7)');
    expect(warm('not a colour', 0.7)).toBe('not a colour');
  });
});

describe('SwitchTrack moving', () => {
  it('moves over 320 ms on the shared ease when the value changes', async () => {
    const view = await render(<SwitchTrack value={false} />);
    timing.mockClear();
    await view.rerender(wrap(<SwitchTrack value />));
    expect(timing).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ duration: tokens.motion.standard }),
    );
  });

  it('under Reduce Motion places the knob at once and fades the colour over 180 ms', async () => {
    reduced.mockReturnValue(true);
    const view = await render(<SwitchTrack value={false} />);
    timing.mockClear();
    await view.rerender(wrap(<SwitchTrack value />));
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 180 }));
    expect(x('switch-knob')).toBe(19.5);
  });
});

describe('SwitchTrack pressed', () => {
  it('gathers a halo in 120 ms and lets it go over 320', async () => {
    const view = await render(<SwitchTrack value={false} />);
    timing.mockClear();
    await view.rerender(wrap(<SwitchTrack value={false} pressed />));
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 120 }));
    timing.mockClear();
    await view.rerender(wrap(<SwitchTrack value={false} />));
    expect(timing).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 320 }));
  });

  it('has no halo under Reduce Motion', async () => {
    reduced.mockReturnValue(true);
    const view = await render(<SwitchTrack value={false} />);
    timing.mockClear();
    await view.rerender(wrap(<SwitchTrack value={false} pressed />));
    expect(timing).not.toHaveBeenCalledWith(1, expect.objectContaining({ duration: 120 }));
  });
});

describe('SwitchTrack, felt', () => {
  it('says nothing on mount', async () => {
    await render(<SwitchTrack value />);
    await wait(500);
    expect(cue).not.toHaveBeenCalled();
  });

  it('clicks on 45 ms after it turns on, once, and off 45 ms after it turns off', async () => {
    const view = await render(<SwitchTrack value={false} />);
    await view.rerender(wrap(<SwitchTrack value />));
    await wait(44);
    expect(cue).not.toHaveBeenCalled();
    await wait(1);
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenLastCalledWith('on');
    await view.rerender(wrap(<SwitchTrack value={false} />));
    await wait(45);
    expect(cue).toHaveBeenCalledTimes(2);
    expect(cue).toHaveBeenLastCalledWith('off');
    await wait(500);
    expect(cue).toHaveBeenCalledTimes(2);
  });

  it('clicks even under Reduce Motion: haptics are kept', async () => {
    reduced.mockReturnValue(true);
    const view = await render(<SwitchTrack value={false} />);
    await view.rerender(wrap(<SwitchTrack value />));
    await wait(45);
    expect(cue).toHaveBeenCalledWith('on');
  });

  it('does not click if it is gone before the knob reaches the middle', async () => {
    const view = await render(<SwitchTrack value={false} />);
    await view.rerender(wrap(<SwitchTrack value />));
    await view.unmount();
    await wait(200);
    expect(cue).not.toHaveBeenCalled();
  });
});
