import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { __setClockForTests, cue, cuedWithin, type Cue } from './haptics';

// A complete stand-in for the native module: the real strings, none of the native calls.
jest.mock('expo-haptics', () => ({
  // Served as the module itself (not a copy), so a test can take a part of it away.
  __esModule: true,
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  performAndroidHapticsAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Soft: 'soft',
    Rigid: 'rigid',
  },
  AndroidHaptics: {
    Confirm: 'confirm',
    Reject: 'reject',
    Gesture_Start: 'gesture-start',
    Gesture_End: 'gesture-end',
    Toggle_On: 'toggle-on',
    Toggle_Off: 'toggle-off',
    Clock_Tick: 'clock-tick',
    Context_Click: 'context-click',
    Keyboard_Release: 'keyboard-release',
    Segment_Tick: 'segment-tick',
    Segment_Frequent_Tick: 'segment-frequent-tick',
  },
}));

const impact = jest.mocked(Haptics.impactAsync);
const selection = jest.mocked(Haptics.selectionAsync);
const perform = jest.mocked(Haptics.performAndroidHapticsAsync);

type Gesture = 'tick' | 'fine' | 'on' | 'off' | 'commit' | 'settle';
/** Every cue that is not a Vibrator waveform, in the order the vocabulary lists them. */
const GESTURES: Gesture[] = ['tick', 'fine', 'on', 'off', 'commit', 'settle'];
const ALL: Cue[] = [...GESTURES, 'breathIn', 'breathOut', 'moment'];

let now = 0;
const advance = (ms: number) => {
  now += ms;
  jest.advanceTimersByTime(ms);
};
/** Lets a rejected promise reach its handler. */
const flush = async () => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

function phone(os: 'ios' | 'android' | 'web', version?: number) {
  jest.replaceProperty(Platform, 'OS', os);
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue((version ?? 0) as never);
}

/** The Android calls one cue makes, after the whole settle tail has had time to play. */
function androidCalls(name: Cue) {
  cue(name);
  advance(200);
  return perform.mock.calls.map(([type]) => type);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  now = 10_000;
  __setClockForTests(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  __setClockForTests(null);
});

