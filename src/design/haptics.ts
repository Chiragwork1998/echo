import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * ECHO's haptic language: nine cues, named for what they say rather than how they are made. Every
 * screen calls `cue(name)`; none calls expo-haptics. What a name does depends on the phone:
 *
 * - tick    a choice was made, a tab changed, a card turned. The lightest click.
 * - fine    one detent of a dial, many in a row. Softer still, and made only where it can be soft.
 * - on, off a switch crossed its middle.
 * - commit  the beginning of something: a stone, BEGIN, the moment a practice is held.
 * - settle  a thing coming to rest. A gesture ending, then a fine tick behind it.
 * - breathIn, breathOut, moment
 *           the Breathe practice, felt with the sound off and the eyes closed. In and out are
 *           different waveforms; a moment is what a bell would mark.
 *
 * Haptics carry no content. Nothing here reads, stores or logs anything a person wrote.
 */
export type Cue =
  'tick' | 'fine' | 'on' | 'off' | 'commit' | 'settle' | 'breathIn' | 'breathOut' | 'moment';

type AndroidType = keyof typeof Haptics.AndroidHaptics;
type Weight = keyof typeof Haptics.ImpactFeedbackStyle;

// The Android API levels at which each kind of constant exists (expo-haptics throws below them).
const API_KEYBOARD_RELEASE = 27;
const API_GESTURE = 30;
const API_SEGMENT = 34;

/** The budget: no two cues closer than this, and no cue twice closer than that. */
const ANY_GAP_MS = 70;
const SAME_GAP_MS = 140;
/** How long after settle's first touch its fine tick lands. */
const SETTLE_TAIL_MS = 90;

/**
 * Commit is a context click on every Android level. If CONFIRM reads as a single clean tap on the
 * test phones (and not as the notification it can be on some makers' builds), set this to 'Confirm'
 * and commit uses it on API 30 and up.
 */
const COMMIT_ANDROID = 'Context_Click' as 'Context_Click' | 'Confirm';

/** Breathe is felt with the eyes closed and must never depend on the budget. */
const EXEMPT: ReadonlySet<Cue> = new Set<Cue>(['breathIn', 'breathOut', 'moment']);

const realClock = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

let clock: () => number = realClock;
let lastAny = -Infinity;
/** When each cue last played, for the budget and for cuedWithin. Dropped cues are never here. */
const playedAt = new Map<Cue, number>();

/**
 * Tests: reads time from `now` instead of the real clock, and forgets every cue played so far, so
 * the budget starts clean. Pass null to go back to the real clock.
 */
export function __setClockForTests(now: (() => number) | null): void {
  clock = now ?? realClock;
  lastAny = -Infinity;
  playedAt.clear();
}

/**
 * Makes one native call and never lets it fail loudly. A call that throws, or whose promise
 * rejects, runs `fallback` once instead (itself guarded). Expo's calls are async, and thin jest
 * mocks return nothing or are missing altogether, so every shape of failure ends here.
 */
function attempt(call: () => unknown, fallback?: () => void): void {
  const fail = () => {
    if (fallback) attempt(fallback);
  };
  try {
    Promise.resolve(call()).catch(fail);
  } catch {
    fail();
  }
}

/** A Vibrator waveform. Light and Soft are one 50 ms buzz at amplitude 30, Medium 43 ms at 50. */
function impact(weight: Weight, fallback?: () => void): void {
  attempt(() => {
    const style = Haptics.ImpactFeedbackStyle?.[weight];
    // Without the style the native default is Medium, which is the wrong buzz. Say nothing.
    if (style === undefined) return undefined;
    return Haptics.impactAsync(style);
  }, fallback);
}

function selection(): void {
  attempt(() => Haptics.selectionAsync());
}

