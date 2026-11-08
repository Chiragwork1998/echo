// The mark that is made as the entry is held: a ring inked clockwise from the top, a dot that lands,
// a lock that shuts, and a card that rises into its place. The stand-in for Reanimated resolves every
// animation to its end, so these prove the geometry at rest, what is asked for and when. The motion
// itself is judged frame by frame.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { withDelay, withTiming } from 'react-native-reanimated';

import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { render } from '@/testing/render';

import { CardArrival } from './CardArrival';
import { DOT_RADIUS, RING, Seal, ringStroke } from './Seal';
import { LOCK, SealedLock } from './SealedLock';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
  withTiming: jest.fn((value: unknown) => value),
  withDelay: jest.fn((_delay: number, value: unknown) => value),
}));
let mockReduced = false;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));

const wrap = (ui: React.ReactElement) => <ThemeProvider crossfade={false}>{ui}</ThemeProvider>;
// The stand-in reads a shared value when the screen is drawn, and an effect sets it after the first
// draw: so what an animation comes to shows at the second.
const settle = async (make: () => React.ReactElement) => {
  const view = await render(make());
  await view.rerender(wrap(make()));
  return view;
};

beforeEach(() => {
  mockReduced = false;
  jest.mocked(withTiming).mockClear();
  jest.mocked(withDelay).mockClear();
});

const CIRCUMFERENCE = 2 * Math.PI * 9;
const ring = () => screen.getByTestId('seal-ring', { includeHiddenElements: true });
const dot = () =>
  StyleSheet.flatten(screen.getByTestId('seal-dot', { includeHiddenElements: true }).props.style);

describe('the seal', () => {
  it('draws its ring by sliding one dash the length of the circle off the start of the path', () => {
    expect(CIRCUMFERENCE).toBeCloseTo(56.55, 2);
    expect(ringStroke(0).strokeDashoffset).toBeCloseTo(CIRCUMFERENCE, 6);
    expect(ringStroke(0.5).strokeDashoffset).toBeCloseTo(CIRCUMFERENCE / 2, 6);
    expect(ringStroke(1).strokeDashoffset).toBe(0);
  });

  it('shows no stroke until some of the ring is drawn, so a round cap is never seen alone', () => {
    expect(ringStroke(0).strokeOpacity).toBe(0);
    expect(ringStroke(0.025).strokeOpacity).toBeCloseTo(0.5, 6);
    expect(ringStroke(0.05).strokeOpacity).toBe(1);
    expect(ringStroke(1).strokeOpacity).toBe(1);
  });

  it('is turned a quarter, once and for good, so that it starts at the top and goes clockwise', async () => {
    await render(<Seal listening={false} />);
    // A quarter turn about the middle of its 20 point board, in the drawing and not in an animation.
    const [a, b, c, d, e, f] = ring().props.matrix as number[];
    expect([a, b, c, d, e, f].map((n) => Math.round(n! * 1000) / 1000 + 0)).toEqual([
      0, -1, 1, 0, 0, 20,
    ]);
    expect(ring().props.strokeDasharray).toEqual([CIRCUMFERENCE, CIRCUMFERENCE]);
    expect(dot().opacity).toBe(0);
  });

  it('ends at the golden\u2019s ring and dot', async () => {
    await settle(() => <Seal listening={false} />);
    expect(RING).toEqual({ radius: 9, stroke: 1.1 });
    expect(DOT_RADIUS).toBe(3.9);
    expect(ring().props.r).toBe(9);
    expect(ring().props.strokeWidth).toBe(1.1);
    expect(dot().opacity).toBe(1);
    expect(dot().transform).toEqual([{ scale: 1 }]);
  });

  it('inks the ring over 520 ms and lands the dot over 320, from a start that can be moved', async () => {
    await render(<Seal listening={false} startAt={620} />);
    const delays = jest.mocked(withDelay).mock.calls.map(([delay]) => delay);
    expect(delays).toEqual([620 + 260, 620 + 680]);
    const spans = jest
      .mocked(withTiming)
      .mock.calls.map(([, config]) => (config as { duration: number }).duration);
    expect(spans.slice(0, 2)).toEqual([520, 320]);
  });

  it('starts when the screen has settled unless it is told later', async () => {
    await render(<Seal listening={false} />);
    expect(jest.mocked(withDelay).mock.calls[0]?.[0]).toBe(tokens.motion.standard + 260);
  });

  it('is drawn at rest at once under Reduce Motion', async () => {
    mockReduced = true;
    await render(<Seal listening={false} />);
    expect(ring().props.r).toBe(9);
    expect(ring().props.strokeWidth).toBe(1.1);
    expect(dot().opacity).toBe(1);
    expect(dot().transform).toEqual([{ scale: 1 }]);
    expect(jest.mocked(withDelay)).not.toHaveBeenCalled();
  });

  it('still breathes while a reflection is on its way', async () => {
    await settle(() => <Seal listening />);
    expect(dot().opacity).toBeGreaterThan(0);
  });
});

