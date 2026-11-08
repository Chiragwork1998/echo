// The reminder dial's time follows the handle (the walk, F2). On a fast drag or a far tap the handle
// glides to its place over half a second or more, and the time used to be written at once: the
// number was at 10:05 while the handle was still turning through 6. The number rides the handle.
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { render } from '@/testing/render';

import { clockText } from './time';
import { dialSize, TimeDial } from './TimeDial';

jest.mock('@/design/haptics');
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false }],
}));

// The shared Reanimated stand-in cannot show an animation part of the way. This one lets the test
// hold the handle where it is and then carry it, and it runs the dial's reactions on request, as the
// UI thread runs them each frame.
type Shared = { value: unknown; get(): unknown; set(next: unknown): void };
type Reaction = {
  prepare: () => unknown;
  react: (now: unknown, was: unknown) => void;
  was: unknown;
};
const mockShared: Shared[] = [];
const mockReactions = new Set<Reaction>();
jest.mock('react-native-reanimated', () => {
  const { useEffect, useRef } = jest.requireActual('react');
  const base = jest.requireActual('@/testing/reanimatedMock').reanimatedMock;
  const useSharedValue = (initial: unknown) => {
    const ref = useRef(null as Shared | null);
    if (!ref.current) {
      const value: Shared = {
        value: initial,
        get() {
          return this.value;
        },
        set(next: unknown) {
          this.value = next;
        },
      };
      ref.current = value;
      mockShared.push(value);
    }
    return ref.current;
  };
  const useAnimatedReaction = (prepare: () => unknown, react: Reaction['react']) => {
    const ref = useRef(null as Reaction | null);
    if (!ref.current) ref.current = { prepare, react, was: prepare() };
    ref.current.prepare = prepare;
    ref.current.react = react;
    useEffect(() => {
      const mine = ref.current as Reaction;
      mockReactions.add(mine);
      return () => void mockReactions.delete(mine);
    }, []);
  };
  // The handle is held where it is: an animation does not move it until the test does.
  const withTiming = jest.fn(() => mockShared[0]?.get());
  return { ...base, useSharedValue, useAnimatedReaction, withTiming };
});

const mockPan: {
  config?: { onBegin?: (e: Touch) => void; onUpdate?: (e: Touch) => void; onFinalize?: () => void };
} = {};
type Touch = { x: number; y: number };
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: unknown }) => children,
  usePanGesture: (config: typeof mockPan.config) => {
    mockPan.config = config;
    return {};
  },
}));

const SIZE = dialSize(393);
const onRing = (degrees: number, radius = SIZE * 0.4): Touch => {
  const a = (degrees * Math.PI) / 180;
  return { x: SIZE / 2 + radius * Math.sin(a), y: SIZE / 2 - radius * Math.cos(a) };
};
// Noon is at the top, 6 pm is 90 degrees.
const angleOf = (hours: number, minutes = 0) =>
  (((hours * 60 + minutes - 720) / 1440) * 360 + 360) % 360;
const handle = () => mockShared[0] as Shared;

/** The UI thread's next frame: every reaction looks at what it watches and says what changed. */
const frame = () =>
  act(() => {
    for (const reaction of mockReactions) {
      const now = reaction.prepare();
      if (now !== reaction.was) {
        const was = reaction.was;
        reaction.was = now;
        reaction.react(now, was);
      }
    }
  });
/** The handle carried to an angle, and the frame that sees it. */
const carry = async (degrees: number) => {
  handle().set(degrees);
  await frame();
};
const touch = (kind: 'onBegin' | 'onUpdate', point: Touch) =>
  act(async () => mockPan.config?.[kind]?.(point));

