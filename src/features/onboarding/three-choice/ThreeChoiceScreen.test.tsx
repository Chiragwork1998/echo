import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions, StyleSheet } from 'react-native';

import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { HorizonScreen } from '@/features/onboarding/screens/HorizonScreen';
import { VoiceScreen } from '@/features/onboarding/screens/VoiceScreen';
import { initialOnboarding, useOnboarding, type OnboardingState } from '@/state/onboarding';
import { render } from '@/testing/render';

import { breakDetail, HORIZON_SCENE, VOICE_SCENE } from './scenes';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

function setWindow(width: number, height: number, fontScale = 1) {
  const metrics = { width, height, scale: 2, fontScale };
  Dimensions.set({ window: metrics, screen: metrics });
}

type Case = {
  name: string;
  Screen: () => React.JSX.Element;
  text: typeof copy.horizon | typeof copy.voice;
  field: 'horizon' | 'mode';
  values: readonly string[];
  step: number;
  back: string;
  next: string;
  paths: boolean;
};

const cases: Case[] = [
  {
    name: 'HorizonScreen',
    Screen: HorizonScreen,
    text: copy.horizon,
    field: 'horizon',
    values: ['past', 'present', 'future'],
    step: 2,
    back: '/onboarding/intent',
    next: '/onboarding/voice',
    paths: false,
  },
  {
    name: 'VoiceScreen',
    Screen: VoiceScreen,
    text: copy.voice,
    field: 'mode',
    values: ['guide', 'space', 'speak'],
    step: 3,
    back: '/onboarding/horizon',
    next: '/onboarding/rhythm',
    paths: true,
  },
];

const label = (option: { title: string; detail: string }) => `${option.title}. ${option.detail}`;

beforeEach(() => {
  jest.clearAllMocks();
  useOnboarding.setState({
    ...initialOnboarding,
    horizon: undefined,
    mode: undefined,
  } as Partial<OnboardingState>);
  setWindow(393, 852);
});

