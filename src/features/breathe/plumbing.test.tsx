import { act, screen } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AccessibilityInfo, AppState } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { cue } from '@/design/haptics';
import { installRuntime } from '@/storage/runtime';
import { createTestRuntime, everyStoredByte } from '@/storage/testing/nodePorts';
import { render } from '@/testing/render';

import {
  BREATH_AUDIO_MODE,
  enterBreathAudio,
  JOURNAL_AUDIO_MODE,
  restoreJournalAudio,
} from './audio';
import { BreathingSky } from './BreathingSky';
import { playerClock, silentClock } from './clock';
import { loadFeelings, recordPractice } from './feelingStore';
import { PracticeView } from './PracticeView';
import { compile } from './timeline';
import type { Practice } from './types';
import { BREATH_KEEP_AWAKE_TAG } from './useBreathAwake';

const mockAudio = {
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn(() => {
    throw new Error('no audio under test');
  }),
};
let mockReduced = false;
let mockScreenReader = false;

jest.mock('@/services/nativeModules', () => ({ loadAudio: () => mockAudio }));
jest.mock('@/design/haptics');
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));
jest.mock('@/features/journal-session/useScreenReader', () => ({
  useScreenReader: () => mockScreenReader,
}));

const practice: Practice = {
  id: 'test',
  feeling: 'Testing',
  name: 'Test',
  line: 'A made-up practice.',
  why: 'For the tests.',
  source: 'Nobody',
  minutes: 1,
  free: true,
  steps: [{ kind: 'breath', pattern: { kind: 'paced', inhale: 4, exhale: 6 }, seconds: 60 }],
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockReduced = false;
  mockScreenReader = false;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: () => undefined }) as never);
});

const advance = async (ms: number, step = 500) => {
  for (let at = 0; at < ms; at += step) {
    await act(async () => void jest.advanceTimersByTime(step));
  }
};

describe('a practice running', () => {
  const run = (onEnd = jest.fn()) =>
    render(
      <PracticeView
        timeline={compile(practice)}
        pace={5.5}
        sound={false}
        voice={false}
        first={false}
        onEnd={onEnd}
      />,
    );

  it('ticks softly as each breath in begins, and more softly as each breath out begins', async () => {
    await run();
    await advance(19_000);
    // Two rounds of 4 in and 6 out: in at 0 and 10 s, out at 4 and 14 s. With the sound off, the
    // opening bell is a tick too.
    const played = jest.mocked(cue).mock.calls.map(([name]) => name);
    expect(played.filter((name) => name === 'breathIn')).toHaveLength(2);
    expect(played.filter((name) => name === 'breathOut')).toHaveLength(2);
    expect(played.filter((name) => name === 'moment')).toHaveLength(1);
    expect(played).toHaveLength(5);
  });

  it('tells a screen reader the first two rounds, then lets the sound carry it', async () => {
    mockScreenReader = true;
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    await run();
    await advance(45_000);
    expect(announce.mock.calls).toEqual([
      ['Breathe in', { queue: true }],
      ['Breathe out', { queue: true }],
      ['Breathe in', { queue: true }],
      ['Breathe out', { queue: true }],
    ]);
  });

  it('holds the screen awake under its own tag, and lets go when it ends', async () => {
    const onEnd = jest.fn();
    await run(onEnd);
    await advance(2000);
    expect(activateKeepAwakeAsync).toHaveBeenCalledWith(BREATH_KEEP_AWAKE_TAG);
    expect(deactivateKeepAwake).not.toHaveBeenCalled();
    await advance(62_000, 2000);
    expect(onEnd).toHaveBeenCalledWith({ finished: true, rounds: 6 });
    expect(deactivateKeepAwake).toHaveBeenCalledWith(BREATH_KEEP_AWAKE_TAG);
  });

  it('shows the words in full, then short, and the safety line only on a first practice', async () => {
    await render(
      <PracticeView
        timeline={compile(practice)}
        pace={5.5}
        sound={false}
        voice={false}
        first
        onEnd={jest.fn()}
      />,
    );
    await advance(1000);
    expect(screen.getByText('Breathe in')).toBeTruthy();
    expect(screen.getByText(/If you feel dizzy or unwell/)).toBeTruthy();
    await advance(24_000);
    expect(screen.getByText('Out')).toBeTruthy();
  });
});

