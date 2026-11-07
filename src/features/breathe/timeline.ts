import {
  breathAt,
  fixedPattern,
  pacedPattern,
  roundsFor,
  type BreathPattern,
  type BreathPhase,
  type BreathState,
} from './engine';
import type { Pattern, Practice } from './types';

/** Heart's paces, in breaths a minute. The default is the middle of the resonance range. */
export const HEART_PACES = [4.5, 5, 5.5, 6, 6.5] as const;
export const DEFAULT_PACE = 5.5;
/** Heart breathes in for 40 percent of each breath and out for 60. */
const HEART_RATIO = { inhale: 40, exhale: 60 } as const;
/** The lengths a person can choose, in minutes. */
export const LENGTHS = [3, 5, 10, 20] as const;
/** A sigh's first breath in fills the lungs most of the way, and the second tops them up. */
const SIGH_FIRST_FILL = 0.8;

const ms = (seconds: number) => Math.round(seconds * 1000);

/** One round of a pattern from the library, as the engine runs it. */
export function breathOf(pattern: Pattern, pace: number = DEFAULT_PACE): BreathPattern {
  switch (pattern.kind) {
    case 'sigh':
      return fixedPattern([
        { action: 'inhale', ms: ms(pattern.inhale), to: SIGH_FIRST_FILL },
        { action: 'inhale', ms: ms(pattern.topUp), cue: 'again' },
        { action: 'exhale', ms: ms(pattern.exhale) },
      ]);
    case 'paced': {
      const phases: BreathPhase[] = [{ action: 'inhale', ms: ms(pattern.inhale) }];
      if (pattern.holdIn) phases.push({ action: 'hold', ms: ms(pattern.holdIn) });
      phases.push({
        action: 'exhale',
        ms: ms(pattern.exhale),
        cue: pattern.hum ? 'hum' : undefined,
      });
      if (pattern.holdOut) phases.push({ action: 'hold', ms: ms(pattern.holdOut) });
      return fixedPattern(phases);
    }
    case 'heart':
      return pacedPattern({ breathsPerMinute: pace, ...HEART_RATIO });
  }
}

/** A stretch of the practice breathed to one pattern, for whole rounds. */
export type Segment = {
  index: number;
  pattern: Pattern;
  breath: BreathPattern;
  rounds: number;
  startMs: number;
  endMs: number;
  /** Rounds breathed in the segments before this one. */
  roundsBefore: number;
};

export type Bell = 'open' | 'moment' | 'close';

/** Something that happens at a moment of the practice, while the breath goes on. */
export type Cue =
  | { kind: 'bell'; atMs: number; bell: Bell }
  | { kind: 'voice'; atMs: number; line: string; text: string }
  | { kind: 'fade'; atMs: number; ms: number };

export type Timeline = {
  practiceId: string;
  segments: Segment[];
  /** In the order they happen. */
  cues: Cue[];
  totalMs: number;
  /** The practice ends in the dark (Sleep): it closes by going quiet, not with a bell. */
  endsInDark: boolean;
};

type Options = { minutes?: number; pace?: number };

/** Where the first breath out begins, from the start of a round. */
function firstExhaleAt(breath: BreathPattern): number {
  const index = breath.phases.findIndex((phase) => phase.action === 'exhale');
  return breath.starts[Math.max(0, index)] ?? 0;
}

/**
 * The rounds of each breath step. A practice at its own length keeps the timing it was written with.
 * Another length is taken up, or given back, by its stretch steps (the last breath step if it marks
 * none), and every step keeps at least one round.
 */
function roundsOf(practice: Practice, breaths: (BreathPattern | null)[], minutes: number) {
  const rounds = practice.steps.map((step, i) => {
    const breath = breaths[i];
    return step.kind === 'breath' && breath ? roundsFor(breath, step.seconds * 1000) : 0;
  });
  const extra = (minutes - practice.minutes) * 60_000;
  if (extra === 0) return rounds;
  let stretch = practice.steps.flatMap((step, i) =>
    step.kind === 'breath' && step.stretch ? [i] : [],
  );
  if (stretch.length === 0) {
    const last = practice.steps.map((step) => step.kind).lastIndexOf('breath');
    stretch = last === -1 ? [] : [last];
  }
  const share = extra / Math.max(1, stretch.length);
  for (const i of stretch) {
    const breath = breaths[i];
    if (!breath) continue;
    const length = (rounds[i] ?? 0) * breath.roundMs + share;
    rounds[i] = Math.max(1, Math.round(length / breath.roundMs));
  }
  return rounds;
}

/**
 * The practice laid out in time. Breath steps follow one another for whole rounds, so every change of
 * pattern falls at the quiet end of a breath out. A voice line waits for the start of the next breath
 * out, a bell and a fade happen where they are written, and the practice opens and closes with a bell
 * unless its steps already do (or, closing, unless it ends in the dark).
 */
