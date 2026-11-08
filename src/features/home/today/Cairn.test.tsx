import { screen } from '@testing-library/react-native';

import { render } from '@/testing/render';

import { BuildingCairn, Cairn } from './Cairn';
import {
  OUTLINE_OUT_MS,
  REDUCED_MS,
  SHADE_LAG_MS,
  SHADE_MS,
  STONE_DROP,
  STONE_DROP_MS,
  STONE_STAGGER_MS,
} from './stoneMotion';

// An ellipse becomes a plain view that keeps every prop it is given, so the test can read what the
// drawing is told. The animation's own props are the ones the drawing is moved by.
jest.mock('react-native-svg', () => {
  const actual = jest.requireActual('react-native-svg');
  const { View } = jest.requireActual('react-native');
  return {
    ...actual,
    __esModule: true,
    Ellipse: (props: object) => <View testID="ellipse" {...props} />,
    G: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View testID="group" {...props}>
        {children}
      </View>
    ),
  };
});

type Drawn = { cx: number; cy: number; rx: number; ry: number; fill: string };
type Props = Drawn & { animatedProps?: { cy: number; opacity: number } };

const SIZE = 23;
const ellipses = () => screen.getAllByTestId('ellipse').map((node) => node.props as Props);
/** The filled ellipses are the stack; the dashed ones are the open outline. */
const stack = () => ellipses().filter((props) => props.fill !== 'none');
// Gradient ids are unique per instance; what they point at is what matters.
const plain = (fill: string) => fill.replace(/#cairn\w+([sgc])\)/, '#$1)');
const shape = ({ cx, cy, rx, ry, fill }: Drawn) => ({ cx, cy, rx, ry, fill: plain(fill) });

/** Records every delay and duration the cairn asks of the animation, and resolves them at once. */
function spyOnTimings() {
  const reanimated = jest.requireMock('react-native-reanimated');
  const delays: number[] = [];
  const durations: number[] = [];
  jest.spyOn(reanimated, 'withDelay').mockImplementation(((at: number, value: unknown) => {
    delays.push(at);
    return value;
  }) as never);
  jest.spyOn(reanimated, 'withTiming').mockImplementation(((
    _to: number,
    options: { duration: number },
  ) => {
    durations.push(options.duration);
    return 1;
  }) as never);
  return { delays, durations };
}

afterEach(() => jest.restoreAllMocks());

describe('the cairn being built', () => {
  it('rests on exactly the drawing the built cairn is', async () => {
    const built = await render(<Cairn built size={SIZE} />);
    const plainStack = stack().map(shape);
    expect(plainStack).toHaveLength(8);
    await built.unmount();

    await render(<BuildingCairn size={SIZE} initial={1} />);
    const finished = stack().map((props) =>
      shape({ ...props, cy: props.animatedProps?.cy ?? Number.NaN }),
    );
    expect(finished).toEqual(plainStack);
    // Every part is fully there.
    expect(stack().every((props) => props.animatedProps?.opacity === 1)).toBe(true);
  });

  it('lets the open outline go entirely', async () => {
    await render(<BuildingCairn size={SIZE} initial={1} />);
    const outline = screen
      .getAllByTestId('group')
      .map((node) => node.props as { animatedProps?: { opacity: number } })
      .filter((props) => props.animatedProps !== undefined);
    expect(outline).toHaveLength(1);
    expect(outline[0]?.animatedProps?.opacity).toBe(0);
  });

  it('starts each stone ten units above its place and unseen, then drops it', async () => {
    const built = await render(<Cairn built size={SIZE} />);
    const resting = stack().map(({ cy }) => cy);
    await built.unmount();
    await render(<BuildingCairn size={SIZE} />);
    const starting = stack().map((props) => props.animatedProps);
    // The ground and the shades stay where they are; only the four stones come down from above.
    const dropped = starting.map((now, i) => (resting[i] ?? 0) - (now?.cy ?? 0)).filter(Boolean);
    expect(dropped).toEqual([STONE_DROP, STONE_DROP, STONE_DROP, STONE_DROP]);
    expect(starting.every((now) => now?.opacity === 0)).toBe(true);
  });

  it('builds from the base up, 110 ms apart, each shade after the stone that makes it', async () => {
    const { delays, durations } = spyOnTimings();
    await render(<BuildingCairn size={SIZE} />);
    expect(delays.slice().sort((a, b) => a - b)).toEqual([
      // The outline lets go and the ground shadow arrives with the first stone.
      0,
      0,
      0,
      STONE_STAGGER_MS,
      2 * STONE_STAGGER_MS,
      STONE_STAGGER_MS + SHADE_LAG_MS,
      3 * STONE_STAGGER_MS,
      2 * STONE_STAGGER_MS + SHADE_LAG_MS,
      3 * STONE_STAGGER_MS + SHADE_LAG_MS,
    ]);
    // Four stones and the ground shadow; then the three shades and the outline, which take as long.
    expect(durations.filter((ms) => ms === STONE_DROP_MS)).toHaveLength(5);
    expect(SHADE_MS).toBe(OUTLINE_OUT_MS);
    expect(durations.filter((ms) => ms === SHADE_MS)).toHaveLength(4);
  });

  it('with Reduce Motion fades the whole stack in together, over 180 ms, and moves nothing', async () => {
    const built = await render(<Cairn built size={SIZE} />);
    const resting = stack().map(({ cy }) => cy);
    await built.unmount();

    const { delays, durations } = spyOnTimings();
    await render(<BuildingCairn size={SIZE} reduced />);
    // From the very first draw every part is where it ends up, and only unseen.
    expect(stack().map((props) => props.animatedProps?.cy)).toEqual(resting);
    expect(stack().every((props) => props.animatedProps?.opacity === 0)).toBe(true);
    expect(new Set(delays)).toEqual(new Set([0]));
    expect(new Set(durations)).toEqual(new Set([REDUCED_MS]));
    expect(REDUCED_MS).toBeLessThanOrEqual(180);
  });

  it('is nothing a screen reader meets', async () => {
    await render(<BuildingCairn size={SIZE} />);
    expect(
      screen.getByTestId('cairn-building', { includeHiddenElements: true }).props.accessible,
    ).toBe(false);
  });
});
