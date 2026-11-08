import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions, Platform } from 'react-native';

import { showToast } from '@/components/Toast';
import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { dialSize } from '@/features/onboarding/rhythm/TimeDial';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { render } from '@/testing/render';

import { commitReminder } from '@/features/onboarding/rhythm/commitReminder';

import { RhythmScreen } from './RhythmScreen';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock('@/features/onboarding/rhythm/commitReminder', () => ({
  commitReminder: jest.fn(),
}));
jest.mock('@/components/Toast', () => ({ showToast: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// The shared Reanimated stand-in makes a new shared value on every render. The dial keeps state in
// shared values between touches, so this one keeps each value for the life of its component.
jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  const base = jest.requireActual('@/testing/reanimatedMock').reanimatedMock;
  const useSharedValue = <T,>(initial: T) =>
    useRef({
      value: initial,
      get() {
        return this.value;
      },
      set(next: T) {
        this.value = next;
      },
    }).current;
  return { ...base, useSharedValue };
});

// Gesture handler needs native code. The detector passes through, and the hook hands the screen's
// own pan callbacks back to the test, which calls them as the gesture would.
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

const mockPicker: {
  value?: Date;
  onValueChange?: (event: unknown, date: Date) => void;
  open: jest.Mock;
} = { open: jest.fn() };
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: (props: { value: Date; onValueChange: (event: unknown, date: Date) => void }) => {
    mockPicker.value = props.value;
    mockPicker.onValueChange = props.onValueChange;
    return null;
  },
  DateTimePickerAndroid: { open: (...args: unknown[]) => mockPicker.open(...args) },
}));

const mockClock = { uses24: false };
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: mockClock.uses24 ? 'en-GB' : 'en-US' }],
  getCalendars: () => [{ uses24hourClock: mockClock.uses24 }],
}));

const [MORNING, EVENING, BEFORE_SLEEP] = copy.rhythm.presets;

function setWindow(width: number, height: number, fontScale = 1) {
  const metrics = { width, height, scale: 2, fontScale };
  Dimensions.set({ window: metrics, screen: metrics });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClock.uses24 = false;
  mockPan.config = undefined;
  useOnboarding.setState({ ...initialOnboarding });
  setWindow(393, 852);
});

const preset = (name: string) => screen.getByRole('radio', { name });
const reminder = () => screen.getByRole('switch', { name: copy.rhythm.reminder });
const cta = () => screen.getByRole('button', { name: copy.rhythm.cta });
const dial = () => screen.getByRole('adjustable');
const time = (spoken: string) => screen.getByRole('button', { name: spoken });

// A touch on the dial at an angle from the top, clockwise, on the ring.
const SIZE = dialSize(393);
const onRing = (degrees: number, radius = SIZE * 0.4): Touch => {
  const a = (degrees * Math.PI) / 180;
  return { x: SIZE / 2 + radius * Math.sin(a), y: SIZE / 2 - radius * Math.cos(a) };
};
const touch = async (kind: 'onBegin' | 'onUpdate', point: Touch) => {
  await act(async () => mockPan.config?.[kind]?.(point));
};
const lift = async () => act(async () => mockPan.config?.onFinalize?.());
// Angle for a time: noon is 0 degrees, 6 pm is 90.
const angleOf = (hours: number, minutes = 0) =>
  (((hours * 60 + minutes - 720) / 1440) * 360 + 360) % 360;

