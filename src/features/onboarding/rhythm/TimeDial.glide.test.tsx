// The reminder dial's time keeps up with the handle (the walk, v9, F2). On a far tap from 9:30 PM to
// 9 AM the handle glided through midnight in half a second, and the number was still reading 11:30 PM
// when the handle was near 8:30: it trailed by a third of a second. The number is drawn by the JS
// thread, which the UI thread reaches by runOnJS. A message that carries the time the handle was at
// when it was sent arrives late on a busy thread and says where the handle was; one that only says
// "look" is answered by looking, and shows where the handle is.
import { act, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { animationClock, onUiThread, reanimatedMock, uiRuntime } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { angleToMinutes, clockText, snapMinutes } from './time';
import { dialSize, TimeDial } from './TimeDial';

jest.mock('@/design/haptics');
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false }],
}));

type Touch = { x: number; y: number };
const mockPan: { config?: { onBegin?: (e: Touch) => void; onUpdate?: (e: Touch) => void } } = {};
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: unknown }) => children,
  usePanGesture: (config: typeof mockPan.config) => {
    mockPan.config = config;
    return {};
  },
}));

const SIZE = dialSize(393);
const FRAME = 16;
const onRing = (degrees: number, radius = SIZE * 0.4): Touch => {
  const a = (degrees * Math.PI) / 180;
  return { x: SIZE / 2 + radius * Math.sin(a), y: SIZE / 2 - radius * Math.cos(a) };
};
// Noon is at the top, 6 pm is 90 degrees.
const angleOf = (hours: number, minutes = 0) =>
  (((hours * 60 + minutes - 720) / 1440) * 360 + 360) % 360;

function Dial({ start }: { start: number }) {
  const [minutes, setMinutes] = useState(start);
  return (
    <TimeDial
      size={SIZE}
      minutes={minutes}
      clock={clockText(minutes, { locale: 'en-US', hour12: true })}
      label="Reminder"
      onChange={setMinutes}
      onOpenPicker={() => undefined}
    />
  );
}

type Node = string | { children: Node[] };
const read = (node: Node): string =>
  typeof node === 'string' ? node : node.children.map(read).join('');
/** The time as the dial writes it, in minutes since midnight. */
const written = () => {
  const text = read(screen.getAllByRole('button')[0] as unknown as Node);
  const [, hours, minutes, period] = /^(\d+):(\d\d)\s*(AM|PM)/.exec(text) ?? [];
  return ((Number(hours) % 12) + (period === 'PM' ? 12 : 0)) * 60 + Number(minutes);
};
/** How far apart two times are, round the clock the short way. */
const apart = (a: number, b: number) => Math.abs(((a - b + 720 + 1440) % 1440) - 720);

const shared = jest.spyOn(reanimatedMock, 'useSharedValue');
const frame = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(FRAME);
  });

beforeEach(() => {
  jest.useFakeTimers();
  uiRuntime.reset();
  animationClock.reset();
  animationClock.stepped = true;
  shared.mockClear();
  mockPan.config = undefined;
});
afterEach(() => {
  jest.useRealTimers();
  animationClock.reset();
});

/** Where the handle is, as a time: the dial's first shared value is its angle. */
const handleAt = () =>
  snapMinutes(angleToMinutes((shared.mock.results[0]?.value as { get(): number }).get()));

async function farTap() {
  await render(<Dial start={21 * 60 + 30} />);
  // 9 am, far across the dial from 9:30 pm: the handle is carried there through midnight, half a second.
  await act(async () => onUiThread(mockPan.config!.onBegin!)(onRing(angleOf(9))));
}

describe('the time on the dial, with a busy JS thread', () => {
  it('keeps up with the handle on a far tap: never more than a couple of frames behind', async () => {
    // Everything the UI thread sends to JS arrives three frames late.
    animationClock.jsLag = 3 * FRAME;
    await farTap();
    const behind: number[] = [];
    for (let at = 0; at < 800; at += FRAME) {
      await frame();
      behind.push(apart(written(), handleAt()));
    }
    // The handle covers 11.5 hours in 560 ms: about 20 minutes a frame. Two frames is 40.
    expect(Math.max(...behind)).toBeLessThanOrEqual(40);
    // And it gets there.
    expect(written()).toBe(9 * 60);
  });

  it('is at the handle’s place when the glide ends, one round trip after it', async () => {
    animationClock.jsLag = 5 * FRAME;
    await farTap();
    for (let at = 0; at < 560 + 6 * FRAME; at += FRAME) await frame();
    expect(handleAt()).toBe(9 * 60);
    expect(written()).toBe(9 * 60);
  });

  it('is written without a new clock for every step: the number is a lookup, not a formatter', async () => {
    const made = jest.spyOn(Intl, 'DateTimeFormat');
    await farTap();
    made.mockClear();
    for (let at = 0; at < 800; at += FRAME) await frame();
    // 35 frames of steps used to build 35 formatters on the thread that draws the number.
    expect(made.mock.calls.length).toBeLessThanOrEqual(1);
    made.mockRestore();
  });
});
