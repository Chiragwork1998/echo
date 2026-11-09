// The reminder dial's time keeps up with the handle (the walk, v9 and v10, F2). On a far tap from 9:30
// PM to 9 AM the handle glided through midnight in half a second, and the number was still reading
// 11:30 PM when the handle was near 8:30: it trailed by a third of a second to half a second. A number
// drawn by the JS thread is told where the handle is by a message from the UI thread, and a busy JS
// thread, or any round trip, makes it late. The number is drawn on the UI thread, from the handle's
// own angle (an animated text field, as ReText does), so it is where the handle is in every frame,
// whatever JS is doing. In jest the screen is drawn on request: `draw`.
import { act, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { ThemeProvider } from '@/design/theme';
import { animationClock, onUiThread, reanimatedMock, uiRuntime } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { angleToMinutes, clockText, snapMinutes } from './time';
import { dialSize, TimeDial } from './TimeDial';

jest.mock('@/design/haptics');
const mockClock = { uses24: false };
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: mockClock.uses24 }],
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

/** What the dial's number fields say, as the UI thread has set them. */
const field = (id: string) =>
  screen.queryByTestId(id, { includeHiddenElements: true })?.props.animatedProps?.text as
    string | undefined;
/** The time as the dial writes it, in minutes since midnight. */
const written = () => {
  const [, hours, minutes] = /^(\d+):(\d\d)/.exec(field('dial-time-main') ?? '') ?? [];
  const pm = field('dial-time-period') === 'PM';
  return ((Number(hours) % 12) + (pm ? 12 : 0)) * 60 + Number(minutes);
};
/** How far apart two times are, round the clock the short way. */
const apart = (a: number, b: number) => Math.abs(((a - b + 720 + 1440) % 1440) - 720);

const shared = jest.spyOn(reanimatedMock, 'useSharedValue');
/** The screen is drawn again: the UI thread has put each animated value on its view. */
const draw = () =>
  screen.rerender(
    <ThemeProvider crossfade={false}>
      <Dial start={drawing.start} />
    </ThemeProvider>,
  );
const drawing = { start: 0 };
/** One frame: the clock moves on, and the screen is drawn. */
const frame = async () => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(FRAME);
  });
  await draw();
};

beforeEach(() => {
  jest.useFakeTimers();
  mockClock.uses24 = false;
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
  drawing.start = 21 * 60 + 30;
  await render(<Dial start={drawing.start} />);
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

describe('the time on the dial, drawn on the UI thread', () => {
  it('is where the handle is in every frame, however late JS is: 40 frames, which no phone is', async () => {
    // Everything the UI thread sends to JS arrives most of a second late. The number does not wait for
    // any of it: it is not told where the handle is, it is drawn from where it is.
    animationClock.jsLag = 40 * FRAME;
    await farTap();
    const behind: number[] = [];
    for (let at = 0; at < 800; at += FRAME) {
      await frame();
      behind.push(apart(written(), handleAt()));
    }
    expect(behind.every((minutes) => minutes === 0)).toBe(true);
    expect(written()).toBe(9 * 60);
  });

  it('is at the handle the very first frame, before JS has said a word', async () => {
    animationClock.jsLag = 1_000_000;
    drawing.start = 21 * 60 + 30;
    await render(<Dial start={drawing.start} />);
    expect(written()).toBe(21 * 60 + 30);
    await act(async () => onUiThread(mockPan.config!.onBegin!)(onRing(angleOf(21, 45))));
    await frame();
    expect(written()).toBe(21 * 60 + 45);
  });

  it('writes the time in two fields, the numbers large and AM or PM smaller, as it was set', async () => {
    drawing.start = 9 * 60 + 5;
    await render(<Dial start={drawing.start} />);
    expect(field('dial-time-main')).toBe('9:05');
    expect(field('dial-time-period')).toBe('AM');
  });

  it('is one centred field on a 24-hour clock, which has no AM or PM', async () => {
    mockClock.uses24 = true;
    drawing.start = 21 * 60 + 30;
    await render(<Dial start={drawing.start} />);
    expect(field('dial-time-main')).toBe('21:30');
    expect(screen.queryByTestId('dial-time-period', { includeHiddenElements: true })).toBeNull();
  });

  it('is only for looking at: it is not a field to type in, and screen readers read the button instead', async () => {
    drawing.start = 21 * 60 + 30;
    await render(<Dial start={drawing.start} />);
    const main = screen.getByTestId('dial-time-main', { includeHiddenElements: true });
    expect(main.props.editable).toBe(false);
    const written = screen.getByTestId('dial-time', { includeHiddenElements: true });
    expect(written.props.pointerEvents).toBe('none');
    expect(written.props.accessibilityElementsHidden).toBe(true);
    expect(written.props.importantForAccessibility).toBe('no-hide-descendants');
    // The button is what is spoken, as it was, and the dial's value is the time that was chosen.
    expect(screen.getByRole('button', { name: '9:30 PM' })).toBeTruthy();
    expect(screen.getByRole('adjustable').props.accessibilityValue).toEqual({ text: '9:30 PM' });
  });

  it('says the time that was chosen to a screen reader at once, with the handle still on its way', async () => {
    await farTap();
    // The spoken value is what the person chose, and it is told at once; the handle is still in motion.
    expect(screen.getByRole('adjustable').props.accessibilityValue).toEqual({ text: '9:00 AM' });
    expect(handleAt()).not.toBe(9 * 60);
  });
});
