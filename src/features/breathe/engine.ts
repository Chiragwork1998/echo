/**
 * A breath, as time. Pure: a pattern and a moment go in, and where the breath is comes out. Nothing
 * here knows which practice it is, how it looks, or what it says, so any pattern can be run: fixed
 * phases (two inhales and a long exhale, 4-7-8, a box), or a pace in breaths per minute with an
 * inhale to exhale ratio.
 */

export type BreathAction = 'inhale' | 'exhale' | 'hold';

export type BreathPhase = {
  readonly action: BreathAction;
  /** How long the phase lasts, in milliseconds. */
  readonly ms: number;
  /**
   * How full the lungs are when the phase ends, from 0 (empty) to 1 (full). An inhale fills to 1 and
   * an exhale empties to 0 unless told otherwise. A hold keeps whatever it found, and takes no `to`.
   */
  readonly to?: number;
  /** A name the words layer can use for a phase said differently, such as a second inhale. */
  readonly cue?: string;
};

/** One round of a breath, repeated for as long as a practice lasts. Made by the functions below. */
export type BreathPattern = {
  readonly phases: readonly BreathPhase[];
  /** When each phase begins, from the start of the round. */
  readonly starts: readonly number[];
  /** How full the lungs are at each phase's start, and, last, at the round's end. */
  readonly levels: readonly number[];
  /** The length of one round. */
  readonly roundMs: number;
};

/** A pace: so many breaths a minute, split between breathing in and out in this ratio. */
export type BreathPace = {
  readonly breathsPerMinute: number;
  /** The inhale's share of each breath. With `exhale`, 1:1 is even, and 4:6 a longer out breath. */
  readonly inhale: number;
  readonly exhale: number;
};

/** Where the breath is at one moment. */
export type BreathState = {
  /** The round, counting from 0. */
  readonly round: number;
  /** The phase within the round, counting from 0. */
  readonly index: number;
  readonly phase: BreathPhase;
  /** 0 as the phase begins, rising toward 1 as it ends. */
  readonly progress: number;
  /** Elapsed time at which this phase began, and at which it ends. */
  readonly startMs: number;
  readonly endMs: number;
  /** How full the lungs are now, eased, and how full at the phase's start and end. */
  readonly level: number;
  readonly from: number;
  readonly to: number;
  /** The practice has run all its rounds. The state is then the very end of the last phase. */
  readonly done: boolean;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function fail(message: string): never {
  throw new Error(`Breath pattern: ${message}`);
}

/** Where a phase leaves the lungs, given where it found them. */
function levelAfter(phase: BreathPhase, before: number): number {
  if (phase.action === 'hold') return before;
  return clamp01(phase.to ?? (phase.action === 'inhale' ? 1 : 0));
}

/** A round made of these phases, in order. Lungs start empty, before the first breath. */
export function fixedPattern(phases: readonly BreathPhase[]): BreathPattern {
  if (phases.length === 0) fail('needs at least one phase');
  const starts: number[] = [];
  const levels: number[] = [0];
  let at = 0;
  let level = 0;
  for (const phase of phases) {
    if (!Number.isFinite(phase.ms) || phase.ms <= 0) fail('every phase needs a positive length');
    if (phase.to !== undefined && phase.action === 'hold') fail('a hold keeps its level');
    if (phase.to !== undefined && (!Number.isFinite(phase.to) || phase.to < 0 || phase.to > 1)) {
      fail('a level runs from 0 to 1');
    }
    starts.push(at);
    at += phase.ms;
    level = levelAfter(phase, level);
    levels.push(level);
  }
  return { phases: [...phases], starts, levels, roundMs: at };
}

/**
 * A round of one inhale and one exhale at a pace. Each breath lasts 60 / breathsPerMinute seconds,
 * divided in the ratio given, to the whole millisecond.
 */
export function pacedPattern(pace: BreathPace): BreathPattern {
  const { breathsPerMinute, inhale, exhale } = pace;
  if (!Number.isFinite(breathsPerMinute) || breathsPerMinute <= 0) {
    fail('a pace needs a positive number of breaths a minute');
  }
  if (!Number.isFinite(inhale) || !Number.isFinite(exhale) || inhale <= 0 || exhale <= 0) {
    fail('a ratio needs a positive inhale and exhale');
  }
  const breathMs = Math.round(60_000 / breathsPerMinute);
  const inhaleMs = Math.round((breathMs * inhale) / (inhale + exhale));
  if (inhaleMs <= 0 || inhaleMs >= breathMs) fail('the ratio leaves no time for one side');
  return fixedPattern([
    { action: 'inhale', ms: inhaleMs },
    { action: 'exhale', ms: breathMs - inhaleMs },
  ]);
}

/** The whole rounds closest to a length of time, and never fewer than one. */
export function roundsFor(pattern: BreathPattern, durationMs: number): number {
  return Math.max(1, Math.round(durationMs / pattern.roundMs));
}

/** How long a practice of so many rounds lasts. */
export const practiceMs = (pattern: BreathPattern, rounds: number) => pattern.roundMs * rounds;

/** Slow at both ends and quickest in the middle, the way a breath moves. 0 → 0, 1 → 1. */
export function easeBreath(progress: number): number {
  const p = clamp01(progress);
  return (1 - Math.cos(Math.PI * p)) / 2;
}

/** The phase holding a moment within one round: the last phase that has begun. */
function phaseIndexAt(pattern: BreathPattern, within: number): number {
  let index = 0;
  for (let i = 0; i < pattern.starts.length; i += 1) {
    if ((pattern.starts[i] ?? 0) <= within) index = i;
  }
  return index;
}

/**
 * Where the breath is, `elapsedMs` into a practice of this pattern. With `rounds`, the practice ends
 * after that many, and any later moment is its last instant, marked done. Without, it runs forever.
 */
export function breathAt(
  pattern: BreathPattern,
  elapsedMs: number,
  rounds = Number.POSITIVE_INFINITY,
): BreathState {
  const { phases, starts, levels, roundMs } = pattern;
  const total = roundMs * rounds;
  const done = elapsedMs >= total;
  // The end of the last phase stands for every moment after the practice.
  const at = done ? total : Math.max(0, elapsedMs);
  const round = done ? rounds - 1 : Math.floor(at / roundMs);
  const within = done ? roundMs : at - round * roundMs;
  const index = done ? phases.length - 1 : phaseIndexAt(pattern, within);
  const phase = phases[index] ?? fail('lost its place');
  const startInRound = starts[index] ?? 0;
  // Round 0 starts from empty lungs. Later rounds start from where the round before ended, which for
  // any pattern with a breath in it is the same place every time.
  const roundStartLevel = round === 0 ? 0 : (levels[levels.length - 1] ?? 0);
  const from = index === 0 ? roundStartLevel : levelFrom(pattern, index, roundStartLevel);
  const to = levelAfter(phase, from);
  const progress = clamp01((within - startInRound) / phase.ms);
  const level = phase.action === 'hold' ? from : from + (to - from) * easeBreath(progress);
  const startMs = round * roundMs + startInRound;
  return {
    round,
    index,
    phase,
    progress,
    startMs,
    endMs: startMs + phase.ms,
    level,
    from,
    to,
    done,
  };
}

/** The lungs' level as phase `index` begins, from a round that started at `start`. */
function levelFrom(pattern: BreathPattern, index: number, start: number): number {
  let level = start;
  for (let i = 0; i < index; i += 1) {
    const phase = pattern.phases[i];
    if (phase) level = levelAfter(phase, level);
  }
  return level;
}
