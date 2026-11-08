import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { useReduceMotion } from '@/design/useReduceMotion';
import { render } from '@/testing/render';

import { TideLine } from './TideLine';

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;

const measured = async (width = 300) => {
  await fireEvent(screen.getByTestId('tide-line', { includeHiddenElements: true }), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 1 } },
  });
};
const light = () => {
  const line = screen.getByTestId('tide-line', { includeHiddenElements: true });
  // track > light > gradient
  const child = line.children[0] as unknown as { props: { style: unknown } };
  return StyleSheet.flatten(child.props.style as never) as {
    width: number;
    opacity: number;
    transform: { translateX: number }[];
  };
};

beforeEach(() => reduced.mockReturnValue(false));

describe('TideLine', () => {
  it('is a hairline along the bottom edge that lets every touch through, and no spinner', async () => {
    await render(<TideLine />);
    const line = screen.getByTestId('tide-line', { includeHiddenElements: true });
    expect(line.props.pointerEvents).toBe('none');
    const track = StyleSheet.flatten(line.props.style);
    expect(track).toMatchObject({ position: 'absolute', bottom: 0, height: 1, overflow: 'hidden' });
    expect(screen.queryByRole('progressbar', { hidden: true })).toBeNull();
  });

  it('keeps the same inset as the rule it runs along', async () => {
    await render(<TideLine inset={16} />);
    const track = StyleSheet.flatten(
      screen.getByTestId('tide-line', { includeHiddenElements: true }).props.style,
    );
    expect(track).toMatchObject({ left: 16, right: 16 });
  });

  it('draws its light 28 percent of the line once it has been measured', async () => {
    await render(<TideLine />);
    await measured(300);
    expect(light().width).toBeCloseTo(84, 5);
  });

  it('starts just outside the left end, where it cannot be seen', async () => {
    await render(<TideLine />);
    await measured(300);
    expect(light().transform[0]?.translateX).toBeCloseTo(-84, 5);
  });

  it('holds still under Reduce Motion: a wider, dimmer light, centred', async () => {
    reduced.mockReturnValue(true);
    await render(<TideLine />);
    await measured(300);
    const still = light();
    expect(still.width).toBeCloseTo(165, 5);
    expect(still.opacity).toBe(0.7);
    expect(still.transform[0]?.translateX).toBeCloseTo((300 - 165) / 2, 5);
  });
});
