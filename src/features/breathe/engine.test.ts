import {
  breathAt,
  easeBreath,
  fixedPattern,
  pacedPattern,
  practiceMs,
  roundsFor,
  type BreathPattern,
} from './engine';

// Patterns written here as any content might write them: the engine knows none of them by name.
const doubleInhale = fixedPattern([
  { action: 'inhale', ms: 2500, to: 0.8 },
  { action: 'inhale', ms: 1000, cue: 'again' },
  { action: 'exhale', ms: 6000 },
]);
const fourSevenEight = fixedPattern([
  { action: 'inhale', ms: 4000 },
  { action: 'hold', ms: 7000 },
  { action: 'exhale', ms: 8000 },
]);
const box = fixedPattern([
  { action: 'inhale', ms: 4000 },
  { action: 'hold', ms: 4000 },
  { action: 'exhale', ms: 4000 },
  { action: 'hold', ms: 4000 },
]);

const phaseAt = (pattern: BreathPattern, ms: number, rounds?: number) =>
  breathAt(pattern, ms, rounds);

describe('fixed patterns', () => {
  it('lays a round out phase by phase', () => {
    expect(doubleInhale.roundMs).toBe(9500);
    expect(doubleInhale.starts).toEqual([0, 2500, 3500]);
    expect(doubleInhale.levels).toEqual([0, 0.8, 1, 0]);
  });

  it('breathes a double inhale: in, in again from where the first stopped, then a long out', () => {
    const first = phaseAt(doubleInhale, 1000);
    expect(first).toMatchObject({ index: 0, from: 0, to: 0.8, round: 0 });
    expect(first.phase.action).toBe('inhale');

    const again = phaseAt(doubleInhale, 3000);
    expect(again).toMatchObject({ index: 1, from: 0.8, to: 1, startMs: 2500, endMs: 3500 });
    expect(again.phase.cue).toBe('again');
    expect(again.progress).toBeCloseTo(0.5);

    const out = phaseAt(doubleInhale, 6500);
    expect(out).toMatchObject({ index: 2, from: 1, to: 0, startMs: 3500, endMs: 9500 });
    expect(out.progress).toBeCloseTo(0.5);
    expect(out.level).toBeCloseTo(0.5);
  });

  it('holds 4-7-8: full through the seven, then eight seconds out', () => {
    expect(fourSevenEight.roundMs).toBe(19_000);
    const hold = phaseAt(fourSevenEight, 4000 + 3500);
    expect(hold.phase.action).toBe('hold');
    expect(hold).toMatchObject({
      index: 1,
      from: 1,
      to: 1,
      level: 1,
      startMs: 4000,
      endMs: 11_000,
    });
    const out = phaseAt(fourSevenEight, 11_000);
    expect(out).toMatchObject({ index: 2, from: 1, to: 0, startMs: 11_000, endMs: 19_000 });
    expect(out.level).toBeCloseTo(1);
  });

  it('keeps a box’s second hold empty, and starts the next round from empty', () => {
    const emptyHold = phaseAt(box, 13_000);
    expect(emptyHold).toMatchObject({ index: 3, from: 0, to: 0, level: 0 });
    const next = phaseAt(box, 16_000);
    expect(next).toMatchObject({
      round: 1,
      index: 0,
      from: 0,
      to: 1,
      startMs: 16_000,
      progress: 0,
    });
  });

  it('turns a phase at its exact boundary', () => {
    expect(phaseAt(box, 3999).index).toBe(0);
    expect(phaseAt(box, 4000).index).toBe(1);
    expect(phaseAt(box, 4000).progress).toBe(0);
  });

  it('counts rounds forever without a limit, and treats a moment before the start as the start', () => {
    expect(phaseAt(box, 16_000 * 40 + 1).round).toBe(40);
    expect(phaseAt(box, -500)).toMatchObject({ round: 0, index: 0, progress: 0, level: 0 });
  });

  it('ends after its rounds at the very end of the last phase, marked done', () => {
    const rounds = 3;
    const total = practiceMs(fourSevenEight, rounds);
    expect(phaseAt(fourSevenEight, total - 1, rounds).done).toBe(false);
    const after = phaseAt(fourSevenEight, total + 5000, rounds);
    expect(after).toMatchObject({ done: true, round: 2, index: 2, progress: 1, level: 0 });
  });

  it('refuses patterns that cannot be breathed', () => {
    expect(() => fixedPattern([])).toThrow();
    expect(() => fixedPattern([{ action: 'inhale', ms: 0 }])).toThrow();
    expect(() => fixedPattern([{ action: 'hold', ms: 1000, to: 1 }])).toThrow();
    expect(() => fixedPattern([{ action: 'inhale', ms: 1000, to: 1.5 }])).toThrow();
  });
});

describe('paced patterns', () => {
  it('turns breaths a minute and a ratio into one breath in and one out', () => {
    const heart = pacedPattern({ breathsPerMinute: 5.5, inhale: 40, exhale: 60 });
    expect(heart.roundMs).toBe(10_909);
    expect(heart.phases.map((phase) => [phase.action, phase.ms])).toEqual([
      ['inhale', 4364],
      ['exhale', 6545],
    ]);
  });

  it('makes six a minute at 1:1 five seconds each way', () => {
    const even = pacedPattern({ breathsPerMinute: 6, inhale: 1, exhale: 1 });
    expect(even.phases.map((phase) => phase.ms)).toEqual([5000, 5000]);
  });

  it.each([4.5, 5, 5.5, 6, 6.5])('makes %s breaths a minute last 60 / pace seconds', (pace) => {
    const pattern = pacedPattern({ breathsPerMinute: pace, inhale: 40, exhale: 60 });
    expect(pattern.roundMs).toBe(Math.round(60_000 / pace));
    expect(roundsFor(pattern, 60_000)).toBe(Math.round(60_000 / pattern.roundMs));
  });

  it('refuses a pace or a ratio that is not positive', () => {
    expect(() => pacedPattern({ breathsPerMinute: 0, inhale: 1, exhale: 1 })).toThrow();
    expect(() => pacedPattern({ breathsPerMinute: 6, inhale: 0, exhale: 1 })).toThrow();
  });
});

describe('time and rounds', () => {
  it('takes the whole rounds closest to a length, never fewer than one', () => {
    expect(roundsFor(doubleInhale, 60_000)).toBe(6);
    expect(roundsFor(fourSevenEight, 76_000)).toBe(4);
    expect(roundsFor(box, 1000)).toBe(1);
  });

  it('eases a breath slowly at both ends', () => {
    expect(easeBreath(0)).toBe(0);
    expect(easeBreath(1)).toBe(1);
    expect(easeBreath(0.5)).toBeCloseTo(0.5);
    expect(easeBreath(0.1)).toBeLessThan(0.1);
    expect(easeBreath(0.9)).toBeGreaterThan(0.9);
  });
});