describe('RhythmScreen on first load', () => {
  it('shows the title, the dial at 9:30 PM, three presets and a disabled reminder', async () => {
    await render(<RhythmScreen />);
    expect(screen.getByRole('header', { name: copy.rhythm.title })).toBeTruthy();
    expect(screen.getByText(copy.rhythm.subtitle)).toBeTruthy();
    expect(screen.getByLabelText(copy.rhythm.dialCaption)).toBeTruthy();
    expect(time('9:30 PM')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    for (const label of [MORNING, EVENING, BEFORE_SLEEP]) {
      expect(preset(label)).not.toBeChecked();
    }
    expect(reminder()).not.toBeChecked();
    expect(cta()).toBeEnabled();
  });

  it('restores a saved rhythm', async () => {
    useOnboarding.setState({ reminder: { time: '08:00', enabled: true, preset: 'morning' } });
    await render(<RhythmScreen />);
    expect(time('8:00 AM')).toBeTruthy();
    expect(preset(MORNING)).toBeChecked();
    expect(reminder()).toBeChecked();
  });

  it('falls back to 9:30 PM when the saved time is unreadable', async () => {
    useOnboarding.setState({ reminder: { time: 'late', enabled: false } });
    await render(<RhythmScreen />);
    expect(time('9:30 PM')).toBeTruthy();
  });

  it('writes the time as the device does: 24-hour on a 24-hour clock', async () => {
    mockClock.uses24 = true;
    await render(<RhythmScreen />);
    expect(time('21:30')).toBeTruthy();
  });
});

describe('presets', () => {
  it('moves the dial to Morning 08:00, Evening 18:30 and Before sleep 21:30, and selects the card', async () => {
    await render(<RhythmScreen />);
    await fireEvent.press(preset(MORNING));
    expect(time('8:00 AM')).toBeTruthy();
    expect(preset(MORNING)).toBeChecked();
    expect(preset(MORNING)).toBeSelected();

    await fireEvent.press(preset(EVENING));
    expect(time('6:30 PM')).toBeTruthy();
    expect(preset(EVENING)).toBeChecked();
    expect(preset(MORNING)).not.toBeChecked();

    await fireEvent.press(preset(BEFORE_SLEEP));
    expect(time('9:30 PM')).toBeTruthy();
    expect(preset(BEFORE_SLEEP)).toBeChecked();
    expect(preset(EVENING)).not.toBeChecked();
  });

  it('cues a tick for each preset', async () => {
    await render(<RhythmScreen />);
    await fireEvent.press(preset(EVENING));
    expect(cue).toHaveBeenCalledWith('tick');
  });

  it('clears the preset when the dial is moved away', async () => {
    await render(<RhythmScreen />);
    await fireEvent.press(preset(MORNING));
    await touch('onBegin', onRing(angleOf(9)));
    expect(time('9:00 AM')).toBeTruthy();
    expect(preset(MORNING)).not.toBeChecked();
  });
});

describe('the dial', () => {
  it('is an adjustable control that announces the time', async () => {
    await render(<RhythmScreen />);
    expect(dial().props.accessibilityValue).toEqual({ text: '9:30 PM' });
    expect(dial().props.accessibilityLabel).toBe(copy.rhythm.title);
    expect(dial().props.accessibilityActions).toEqual([
      { name: 'increment' },
      { name: 'decrement' },
    ]);
  });

  it('moves by a quarter hour on increment and decrement, and wraps past midnight', async () => {
    await render(<RhythmScreen />);
    await fireEvent(dial(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(time('9:45 PM')).toBeTruthy();
    expect(dial().props.accessibilityValue).toEqual({ text: '9:45 PM' });
    await fireEvent(dial(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await fireEvent(dial(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(time('9:15 PM')).toBeTruthy();

    await fireEvent.press(preset(BEFORE_SLEEP));
    for (let i = 0; i < 10; i += 1) {
      await fireEvent(dial(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    }
    expect(time('12:00 AM')).toBeTruthy();
    await fireEvent(dial(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(time('11:45 PM')).toBeTruthy();
  });

  it('turns a touch on the ring into a time, snapped to 5 minutes', async () => {
    await render(<RhythmScreen />);
    await touch('onBegin', onRing(angleOf(18)));
    expect(time('6:00 PM')).toBeTruthy();
    await touch('onUpdate', onRing(angleOf(7, 32)));
    expect(time('7:30 AM')).toBeTruthy();
    await touch('onUpdate', onRing(angleOf(7, 33)));
    expect(time('7:35 AM')).toBeTruthy();
    await lift();
  });

  it('follows a drag over midnight in both directions', async () => {
    await render(<RhythmScreen />);
    await touch('onBegin', onRing(angleOf(23, 50)));
    expect(time('11:50 PM')).toBeTruthy();
    await touch('onUpdate', onRing(angleOf(23, 55)));
    expect(time('11:55 PM')).toBeTruthy();
    await touch('onUpdate', onRing(angleOf(0, 0)));
    expect(time('12:00 AM')).toBeTruthy();
    await touch('onUpdate', onRing(angleOf(0, 5)));
    expect(time('12:05 AM')).toBeTruthy();
    await touch('onUpdate', onRing(angleOf(23, 55)));
    expect(time('11:55 PM')).toBeTruthy();
  });

  it('cues one fine tick for each hour crossed, and not for each 5-minute step', async () => {
    await render(<RhythmScreen />);
    // Starts at 21:30. Moving inside the 21:00 hour does not buzz.
    await touch('onBegin', onRing(angleOf(21, 35)));
    await touch('onUpdate', onRing(angleOf(21, 40)));
    await touch('onUpdate', onRing(angleOf(21, 55)));
    expect(cue).not.toHaveBeenCalled();

    await touch('onUpdate', onRing(angleOf(22, 0)));
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('fine');

    await touch('onUpdate', onRing(angleOf(22, 5)));
    await touch('onUpdate', onRing(angleOf(22, 20)));
    expect(cue).toHaveBeenCalledTimes(1);

    // Over midnight is an hour change too.
    await touch('onUpdate', onRing(angleOf(23, 55)));
    expect(cue).toHaveBeenCalledTimes(2);
    await touch('onUpdate', onRing(angleOf(0, 0)));
    expect(cue).toHaveBeenCalledTimes(3);
  });

  it('ignores a touch that starts near the centre, where the time is, or well outside the dial', async () => {
    await render(<RhythmScreen />);
    await touch('onBegin', { x: SIZE / 2 + 10, y: SIZE / 2 + 10 });
    await touch('onUpdate', onRing(angleOf(8)));
    expect(time('9:30 PM')).toBeTruthy();
    await lift();
    await touch('onBegin', onRing(angleOf(8), SIZE));
    expect(time('9:30 PM')).toBeTruthy();
  });

  it('does not report a step it is already on', async () => {
    await render(<RhythmScreen />);
    await touch('onBegin', onRing(angleOf(21, 31)));
    expect(time('9:30 PM')).toBeTruthy();
    expect(cue).not.toHaveBeenCalled();
  });
});

describe('the native time picker', () => {
  it('opens from the time on iOS, and a chosen time becomes the rhythm and clears the preset', async () => {
    await render(<RhythmScreen />);
    await fireEvent.press(preset(EVENING));
    await fireEvent.press(time('6:30 PM'));
    expect(mockPicker.value?.getHours()).toBe(18);
    expect(mockPicker.value?.getMinutes()).toBe(30);
    await act(async () => mockPicker.onValueChange?.({}, new Date(2000, 0, 1, 7, 12)));
    expect(time('7:12 AM')).toBeTruthy();
    expect(preset(EVENING)).not.toBeChecked();
  });

  it('opens the Android dialog with the current time', async () => {
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await render(<RhythmScreen />);
      await fireEvent.press(time('9:30 PM'));
      expect(mockPicker.open).toHaveBeenCalledTimes(1);
      const options = mockPicker.open.mock.calls[0]?.[0];
      expect(options.mode).toBe('time');
      expect(options.is24Hour).toBe(false);
      expect(options.value.getHours()).toBe(21);
      await act(async () => options.onValueChange({}, new Date(2000, 0, 1, 6, 45)));
      expect(time('6:45 AM')).toBeTruthy();
    } finally {
      android.restore();
    }
  });
});

describe('Set my rhythm', () => {
  it('stores 24-hour time, enabled and preset, then goes to the next step', async () => {
    await render(<RhythmScreen />);
    await fireEvent.press(preset(MORNING));
    await fireEvent.press(reminder());
    expect(reminder()).toBeChecked();
    await fireEvent.press(cta());
    expect(useOnboarding.getState().reminder).toEqual({
      time: '08:00',
      enabled: true,
      preset: 'morning',
    });
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/privacy'));
    expect(commitReminder).toHaveBeenCalledWith('08:00', true);
  });

  it('meets a scheduled reminder with a toast, in the device’s own time format', async () => {
    jest.mocked(commitReminder).mockResolvedValue({ status: 'scheduled', time: '08:00' });
    await render(<RhythmScreen />);
    await fireEvent.press(preset(MORNING));
    await fireEvent.press(reminder());
    await fireEvent.press(cta());
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/privacy'));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('We’ll meet you at 8:00 AM.');
  });

  it('writes the toast on a 24-hour clock when the device uses one', async () => {
    mockClock.uses24 = true;
    jest.mocked(commitReminder).mockResolvedValue({ status: 'scheduled', time: '21:30' });
    await render(<RhythmScreen />);
    await fireEvent.press(reminder());
    await fireEvent.press(cta());
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('We’ll meet you at 21:30.'));
  });

  it.each([{ status: 'off' }, { status: 'not_allowed' }, { status: 'failed' }] as const)(
    'says nothing when the reminder is $status, and still moves on',
    async (result) => {
      jest.mocked(commitReminder).mockResolvedValue(result);
      await render(<RhythmScreen />);
      await fireEvent.press(cta());
      await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/privacy'));
      expect(showToast).not.toHaveBeenCalled();
    },
  );

  it('stores a dragged time with no preset', async () => {
    await render(<RhythmScreen />);
    await touch('onBegin', onRing(angleOf(17, 45)));
    await fireEvent.press(cta());
    const { reminder: stored } = useOnboarding.getState();
    expect(stored.time).toBe('17:45');
    expect(stored.enabled).toBe(false);
    expect(stored.preset).toBeUndefined();
  });

  it('keeps the default of 21:30 and disabled when nothing is changed', async () => {
    await render(<RhythmScreen />);
    await fireEvent.press(cta());
    expect(useOnboarding.getState().reminder).toEqual({ time: '21:30', enabled: false });
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/privacy');
  });

  it('goes back to the previous step', async () => {
    await render(<RhythmScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/voice');
  });
});

describe('large text and landscape', () => {
  it('shows a time button instead of the dial at 125% text, with the same choices', async () => {
    setWindow(393, 852, 1.25);
    await render(<RhythmScreen />);
    expect(screen.queryByRole('adjustable')).toBeNull();
    expect(screen.getByText(copy.rhythm.dialCaption.toUpperCase())).toBeTruthy();
    await fireEvent.press(preset(EVENING));
    expect(time('6:30 PM')).toBeTruthy();
    await fireEvent.press(time('6:30 PM'));
    expect(mockPicker.value?.getHours()).toBe(18);
    await fireEvent.press(reminder());
    await fireEvent.press(cta());
    expect(useOnboarding.getState().reminder).toEqual({
      time: '18:30',
      enabled: true,
      preset: 'evening',
    });
  });

  it('does the same in landscape', async () => {
    setWindow(852, 393);
    await render(<RhythmScreen />);
    expect(screen.queryByRole('adjustable')).toBeNull();
    expect(time('9:30 PM')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(reminder()).toBeTruthy();
  });

  it('uses the scrolling layout when a short phone cannot hold the dial and the cards together', async () => {
    setWindow(320, 568);
    await render(<RhythmScreen />);
    expect(screen.queryByRole('adjustable')).toBeNull();
    expect(time('9:30 PM')).toBeTruthy();
  });

  it('keeps the dial on a compact phone that can hold it', async () => {
    setWindow(375, 667);
    await render(<RhythmScreen />);
    expect(dial()).toBeTruthy();
  });
});

describe('dial size', () => {
  it('is 262 on the 393 pt reference and stays within 248 to 292', () => {
    expect(dialSize(393)).toBe(262);
    expect(dialSize(320)).toBe(248);
    expect(dialSize(375)).toBe(250);
    expect(dialSize(430)).toBe(287);
    expect(dialSize(600)).toBe(292);
  });
});
