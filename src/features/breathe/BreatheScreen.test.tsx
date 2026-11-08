import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { DEFAULT_PRACTICE, usePreferences } from '@/state/preferences';
import { useRequirePlus, usePlus } from '@/services/plus';
import { render } from '@/testing/render';

import { freeAtAll } from './access';
import { JOURNAL_AUDIO_MODE } from './audio';
import { breatheCopy } from './breatheCopy';
import { BreatheScreen } from './BreatheScreen';
import { recordPractice } from './feelingStore';
import { PRACTICES } from './library/practices';
import { supportCopy } from '@/features/patterns/supportResources';

const mockAudio = {
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn(() => ({
    loop: false,
    volume: 1,
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
};
let mockMorning = false;

jest.mock('@/services/nativeModules', () => ({ loadAudio: () => mockAudio }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), replace: jest.fn() },
  usePathname: () => '/home/breathe',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/services/plus', () => ({ usePlus: jest.fn(), useRequirePlus: jest.fn() }));
jest.mock('@/features/become/morning', () => ({
  ...jest.requireActual('@/features/become/morning'),
  useMorning: () => mockMorning,
}));
jest.mock('./feelingStore', () => ({
  ...jest.requireActual('./feelingStore'),
  recordPractice: jest.fn(async () => ({ ok: true, value: null })),
}));

const requirePlus = jest.fn(() => false);

function as(plus: boolean) {
  jest.mocked(usePlus).mockReturnValue({ status: plus ? 'plus' : 'free', isPlus: plus });
  jest.mocked(useRequirePlus).mockReturnValue(requirePlus);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockMorning = false;
  usePreferences.setState({ practice: { ...DEFAULT_PRACTICE, begun: 1 } });
  as(false);
});

const row = (id: string) => screen.getByTestId(`feeling-${id}`);

describe('What are you feeling?', () => {
  it('lists every feeling with its practice and length, marking Plus only for someone without it', async () => {
    await render(<BreatheScreen />);
    expect(screen.getByRole('header', { name: breatheCopy.title })).toBeTruthy();
    for (const practice of PRACTICES) {
      const plus = freeAtAll(practice) ? '' : ', Plus';
      expect(row(practice.id)).toHaveProp(
        'accessibilityLabel',
        `${practice.feeling}. ${practice.name}, ${practice.minutes} min${plus}`,
      );
    }
    const plusOnly = PRACTICES.filter((practice) => !freeAtAll(practice));
    expect(screen.getAllByText(/· Plus$/)).toHaveLength(plusOnly.length);
  });

  it('marks nothing for someone with Plus', async () => {
    as(true);
    await render(<BreatheScreen />);
    expect(screen.queryAllByText(/· Plus$/)).toHaveLength(0);
  });

  it('opens a free practice without asking, and asks for Plus before a Plus one', async () => {
    await render(<BreatheScreen />);
    await fireEvent.press(row('cool'));
    expect(requirePlus).toHaveBeenCalledWith('breath-library');
    expect(screen.getByRole('header', { name: breatheCopy.title })).toBeTruthy();

    requirePlus.mockClear();
    await fireEvent.press(row('soothe'));
    expect(requirePlus).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Soothe' })).toBeTruthy();
  });

  it('lets a Plus practice open when the gate says yes', async () => {
    requirePlus.mockReturnValueOnce(true);
    await render(<BreatheScreen />);
    await fireEvent.press(row('sleep'));
    expect(screen.getByRole('header', { name: 'Sleep' })).toBeTruthy();
  });

  it('goes back to Today from the list', async () => {
    await render(<BreatheScreen />);
    await fireEvent.press(screen.getByTestId('breathe-back'));
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });
});

describe('the page under the status bar', () => {
  // Seen on You and Patterns in the release walk: words scrolled up ran under the clock. Breathe's
  // list and its Before screen (long once "Why this helps" is open) scroll the same way, so their
  // scrolling begins below the status bar, as the onboarding screens' and the tab pages' do.
  it('begins its scrolling below the status bar, with the inset given once', async () => {
    await render(<BreatheScreen />);
    const scroll = screen.getByTestId('breathe-scroll');
    // The safe area mock has no inset, so the page keeps its 8 pt floor.
    expect(StyleSheet.flatten(scroll.props.style).marginTop).toBe(8);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop ?? 0).toBe(0);
  });
});

describe('Before it starts', () => {
  async function openHeart() {
    await render(<BreatheScreen />);
    await fireEvent.press(row('heart'));
  }
  const selected = (testID: string) =>
    screen.getByTestId(testID).props.accessibilityState?.selected === true;

  it('keeps Heart free at 3 and 5 minutes, and asks for Plus at 10', async () => {
    await openHeart();
    expect(selected('length-5')).toBe(true);
    await fireEvent.press(screen.getByTestId('length-3'));
    expect(requirePlus).not.toHaveBeenCalled();
    expect(selected('length-3')).toBe(true);
    expect(usePreferences.getState().practice.minutes.heart).toBe(3);

    await fireEvent.press(screen.getByTestId('length-10'));
    expect(requirePlus).toHaveBeenCalledWith('breath-library');
    expect(selected('length-3')).toBe(true);
  });

  it('keeps Your pace for Plus, and the default pace for everyone', async () => {
    await openHeart();
    expect(selected('pace-5.5')).toBe(true);
    await fireEvent.press(screen.getByTestId('pace-6'));
    expect(requirePlus).toHaveBeenCalledWith('breath-library');
    expect(selected('pace-5.5')).toBe(true);
    expect(screen.getByTestId('pace-6')).toHaveProp(
      'accessibilityLabel',
      '6 breaths a minute, Plus',
    );
  });

  it('lets someone with Plus choose any length and pace', async () => {
    as(true);
    await openHeart();
    await fireEvent.press(screen.getByTestId('length-20'));
    await fireEvent.press(screen.getByTestId('pace-4.5'));
    expect(requirePlus).not.toHaveBeenCalled();
    expect(usePreferences.getState().practice).toMatchObject({ minutes: { heart: 20 }, pace: 4.5 });
  });

  it('warns before a practice that holds the breath', async () => {
    requirePlus.mockReturnValueOnce(true);
    await render(<BreatheScreen />);
    await fireEvent.press(row('sleep'));
    expect(screen.getByTestId('breathe-caution')).toBeTruthy();
  });

  it('lays a patch behind the warning on either sky, so the moon and snow never wash it out', async () => {
    for (const theme of ['night', 'day'] as const) {
      usePreferences.setState({ theme });
      requirePlus.mockReturnValueOnce(true);
      const view = await render(<BreatheScreen />);
      await fireEvent.press(row('sleep'));
      expect(screen.getByTestId('breathe-caution')).toBeTruthy();
      expect(screen.getByTestId('breathe-heading-patch')).toBeTruthy();
      await view.unmount();
    }
  });

  it('gives no warning before a practice that does not hold the breath', async () => {
    await render(<BreatheScreen />);
    await fireEvent.press(row('heart'));
    expect(screen.queryByTestId('breathe-caution')).toBeNull();
  });

  it('opens why it helps on a tap, with its source', async () => {
    await openHeart();
    const heart = PRACTICES.find((practice) => practice.id === 'heart');
    const source = breatheCopy.source(heart?.source ?? '');
    expect(screen.queryByText(source)).toBeNull();
    await fireEvent.press(screen.getByTestId('breathe-why'));
    expect(screen.getByText(source)).toBeTruthy();
  });

  it('remembers the voice and the sound, and shows the lines to read when the voice is off', async () => {
    await openHeart();
    expect(screen.queryByText(breatheCopy.linesTitle)).toBeNull();
    await fireEvent.press(screen.getByRole('switch', { name: breatheCopy.voice }));
    await fireEvent.press(screen.getByRole('switch', { name: breatheCopy.sound }));
    expect(usePreferences.getState().practice).toMatchObject({ voice: false, sound: false });
    expect(screen.getByText(breatheCopy.linesTitle)).toBeTruthy();
  });
});

describe('after a practice', () => {
  async function breatheThrough(id: string) {
    await render(<BreatheScreen />);
    await fireEvent.press(row(id));
    await fireEvent.press(screen.getByRole('button', { name: breatheCopy.begin }));
    // The whole practice, on its own clock: there is no sound to follow under test.
    for (let i = 0; i < 40; i += 1) await act(async () => void jest.advanceTimersByTime(10_000));
  }

  it('asks how the person feels, keeps the answer as a count, and offers the ways on', async () => {
    await breatheThrough('settle');
    expect(screen.getByRole('header', { name: breatheCopy.check.title })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('feeling-check-calmer'));
    expect(recordPractice).toHaveBeenCalledWith(expect.any(String), 'settle', {
      practice: true,
      feeling: 'calmer',
    });
    expect(screen.getByRole('button', { name: breatheCopy.actions.echo })).toBeTruthy();
    expect(screen.getByRole('button', { name: breatheCopy.actions.more })).toBeTruthy();
    expect(screen.getByRole('button', { name: breatheCopy.actions.done })).toBeTruthy();
  });

  it('offers support after Ground when the person is still unsettled', async () => {
    await breatheThrough('ground');
    await fireEvent.press(screen.getByTestId('feeling-check-unsettled'));
    expect(screen.getByRole('header', { name: supportCopy.title })).toBeTruthy();
  });

  it('does not offer support after a practice that does not ask for it', async () => {
    await breatheThrough('settle');
    await fireEvent.press(screen.getByTestId('feeling-check-unsettled'));
    expect(screen.queryByRole('header', { name: supportCopy.title })).toBeNull();
  });

  it('puts the journal’s audio back before Begin your echo opens today’s session', async () => {
    await breatheThrough('settle');
    await fireEvent.press(screen.getByTestId('feeling-check-skip'));
    mockAudio.setAudioModeAsync.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: breatheCopy.actions.echo }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith(JOURNAL_AUDIO_MODE);
    const restored = mockAudio.setAudioModeAsync.mock.invocationCallOrder.at(-1) ?? 0;
    expect(restored).toBeLessThan(jest.mocked(router.push).mock.invocationCallOrder[0] ?? 0);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'voice' },
    });
  });

  it('asks the morning question when Begin your echo is pressed in the morning', async () => {
    mockMorning = true;
    await breatheThrough('settle');
    await fireEvent.press(screen.getByTestId('feeling-check-skip'));
    await fireEvent.press(screen.getByRole('button', { name: breatheCopy.actions.echo }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/home/session',
        params: { mode: 'voice', prompt: 'become' },
      }),
    );
  });

  it('carries on for one more minute, then offers the ways on without asking again', async () => {
    await breatheThrough('settle');
    await fireEvent.press(screen.getByTestId('feeling-check-same'));
    await fireEvent.press(screen.getByTestId('after-more'));
    expect(screen.getByTestId('practice-sky', { includeHiddenElements: true })).toBeTruthy();
    for (let i = 0; i < 10; i += 1) await act(async () => void jest.advanceTimersByTime(10_000));
    expect(screen.queryByRole('header', { name: breatheCopy.check.title })).toBeNull();
    expect(screen.getByRole('button', { name: breatheCopy.actions.done })).toBeTruthy();
    expect(recordPractice).toHaveBeenCalledTimes(1);
  });

  it('goes back to Today on Done', async () => {
    await breatheThrough('settle');
    await fireEvent.press(screen.getByTestId('feeling-check-skip'));
    await fireEvent.press(screen.getByTestId('after-done'));
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });
});
