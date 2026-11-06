import { act, fireEvent, screen, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Dimensions, StyleSheet } from 'react-native';

import { copy } from '@/content/copy';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { render } from '@/testing/render';

import { IntentScreen } from './IntentScreen';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const [QUIET, UNDERSTAND, HOLD, DIRECTION] = copy.intent.options;

function setWindow(width: number, height: number, fontScale = 1) {
  const metrics = { width, height, scale: 2, fontScale };
  Dimensions.set({ window: metrics, screen: metrics });
}

beforeEach(() => {
  jest.clearAllMocks();
  useOnboarding.setState({ ...initialOnboarding, intent: undefined });
  setWindow(393, 852);
});

const radio = (name: string) => screen.getByRole('radio', { name });
const cta = () => screen.getByRole('button', { name: copy.intent.cta });

describe('IntentScreen', () => {
  it('shows the title, subtitle and four choices, with nothing chosen on first load', async () => {
    await render(<IntentScreen />);
    expect(screen.getByRole('header', { name: copy.intent.title })).toBeTruthy();
    expect(screen.getByText(copy.intent.subtitle)).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    for (const label of copy.intent.options) {
      expect(radio(label)).not.toBeChecked();
      expect(radio(label)).not.toBeSelected();
    }
  });

  it('keeps the CTA disabled, and explains why, until a choice is made', async () => {
    await render(<IntentScreen />);
    expect(cta()).toBeDisabled();
    expect(cta().props.accessibilityHint).toBe(copy.intent.subtitle);
    await fireEvent.press(cta());
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('selects one choice at a time, stores it, and gives a light haptic', async () => {
    await render(<IntentScreen />);
    await fireEvent.press(radio(HOLD));
    expect(useOnboarding.getState().intent).toBe('hold_moments');
    expect(radio(HOLD)).toBeChecked();
    expect(radio(HOLD)).toBeSelected();
    expect(radio(QUIET)).not.toBeChecked();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');

    await fireEvent.press(radio(DIRECTION));
    expect(useOnboarding.getState().intent).toBe('direction');
    expect(radio(DIRECTION)).toBeChecked();
    expect(radio(HOLD)).not.toBeChecked();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
  });

  it('stores the right value for every choice', async () => {
    await render(<IntentScreen />);
    const expected = {
      [QUIET]: 'quiet',
      [UNDERSTAND]: 'understand_self',
      [HOLD]: 'hold_moments',
      [DIRECTION]: 'direction',
    };
    for (const [label, value] of Object.entries(expected)) {
      await fireEvent.press(radio(label));
      expect(useOnboarding.getState().intent).toBe(value);
    }
  });

  it('does not buzz or change anything when the chosen point is pressed again', async () => {
    await render(<IntentScreen />);
    await fireEvent.press(radio(UNDERSTAND));
    await fireEvent.press(radio(UNDERSTAND));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(radio(UNDERSTAND)).toBeChecked();
  });

  it('enables the CTA after a choice and goes to the next step', async () => {
    await render(<IntentScreen />);
    await fireEvent.press(radio(QUIET));
    expect(cta()).toBeEnabled();
    await fireEvent.press(cta());
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/horizon');
  });

  it('restores a saved choice when returning to the step', async () => {
    useOnboarding.setState({ intent: 'understand_self' });
    await render(<IntentScreen />);
    expect(radio(UNDERSTAND)).toBeChecked();
    expect(cta()).toBeEnabled();
  });

  it('goes back to Landing', async () => {
    await render(<IntentScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.navigate).toHaveBeenCalledWith('/');
  });

  it('announces step 1 of 8', async () => {
    await render(<IntentScreen />);
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 8' })).toBeTruthy();
  });

  it('hides the decorative trail from screen readers and touches', async () => {
    await render(<IntentScreen />);
    const trail = screen.getByTestId('river-trail', { includeHiddenElements: true });
    expect(trail.props.accessibilityElementsHidden).toBe(true);
    expect(trail.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(trail.props.pointerEvents).toBe('none');
  });
});

describe('IntentScreen touch targets', () => {
  const frame = (name: string) => StyleSheet.flatten(radio(name).props.style);

  it('makes every point at least 44 x 44 pt, with its label inside the target', async () => {
    await render(<IntentScreen />);
    for (const label of copy.intent.options) {
      expect(frame(label).height).toBeGreaterThanOrEqual(44);
      expect(within(radio(label)).getByText(label)).toBeTruthy();
    }
  });

  it.each([
    [360, 780],
    [393, 852],
    [430, 932],
  ])('keeps targets apart, on screen, and clear of the CTA at %i x %i', async (width, height) => {
    setWindow(width, height);
    await render(<IntentScreen />);
    const rects = copy.intent.options.map((label) => {
      const { top, left, height: h } = frame(label);
      return {
        top: top as number,
        left: left as number,
        bottom: (top as number) + (h as number),
        x: left as number,
      };
    });
    rects.forEach((rect, index) => {
      expect(rect.top).toBeGreaterThan(0);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      if (index > 0) expect(rect.top).toBeGreaterThanOrEqual(rects[index - 1]!.bottom);
    });
    // The CTA is 56 pt tall, 18 pt above the safe area, under a 12 pt pad (the insets are 0 here).
    expect(rects[3]!.bottom).toBeLessThan(height - (56 + 18 + 12));
  });

  it('puts "Find my direction" to the left of its point where the right side cannot hold it', async () => {
    setWindow(360, 780);
    await render(<IntentScreen />);
    const find = radio(DIRECTION);
    expect(frame(DIRECTION).left).toBeDefined();
    // Labels start hidden until measured. A measured width wider than the room flips the label.
    const label = within(find).getByText(DIRECTION);
    await act(async () => {
      fireEvent(label, 'layout', { nativeEvent: { layout: { width: 101, height: 20 } } });
    });
    const flipped = StyleSheet.flatten(radio(DIRECTION).props.style);
    expect(flipped.right).toBeDefined();
    expect(flipped.left).toBeUndefined();
    expect(flipped.flexDirection).toBe('row-reverse');
  });

  it('keeps "Find my direction" on the right on the reference phone, as in the golden', async () => {
    await render(<IntentScreen />);
    const label = within(radio(DIRECTION)).getByText(DIRECTION);
    await act(async () => {
      fireEvent(label, 'layout', { nativeEvent: { layout: { width: 100, height: 20 } } });
    });
    const style = StyleSheet.flatten(radio(DIRECTION).props.style);
    expect(style.left).toBeDefined();
    expect(style.flexDirection).toBe('row');
  });
});

describe('IntentScreen at large text sizes and in landscape', () => {
  it('switches to a list of choices at 125% text, with the same radio semantics', async () => {
    setWindow(393, 852, 1.5);
    await render(<IntentScreen />);
    expect(screen.queryByTestId('river-trail', { includeHiddenElements: true })).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(cta()).toBeDisabled();
    await fireEvent.press(radio(HOLD));
    expect(useOnboarding.getState().intent).toBe('hold_moments');
    expect(radio(HOLD)).toBeChecked();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    await fireEvent.press(cta());
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/horizon');
  });

  it('uses the list in landscape, where the portrait river would run off screen', async () => {
    setWindow(852, 393);
    await render(<IntentScreen />);
    expect(screen.queryByTestId('river-trail', { includeHiddenElements: true })).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('uses the list on a tablet, where the points would land off the river', async () => {
    setWindow(768, 1024);
    await render(<IntentScreen />);
    expect(screen.queryByTestId('river-trail', { includeHiddenElements: true })).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('keeps the river on the largest phones, which are 440 pt wide', async () => {
    setWindow(440, 956);
    await render(<IntentScreen />);
    expect(screen.getByTestId('river-trail', { includeHiddenElements: true })).toBeTruthy();
  });
});
