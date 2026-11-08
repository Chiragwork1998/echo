import { fireEvent, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { render } from '@/testing/render';

import { Loading, Notice, Row, SkeletonLine, SwitchRow } from './parts';

describe('Row while it works', () => {
  it('has no spinner: a tide line runs along its rule and its label says the work', async () => {
    await render(
      <Row label="Preparing your export" detail="Saving a copy" onPress={() => undefined} busy />,
    );
    expect(screen.queryByRole('progressbar', { hidden: true })).toBeNull();
    expect(screen.getByTestId('tide-line', { includeHiddenElements: true })).toBeTruthy();
    const row = screen.getByRole('button', { name: /Preparing your export/ });
    expect(row).toBeBusy();
    expect(row).toBeDisabled();
  });

  it('draws no tide line when it is not working', async () => {
    await render(<Row label="Export" onPress={() => undefined} />);
    expect(screen.queryByTestId('tide-line', { includeHiddenElements: true })).toBeNull();
  });

  it('does not fire while it is working', async () => {
    const onPress = jest.fn();
    await render(<Row label="Export" onPress={onPress} busy />);
    await fireEvent.press(screen.getByRole('button', { name: /Export/ }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Row detail room', () => {
  const metrics = { width: 393, height: 852, scale: 2 };
  const fontScale = (scale: number) =>
    Dimensions.set({
      window: { ...metrics, fontScale: scale },
      screen: { ...metrics, fontScale: scale },
    });
  beforeEach(() => fontScale(1));
  afterEach(() => fontScale(1));

  const room = (text: string) =>
    (StyleSheet.flatten(screen.getByText(text).props.style) as { minHeight?: number }).minHeight;

  it('reserves the lines it is told to, so a detail that changes never moves the rows below', async () => {
    // The Export row: a two-line description is replaced by a one-line result, and back. At 20 pt a line.
    const view = await render(<Row label="Export" detail="Two lines of words" detailLines={2} />);
    expect(room('Two lines of words')).toBe(40);
    await view.rerender(
      <ThemeProvider crossfade={false}>
        <Row label="Export" detail="One line." detailLines={2} />
      </ThemeProvider>,
    );
    expect(room('One line.')).toBe(40);
  });

  it('reserves nothing unless asked: a row that has one line of detail is as tall as one', async () => {
    await render(<Row label="Export" detail="One line." />);
    expect(room('One line.')).toBeUndefined();
  });

  it('grows with the type size the person has chosen, as far as the type itself does (1.6 times)', async () => {
    fontScale(2);
    await render(<Row label="Export" detail="One line." detailLines={2} />);
    expect(room('One line.')).toBe(2 * 20 * 1.6);
  });
});

describe('Loading', () => {
  it('says what it is waiting for from the first moment, and is busy', async () => {
    await render(
      <Loading label="Opening your echoes">
        <SkeletonLine width="60%" />
      </Loading>,
    );
    const loading = screen.getByLabelText('Opening your echoes');
    expect(loading).toBeBusy();
  });
});

describe('Notice', () => {
  it('still shows its message and its action', async () => {
    const onAction = jest.fn();
    await render(<Notice message="Something went quietly wrong." onAction={onAction} />);
    expect(screen.getByText('Something went quietly wrong.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('is a polite live region, so it is announced when it arrives', async () => {
    await render(<Notice message="Something went quietly wrong." />);
    expect(
      screen.getByText('Something went quietly wrong.').parent?.props.accessibilityLiveRegion,
    ).toBe('polite');
  });
});

describe('SwitchRow', () => {
  it('is a switch with its state, and asks for the opposite on press', async () => {
    const onChange = jest.fn();
    await render(<SwitchRow label="Gentle reminder" value={false} onChange={onChange} />);
    const row = screen.getByRole('switch', { name: 'Gentle reminder' });
    expect(row).not.toBeChecked();
    await fireEvent.press(row);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports checked when on, and holds the golden knob position', async () => {
    await render(<SwitchRow label="Gentle reminder" value onChange={jest.fn()} />);
    expect(screen.getByRole('switch', { name: 'Gentle reminder' })).toBeChecked();
    expect(screen.getByTestId('switch-fill')).toBeTruthy();
  });

  it('does nothing when disabled', async () => {
    const onChange = jest.fn();
    await render(<SwitchRow label="Gentle reminder" value={false} onChange={onChange} disabled />);
    await fireEvent.press(screen.getByRole('switch', { name: 'Gentle reminder' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
