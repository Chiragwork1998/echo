import { fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';
import { reanimatedMock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { PrimaryCTA } from './PrimaryCTA';

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;
const timing = jest.spyOn(reanimatedMock, 'withTiming');

const wrap = (element: ReactElement) => <ThemeProvider crossfade={false}>{element}</ThemeProvider>;

const flat = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style) as {
    opacity?: number;
    transform?: { scale: number }[];
  };

beforeEach(() => {
  reduced.mockReturnValue(false);
  timing.mockClear();
});

describe('PrimaryCTA', () => {
  it('fires onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(<PrimaryCTA label="Begin with this" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Begin with this' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire, and announces disabled, when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <PrimaryCTA label="Reflect" onPress={onPress} disabled disabledHint="Write more" />,
    );
    const button = screen.getByRole('button', { name: 'Reflect' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('PrimaryCTA at rest', () => {
  it('is ghosted at 42 percent while cream is disabled, and whole once it can be used', async () => {
    const ghost = await render(<PrimaryCTA label="Begin" disabled />);
    expect(flat('primary-cta').opacity).toBe(0.42);
    await ghost.unmount();
    await render(<PrimaryCTA label="Begin" />);
    expect(flat('primary-cta').opacity).toBe(1);
  });

  it('keeps the frosted pill whole while glass is disabled: only its label is dimmed', async () => {
    await render(<PrimaryCTA label="Reflect" variant="glass" disabled />);
    expect(flat('primary-cta').opacity).toBe(1);
  });

  it('has a shadow layer for cream, which glass does not', async () => {
    const cream = await render(<PrimaryCTA label="Begin" />);
    expect(screen.getByTestId('cta-shadow', { includeHiddenElements: true })).toBeTruthy();
    await cream.unmount();
    await render(<PrimaryCTA label="Reflect" variant="glass" />);
    expect(screen.queryByTestId('cta-shadow', { includeHiddenElements: true })).toBeNull();
  });

  it('starts at rest: nothing eases on mount for the state it is already in', async () => {
    await render(<PrimaryCTA label="Begin" disabled />);
    // The effect sets the value it already holds; the pill is at its disabled opacity, not animating.
    expect(flat('primary-cta').opacity).toBe(0.42);
  });
});

describe('PrimaryCTA enabling', () => {
  it('eases its fill and its shadow over 320 ms when it enables, not in one frame', async () => {
    const view = await render(<PrimaryCTA label="Begin" disabled />);
    timing.mockClear();
    await view.rerender(wrap(<PrimaryCTA label="Begin" />));
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 320 }));
  });

  it('is a 180 ms fade under Reduce Motion', async () => {
    reduced.mockReturnValue(true);
    const view = await render(<PrimaryCTA label="Begin" disabled />);
    timing.mockClear();
    await view.rerender(wrap(<PrimaryCTA label="Begin" />));
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 180 }));
  });
});

describe('PrimaryCTA pressed', () => {
  it('sinks to 0.985 over 180 ms, decelerating', async () => {
    await render(<PrimaryCTA label="Begin" />);
    timing.mockClear();
    await fireEvent(screen.getByRole('button', { name: 'Begin' }), 'pressIn');
    expect(timing).toHaveBeenCalledWith(0.985, expect.objectContaining({ duration: 180 }));
    await fireEvent(screen.getByRole('button', { name: 'Begin' }), 'pressOut');
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 180 }));
  });

  it('does not scale under Reduce Motion: the label dims while it is held', async () => {
    reduced.mockReturnValue(true);
    const view = await render(<PrimaryCTA label="Begin" />);
    timing.mockClear();
    await fireEvent(screen.getByRole('button', { name: 'Begin' }), 'pressIn');
    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 120 }));
    await view.rerender(wrap(<PrimaryCTA label="Begin" />));
    expect(flat('cta-label').opacity).toBeCloseTo(0.72, 5);
    expect(flat('primary-cta').transform).toEqual([{ scale: 1 }]);
  });
});

describe('PrimaryCTA working', () => {
  it('keeps its label, dimmed, with a tide line and no spinner', async () => {
    await render(<PrimaryCTA label="Enter" loading />);
    expect(screen.getByText('Enter')).toBeTruthy();
    expect(screen.getByTestId('tide-line', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByRole('progressbar', { hidden: true })).toBeNull();
    const button = screen.getByRole('button', { name: 'Enter' });
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    expect(flat('cta-label').opacity).toBeCloseTo(0.72, 5);
  });

  it('draws no tide line when it is not working', async () => {
    await render(<PrimaryCTA label="Enter" />);
    expect(screen.queryByTestId('tide-line', { includeHiddenElements: true })).toBeNull();
    expect(flat('cta-label').opacity).toBe(1);
  });
});
