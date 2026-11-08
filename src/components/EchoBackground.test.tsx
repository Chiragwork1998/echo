import { act, screen } from '@testing-library/react-native';
import { useEffect, type ReactElement } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { backgroundSources } from '@/design/generated/backgrounds';
import { setPlateFlowStep } from '@/design/plateMotion';
import {
  lastShownPlate,
  PLATE_HELD_OPACITY,
  PLATE_LATE_MS,
  resetPlatesForTests,
  usePlatesPending,
  usePosterShown,
} from '@/design/platePaint';
import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
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
  resetPlatesForTests();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  await act(async () => {
    setPlateFlowStep(null);
    usePreferences.setState({ theme: 'night' });
  });
});

afterEach(() => jest.restoreAllMocks());

const plates = () => screen.getAllByTestId('plate', { includeHiddenElements: true });
const sources = () => plates().map((plate) => plate.props.source);
/** The scale the plates are drawn at, from the layer that carries them all. */
const scaleOf = () => {
  const layer = screen.getByTestId('drift', { includeHiddenElements: true });
  const transform = StyleSheet.flatten(layer.props.style as object) as {
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
    const root = screen.getByTestId('drift', { includeHiddenElements: true }).parent;
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
    // Both plates stay while it is going back, and Night is the one that is left.
    expect(sources()).toEqual([backgroundSources.day.intent, backgroundSources.night.intent]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(899);
    });
    expect(plates()).toHaveLength(2);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(sources()).toEqual([backgroundSources.night.intent]);
  });

  it('carries both plates with one value, so a change reversed half way goes back from where it was', async () => {
    const reanimated = jest.requireMock('react-native-reanimated');
    const targets: number[] = [];
    jest.spyOn(reanimated, 'withTiming').mockImplementation(((to: number) => {
      targets.push(to);
      return to;
    }) as never);
    await render(<EchoBackground screen="intent" />);
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    await act(async () => usePreferences.setState({ theme: 'night' }));
    // Night's own amount, going to Day and then back; there is no second plate started at full.
    expect(targets.filter((to) => to === 0 || to === 1).slice(-3)).toEqual([1, 0, 1]);
  });
});

describe('EchoBackground with an overlay (the living Night plate, D-009)', () => {
  const layers = () =>
    screen
      .getAllByTestId(/^(plate|overlay)$/, { includeHiddenElements: true })
      .map((node) => node.props.testID as string);
  const overlay = <Text testID="overlay">loop</Text>;

  it('lays it over the Night plate', async () => {
    await render(<EchoBackground screen="home" overlay={overlay} />);
    expect(layers()).toEqual(['plate', 'overlay']);
  });

  it('keeps it with the Night plate as that fades out, so the loop fades with the sky it is part of', async () => {
    await render(<EchoBackground screen="home" overlay={overlay} />);
    await act(async () => usePreferences.setState({ theme: 'day' }));
    // Day beneath; Night above it, and the loop in the same fading group as the Night plate.
    expect(layers()).toEqual(['plate', 'plate', 'overlay']);
    const night = screen.getByTestId('overlay', { includeHiddenElements: true }).parent;
    expect(screen.getAllByTestId('plate', { includeHiddenElements: true })[1]?.parent).toBe(night);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(900);
    });
    expect(layers()).toEqual(['plate']);
  });

  it('draws the loop in Day only for as long as Night is still fading in', async () => {
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await render(<EchoBackground screen="home" overlay={overlay} />);
    expect(layers()).toEqual(['plate']);
    await act(async () => usePreferences.setState({ theme: 'night' }));
    expect(layers()).toEqual(['plate', 'plate', 'overlay']);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(900);
    });
    expect(layers()).toEqual(['plate', 'overlay']);
  });

  it('never makes the loop again when the change is reversed inside the fade', async () => {
    const log: string[] = [];
    function Probe() {
      useEffect(() => {
        log.push('mount');
        return () => void log.push('unmount');
      }, []);
      return <Text testID="overlay">loop</Text>;
    }
    await render(<EchoBackground screen="home" overlay={<Probe />} />);
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    await act(async () => usePreferences.setState({ theme: 'night' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(900);
    });
    expect(log).toEqual(['mount']);
  });

  it('draws the same plates as before when there is no overlay', async () => {
    await render(<EchoBackground screen="home" />);
    expect(layers()).toEqual(['plate']);
  });
});

