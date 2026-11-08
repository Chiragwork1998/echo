import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, BackHandler, Dimensions, StyleSheet } from 'react-native';

import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { initialOnboarding, useOnboarding, type Mood } from '@/state/onboarding';
import { render } from '@/testing/render';

import { ArrivalScreen } from './ArrivalScreen';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
  // Runs the effect once on mount, as a focused screen would.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const [LIGHT, STEADY, UNSETTLED, HEAVY, NUMB] = copy.arrival.moods;
const VALUES: Record<string, Mood> = {
  [LIGHT!]: 'light',
  [STEADY!]: 'steady',
  [UNSETTLED!]: 'unsettled',
  [HEAVY!]: 'heavy',
  [NUMB!]: 'numb',
};

function setWindow(width: number, height: number, fontScale = 1) {
  const metrics = { width, height, scale: 2, fontScale };
  Dimensions.set({ window: metrics, screen: metrics });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  useOnboarding.setState({ ...initialOnboarding, mood: undefined });
  setWindow(393, 852);
});

const radio = (name: string) => screen.getByRole('radio', { name });
const cta = () => screen.getByRole('button', { name: copy.arrival.cta });
const skip = () => screen.getByRole('button', { name: copy.arrival.skip });

describe('ArrivalScreen', () => {
  it('shows the title, subtitle and five stones, with nothing chosen on first load', async () => {
    await render(<ArrivalScreen />);
    expect(screen.getByRole('header', { name: copy.arrival.title })).toBeTruthy();
    expect(screen.getByText(copy.arrival.subtitle)).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    for (const label of copy.arrival.moods) {
      expect(radio(label)).not.toBeChecked();
      expect(radio(label)).not.toBeSelected();
    }
    expect(useOnboarding.getState().mood).toBeUndefined();
  });

  it('keeps the CTA disabled, and explains why, until a stone is chosen', async () => {
    await render(<ArrivalScreen />);
    expect(cta()).toBeDisabled();
    expect(cta().props.accessibilityHint).toBe(copy.arrival.subtitle);
    await fireEvent.press(cta());
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('selects one stone at a time, stores it, and cues a tick', async () => {
    await render(<ArrivalScreen />);
    await fireEvent.press(radio(UNSETTLED!));
    expect(useOnboarding.getState().mood).toBe('unsettled');
    expect(radio(UNSETTLED!)).toBeSelected();
    expect(radio(UNSETTLED!)).toBeChecked();
    expect(radio(LIGHT!)).not.toBeSelected();
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('tick');

    await fireEvent.press(radio(HEAVY!));
    expect(useOnboarding.getState().mood).toBe('heavy');
    expect(radio(HEAVY!)).toBeChecked();
    expect(radio(UNSETTLED!)).not.toBeChecked();
    expect(cue).toHaveBeenCalledTimes(2);
  });

  it('stores the right value for every stone', async () => {
    await render(<ArrivalScreen />);
    for (const [label, value] of Object.entries(VALUES)) {
      await fireEvent.press(radio(label));
      expect(useOnboarding.getState().mood).toBe(value);
    }
  });

  it('does not buzz when the chosen stone is pressed again', async () => {
    await render(<ArrivalScreen />);
    await fireEvent.press(radio(NUMB!));
    await fireEvent.press(radio(NUMB!));
    expect(cue).toHaveBeenCalledTimes(1);
    expect(radio(NUMB!)).toBeChecked();
  });

  it('enables the CTA after a choice and goes to the First Echo step', async () => {
    await render(<ArrivalScreen />);
    await fireEvent.press(radio(STEADY!));
    expect(cta()).toBeEnabled();
    await fireEvent.press(cta());
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/first-echo');
  });

  it('restores a saved mood when returning to the step', async () => {
    useOnboarding.setState({ mood: 'heavy' });
    await render(<ArrivalScreen />);
    expect(radio(HEAVY!)).toBeChecked();
    expect(cta()).toBeEnabled();
  });

  it('skips to the First Echo step and clears any mood', async () => {
    useOnboarding.setState({ mood: 'light' });
    await render(<ArrivalScreen />);
    await fireEvent.press(skip());
    expect(useOnboarding.getState().mood).toBeUndefined();
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/first-echo');
  });

  it('lets Skip be used with nothing chosen', async () => {
    await render(<ArrivalScreen />);
    await fireEvent.press(skip());
    expect(useOnboarding.getState().mood).toBeUndefined();
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/first-echo');
  });

  it('announces step 6 of 8, and has no back arrow', async () => {
    await render(<ArrivalScreen />);
    expect(screen.getByRole('progressbar', { name: 'Step 6 of 8' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('sends the system back button to Privacy', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: jest.fn() };
    });
    await render(<ArrivalScreen />);
    expect(handlers).toHaveLength(1);
    expect(handlers[0]!()).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/privacy');
  });
});

/** Every ring or glow the SVG layer has drawn, as the native view tree holds it. */
function drawnEllipses() {
  const found: { strokeOpacity?: number }[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const { type, props, children } = node as {
      type?: string;
      props?: { strokeOpacity?: number };
      children?: unknown[];
    };
    if (type === 'RNSVGEllipse') found.push(props ?? {});
    children?.forEach(walk);
  };
  walk(screen.toJSON());
  return found;
}

describe('ArrivalScreen ripple', () => {
  const ripples = () => screen.getAllByTestId('stone-ripple', { includeHiddenElements: true });

  it('hides the decorative water from screen readers and from touches', async () => {
    await render(<ArrivalScreen />);
    for (const ripple of ripples()) {
      expect(ripple.props.accessibilityElementsHidden).toBe(true);
      expect(ripple.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(ripple.props.pointerEvents).toBe('none');
    }
  });

  it('keeps the rings still when Reduce Motion is on', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    useOnboarding.setState({ mood: 'unsettled' });
    await render(<ArrivalScreen />);
    // Three rings on each of the five stones, drawn at rest.
    await waitFor(() =>
      expect(drawnEllipses().filter((ellipse) => (ellipse.strokeOpacity ?? 0) > 0)).toHaveLength(
        15,
      ),
    );
  });

  it('draws animated rings, which start unseen, when motion is allowed', async () => {
    useOnboarding.setState({ mood: 'unsettled' });
    await render(<ArrivalScreen />);
    const visible = drawnEllipses().filter((ellipse) => (ellipse.strokeOpacity ?? 0) > 0);
    expect(visible).toHaveLength(0);
  });
});

describe('ArrivalScreen touch targets', () => {
  const frame = (name: string) => StyleSheet.flatten(radio(name).props.style);

  it('makes every stone at least 56 x 56 pt, with its word inside the target', async () => {
    await render(<ArrivalScreen />);
    for (const label of copy.arrival.moods) {
      expect(frame(label).width).toBeGreaterThanOrEqual(56);
      expect(frame(label).height).toBeGreaterThanOrEqual(56);
      expect(within(radio(label)).getByText(label)).toBeTruthy();
    }
  });

  it.each([
    [360, 780],
    [393, 852],
    [430, 932],
  ])('keeps targets apart and clear of the CTA at %i x %i', async (width, height) => {
    setWindow(width, height);
    await render(<ArrivalScreen />);
    const boxes = copy.arrival.moods.map((label) => {
      const { top, left, width: w, height: h } = frame(label);
      return { top: top as number, left: left as number, w: w as number, h: h as number };
    });
    boxes.forEach((a, i) => {
      expect(a.top).toBeGreaterThan(0);
      boxes.slice(i + 1).forEach((b) => {
        const apart =
          a.left + a.w <= b.left ||
          b.left + b.w <= a.left ||
          a.top + a.h <= b.top ||
          b.top + b.h <= a.top;
        expect(apart).toBe(true);
      });
    });
    // The CTA is 56 pt tall, 18 pt above the safe area, under a 12 pt pad (the insets are 0 here).
    for (const box of boxes) expect(box.top + box.h).toBeLessThan(height - (56 + 18 + 12));
  });
});

describe('ArrivalScreen at large text sizes and in landscape', () => {
  it('switches to a list of moods at 125% text, with the same radio semantics', async () => {
    setWindow(393, 852, 1.5);
    await render(<ArrivalScreen />);
    expect(screen.queryByTestId('stone-ripple', { includeHiddenElements: true })).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(cta()).toBeDisabled();
    await fireEvent.press(radio(HEAVY!));
    expect(useOnboarding.getState().mood).toBe('heavy');
    expect(radio(HEAVY!)).toBeChecked();
    expect(cue).toHaveBeenCalledTimes(1);
    await fireEvent.press(cta());
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/first-echo');
  });

  it('keeps Skip and the step announcement at large text', async () => {
    setWindow(393, 852, 2);
    await render(<ArrivalScreen />);
    expect(screen.getByRole('progressbar', { name: 'Step 6 of 8' })).toBeTruthy();
    await fireEvent.press(skip());
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/first-echo');
  });

  it('uses the list in landscape, where the portrait stream would run off screen', async () => {
    setWindow(852, 393);
    await render(<ArrivalScreen />);
    expect(screen.queryByTestId('stone-ripple', { includeHiddenElements: true })).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('keeps the stones, the progress and Skip on a 320 pt phone, with the header set to fit', async () => {
    setWindow(320, 568);
    await render(<ArrivalScreen />);
    expect(screen.getAllByTestId('stone-ripple', { includeHiddenElements: true }).length).toBe(5);
    expect(screen.getByRole('progressbar', { name: 'Step 6 of 8' })).toBeTruthy();
    expect(skip()).toBeTruthy();
    expect(screen.getByRole('header', { name: copy.landing.wordmark })).toBeTruthy();
  });

  it('uses the list on a tablet, where the stones would land off the water', async () => {
    setWindow(768, 1024);
    await render(<ArrivalScreen />);
    expect(screen.queryByTestId('stone-ripple', { includeHiddenElements: true })).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(cta()).toBeDisabled();
    await fireEvent.press(radio(HEAVY!));
    expect(radio(HEAVY!)).toBeChecked();
  });
});