describe('the breathing sky', () => {
  function Sky({ breath }: { breath: number }) {
    const level = useSharedValue(breath);
    const dark = useSharedValue(0);
    return <BreathingSky level={level} dark={dark} word={null} />;
  }
  const tide = () => JSON.stringify(screen.getByTestId('breath-tide').props.style);

  it('moves the tide line with the breath', async () => {
    await render(<Sky breath={1} />);
    expect(tide()).toContain('"translateY":-64');
  });

  it('under Reduce Motion, holds the line still and changes only its light', async () => {
    mockReduced = true;
    await render(<Sky breath={0} />);
    const empty = tide();
    await render(<Sky breath={1} />);
    expect(tide()).toContain('"translateY":-32');
    expect(empty).toContain('"translateY":-32');
    expect(tide()).not.toBe(empty);
  });
});

describe('the audio mode', () => {
  it('breathes in silent mode and under the person’s own music', async () => {
    await enterBreathAudio();
    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith(BREATH_AUDIO_MODE);
    expect(BREATH_AUDIO_MODE).toMatchObject({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
    });
  });

  it('puts back the mode the journal leaves itself in', async () => {
    await restoreJournalAudio();
    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith({ allowsRecording: false });
    expect(JOURNAL_AUDIO_MODE).toEqual({ allowsRecording: false });
  });

  it('on Android, also puts back the focus a mode never set has, as doNotMix', () => {
    jest.isolateModules(() => {
      const { Platform } = jest.requireActual('react-native');
      jest.replaceProperty(Platform, 'OS', 'android');
      const { JOURNAL_AUDIO_MODE: android } = jest.requireActual('./audio');
      expect(android).toMatchObject({ allowsRecording: false, interruptionMode: 'doNotMix' });
    });
  });
});

describe('the clock', () => {
  type Listener = (status: object) => void;
  function fakePlayer() {
    let listener: Listener = () => undefined;
    return {
      emit: (status: object) => listener({ isLoaded: true, duration: 10, ...status }),
      player: {
        addListener: (_: string, next: Listener) => {
          listener = next;
          return { remove: () => undefined };
        },
        pause: jest.fn(),
        play: jest.fn(),
      },
    };
  }

  it('follows the player, carrying it forward between reports, and counts each time round', () => {
    let now = 0;
    const { player, emit } = fakePlayer();
    const clock = playerClock(player as never, 10_000, () => now);
    expect(clock.started()).toBe(false);
    emit({ currentTime: 2, playing: true });
    expect(clock.started()).toBe(true);
    now = 500;
    expect(clock.elapsedMs()).toBe(2500);
    // Between reports it runs past the end of the file: the next time round.
    now = 8500;
    expect(clock.elapsedMs()).toBe(10_500);
    emit({ currentTime: 0.6, playing: true });
    expect(clock.elapsedMs()).toBe(10_600);
  });

  it('stops where the sound stopped', () => {
    let now = 0;
    const { player, emit } = fakePlayer();
    const clock = playerClock(player as never, 10_000, () => now);
    emit({ currentTime: 3, playing: true });
    now = 1000;
    clock.pause();
    now = 9000;
    expect(clock.elapsedMs()).toBe(4000);
    expect(player.pause).toHaveBeenCalled();
  });

  it('keeps time on the wall without a player, with pauses taken out', () => {
    let now = 0;
    const clock = silentClock(() => now);
    now = 3000;
    clock.pause();
    now = 9000;
    clock.resume();
    now = 10_000;
    expect(clock.elapsedMs()).toBe(4000);
  });
});

describe('how the person felt', () => {
  beforeEach(async () => {
    jest.useRealTimers();
    installRuntime(await createTestRuntime());
  });
  afterEach(() => installRuntime(null));

  it('is kept sealed, as counts only', async () => {
    const rt = await createTestRuntime();
    installRuntime(rt);
    await recordPractice('2026-11-08', 'settle', { practice: true, feeling: 'calmer' });
    await recordPractice('2026-11-08', 'settle', { practice: true });
    await recordPractice('2026-11-09', 'ground', { practice: true, feeling: 'unsettled' });
    expect(await loadFeelings()).toEqual({
      ok: true,
      value: {
        v: 1,
        days: {
          '2026-11-08': { settle: { practices: 2, calmer: 1, same: 0, unsettled: 0 } },
          '2026-11-09': { ground: { practices: 1, calmer: 0, same: 0, unsettled: 1 } },
        },
      },
    });
    const stored = everyStoredByte(rt.root);
    expect(stored.includes('settle')).toBe(false);
    expect(stored.includes('calmer')).toBe(false);
  });
});