describe('EchoBackground when a screen changes: never a flat colour before the photograph', () => {
  const HIDDEN = { includeHiddenElements: true };
  const own = () => screen.getByTestId('plate', HIDDEN);
  const veil = () => screen.queryByTestId('veil', HIDDEN);
  const opacityOf = (node: { props: { style?: unknown } }) =>
    (StyleSheet.flatten(node.props.style as object) as { opacity?: number }).opacity;
  /** The picture reports that it has been drawn, as expo-image does. */
  const draw = (node = own()) => act(async () => node.props.onDisplay());
  const fade = jest.fn();
  const watchFades = () => {
    const reanimated = jest.requireMock('react-native-reanimated');
    jest.spyOn(reanimated, 'withTiming').mockImplementation(((
      to: number,
      options: { duration: number },
    ) => {
      if (to === 1 && options.duration === tokens.motion.standard) fade();
      return to;
    }) as never);
  };
  const redraw = (view: Awaited<ReturnType<typeof render>>, element: ReactElement) =>
    view.rerender(<ThemeProvider crossfade={false}>{element}</ThemeProvider>);
  const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

  /** The screen that was on show, drawn, and then left. */
  async function leave(screenName: 'intent' | 'home' = 'intent') {
    const first = await render(<EchoBackground screen={screenName} />);
    await draw();
    await first.unmount();
  }

  beforeEach(() => fade.mockClear());

  it('has nothing to hold the first time a plate is ever drawn', async () => {
    await render(<EchoBackground screen="intent" />);
    expect(veil()).toBeNull();
    expect(opacityOf(own())).toBe(1);
  });

  it('holds up the plate that was on show, and keeps its own hidden, until its own is drawn', async () => {
    await leave('intent');
    await render(<EchoBackground screen="rhythm" />);
    expect(veil()?.props.source).toBe(backgroundSources.night.intent);
    expect(own().props.source).toBe(backgroundSources.night.rhythm);
    // Not quite nothing, so that the picture is drawn, and on the GPU, before its dissolve begins.
    expect(opacityOf(own())).toBe(PLATE_HELD_OPACITY);
    expect(PLATE_HELD_OPACITY).toBeGreaterThan(0);
    expect(PLATE_HELD_OPACITY).toBeLessThanOrEqual(0.02);
  });

  it('brings its own up over it, softly, when it was late, and then lets the old one go', async () => {
    watchFades();
    await leave('intent');
    const view = await render(<EchoBackground screen="rhythm" />);
    await advance(PLATE_LATE_MS + 120);
    await draw();
    expect(fade).toHaveBeenCalledTimes(1);
    await redraw(view, <EchoBackground screen="rhythm" />);
    expect(opacityOf(own())).toBe(1);
    // Both are drawn while it comes up, so the photograph beneath is never uncovered.
    expect(veil()).not.toBeNull();
    await advance(tokens.motion.standard);
    expect(veil()).toBeNull();
  });

  it('keeps it to 180 ms with Reduce Motion', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    await leave('intent');
    await render(<EchoBackground screen="rhythm" />);
    await act(async () => undefined);
    await advance(PLATE_LATE_MS + 120);
    await draw();
    await advance(tokens.motion.fast - 1);
    expect(veil()).not.toBeNull();
    await advance(1);
    expect(veil()).toBeNull();
  });

  it('replaces it at once when its own was already to hand, as a plate always did', async () => {
    watchFades();
    await leave('intent');
    const view = await render(<EchoBackground screen="rhythm" />);
    await advance(PLATE_LATE_MS - 30);
    await draw();
    await redraw(view, <EchoBackground screen="rhythm" />);
    expect(fade).not.toHaveBeenCalled();
    expect(opacityOf(own())).toBe(1);
    expect(veil()).toBeNull();
  });

  it('holds nothing up for a screen that wears the same plate', async () => {
    await leave('home');
    await render(<EchoBackground screen="home" />);
    expect(veil()).toBeNull();
    expect(opacityOf(own())).toBe(1);
  });

  it('holds nothing up from the other theme, which has its own cross-fade', async () => {
    await leave('intent');
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await render(<EchoBackground screen="rhythm" />);
    expect(veil()).toBeNull();
    expect(opacityOf(own())).toBe(1);
  });

  it('lets the old plate go if its own cannot be drawn, rather than keep a photograph that is not its own', async () => {
    await leave('intent');
    const view = await render(<EchoBackground screen="rhythm" />);
    await act(async () => own().props.onError());
    await advance(tokens.motion.standard);
    await redraw(view, <EchoBackground screen="rhythm" />);
    expect(veil()).toBeNull();
    expect(opacityOf(own())).toBe(1);
  });

  it('is awaited until it has been drawn, so a launch can hold the splash for it', async () => {
    function Pending() {
      return <Text testID="pending">{String(usePlatesPending())}</Text>;
    }
    const view = await render(
      <>
        <Pending />
        <EchoBackground screen="intent" />
      </>,
    );
    expect(screen.getByTestId('pending').props.children).toBe('true');
    await draw();
    await redraw(
      view,
      <>
        <Pending />
        <EchoBackground screen="intent" />
      </>,
    );
    expect(screen.getByTestId('pending').props.children).toBe('false');
  });

  it('tells a loop over it when the still it lies over has been drawn', async () => {
    function Loop() {
      return <Text testID="loop">{String(usePosterShown())}</Text>;
    }
    const view = await render(<EchoBackground screen="home" overlay={<Loop />} />);
    expect(screen.getByTestId('loop', HIDDEN).props.children).toBe('false');
    await draw();
    await redraw(view, <EchoBackground screen="home" overlay={<Loop />} />);
    expect(screen.getByTestId('loop', HIDDEN).props.children).toBe('true');
  });
});