export function compile(practice: Practice, options: Options = {}): Timeline {
  const pace = options.pace ?? DEFAULT_PACE;
  const minutes = options.minutes ?? practice.minutes;
  const breaths = practice.steps.map((step) =>
    step.kind === 'breath' ? breathOf(step.pattern, pace) : null,
  );
  const rounds = roundsOf(practice, breaths, minutes);
  const segments: Segment[] = [];
  const cues: Cue[] = [];
  const waiting: { line: string; text: string }[] = [];
  const firstBreath = practice.steps.findIndex((step) => step.kind === 'breath');
  const lastBreath = practice.steps.map((step) => step.kind).lastIndexOf('breath');
  let at = 0;
  let roundsBefore = 0;
  let opened = false;
  let closed = false;

  practice.steps.forEach((step, i) => {
    switch (step.kind) {
      case 'breath': {
        const breath = breaths[i];
        if (!breath) return;
        const count = rounds[i] ?? 1;
        const segment: Segment = {
          index: segments.length,
          pattern: step.pattern,
          breath,
          rounds: count,
          startMs: at,
          endMs: at + count * breath.roundMs,
          roundsBefore,
        };
        // Lines waiting for this breath are spoken at the start of its breaths out, one a round.
        waiting.splice(0).forEach((voice, k) => {
          const round = Math.min(k, count - 1);
          const atMs = segment.startMs + round * breath.roundMs + firstExhaleAt(breath);
          cues.push({ kind: 'voice', atMs, ...voice });
        });
        segments.push(segment);
        at = segment.endMs;
        roundsBefore += count;
        return;
      }
      case 'voice':
        waiting.push({ line: step.line, text: step.text });
        return;
      case 'bell': {
        const bell: Bell = i < firstBreath ? 'open' : i > lastBreath ? 'close' : 'moment';
        if (bell === 'open') opened = true;
        if (bell === 'close') closed = true;
        cues.push({ kind: 'bell', atMs: at, bell });
        return;
      }
      case 'fade':
        cues.push({ kind: 'fade', atMs: at, ms: step.seconds * 1000 });
        return;
    }
  });
  // Lines after the last breath have nothing to wait for.
  waiting.forEach((voice) => cues.push({ kind: 'voice', atMs: at, ...voice }));

  const endsInDark = cues.some((cue) => cue.kind === 'fade');
  if (!opened) cues.unshift({ kind: 'bell', atMs: 0, bell: 'open' });
  if (!closed && !endsInDark) cues.push({ kind: 'bell', atMs: at, bell: 'close' });
  cues.sort((a, b) => a.atMs - b.atMs);
  return { practiceId: practice.id, segments, cues, totalMs: at, endsInDark };
}

/** Where the practice is at one moment. */
export type Moment = {
  segment: Segment;
  breath: BreathState;
  /** Rounds since the practice began, counting from 0. */
  round: number;
  /** Changes exactly when the phase does. */
  key: string;
  done: boolean;
};

/** The segment holding a moment: the last one that has begun. */
function segmentAt(timeline: Timeline, elapsedMs: number): Segment | undefined {
  let found = timeline.segments[0];
  for (const segment of timeline.segments) if (segment.startMs <= elapsedMs) found = segment;
  return found;
}

export function momentAt(timeline: Timeline, elapsedMs: number): Moment | null {
  const segment = segmentAt(timeline, elapsedMs);
  if (!segment) return null;
  const done = elapsedMs >= timeline.totalMs;
  const breath = breathAt(segment.breath, elapsedMs - segment.startMs, segment.rounds);
  const round = segment.roundsBefore + breath.round;
  return {
    segment,
    breath,
    round,
    key: `${segment.index}:${breath.round}:${breath.index}`,
    done,
  };
}

/**
 * One more minute of the breath a practice ended on, in whole rounds, closing with its bell. It opens
 * with none: it carries on from the practice before it.
 */
export function oneMoreMinute(timeline: Timeline): Timeline {
  const last = timeline.segments.at(-1);
  if (!last) return timeline;
  const rounds = roundsFor(last.breath, 60_000);
  const totalMs = rounds * last.breath.roundMs;
  const segment: Segment = {
    ...last,
    index: 0,
    rounds,
    startMs: 0,
    endMs: totalMs,
    roundsBefore: 0,
  };
  return {
    practiceId: timeline.practiceId,
    segments: [segment],
    cues: timeline.endsInDark ? [] : [{ kind: 'bell', atMs: totalMs, bell: 'close' }],
    totalMs,
    endsInDark: timeline.endsInDark,
  };
}