describe('the lock', () => {
  const asset = readFileSync(join(process.cwd(), 'assets/icons/lock.svg'), 'utf8');

  it('is exactly the asset’s own lock, in two pieces', () => {
    const rect = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="(\d+)"/.exec(asset);
    expect(rect?.slice(1).map(Number)).toEqual([
      LOCK.body.x,
      LOCK.body.y,
      LOCK.body.width,
      LOCK.body.height,
      LOCK.body.rx,
    ]);
    const path = /<path d="([^"]+)"/.exec(asset)?.[1];
    // The asset draws the shackle and the keyhole as one path: here they are two, drawn apart.
    expect(`${LOCK.shackle}${LOCK.keyhole}`).toBe(path);
    expect(asset).toContain(`stroke-width="${LOCK.stroke}"`);
    expect(asset).toContain('stroke-linecap="round"');
    expect(asset).toContain('viewBox="0 0 24 24"');
    expect(LOCK.size).toBe(24);
  });

  it('draws the shackle apart from the body so that it can drop', async () => {
    await render(<SealedLock size={16} color="#fff" startAt={900} />);
    expect(screen.getByTestId('sealed-lock-shackle', { includeHiddenElements: true })).toBeTruthy();
  });

  it('closes: the shackle lifts at first and ends flush, and the body is in', async () => {
    await render(<SealedLock size={16} color="#fff" startAt={900} />);
    // Open, and unseen, until it is time.
    expect(
      StyleSheet.flatten(
        screen.getByTestId('sealed-lock-shackle', { includeHiddenElements: true }).props.style,
      ),
    ).toMatchObject({
      opacity: 0,
      transform: [{ translateY: -2.5 * (16 / 24) }],
    });
    expect(jest.mocked(withDelay).mock.calls.map(([delay]) => delay)).toEqual([900, 900]);
    expect(
      jest.mocked(withTiming).mock.calls.map(([, c]) => (c as { duration: number }).duration),
    ).toEqual([220, 240]);
  });

  it('is drawn closed under Reduce Motion', async () => {
    mockReduced = true;
    await render(<SealedLock size={16} color="#fff" startAt={900} />);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('sealed-lock-shackle', { includeHiddenElements: true }).props.style,
      ),
    ).toMatchObject({
      opacity: 1,
      transform: [{ translateY: 0 }],
    });
  });
});

describe('the card arriving', () => {
  const style = () => StyleSheet.flatten(screen.getByTestId('card-arrival').props.style);

  it('rises into its place from 24 pt below, as clear glass comes up, 120 ms after the screen', async () => {
    await render(
      <CardArrival>
        <></>
      </CardArrival>,
    );
    expect(style()).toMatchObject({ opacity: 0, transform: [{ translateY: 24 }] });
    expect(jest.mocked(withDelay).mock.calls.map(([delay]) => delay)).toEqual([120, 120]);
    expect(
      jest.mocked(withTiming).mock.calls.map(([, c]) => (c as { duration: number }).duration),
    ).toEqual([560, 320]);
  });

  it('rests exactly where the golden has it', async () => {
    await settle(() => (
      <CardArrival>
        <></>
      </CardArrival>
    ));
    expect(style()).toMatchObject({ opacity: 1, transform: [{ translateY: 0 }] });
  });

  it('does not rise under Reduce Motion', async () => {
    mockReduced = true;
    await render(
      <CardArrival>
        <></>
      </CardArrival>,
    );
    expect(style()).toMatchObject({ opacity: 1, transform: [{ translateY: 0 }] });
    expect(jest.mocked(withTiming)).not.toHaveBeenCalled();
  });
});
