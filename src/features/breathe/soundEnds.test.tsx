import { act, fireEvent, screen } from '@testing-library/react-native';

import { useRequirePlus, usePlus } from '@/services/plus';
import { DEFAULT_PRACTICE, usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { breatheCopy } from './breatheCopy';
import { BreatheScreen } from './BreatheScreen';
import { BELLS } from './sounds';

/**
 * A player as Android's expo-audio has it: `remove()` only takes the player off the module's list and
 * the sound plays on. Only `pause()` or `release()` silences it. The release walk of 1.0.0 heard the
 * breath loop play on after every practice, into the journal take and the background.
 */
type Status = { isLoaded: boolean; playing: boolean; currentTime: number; duration: number };
class FakePlayer {
  loop = false;
  volume = 1;
  playing = false;
  released = false;
  private listeners = new Set<(status: Status) => void>();
  constructor(readonly source: unknown) {}
  play = jest.fn(() => {
    this.playing = true;
    // Its first report comes a moment later, as a phone's does, once the practice is listening. Heard
    // to play, the practice follows this player's clock.
    setTimeout(() => {
      if (!this.playing) return;
      this.listeners.forEach((listener) =>
        listener({ isLoaded: true, playing: true, currentTime: 0, duration: 0 }),
      );
    }, 100);
  });
  pause = jest.fn(() => {
    this.playing = false;
  });
  remove = jest.fn();
  release = jest.fn(() => {
    this.released = true;
  });
  seekTo = jest.fn(async () => undefined);
  addListener = jest.fn((_event: string, listener: (status: Status) => void) => {
    this.listeners.add(listener);
    return { remove: () => void this.listeners.delete(listener) };
  });
  /** Still heard: playing, and never stopped or freed. */
  get sounding() {
    return this.playing && !this.released && this.volume > 0;
  }
}

let mockPlayers: FakePlayer[] = [];
const mockAudio = {
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn((source: unknown) => {
    const player = new FakePlayer(source);
    mockPlayers.push(player);
    return player;
  }),
};

jest.mock('@/services/nativeModules', () => ({ loadAudio: () => mockAudio }));
jest.mock('@/design/haptics');
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
// Every sound file is the same number under jest: the bells are named here so the closing one can be found.
jest.mock('./sounds', () => ({
  ...jest.requireActual('./sounds'),
  BELLS: { open: 'bell-open', moment: 'bell', close: 'bell-close' },
}));
jest.mock('./feelingStore', () => ({
  ...jest.requireActual('./feelingStore'),
  recordPractice: jest.fn(async () => ({ ok: true, value: null })),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockPlayers = [];
  usePreferences.setState({ practice: { ...DEFAULT_PRACTICE, begun: 1 } });
  jest.mocked(usePlus).mockReturnValue({ status: 'free', isPlus: false });
  jest.mocked(useRequirePlus).mockReturnValue(() => true);
});

const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));
const loops = () => mockPlayers.filter((player) => player.loop);
const sounding = () => mockPlayers.filter((player) => player.sounding);

async function beginSettle() {
  const view = await render(<BreatheScreen />);
  await fireEvent.press(screen.getByTestId('feeling-settle'));
  await fireEvent.press(screen.getByRole('button', { name: breatheCopy.begin }));
  await advance(20_000);
  // The breath is playing on the loop’s own clock.
  expect(loops().some((player) => player.sounding)).toBe(true);
  return view;
}

describe('when a practice ends, its sound ends', () => {
  it('fades the breath out and frees every player after the practice runs to its end, and lets the closing bell ring out', async () => {
    await beginSettle();
    let after = false;
    for (let second = 20; second < 400 && !after; second += 1) {
      await advance(1000);
      after = screen.queryByRole('header', { name: breatheCopy.check.title }) !== null;
    }
    expect(after).toBe(true);

    // The closing bell has just rung. It is not cut off as the practice hands over.
    const close = mockPlayers.find((player) => player.source === BELLS.close);
    expect(close?.play).toHaveBeenCalled();
    expect(close?.released).toBe(false);

    // The breath fades over a second or so, then stops, and its players are freed.
    await advance(1500);
    expect(loops().filter((player) => player.sounding)).toEqual([]);
    expect(loops().every((player) => player.release.mock.calls.length === 1)).toBe(true);

    // Once every bell and line has had time to ring out, nothing is left.
    await advance(10_000);
    expect(sounding()).toEqual([]);
    expect(mockPlayers.every((player) => player.release.mock.calls.length === 1)).toBe(true);
  });

  it('stops every sound at once when End is pressed', async () => {
    await beginSettle();
    await fireEvent.press(screen.getByTestId('practice-end'));
    await advance(300);
    expect(sounding()).toEqual([]);
    expect(mockPlayers.every((player) => player.release.mock.calls.length === 1)).toBe(true);
  });

  it('stops every sound when the screen goes away mid-practice', async () => {
    const view = await beginSettle();
    await view.unmount();
    await advance(300);
    expect(sounding()).toEqual([]);
    expect(mockPlayers.every((player) => player.release.mock.calls.length === 1)).toBe(true);
  });
});
