// The dark that Arrive leaves is lifted by its own animation, and taken away when that has ended: a UI
// thread that begins it seconds late (the walked emulator began animations 1.8 to 2.1 s late) must never
// have the dark removed in the middle of the lift, which is the cut the lift is there to prevent.
import { act, screen } from '@testing-library/react-native';

import { tokens } from '@/design/tokens';
import { netAfterBegin } from '@/features/book/animationEnd';
import { ANIMATION_NET_MS, UI_HANG_MS } from '@/features/book/ritual';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { DarkLift } from './DarkLift';

let mockReduced = false;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));

const LIFT_MS = 700;
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const lift = () => screen.queryByTestId('arrive-lift', { includeHiddenElements: true });

beforeEach(() => {
  mockReduced = false;
  animationClock.reset();
  jest.useFakeTimers();
});
afterEach(() => {
  animationClock.reset();
  jest.useRealTimers();
});

describe('the dark lifting', () => {
  it('is taken away when it has lifted', async () => {
    await render(<DarkLift from={1} />);
    expect(lift()).toBeTruthy();
    await tick(LIFT_MS - 1);
    expect(lift()).toBeTruthy();
    await tick(1);
    expect(lift()).toBeNull();
  });

  it('is nothing at all for a person who tapped early and left it at 0', async () => {
    await render(<DarkLift from={0} />);
    expect(lift()).toBeNull();
  });

  it('stays for as long as the lift takes on a UI thread that begins it two seconds late', async () => {
    animationClock.lag = 2000;
    await render(<DarkLift from={1} />);
    // The old clock took the dark away 750 ms after JS asked for the lift: a cut, before it had begun.
    await tick(LIFT_MS + 50 + 100);
    expect(lift()).toBeTruthy();
    await tick(2000 + LIFT_MS - (LIFT_MS + 150) - 1);
    expect(lift()).toBeTruthy();
    await tick(2);
    expect(lift()).toBeNull();
  });

  it('is let go of a net after it was due, from its first frame, if the UI thread never says it is over', async () => {
    animationClock.lag = 2000;
    animationClock.silent = true;
    await render(<DarkLift from={1} />);
    await tick(2000 + netAfterBegin(LIFT_MS) - 2);
    expect(lift()).toBeTruthy();
    await tick(4);
    expect(lift()).toBeNull();
  });

  it('is let go of a very long time after it was due, if the UI thread never begins it', async () => {
    animationClock.lag = 1_000_000;
    await render(<DarkLift from={1} />);
    await tick(LIFT_MS + 1500 + ANIMATION_NET_MS + 100);
    expect(lift()).toBeTruthy();
    await tick(UI_HANG_MS);
    expect(lift()).toBeNull();
  });

  it('is a plain fade of 180 ms under Reduce Motion', async () => {
    mockReduced = true;
    await render(<DarkLift from={1} />);
    await tick(tokens.motion.fast - 1);
    expect(lift()).toBeTruthy();
    await tick(1);
    expect(lift()).toBeNull();
  });
});
