// The shade under the quiet row and the row itself are one thing: they come together and they go
// together. The stand-in for Reanimated records how each fade was asked for; the curves are judged
// by eye, frame by frame.
import { fireEvent, screen } from '@testing-library/react-native';
import { withTiming } from 'react-native-reanimated';

import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { render } from '@/testing/render';

import { QuietControls } from './QuietControls';
import { QUIET_FADE, Wash } from './Wash';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
  withTiming: jest.fn((value: unknown) => value),
}));
let mockReduced = false;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));

const last = () => jest.mocked(withTiming).mock.calls.at(-1)!;

// A rerender replaces the whole tree, so the providers go back around it.
const wrap = (ui: React.ReactElement) => <ThemeProvider crossfade={false}>{ui}</ThemeProvider>;
const rendered = async (ui: React.ReactElement) => {
  const view = await render(ui);
  return { rerender: (next: React.ReactElement) => view.rerender(wrap(next)) };
};

beforeEach(() => {
  mockReduced = false;
  jest.mocked(withTiming).mockClear();
});

describe('the ground shade', () => {
  it('rides with the quiet row: it comes in 900 ms and leaves in 200 ms, on the row’s curve', async () => {
    const shade = (visible: boolean) => <Wash kind="ground" quiet visible={visible} style={{}} />;
    const { rerender } = await rendered(shade(true));
    expect(last()[0]).toBe(1);
    expect(last()[1]).toMatchObject({ duration: QUIET_FADE.come });
    await rerender(shade(false));
    expect(last()[0]).toBe(0);
    expect(last()[1]).toMatchObject({ duration: QUIET_FADE.go });
    expect(QUIET_FADE).toEqual({ come: 900, go: 200, reduced: tokens.motion.fast });
  });

  it('leaves the shades that are not the session’s as they were: 900 in and 600 out', async () => {
    const shade = (visible: boolean) => <Wash kind="sky" visible={visible} style={{}} />;
    const { rerender } = await rendered(shade(true));
    expect(last()[1]).toMatchObject({ duration: 900 });
    await rerender(shade(false));
    expect(last()[1]).toMatchObject({ duration: 600 });
  });

  it('goes as slowly as it is asked to, where something else goes as slowly (Breathe’s dark: 3 s)', async () => {
    const shade = (visible: boolean) => (
      <Wash kind="ground" visible={visible} goMs={3000} style={{}} />
    );
    const { rerender } = await rendered(shade(true));
    // Coming is the same as ever; only the leaving takes its own time.
    expect(last()[1]).toMatchObject({ duration: 900 });
    await rerender(shade(false));
    expect(last()[1]).toMatchObject({ duration: 3000 });
    // A shade that rides with the quiet row keeps the row's own 200 ms whatever it is asked.
    const quiet = (visible: boolean) => (
      <Wash kind="ground" quiet visible={visible} goMs={3000} style={{}} />
    );
    await rerender(quiet(true));
    await rerender(quiet(false));
    expect(last()[1]).toMatchObject({ duration: QUIET_FADE.go });
  });

  it('is a plain fade under Reduce Motion: the quiet row’s own under the row, 160 ms elsewhere', async () => {
    mockReduced = true;
    const { rerender } = await rendered(<Wash kind="ground" quiet visible style={{}} />);
    expect(last()[1]).toMatchObject({ duration: QUIET_FADE.reduced });
    await rerender(<Wash kind="sky" visible={false} style={{}} />);
    expect(last()[1]).toMatchObject({ duration: 160 });
  });
});

describe('the quiet row', () => {
  const row = (visible: boolean) => (
    <QuietControls
      visible={visible}
      middle="write"
      middleDisabled={false}
      canReflect={false}
      reflecting={false}
      onBack={jest.fn()}
      onMiddle={jest.fn()}
      onReflect={jest.fn()}
    />
  );

  it('uses the very same two lengths as the shade, so the two cannot drift apart', async () => {
    const { rerender } = await rendered(row(true));
    expect(last()[1]).toMatchObject({ duration: QUIET_FADE.come });
    await rerender(row(false));
    expect(last()[1]).toMatchObject({ duration: QUIET_FADE.go });
    // The least a fade may be (docs/DESIGN_QUALITY.md).
    expect(QUIET_FADE.go).toBeGreaterThanOrEqual(200);
  });

  it('fades with its shade under Reduce Motion too, in the same 180 ms', async () => {
    mockReduced = true;
    const { rerender } = await rendered(row(true));
    expect(last()[1]).toMatchObject({ duration: QUIET_FADE.reduced });
    await rerender(row(false));
    expect(last()[1]).toMatchObject({ duration: QUIET_FADE.reduced });
    expect(QUIET_FADE.reduced).toBe(tokens.motion.fast);
  });

  it('brings Reflect up with the house curve rather than whole, and still presses', async () => {
    const onReflect = jest.fn();
    const { rerender } = await rendered(
      <QuietControls
        visible
        middle="write"
        middleDisabled={false}
        canReflect={false}
        reflecting={false}
        onBack={jest.fn()}
        onMiddle={jest.fn()}
        onReflect={onReflect}
      />,
    );
    expect(screen.queryByTestId('quiet-reflect')).toBeNull();
    await rerender(
      <QuietControls
        visible
        middle="write"
        middleDisabled={false}
        canReflect
        reflecting={false}
        onBack={jest.fn()}
        onMiddle={jest.fn()}
        onReflect={onReflect}
      />,
    );
    expect(screen.getByTestId('quiet-reflect-arrive')).toBeTruthy();
    expect(last()[1]).toMatchObject({ duration: 600 });
    await fireEvent.press(screen.getByTestId('quiet-reflect'));
    expect(onReflect).toHaveBeenCalledTimes(1);
  });
});