describe('the Android ladder', () => {
  const LADDER: Record<number, Record<Gesture, string[]>> = {
    // API 34 and up: the segment and toggle constants exist.
    34: {
      tick: ['segment-tick'],
      fine: ['segment-frequent-tick'],
      on: ['toggle-on'],
      off: ['toggle-off'],
      commit: ['context-click'],
      settle: ['gesture-end', 'segment-frequent-tick'],
    },
    // API 30 to 33: the phone maker's clock tick stands in, and fine falls to keyboard release.
    31: {
      tick: ['clock-tick'],
      fine: ['keyboard-release'],
      on: ['clock-tick'],
      off: ['clock-tick'],
      commit: ['context-click'],
      settle: ['gesture-end', 'keyboard-release'],
    },
    // API 27 to 29: no gesture-end, so settle is a single context click.
    29: {
      tick: ['clock-tick'],
      fine: ['keyboard-release'],
      on: ['clock-tick'],
      off: ['clock-tick'],
      commit: ['context-click'],
      settle: ['context-click'],
    },
    // API 26: fine cannot be made well, so it is not made.
    26: {
      tick: ['clock-tick'],
      fine: [],
      on: ['clock-tick'],
      off: ['clock-tick'],
      commit: ['context-click'],
      settle: ['context-click'],
    },
  };

  describe.each(Object.keys(LADDER).map(Number))('on API %i', (api) => {
    beforeEach(() => phone('android', api));

    it.each(GESTURES.map((name) => [name] as const))('plays %s on the right rung', (name) => {
      expect(androidCalls(name)).toEqual(LADDER[api]?.[name]);
    });

    it.each(GESTURES.map((name) => [name] as const))(
      'never reaches for the Vibrator to play %s',
      (name) => {
        cue(name);
        advance(200);
        expect(impact).not.toHaveBeenCalled();
        expect(selection).not.toHaveBeenCalled();
      },
    );
  });

  it('plays the settle tail 90 ms after its first rung, not before', () => {
    phone('android', 34);
    cue('settle');
    expect(perform.mock.calls.map(([type]) => type)).toEqual(['gesture-end']);
    advance(89);
    expect(perform).toHaveBeenCalledTimes(1);
    advance(1);
    expect(perform.mock.calls.map(([type]) => type)).toEqual([
      'gesture-end',
      'segment-frequent-tick',
    ]);
  });

  it('plays no tail when settle is a single context click', () => {
    phone('android', 29);
    cue('settle');
    advance(500);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('plays fine as nothing at all on API 26, with no fallback buzz', () => {
    phone('android', 26);
    cue('fine');
    advance(500);
    expect(perform).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
    expect(selection).not.toHaveBeenCalled();
  });
});

describe('the breath cues stay on the Vibrator, on every Android level', () => {
  it.each([34, 31, 29, 26])('on API %i: in is Medium, out is Light, a moment is Light', (api) => {
    phone('android', api);
    cue('breathIn');
    expect(impact).toHaveBeenLastCalledWith('medium');
    cue('breathOut');
    expect(impact).toHaveBeenLastCalledWith('light');
    cue('moment');
    expect(impact).toHaveBeenLastCalledWith('light');
    expect(impact).toHaveBeenCalledTimes(3);
    expect(perform).not.toHaveBeenCalled();
    expect(selection).not.toHaveBeenCalled();
  });

  it('plays in and out as different waveforms', () => {
    phone('android', 34);
    cue('breathIn');
    cue('breathOut');
    const [first, second] = impact.mock.calls.map(([style]) => style);
    expect(first).not.toBe(second);
  });
});

describe('a cue that fails on Android', () => {
  beforeEach(() => phone('android', 34));

  it('falls back to one Light impact when commit throws', () => {
    perform.mockImplementationOnce(() => {
      throw new Error('no such haptic');
    });
    cue('commit');
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith('light');
  });

  it('falls back to one Light impact when commit is rejected', async () => {
    perform.mockRejectedValueOnce(new Error('not supported'));
    cue('commit');
    await flush();
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith('light');
  });

  it('falls back to one Light impact when settle throws', () => {
    perform.mockImplementationOnce(() => {
      throw new Error('no such haptic');
    });
    cue('settle');
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith('light');
  });

  it('falls back to one Light impact when settle is rejected', async () => {
    perform.mockRejectedValueOnce(new Error('not supported'));
    cue('settle');
    await flush();
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith('light');
  });

  it.each(['tick', 'fine', 'on', 'off'] as const)(
    'makes nothing instead when %s throws or is rejected',
    async (name) => {
      perform.mockImplementationOnce(() => {
        throw new Error('no such haptic');
      });
      cue(name);
      advance(200);
      perform.mockRejectedValueOnce(new Error('not supported'));
      cue(name);
      await flush();
      expect(impact).not.toHaveBeenCalled();
      expect(selection).not.toHaveBeenCalled();
    },
  );
});

describe('iOS', () => {
  beforeEach(() => phone('ios', 17));

  it('maps every cue to its impact', () => {
    const IOS: Record<Exclude<Cue, 'settle'>, string> = {
      tick: 'selection',
      fine: 'soft',
      on: 'light',
      off: 'soft',
      commit: 'medium',
      breathIn: 'light',
      breathOut: 'soft',
      moment: 'light',
    };
    for (const [name, expected] of Object.entries(IOS)) {
      impact.mockClear();
      selection.mockClear();
      advance(1000);
      cue(name as Cue);
      if (expected === 'selection') {
        expect(selection).toHaveBeenCalledTimes(1);
        expect(impact).not.toHaveBeenCalled();
      } else {
        expect(impact).toHaveBeenCalledTimes(1);
        expect(impact).toHaveBeenCalledWith(expected);
        expect(selection).not.toHaveBeenCalled();
      }
    }
  });

  it('plays settle as Medium, then Soft 90 ms later', () => {
    cue('settle');
    expect(impact.mock.calls).toEqual([['medium']]);
    advance(89);
    expect(impact).toHaveBeenCalledTimes(1);
    advance(1);
    expect(impact.mock.calls).toEqual([['medium'], ['soft']]);
  });

  it('never calls the Android API', () => {
    for (const name of ALL) {
      advance(1000);
      cue(name);
    }
    advance(1000);
    expect(perform).not.toHaveBeenCalled();
  });
});

describe('the web', () => {
  beforeEach(() => phone('web'));

  it('does nothing at all, tail included', () => {
    for (const name of ALL) {
      advance(1000);
      cue(name);
    }
    advance(1000);
    expect(impact).not.toHaveBeenCalled();
    expect(selection).not.toHaveBeenCalled();
    expect(perform).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('has cued nothing', () => {
    cue('settle');
    expect(cuedWithin('settle', 60_000)).toBe(false);
  });
});

describe('a module that is only partly there', () => {
  const PARTS = [
    'impactAsync',
    'selectionAsync',
    'performAndroidHapticsAsync',
    'ImpactFeedbackStyle',
    'AndroidHaptics',
  ];
  const stand = Haptics as unknown as Record<string, unknown>;
  const whole = { ...stand };
  afterEach(() => {
    Object.assign(stand, whole);
  });

  /** Takes away every part of the module but the ones named, as a thin jest mock would. */
  function offer(...kept: string[]) {
    for (const part of PARTS) {
      if (!kept.includes(part)) stand[part] = undefined;
    }
  }
  function playAll() {
    for (const name of ALL) {
      advance(1000);
      expect(() => cue(name)).not.toThrow();
    }
    advance(1000);
  }

  it.each([
    ['ios', 17],
    ['android', 34],
    ['android', 29],
    ['android', 26],
  ] as const)('does not throw on %s %i with only impactAsync', (os, version) => {
    phone(os, version);
    offer('impactAsync');
    playAll();
  });

  it.each(['ios', 'android'] as const)(
    'does not throw on %s with only selectionAsync, as the tab bar test mocks it',
    (os) => {
      phone(os, 34);
      offer('selectionAsync');
      playAll();
    },
  );

  it.each(['ios', 'android'] as const)(
    'does not throw on %s with impactAsync and a styles table that lacks Soft',
    (os) => {
      phone(os, 34);
      offer('impactAsync', 'selectionAsync', 'ImpactFeedbackStyle');
      stand.ImpactFeedbackStyle = { Light: 'light', Medium: 'medium' };
      playAll();
    },
  );

  it.each(['ios', 'android'] as const)('does not throw on %s with an empty module', (os) => {
    phone(os, 34);
    offer();
    playAll();
  });

  it.each([
    [
      'throws',
      () => {
        throw new Error('no haptics here');
      },
    ],
    ['rejects', () => Promise.reject(new Error('no haptics here'))],
  ] as const)('does not throw on either platform when every call %s', async (_, fail) => {
    for (const [os, version] of [
      ['ios', 17],
      ['android', 34],
    ] as const) {
      phone(os, version);
      stand.impactAsync = fail;
      stand.selectionAsync = fail;
      stand.performAndroidHapticsAsync = fail;
      for (const name of ALL) {
        advance(1000);
        expect(() => cue(name)).not.toThrow();
        await flush();
      }
      advance(1000);
    }
  });

  it('reaches for no impact style it was not given', () => {
    phone('ios', 17);
    offer('impactAsync');
    cue('commit');
    // Without the style, the native default would be Medium for every cue. Better to say nothing.
    expect(impact).not.toHaveBeenCalled();
  });

  it('returns nothing', () => {
    phone('ios', 17);
    offer();
    expect(cue('tick')).toBeUndefined();
  });
});

describe('the budget', () => {
  beforeEach(() => phone('ios', 17));

  it('drops a second, different cue inside 70 ms and plays it at 70', () => {
    cue('tick');
    advance(69);
    cue('on');
    expect(impact).not.toHaveBeenCalled();
    advance(1);
    cue('on');
    expect(selection).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledTimes(1);
  });

  it('drops the same cue inside 140 ms and plays it at 140', () => {
    cue('tick');
    advance(139);
    cue('tick');
    expect(selection).toHaveBeenCalledTimes(1);
    advance(1);
    cue('tick');
    expect(selection).toHaveBeenCalledTimes(2);
  });

  it('does not let a dropped cue push the window out', () => {
    cue('tick');
    advance(100);
    cue('tick');
    advance(40);
    cue('tick');
    expect(selection).toHaveBeenCalledTimes(2);
  });

  it('does not count a dropped cue against the next one', () => {
    cue('tick');
    advance(50);
    cue('on');
    advance(30);
    // 80 ms since the tick that played; the dropped on never counted.
    cue('on');
    expect(impact).toHaveBeenCalledTimes(1);
  });

  it('exempts the breath cues and the moment from the budget', () => {
    cue('breathIn');
    cue('breathIn');
    cue('breathOut');
    cue('moment');
    cue('moment');
    expect(impact.mock.calls).toEqual([['light'], ['light'], ['soft'], ['light'], ['light']]);
  });

  it('keeps the breath cues out of everyone else’s budget', () => {
    cue('breathIn');
    cue('tick');
    expect(selection).toHaveBeenCalledTimes(1);
    cue('moment');
    expect(impact).toHaveBeenCalledTimes(2);
    advance(100);
    cue('breathOut');
    cue('commit');
    expect(impact).toHaveBeenCalledTimes(4);
  });

  it('plays the settle tail even 20 ms after another cue', () => {
    cue('settle');
    advance(70);
    cue('tick');
    expect(selection).toHaveBeenCalledTimes(1);
    advance(20);
    // The tail lands at 90 ms, 20 ms after the tick, and is not held back.
    expect(impact.mock.calls).toEqual([['medium'], ['soft']]);
  });

  it('does not let the tail hold back a fine cue that follows it', () => {
    cue('settle');
    advance(90);
    expect(impact).toHaveBeenCalledTimes(2);
    advance(50);
    cue('fine');
    expect(impact).toHaveBeenCalledTimes(3);
  });

  it('holds settle itself to the budget', () => {
    cue('tick');
    advance(50);
    cue('settle');
    advance(500);
    expect(impact).not.toHaveBeenCalled();
  });

  it('keeps the same budget on Android', () => {
    phone('android', 34);
    cue('tick');
    advance(60);
    cue('on');
    advance(10);
    cue('on');
    advance(139);
    cue('on');
    expect(perform.mock.calls.map(([type]) => type)).toEqual(['segment-tick', 'toggle-on']);
    advance(1);
    cue('on');
    expect(perform).toHaveBeenCalledTimes(3);
  });
});

describe('cuedWithin', () => {
  beforeEach(() => phone('ios', 17));

  it('is false for a cue that has not played', () => {
    expect(cuedWithin('settle', 3000)).toBe(false);
  });

  it('is true for a cue that played inside the window, and false once it is out', () => {
    cue('settle');
    advance(2999);
    expect(cuedWithin('settle', 3000)).toBe(true);
    advance(1);
    expect(cuedWithin('settle', 3000)).toBe(true);
    advance(1);
    expect(cuedWithin('settle', 3000)).toBe(false);
  });

  it('asks about one cue at a time', () => {
    cue('settle');
    expect(cuedWithin('commit', 3000)).toBe(false);
    expect(cuedWithin('settle', 3000)).toBe(true);
  });

  it('is false for a cue the budget dropped', () => {
    cue('tick');
    advance(20);
    cue('commit');
    expect(cuedWithin('commit', 3000)).toBe(false);
  });

  it('knows an exempt cue played', () => {
    cue('breathIn');
    expect(cuedWithin('breathIn', 1000)).toBe(true);
  });

  it('does not count the tail as a fine cue', () => {
    cue('settle');
    advance(200);
    expect(cuedWithin('fine', 3000)).toBe(false);
  });

  it('answers on Android too', () => {
    phone('android', 34);
    cue('commit');
    expect(cuedWithin('commit', 3000)).toBe(true);
  });
});

describe('the clock', () => {
  it('goes back to the real clock when it is cleared', () => {
    phone('ios', 17);
    __setClockForTests(null);
    cue('tick');
    expect(selection).toHaveBeenCalledTimes(1);
    expect(cuedWithin('tick', 60_000)).toBe(true);
  });

  it('starts every budget afresh when it is set', () => {
    phone('ios', 17);
    cue('tick');
    __setClockForTests(() => now);
    cue('tick');
    expect(selection).toHaveBeenCalledTimes(2);
  });
});