describe.each(cases)('$name', ({ Screen, text, field, values, step, back, next, paths }) => {
  const radio = (index: number) => screen.getByRole('radio', { name: label(text.options[index]!) });
  const cta = () => screen.getByRole('button', { name: text.cta });
  const stored = () => useOnboarding.getState()[field];

  it('shows the heading and three radios, with nothing chosen on first load', async () => {
    await render(<Screen />);
    expect(screen.getByRole('header', { name: text.title })).toBeTruthy();
    expect(screen.getByText(text.subtitle)).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    values.forEach((_, i) => {
      expect(radio(i)).not.toBeChecked();
      expect(radio(i)).not.toBeSelected();
    });
    expect(stored()).toBeUndefined();
  });

  it('keeps the CTA disabled, and explains why, until a choice is made', async () => {
    await render(<Screen />);
    expect(cta()).toBeDisabled();
    expect(cta().props.accessibilityHint).toBe(text.subtitle);
    await fireEvent.press(cta());
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('puts the title and detail in each radio label', async () => {
    await render(<Screen />);
    text.options.forEach((option, i) => {
      expect(radio(i).props.accessibilityLabel).toBe(`${option.title}. ${option.detail}`);
    });
  });

  it('selects one choice at a time, stores the right value, and cues a tick', async () => {
    await render(<Screen />);
    for (const [i, value] of values.entries()) {
      await fireEvent.press(radio(i));
      expect(stored()).toBe(value);
      expect(radio(i)).toBeChecked();
      expect(radio(i)).toBeSelected();
      values.forEach((_, other) => {
        if (other !== i) expect(radio(other)).not.toBeChecked();
      });
      expect(cue).toHaveBeenCalledTimes(i + 1);
      expect(cue).toHaveBeenLastCalledWith('tick');
    }
  });

  it('does not buzz or change anything when the chosen radio is pressed again', async () => {
    await render(<Screen />);
    await fireEvent.press(radio(1));
    await fireEvent.press(radio(1));
    expect(cue).toHaveBeenCalledTimes(1);
    expect(radio(1)).toBeChecked();
  });

  it('enables the CTA after a choice and goes to the next step', async () => {
    await render(<Screen />);
    await fireEvent.press(radio(0));
    expect(cta()).toBeEnabled();
    await fireEvent.press(cta());
    expect(router.navigate).toHaveBeenCalledWith(next);
  });

  it('restores a saved choice when returning to the step', async () => {
    useOnboarding.setState({ [field]: values[2] } as Partial<OnboardingState>);
    await render(<Screen />);
    expect(radio(2)).toBeChecked();
    expect(cta()).toBeEnabled();
  });

  it('goes back to the previous step', async () => {
    await render(<Screen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.navigate).toHaveBeenCalledWith(back);
  });

  it('announces its step of 8', async () => {
    await render(<Screen />);
    expect(screen.getByRole('progressbar', { name: `Step ${step} of 8` })).toBeTruthy();
  });

  it('hides the decorative path light from screen readers and touches', async () => {
    await render(<Screen />);
    const glows = screen.queryAllByTestId('path-glow', { includeHiddenElements: true });
    expect(glows).toHaveLength(paths ? 3 : 0);
    for (const glow of glows) {
      expect(glow.props.accessibilityElementsHidden).toBe(true);
      expect(glow.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(glow.props.pointerEvents).toBe('none');
    }
  });

  describe('touch targets', () => {
    const frame = (i: number) => StyleSheet.flatten(radio(i).props.style);

    it('makes every radio at least 44 x 44 pt, with its text inside the target', async () => {
      await render(<Screen />);
      text.options.forEach((option, i) => {
        expect(frame(i).height).toBeGreaterThanOrEqual(44);
        expect(frame(i).width).toBeGreaterThanOrEqual(44);
        expect(within(radio(i)).getByText(option.title)).toBeTruthy();
      });
    });

    it.each([
      [320, 568],
      [360, 780],
      [393, 852],
      [430, 932],
    ])('keeps targets apart and on screen at %i x %i', async (width, height) => {
      setWindow(width, height);
      await render(<Screen />);
      const rects = text.options.map((_, i) => {
        const { left, width: w } = frame(i);
        return { left: left as number, right: (left as number) + (w as number) };
      });
      rects.forEach((rect, i) => {
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.right).toBeLessThanOrEqual(width);
        if (i > 0) expect(rect.left).toBeGreaterThanOrEqual(rects[i - 1]!.right);
      });
    });
  });

  describe('at large text sizes and in landscape', () => {
    it('switches to a list at 125% text, with the same radio semantics', async () => {
      setWindow(393, 852, 1.5);
      await render(<Screen />);
      expect(screen.queryByTestId('choice-scene')).toBeNull();
      expect(screen.queryAllByTestId('path-glow', { includeHiddenElements: true })).toHaveLength(0);
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      expect(cta()).toBeDisabled();
      await fireEvent.press(radio(1));
      expect(stored()).toBe(values[1]);
      expect(radio(1)).toBeChecked();
      expect(cue).toHaveBeenCalledTimes(1);
      await fireEvent.press(cta());
      expect(router.navigate).toHaveBeenCalledWith(next);
    });

    it('uses the list in landscape, where the portrait photograph would run off screen', async () => {
      setWindow(852, 393);
      await render(<Screen />);
      expect(screen.queryByTestId('choice-scene')).toBeNull();
      expect(screen.getAllByRole('radio')).toHaveLength(3);
    });

    it('uses the list on a tablet, where the choices would land off the scenery', async () => {
      setWindow(768, 1024);
      await render(<Screen />);
      expect(screen.queryByTestId('choice-scene')).toBeNull();
      expect(screen.getAllByRole('radio')).toHaveLength(3);
    });

    it('keeps the scene on the largest phones, which are 440 pt wide', async () => {
      setWindow(440, 956);
      await render(<Screen />);
      expect(screen.getByTestId('choice-scene')).toBeTruthy();
    });

    it('keeps the scene at 120% text, below the list threshold', async () => {
      setWindow(393, 852, 1.2);
      await render(<Screen />);
      expect(screen.getByTestId('choice-scene')).toBeTruthy();
    });
  });
});

describe('scenes', () => {
  it('measure three choices per scene, left to right', () => {
    for (const scene of [HORIZON_SCENE, VOICE_SCENE]) {
      expect(scene.choices).toHaveLength(3);
      const xs = scene.choices.map((c) => c.ring.x);
      expect(xs).toEqual([...xs].sort((a, b) => a - b));
    }
  });

  it('gives every Voice choice a path to light and a stem that lands on it', () => {
    for (const { path, ring } of VOICE_SCENE.choices) {
      expect(path).toBeDefined();
      expect(path!.line.length).toBeGreaterThan(5);
      expect(path!.stemEnd).toBeGreaterThan(ring.y);
    }
    expect(HORIZON_SCENE.choices.every((c) => c.path === undefined)).toBe(true);
  });

  it('breaks a detail line where the golden does, and never alters the words', () => {
    const detail = copy.horizon.options[0]!.detail;
    expect(breakDetail(detail, 3)).toBe('A memory or\nsomething unfinished');
    expect(breakDetail(detail, 3).replace('\n', ' ')).toBe(detail);
    expect(breakDetail(detail)).toBe(detail);
  });
});
