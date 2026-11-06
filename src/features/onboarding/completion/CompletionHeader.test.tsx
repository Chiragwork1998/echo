import { screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { render } from '@/testing/render';

import { CompletionHeader } from './CompletionHeader';

function setWindow(width: number, height: number) {
  const metrics = { width, height, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
}

/** The size of the first dot of the progress. */
const dotSize = () => {
  const [first] = screen.getAllByTestId('completion-dot');
  return (StyleSheet.flatten(first?.props.style as object) as { width: number }).width;
};

describe('CompletionHeader on small phones', () => {
  it('keeps the golden’s dots on a standard phone', async () => {
    setWindow(393, 852);
    await render(<CompletionHeader step={8} />);
    expect(dotSize()).toBe(6);
  });

  it('keeps them at 360 pt, where the wordmark already leaves room', async () => {
    setWindow(360, 780);
    await render(<CompletionHeader step={8} />);
    expect(dotSize()).toBe(6);
  });

  it('sets them smaller at 320 pt, so that they stay clear of the wordmark', async () => {
    setWindow(320, 568);
    await render(<CompletionHeader step={8} />);
    expect(dotSize()).toBe(5);
    expect(screen.getByRole('progressbar', { name: 'Step 8 of 8' })).toBeTruthy();
  });

  it('shows the wordmark alone on the daily screen', async () => {
    setWindow(320, 568);
    await render(<CompletionHeader />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
