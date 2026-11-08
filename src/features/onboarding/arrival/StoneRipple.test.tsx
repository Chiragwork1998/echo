import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { withDelay, withTiming } from 'react-native-reanimated';

import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { WATER } from './geometry';
import { HANDOVER, IMPACT_DELAY } from './impact';
import { StoneRipple } from './StoneRipple';

jest.mock('react-native-reanimated', () => {
  const base = jest.requireActual('@/testing/reanimatedMock').reanimatedMock;
  return {
    ...base,
    withTiming: jest.fn((value: unknown) => value),
    withDelay: jest.fn((_delay: number, value: unknown) => value),
  };
});

const AT = { x: 200, y: 500 };
const flush = () => act(async () => {});
const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

function ripple(mood: keyof typeof WATER, active: boolean) {
  return (
    <ThemeProvider crossfade={false}>
      <StoneRipple at={AT} rx={70} ry={24} active={active} water={WATER[mood]} />
    </ThemeProvider>
  );
}

/** Every ellipse the SVG layer has drawn, as the native view tree holds it. */
function ellipses() {
  const found: { strokeOpacity?: number; testID?: string }[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const { type, props, children } = node as {
      type?: string;
      props?: { strokeOpacity?: number; testID?: string };
      children?: unknown[];
    };
    if (type === 'RNSVGEllipse') found.push(props ?? {});
    children?.forEach(walk);
  };
  walk(screen.toJSON());
  return found;
}

const impactRing = () => screen.queryByTestId('stone-impact', { includeHiddenElements: true });
const timings = () =>
  jest.mocked(withTiming).mock.calls.map(([, config]) => config as Record<string, unknown>);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
});
afterEach(() => jest.useRealTimers());

describe('StoneRipple impact ring', () => {
  it('sends one ring from a stone the moment it is chosen', async () => {
    const view = await render(ripple('steady', false));
    await flush();
    expect(impactRing()).toBeNull();
    await view.rerender(ripple('steady', true));
    await flush();
    expect(screen.getAllByTestId('stone-impact', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('does not send one for a stone that was already chosen when the screen opened', async () => {
    await render(ripple('steady', true));
    await flush();
    expect(impactRing()).toBeNull();
  });

  it('lets the ring go once it has spread and faded, so nothing is left drawn', async () => {
    const view = await render(ripple('light', false));
    await flush();
    await view.rerender(ripple('light', true));
    await flush();
    expect(impactRing()).not.toBeNull();
    // Just before it is done, it is still there; after, it is gone.
    await advance(IMPACT_DELAY + WATER.light.impact.ms - 100);
    expect(impactRing()).not.toBeNull();
    await advance(400);
    expect(impactRing()).toBeNull();
  });

  it('draws the ring unseen, so a frame before the first tick shows nothing', async () => {
    const view = await render(ripple('heavy', false));
    await flush();
    await view.rerender(ripple('heavy', true));
    await flush();
    const ring = ellipses().find((ellipse) => ellipse.testID === 'stone-impact');
    expect(ring?.strokeOpacity ?? 0).toBe(0);
  });

  it('sends a fresh ring each time the stone is chosen again', async () => {
    const view = await render(ripple('numb', false));
    await flush();
    await view.rerender(ripple('numb', true));
    await flush();
    await advance(5000);
    expect(impactRing()).toBeNull();
    await view.rerender(ripple('numb', false));
    await flush();
    await view.rerender(ripple('numb', true));
    await flush();
    expect(impactRing()).not.toBeNull();
  });

  it("starts the ring after the beat, over the mood's own time, and lets the standing rings follow", async () => {
    const view = await render(ripple('heavy', false));
    await flush();
    jest.mocked(withDelay).mockClear();
    jest.mocked(withTiming).mockClear();
    await view.rerender(ripple('heavy', true));
    await flush();
    const delays = jest.mocked(withDelay).mock.calls.map(([delay]) => delay);
    const { impact, cycle } = WATER.heavy;
    expect(delays).toContain(IMPACT_DELAY);
    const lead = HANDOVER * impact.ms;
    for (const index of [0, 1, 2]) expect(delays).toContain(lead + (index * cycle) / 3);
    const durations = timings().map((config) => config.duration);
    expect(durations).toContain(impact.ms);
    expect(durations).toContain(cycle);
    expect(durations).toContain(WATER.heavy.twinkle);
  });

  it('starts the standing rings at once when the stone was already chosen', async () => {
    await render(ripple('light', true));
    await flush();
    const delays = jest.mocked(withDelay).mock.calls.map(([delay]) => delay);
    expect(delays).toEqual(expect.arrayContaining([0, WATER.light.cycle / 3]));
    expect(delays).not.toContain(IMPACT_DELAY);
  });
});

describe('StoneRipple presence', () => {
  const presence = () => timings().filter((config) => config.reduceMotion === 'never');

  it('comes up quickly on a decelerating curve, and goes slowly when another stone is chosen', async () => {
    const view = await render(ripple('steady', false));
    await flush();
    jest.mocked(withTiming).mockClear();
    await view.rerender(ripple('steady', true));
    await flush();
    expect(presence()).toContainEqual(
      expect.objectContaining({ duration: tokens.motion.standard, reduceMotion: 'never' }),
    );
    jest.mocked(withTiming).mockClear();
    await view.rerender(ripple('steady', false));
    await flush();
    expect(presence()).toContainEqual(
      expect.objectContaining({ duration: tokens.motion.atmosphere, reduceMotion: 'never' }),
    );
  });

  it('never shows the ring in the same place twice at once: the old rings are kept to fade, not cut', async () => {
    const view = await render(ripple('heavy', true));
    await flush();
    await view.rerender(ripple('heavy', false));
    await flush();
    // The layer stays mounted (it fades out) and its rings are not removed.
    expect(screen.getByTestId('stone-ripple', { includeHiddenElements: true })).toBeTruthy();
    expect(ellipses().length).toBeGreaterThanOrEqual(3);
  });
});

describe('StoneRipple with Reduce Motion', () => {
  beforeEach(() => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  });

  it("draws the golden's three still rings, with no ring sent out and no cycles", async () => {
    const view = await render(ripple('heavy', false));
    await flush();
    await view.rerender(ripple('heavy', true));
    await flush();
    expect(impactRing()).toBeNull();
    const rings = ellipses().filter((ellipse) => (ellipse.strokeOpacity ?? 0) > 0);
    expect(rings).toHaveLength(3);
    expect(jest.mocked(withDelay)).not.toHaveBeenCalled();
    const durations = timings().map((config) => config.duration);
    expect(durations).not.toContain(WATER.heavy.cycle);
    expect(durations).not.toContain(WATER.heavy.impact.ms);
  });

  it('fades the glow in as opacity alone, in no more than 180 ms', async () => {
    const view = await render(ripple('steady', false));
    await flush();
    jest.mocked(withTiming).mockClear();
    await view.rerender(ripple('steady', true));
    await flush();
    const fades = timings().filter((config) => config.reduceMotion === 'never');
    expect(fades).toContainEqual(expect.objectContaining({ duration: tokens.motion.fast }));
    for (const fade of fades) expect(fade.duration as number).toBeLessThanOrEqual(180);
  });
});
