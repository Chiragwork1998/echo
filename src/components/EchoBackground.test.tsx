import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { backgroundSources } from '@/design/generated/backgrounds';
import { setPlateFlowStep } from '@/design/plateMotion';
import { ThemeProvider } from '@/design/theme';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { EchoBackground } from './EchoBackground';

// The picture itself is not what is under test: which plate is drawn, and how it moves, is.
jest.mock('expo-image', () => {
  const { View: Box } = jest.requireActual('react-native');
  return { Image: (props: { source: unknown }) => <Box testID="plate" {...props} /> };
});

beforeAll(() => {
  jest.useFakeTimers();
});

beforeEach(async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  await act(async () => {
    setPlateFlowStep(null);
    usePreferences.setState({ theme: 'night' });
  });
});

afterEach(() => jest.restoreAllMocks());

const plates = () => screen.getAllByTestId('plate', { includeHiddenElements: true });
const sources = () => plates().map((plate) => plate.props.source);
/** The scale the plate is drawn at, from the layer that carries it. */
const scaleOf = () => {
  const layer = plates()[0]?.parent;
  const transform = StyleSheet.flatten(layer?.props.style as object) as {
    transform?: { scale: number }[];
  };
  return transform.transform?.[0]?.scale;
};

describe('EchoBackground in the journey', () => {
  it('rests at 1.00 on the screen that is current', async () => {
    setPlateFlowStep(4);
    await render(<EchoBackground screen="rhythm" />);
    expect(scaleOf()).toBe(1);
  });

  it('arrives at 0.985, ready to settle, when the journey is still behind it', async () => {
    setPlateFlowStep(3);
    await render(<EchoBackground screen="rhythm" />);
    expect(scaleOf()).toBe(0.985);
  });

  it('holds a plate that has been left at 1.025', async () => {
    setPlateFlowStep(5);
    await render(<EchoBackground screen="rhythm" />);
    expect(scaleOf()).toBe(1.025);
  });

  it('settles to 1.00 once its screen becomes current', async () => {
    setPlateFlowStep(3);
    const view = await render(<EchoBackground screen="rhythm" />);
    await act(async () => setPlateFlowStep(4));
    // The test double resolves each animation at once, and shows it on the next draw.
    await view.rerender(
      <ThemeProvider crossfade={false}>
        <EchoBackground screen="rhythm" />
      </ThemeProvider>,
    );
    expect(scaleOf()).toBe(1);
  });

  it('does not scale at all with Reduce Motion, which keeps only the dissolve', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    setPlateFlowStep(3);
    const view = await render(<EchoBackground screen="rhythm" />);
    await act(async () => undefined);
    await view.rerender(
      <ThemeProvider crossfade={false}>
        <EchoBackground screen="rhythm" />
      </ThemeProvider>,
    );
    expect(scaleOf()).toBe(1);
  });

  it('never moves Home’s plate, which is not part of the journey', async () => {
    setPlateFlowStep(3);
    await render(<EchoBackground screen="home" />);
    expect(scaleOf()).toBe(1);
  });

  it('hides the plate from screen readers', async () => {
    await render(<EchoBackground screen="intent" />);
    const root = plates()[0]?.parent?.parent;
    expect(root?.props.accessibilityElementsHidden).toBe(true);
    expect(root?.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});

describe('EchoBackground when the theme changes', () => {
  it('draws one plate at rest, in the current theme', async () => {
    await render(<EchoBackground screen="intent" />);
    expect(sources()).toEqual([backgroundSources.night.intent]);
  });

  it('lays the old plate over the new one and removes it after 900 ms', async () => {
    await render(<EchoBackground screen="intent" />);
    await act(async () => usePreferences.setState({ theme: 'day' }));
    // New plate beneath, old plate fading above it.
    expect(sources()).toEqual([backgroundSources.day.intent, backgroundSources.night.intent]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(899);
    });
    expect(plates()).toHaveLength(2);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(sources()).toEqual([backgroundSources.day.intent]);
  });

  it('keeps it to 180 ms with Reduce Motion', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    await render(<EchoBackground screen="intent" />);
    await act(async () => undefined);
    await act(async () => usePreferences.setState({ theme: 'day' }));
    expect(plates()).toHaveLength(2);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(180);
    });
    expect(plates()).toHaveLength(1);
  });

  it('never leaves the screen without a plate while the theme changes back and forth', async () => {
    await render(<EchoBackground screen="intent" />);
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    await act(async () => usePreferences.setState({ theme: 'night' }));
    expect(plates().length).toBeGreaterThanOrEqual(1);
    expect(sources()[0]).toBe(backgroundSources.night.intent);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(900);
    });
    expect(sources()).toEqual([backgroundSources.night.intent]);
  });
});

describe('EchoBackground with an overlay (the living Night plate, D-009)', () => {
  const layers = () =>
    screen
      .getAllByTestId(/^(plate|overlay)$/, { includeHiddenElements: true })
      .map((node) => node.props.testID as string);
  const overlay = <Text testID="overlay">loop</Text>;

  it('lays it over the plate of the current theme', async () => {
    await render(<EchoBackground screen="home" overlay={overlay} />);
    expect(layers()).toEqual(['plate', 'overlay']);
  });

  it('keeps it beneath a plate that is leaving, so the old theme still covers it as it fades', async () => {
    await render(<EchoBackground screen="home" overlay={overlay} />);
    await act(async () => usePreferences.setState({ theme: 'day' }));
    expect(layers()).toEqual(['plate', 'overlay', 'plate']);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(900);
    });
    expect(layers()).toEqual(['plate', 'overlay']);
  });

  it('draws the same plates as before when there is no overlay', async () => {
    await render(<EchoBackground screen="home" />);
    expect(layers()).toEqual(['plate']);
  });
});
