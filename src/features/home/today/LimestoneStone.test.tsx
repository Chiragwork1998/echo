import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { render } from '@/testing/render';

import { LimestoneStone } from './LimestoneStone';

jest.mock('@/design/haptics');

const stone = () => (
  <LimestoneStone
    title="Begin"
    arcCaption="Your seven minutes"
    accessibilityLabel="Begin"
    onPress={jest.fn()}
  />
);

type Change = (reduced: boolean) => void;
// Everything that listens: the stone, and the theme around it.
let reduceMotionChanged: Change[] = [];

beforeEach(() => {
  reduceMotionChanged = [];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    type: string,
    handler: unknown,
  ) => {
    if (type === 'reduceMotionChanged') reduceMotionChanged.push(handler as Change);
    return { remove: jest.fn() };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

/** The stone's own layer, as it is drawn now. */
const bodyStyle = () =>
  StyleSheet.flatten(screen.getByTestId('home-stone-body').props.style) as {
    opacity: number;
    transform: { translateY: number; scale: number }[];
  };
const pose = () => {
  const [lift, scale] = bodyStyle().transform;
  return { opacity: bodyStyle().opacity, translateY: lift?.translateY, scale: scale?.scale };
};
const pressIn = async (view: Awaited<ReturnType<typeof render>>) => {
  await fireEvent(screen.getByTestId('home-begin-stone'), 'pressIn');
  // The test double shows an animation's end on the next draw.
  await view.rerender(<ThemeProvider crossfade={false}>{stone()}</ThemeProvider>);
};

describe('pressing the stone', () => {
  it('settles it into its shadow: a little lower and a little smaller', async () => {
    const view = await render(stone());
    expect(pose()).toEqual({ opacity: 1, translateY: 0, scale: 1 });
    await pressIn(view);
    expect(pose()).toEqual({ opacity: 1, translateY: 2.5, scale: 0.968 });
  });

  it('with Reduce Motion only dims it: no sink and no scale', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const view = await render(stone());
    await act(async () => undefined);
    await pressIn(view);
    expect(pose()).toEqual({ opacity: 0.86, translateY: 0, scale: 1 });
  });
});

describe('the halo', () => {
  const cancelled = () => {
    const reanimated = jest.requireMock('react-native-reanimated');
    return jest.spyOn(reanimated, 'cancelAnimation');
  };

  it('stops driving anything when the stone goes', async () => {
    const stopped = cancelled();
    const view = await render(stone());
    expect(stopped).not.toHaveBeenCalled();
    await view.unmount();
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('stops, and rests, when Reduce Motion is turned on', async () => {
    const stopped = cancelled();
    await render(stone());
    await act(async () => undefined);
    expect(stopped).not.toHaveBeenCalled();
    await act(async () => reduceMotionChanged.forEach((listener) => listener(true)));
    expect(stopped).toHaveBeenCalledTimes(1);
  });
});