describe('EchoBackground over the plate backing: never a flat colour of its own', () => {
  const HIDDEN = { includeHiddenElements: true };
  const draw = (node: ReturnType<typeof photos>[number]) => act(async () => node.props.onDisplay());
  const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
  const photos = () => screen.getAllByTestId('plate', HIDDEN);
  const flush = () => act(async () => void (await Promise.resolve()));

  it('paints nothing behind its plates, so that the backing beneath the navigator shows through', async () => {
    await render(<EchoBackground screen="intent" />);
    const root = screen.getByTestId('drift', HIDDEN).parent;
    const style = StyleSheet.flatten(root?.props.style as object) as { backgroundColor?: string };
    expect(style.backgroundColor).toBeUndefined();
  });

  it('is not the plate on show until it has been drawn', async () => {
    await render(<EchoBackground screen="intent" />);
    expect(lastShownPlate()).toBeNull();
    await draw(photos()[0]!);
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'intent' });
  });

  it('becomes the plate on show at once when it was to hand, and replaces the old one as it always did', async () => {
    const first = await render(<EchoBackground screen="intent" />);
    await draw(photos()[0]!);
    await first.unmount();
    await render(<EchoBackground screen="rhythm" />);
    await advance(PLATE_LATE_MS - 30);
    await draw(photos()[photos().length - 1]!);
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'rhythm' });
  });

  it('stays out of the backing while it dissolves in over the old plate, so the dissolve is seen', async () => {
    const first = await render(<EchoBackground screen="intent" />);
    await draw(photos()[0]!);
    await first.unmount();
    await render(<EchoBackground screen="rhythm" />);
    await advance(PLATE_LATE_MS + 120);
    await draw(photos()[photos().length - 1]!);
    // The backing is what the dissolve goes over. If it showed Rhythm's photograph already, nothing
    // would be seen to change.
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'intent' });
    await advance(tokens.motion.standard);
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'rhythm' });
  });

  it('gives the backing back to the plate beneath it when its screen is left', async () => {
    await render(
      <>
        <EchoBackground screen="home" />
        <EchoBackground screen="completion" />
      </>,
    );
    const [home, completion] = photos();
    await draw(home!);
    await draw(completion!);
    expect(lastShownPlate()?.screen).toBe('completion');
  });

  it('is released when it unmounts, and the plate that was beneath it is on show again', async () => {
    function Both({ completion }: { completion: boolean }) {
      return (
        <>
          <EchoBackground screen="home" />
          {completion && <EchoBackground screen="completion" />}
        </>
      );
    }
    const view = await render(<Both completion />);
    for (const photo of photos()) await draw(photo);
    expect(lastShownPlate()?.screen).toBe('completion');
    await view.rerender(
      <ThemeProvider crossfade={false}>
        <Both completion={false} />
      </ThemeProvider>,
    );
    await flush();
    expect(lastShownPlate()?.screen).toBe('home');
  });

  it('is the plate on show in the new theme once the new theme has been drawn', async () => {
    await render(<EchoBackground screen="home" />);
    await draw(photos()[0]!);
    await act(async () => usePreferences.setState({ theme: 'day' }));
    // Day lies beneath the fading Night plate; once it is drawn, the backing follows the theme.
    const day = photos().find((photo) => photo.props.source === backgroundSources.day.home);
    await draw(day!);
    expect(lastShownPlate()).toEqual({ theme: 'day', screen: 'home' });
  });

  it('holds nothing and keeps the backing as it was when its own plate cannot be drawn', async () => {
    const first = await render(<EchoBackground screen="intent" />);
    await draw(photos()[0]!);
    await first.unmount();
    await render(<EchoBackground screen="rhythm" />);
    await act(async () => photos()[photos().length - 1]!.props.onError());
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'intent' });
  });
});
