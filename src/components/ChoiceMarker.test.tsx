import { screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { reanimatedMock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { ChoiceMarker } from './ChoiceMarker';

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;
const timing = jest.spyOn(reanimatedMock, 'withTiming');
const wrap = (element: ReactElement) => <ThemeProvider crossfade={false}>{element}</ThemeProvider>;
const night = tokens.color.night;

type Drawn = {
  opacity?: number;
  borderColor?: string;
  boxShadow?: string;
  transform?: { scale: number }[];
};
const drawn = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style) as Drawn;
const durations = () =>
  timing.mock.calls.map((call) => ((call as unknown[])[1] as { duration: number }).duration);

beforeEach(() => {
  reduced.mockReturnValue(false);
  timing.mockClear();
});

describe('ChoiceMarker at rest', () => {
  it('selected is the warm ring with its glow and the whole dot, as it was drawn before', async () => {
    await render(<ChoiceMarker selected />);
    expect(drawn('marker-warm')).toMatchObject({
      opacity: 1,
      borderColor: night.accentWarm,
      boxShadow: tokens.shadow.glow,
    });
    expect(drawn('marker-ring').opacity).toBe(0);
    expect(drawn('marker-dot')).toMatchObject({ opacity: 1, transform: [{ scale: 1 }] });
    expect(drawn('marker-ripple').opacity).toBe(0);
  });

  it('unselected is the cream ring, no glow, no dot', async () => {
    await render(<ChoiceMarker selected={false} />);
    expect(drawn('marker-ring')).toMatchObject({ opacity: 1, borderColor: night.textPrimary });
    expect(drawn('marker-warm').opacity).toBe(0);
    expect(drawn('marker-dot').opacity).toBe(0);
  });

  it('keeps the cream ring cream in both states: only its opacity changes', async () => {
    await render(<ChoiceMarker selected />);
    expect(drawn('marker-ring').borderColor).toBe(night.textPrimary);
  });

  it('draws nothing when it appears already chosen: it was there, it did not arrive', async () => {
    await render(<ChoiceMarker selected />);
    expect(timing).not.toHaveBeenCalled();
  });

  it('is dimmed to 42 percent when disabled', async () => {
    await render(<ChoiceMarker selected={false} disabled />);
    const box = screen.getByTestId('marker-ring', { includeHiddenElements: true }).parent;
    expect(StyleSheet.flatten(box?.props.style).opacity).toBe(0.42);
  });
});

describe('ChoiceMarker chosen', () => {
  it('lands the dot over 320 ms (fading in over 200), warms the ring, and lets one ripple go over 640', async () => {
    const view = await render(<ChoiceMarker selected={false} />);
    timing.mockClear();
    await view.rerender(wrap(<ChoiceMarker selected />));
    expect(durations().sort((a, b) => a - b)).toEqual([200, 320, 320, 640]);
  });

  it('lets the old choice go: its dot fades over 180 ms and its ring cools', async () => {
    const view = await render(<ChoiceMarker selected />);
    timing.mockClear();
    await view.rerender(wrap(<ChoiceMarker selected={false} />));
    expect(durations().sort((a, b) => a - b)).toEqual([180, 320]);
    expect(timing).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 180 }));
  });

  it('under Reduce Motion fades the dot and the ring over 180 ms, with no ripple', async () => {
    reduced.mockReturnValue(true);
    const view = await render(<ChoiceMarker selected={false} />);
    timing.mockClear();
    await view.rerender(wrap(<ChoiceMarker selected />));
    expect(durations().every((ms) => ms <= 180)).toBe(true);
    expect(durations()).not.toContain(640);
  });
});
