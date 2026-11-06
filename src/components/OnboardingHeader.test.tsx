import { screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { render } from '@/testing/render';

import { OnboardingHeader } from './OnboardingHeader';

function setWindow(width: number, height: number) {
  const metrics = { width, height, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
}

const GAP = 1.5;
/** The width of each bar of the progress, in order. */
const widths = () =>
  screen
    .getAllByTestId('progress-segment')
    .map((bar) => StyleSheet.flatten(bar.props.style as object) as { width: number })
    .map((style) => style.width);
const rowWidth = () =>
  widths().reduce((sum, width) => sum + width, 0) + GAP * (widths().length - 1);

// Half the header row, less half the 105 pt wordmark, less the 12 pt of air beside it.
const roomAt = (phone: number, gutter: number) => (phone - gutter * 2) / 2 - 105 / 2 - 12;

describe('OnboardingHeader on small phones', () => {
  it('keeps the golden’s 96 pt progress where it fits', async () => {
    setWindow(393, 852);
    await render(<OnboardingHeader step={3} />);
    expect(widths()[0]).toBe(10.5);
    expect(rowWidth()).toBeCloseTo(94.5);
  });

  it('keeps it at 360 pt, where the wordmark already leaves room', async () => {
    setWindow(360, 780);
    await render(<OnboardingHeader step={3} />);
    expect(widths()[0]).toBe(10.5);
  });

  it('shrinks the progress at 320 pt so that it stays clear of the wordmark', async () => {
    setWindow(320, 568);
    await render(<OnboardingHeader step={3} />);
    const room = roomAt(320, 20);
    expect(room).toBeLessThan(94.5);
    expect(rowWidth()).toBeLessThanOrEqual(room + 0.01);
    expect(widths()[0]).toBeGreaterThan(3);
  });

  it('still announces the step and draws all eight segments', async () => {
    setWindow(320, 568);
    await render(<OnboardingHeader step={5} />);
    expect(screen.getByRole('progressbar', { name: 'Step 5 of 8' })).toBeTruthy();
    expect(widths()).toHaveLength(8);
  });
});
