import type { Pattern, Practice } from '../types';

/**
 * The timing the practices in this library are written for. The engine runs a practice; this models
 * how, so the library's own tests can check that every line lands where it should at every length
 * and pace. Where the engine differs, the content may need to change with it.
 *
 * - Steps run in order. Only breath steps take time. A bell rings when it is reached, a fade starts
 *   when it is reached and runs while the breath goes on, and a voice line starts at the start of the
 *   next out breath, with the breath going on underneath.
 * - A breath step runs whole breaths: its seconds divided by one breath, to the nearest whole breath
 *   (never fewer than one). At a practice's default length every fixed rhythm divides exactly, so the
 *   steps add up to the length to the second; only Heart's own pace can leave part of a breath over.
 * - At another length, the one stretch step grows or shrinks by the difference. Every stretch step
 *   with a fixed rhythm has a breath that divides a minute, so it stays whole at any length.
 */

/** Heart's pace in breaths a minute: where it starts, and the range a person may choose. */
export const HEART_PACE = { default: 5.5, slowest: 4.5, fastest: 6.5 } as const;

/** The lengths a person may choose besides the default (PRODUCT_V1, ECHO Plus). */
export const OTHER_LENGTHS = [3, 5, 10, 20] as const;

export type Rounding = 'nearest' | 'down';

/** One breath of a pattern: the in breath with any hold after it, and the out breath with any hold. */
export function breathParts(pattern: Pattern, pace: number = HEART_PACE.default) {
  switch (pattern.kind) {
    case 'sigh':
      return { inSeconds: pattern.inhale + pattern.topUp, outSeconds: pattern.exhale };
    case 'paced':
      return {
        inSeconds: pattern.inhale + (pattern.holdIn ?? 0),
        outSeconds: pattern.exhale + (pattern.holdOut ?? 0),
      };
    case 'heart': {
      const breath = 60 / pace;
      return { inSeconds: 0.4 * breath, outSeconds: 0.6 * breath };
    }
  }
}

export function breathSeconds(pattern: Pattern, pace: number = HEART_PACE.default): number {
  const { inSeconds, outSeconds } = breathParts(pattern, pace);
  return inSeconds + outSeconds;
}

/** The practice's length at its default, from its breath steps. */
export function totalSeconds(practice: Practice): number {
  return practice.steps.reduce((sum, step) => sum + (step.kind === 'breath' ? step.seconds : 0), 0);
}

export type Spoken = {
  line: string;
  /** Seconds from the start of the practice. */
  at: number;
  /** Seconds from the start of the line until the next in breath begins. */
  room: number;
};

/** When each line is spoken, and how much out breath it has, at a chosen length and pace. */
export function schedule(
  practice: Practice,
  {
    minutes = practice.minutes,
    pace = HEART_PACE.default,
    rounding = 'nearest' as Rounding,
  }: { minutes?: number; pace?: number; rounding?: Rounding } = {},
): { spoken: Spoken[]; seconds: number } {
  const extra = (minutes - practice.minutes) * 60;
  const spoken: Spoken[] = [];
  let pending: string[] = [];
  let clock = 0;
  for (const step of practice.steps) {
    if (step.kind === 'voice') {
      pending.push(step.line);
      continue;
    }
    if (step.kind !== 'breath') continue;
    const { inSeconds, outSeconds } = breathParts(step.pattern, pace);
    const breath = inSeconds + outSeconds;
    const seconds = step.seconds + (step.stretch ? extra : 0);
    const whole =
      rounding === 'nearest' ? Math.round(seconds / breath) : Math.floor(seconds / breath);
    const count = Math.max(1, whole);
    for (const line of pending) spoken.push({ line, at: clock + inSeconds, room: outSeconds });
    pending = [];
    clock += count * breath;
  }
  if (pending.length > 0) throw new Error(`${practice.id} ends with a line that has no breath.`);
  return { spoken, seconds: clock };
}