/** The phone maker's own haptic for a view, which follows the person's Touch feedback setting. */
function perform(type: AndroidType, fallback?: () => void): void {
  attempt(() => {
    const constant = Haptics.AndroidHaptics?.[type];
    if (constant === undefined) throw new Error('No such haptic.');
    return Haptics.performAndroidHapticsAsync(constant);
  }, fallback);
}

/** The Android rung for a cue on this API level, or nothing where it cannot be made well. */
const RUNG: Record<
  'tick' | 'fine' | 'on' | 'off' | 'commit' | 'settle',
  (api: number) => AndroidType | undefined
> = {
  tick: (api) => (api >= API_SEGMENT ? 'Segment_Tick' : 'Clock_Tick'),
  fine: (api) =>
    api >= API_SEGMENT
      ? 'Segment_Frequent_Tick'
      : api >= API_KEYBOARD_RELEASE
        ? 'Keyboard_Release'
        : undefined,
  on: (api) => (api >= API_SEGMENT ? 'Toggle_On' : 'Clock_Tick'),
  off: (api) => (api >= API_SEGMENT ? 'Toggle_Off' : 'Clock_Tick'),
  commit: (api) =>
    COMMIT_ANDROID === 'Confirm' && api >= API_GESTURE ? 'Confirm' : 'Context_Click',
  settle: (api) => (api >= API_GESTURE ? 'Gesture_End' : 'Context_Click'),
};

/** Fine, with no budget and no record: the tail of a settle. */
function fineOnAndroid(api: number): void {
  const rung = RUNG.fine(api);
  if (rung) perform(rung);
}

function playAndroid(name: Cue): void {
  // Breathe stays on the Vibrator on purpose: it works with the sound off and the eyes closed, and
  // does not depend on the person's Touch feedback setting. Only here are in and out different.
  if (name === 'breathIn') return impact('Medium');
  if (name === 'breathOut' || name === 'moment') return impact('Light');

  const api = Number(Platform.Version);
  const rung = RUNG[name](api);
  if (!rung) return;
  // A cue that cannot be made well is not made: only commit and settle, which must be felt, fall
  // back to a Vibrator tap. Tick, fine, on and off do not.
  const lightTap = () => impact('Light');
  const needed = name === 'commit' || name === 'settle';
  perform(rung, needed ? lightTap : undefined);
  if (name === 'settle' && api >= API_GESTURE) {
    setTimeout(() => fineOnAndroid(api), SETTLE_TAIL_MS);
  }
}

function playIos(name: Cue): void {
  switch (name) {
    case 'tick':
      return selection();
    case 'fine':
    case 'off':
    case 'breathOut':
      return impact('Soft');
    case 'on':
    case 'breathIn':
    case 'moment':
      return impact('Light');
    case 'commit':
      return impact('Medium');
    case 'settle':
      impact('Medium');
      setTimeout(() => impact('Soft'), SETTLE_TAIL_MS);
  }
}

/**
 * Plays a cue. Never throws and returns nothing: a haptic is a courtesy, and a phone that cannot
 * make one simply does not. A cue that comes too soon after another is dropped, not delayed
 * (70 ms between any two cues, 140 ms between two of the same); the breath cues and the moment are
 * exempt, as is settle's own tail. The web does nothing.
 */
export function cue(name: Cue): void {
  try {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    const now = clock();
    if (!EXEMPT.has(name)) {
      if (now - lastAny < ANY_GAP_MS) return;
      const same = playedAt.get(name);
      if (same !== undefined && now - same < SAME_GAP_MS) return;
      lastAny = now;
    }
    playedAt.set(name, now);
    if (Platform.OS === 'ios') playIos(name);
    else playAndroid(name);
  } catch {
    // A haptic is never worth a crash.
  }
}

/**
 * True if this cue played, rather than being dropped, in the last `ms` milliseconds (inclusive).
 * Lets two screens that meet at one moment agree on a single buzz between them.
 */
export function cuedWithin(name: Cue, ms: number): boolean {
  const at = playedAt.get(name);
  return at !== undefined && clock() - at <= ms;
}