function Dial({ start }: { start: number }) {
  const [minutes, setMinutes] = useState(start);
  return (
    <>
      <TimeDial
        size={SIZE}
        minutes={minutes}
        clock={clockText(minutes, { locale: 'en-US', hour12: true })}
        label="Reminder"
        onChange={setMinutes}
        onOpenPicker={() => undefined}
      />
      {/* What a preset does: sets the time from outside the dial. */}
      <PresetButton onPick={setMinutes} />
    </>
  );
}
function PresetButton({ onPick }: { onPick: (minutes: number) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Morning"
      onPress={() => onPick(8 * 60)}
    >
      <Text>Morning</Text>
    </Pressable>
  );
}

type Node = string | { children: Node[] };
const read = (node: Node): string =>
  typeof node === 'string' ? node : node.children.map(read).join('');
/** What the dial writes for the time, as a person sees it: its own button, the first there is. */
const timeText = () => read(screen.getAllByRole('button')[0] as unknown as Node);
const spoken = (time: string) => screen.getByRole('button', { name: time });

beforeEach(() => {
  mockShared.length = 0;
  mockReactions.clear();
  mockPan.config = undefined;
});

describe('the time on the dial', () => {
  it('is the time the handle is at to begin with', async () => {
    await render(<Dial start={4 * 60} />);
    expect(timeText()).toMatch(/^4:00 /);
  });

  it('follows a far tap round: it stays where the handle is, and arrives with it', async () => {
    await render(<Dial start={4 * 60} />);
    // 9 pm, far across the dial from 4 am: the handle is carried there, half a second.
    await touch('onBegin', onRing(angleOf(21)));
    // The person has chosen 9 pm, and is told so at once, but the number has not got there.
    expect(spoken('9:00 PM')).toBeTruthy();
    expect(timeText()).toMatch(/^4:00 /);
    // The handle comes round, and the number comes with it.
    await carry(angleOf(8));
    expect(timeText()).toMatch(/^8:00 /);
    await carry(angleOf(17, 30));
    expect(timeText()).toMatch(/^5:30 /);
    await carry(angleOf(21));
    expect(timeText()).toMatch(/^9:00 /);
  });

  it('follows a fast drag the same way: never ahead of the handle', async () => {
    await render(<Dial start={4 * 60} />);
    await touch('onBegin', onRing(angleOf(4, 5)));
    await frame();
    // A jump across the dial in one movement: 4 am to 10 am.
    await touch('onUpdate', onRing(angleOf(10, 5)));
    expect(timeText()).toMatch(/^4:05 /);
    await carry(angleOf(7));
    expect(timeText()).toMatch(/^7:00 /);
    await carry(angleOf(10, 5));
    expect(timeText()).toMatch(/^10:05 /);
  });

  it('is under the finger, step for step, when the handle is: a slow drag has nothing to wait for', async () => {
    await render(<Dial start={21 * 60 + 30} />);
    await touch('onBegin', onRing(angleOf(21, 35)));
    await frame();
    expect(timeText()).toMatch(/^9:35 /);
    await touch('onUpdate', onRing(angleOf(21, 40)));
    await frame();
    expect(timeText()).toMatch(/^9:40 /);
    await touch('onUpdate', onRing(angleOf(21, 45)));
    await frame();
    expect(timeText()).toMatch(/^9:45 /);
  });

  it('follows a time chosen elsewhere, a preset, as the handle is carried to it', async () => {
    await render(<Dial start={21 * 60 + 30} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Morning' }));
    // Morning is 8:00. The handle has not moved yet, and the number does not run ahead of it.
    expect(timeText()).toMatch(/^9:30 /);
    await carry(angleOf(0));
    expect(timeText()).toMatch(/^12:00 /);
    await carry(angleOf(8));
    expect(timeText()).toMatch(/^8:00 /);
    // Spoken, it was 8:00 AM from the moment it was chosen.
    expect(spoken('8:00 AM')).toBeTruthy();
  });

  it('says the time that was chosen to a screen reader at once, whatever the handle is doing', async () => {
    await render(<Dial start={4 * 60} />);
    await touch('onBegin', onRing(angleOf(21)));
    expect(screen.getByRole('adjustable').props.accessibilityValue).toEqual({ text: '9:00 PM' });
  });
});
