import { breatheCopy, wordFor } from './breatheCopy';
import { ARRIVE, PRACTICES } from './library/practices';
import { loopFor, loopName } from './sounds';
import { breathOf, compile, momentAt, oneMoreMinute } from './timeline';
import type { Practice } from './types';

const practice = (patch: Partial<Practice>): Practice => ({
  id: 'test',
  feeling: 'Testing',
  name: 'Test',
  line: 'A made-up practice.',
  why: 'For the tests.',
  source: 'Nobody',
  minutes: 3,
  free: true,
  steps: [],
  ...patch,
});
const sigh = { kind: 'sigh', inhale: 2.5, topUp: 1, exhale: 6 } as const;
const longOut = { kind: 'paced', inhale: 4, exhale: 6 } as const;

describe('patterns from the library', () => {
  it('reads a sigh as two breaths in, the second topping up, and one long out', () => {
    const breath = breathOf(sigh);
    expect(breath.phases.map((phase) => [phase.action, phase.ms, phase.cue])).toEqual([
      ['inhale', 2500, undefined],
      ['inhale', 1000, 'again'],
      ['exhale', 6000, undefined],
    ]);
  });

  it('reads paced holds, and a hum on the breath out', () => {
    const breath = breathOf({ kind: 'paced', inhale: 4, holdIn: 7, exhale: 8, hum: true });
    expect(breath.phases.map((phase) => phase.action)).toEqual(['inhale', 'hold', 'exhale']);
    expect(breath.phases[2]?.cue).toBe('hum');
  });

  it('breathes Heart at the person’s pace, 40 percent in and 60 out', () => {
    expect(breathOf({ kind: 'heart' }).roundMs).toBe(10_909);
    expect(breathOf({ kind: 'heart' }, 6).phases.map((phase) => phase.ms)).toEqual([4000, 6000]);
  });

  it('has a sound for every pattern in the library, and for every pace of Heart', () => {
    const patterns = [...PRACTICES, ARRIVE].flatMap((item) =>
      item.steps.flatMap((step) => (step.kind === 'breath' ? [step.pattern] : [])),
    );
    for (const pattern of patterns) expect(loopFor(pattern, 5.5)).not.toBeNull();
    for (const pace of [4.5, 5, 5.5, 6, 6.5]) {
      expect(loopName({ kind: 'heart' }, pace)).toBe(`heart-${pace * 10}`);
      expect(loopFor({ kind: 'heart' }, pace)).not.toBeNull();
    }
    expect(loopFor({ kind: 'paced', inhale: 3, exhale: 9 }, 5.5)).toBeNull();
  });
});

describe('a practice in time', () => {
  it('opens and closes with a bell, and says a line at the start of the next breath out', () => {
    const timeline = compile(
      practice({
        steps: [
          { kind: 'breath', pattern: longOut, seconds: 60 },
          { kind: 'voice', line: 'look', text: 'Find three things.' },
          { kind: 'breath', pattern: longOut, seconds: 60 },
        ],
      }),
    );
    expect(timeline.totalMs).toBe(120_000);
    expect(timeline.cues).toEqual([
      { kind: 'bell', atMs: 0, bell: 'open' },
      // The next breath begins at 60 s, and its first breath out 4 s later.
      { kind: 'voice', atMs: 64_000, line: 'look', text: 'Find three things.' },
      { kind: 'bell', atMs: 120_000, bell: 'close' },
    ]);
  });

  it('rings a bell where it is written, and does not add one where the steps already ring', () => {
    const timeline = compile(
      practice({
        steps: [
          { kind: 'bell' },
          { kind: 'breath', pattern: longOut, seconds: 30 },
          { kind: 'bell' },
          { kind: 'breath', pattern: longOut, seconds: 30 },
          { kind: 'bell' },
        ],
      }),
    );
    expect(timeline.cues.map((cue) => cue.kind === 'bell' && [cue.bell, cue.atMs])).toEqual([
      ['open', 0],
      ['moment', 30_000],
      ['close', 60_000],
    ]);
  });

  it('goes dark on a fade, carries on breathing under it, and ends without a bell', () => {
    const timeline = compile(PRACTICES.find((item) => item.id === 'sleep') as Practice);
    const fade = timeline.cues.find((cue) => cue.kind === 'fade');
    expect(fade).toMatchObject({ atMs: 76_000, ms: 120_000 });
    expect(timeline.endsInDark).toBe(true);
    expect(timeline.cues.some((cue) => cue.kind === 'bell' && cue.bell === 'close')).toBe(false);
    // Four rounds of 4-7-8 first.
    expect(timeline.segments[0]?.rounds).toBe(4);
  });

  it('takes a longer chosen length up in its stretch steps, in whole rounds', () => {
    const steps = [
      { kind: 'breath', pattern: longOut, seconds: 120, stretch: true },
      { kind: 'breath', pattern: longOut, seconds: 60 },
    ] as const;
    const own = compile(practice({ steps: [...steps] }));
    const longer = compile(practice({ steps: [...steps] }), { minutes: 10 });
    expect(own.totalMs).toBe(180_000);
    expect(longer.totalMs).toBe(600_000);
    expect(longer.segments.map((segment) => segment.rounds)).toEqual([54, 6]);
  });

  it('gives a shorter length back from the stretch, keeping at least one round', () => {
    const shorter = compile(
      practice({
        minutes: 4,
        steps: [{ kind: 'breath', pattern: longOut, seconds: 240, stretch: true }],
      }),
      { minutes: 3 },
    );
    expect(shorter.totalMs).toBe(180_000);
  });

  it('stretches the last breath when no step is marked to', () => {
    const timeline = compile(
      practice({
        steps: [
          { kind: 'breath', pattern: sigh, seconds: 57 },
          { kind: 'breath', pattern: longOut, seconds: 120 },
        ],
      }),
      { minutes: 5 },
    );
    expect(timeline.segments[0]?.rounds).toBe(6);
    expect(timeline.segments[1]?.rounds).toBe(24);
  });

  it('knows where it is, across steps, counting rounds from the start', () => {
    const timeline = compile(
      practice({
        steps: [
          { kind: 'breath', pattern: sigh, seconds: 19 },
          { kind: 'breath', pattern: longOut, seconds: 20 },
        ],
      }),
    );
    const early = momentAt(timeline, 3000);
    expect(early?.segment.index).toBe(0);
    expect(early?.breath.phase.cue).toBe('again');
    const later = momentAt(timeline, 19_000 + 15_000);
    expect(later).toMatchObject({ round: 3, done: false });
    expect(later?.segment.index).toBe(1);
    expect(later?.breath.phase.action).toBe('exhale');
    expect(momentAt(timeline, 39_000)?.done).toBe(true);
  });

  it('gives one more minute of the last breath, closing with a bell and no opening one', () => {
    const timeline = compile(PRACTICES[1] as Practice);
    const more = oneMoreMinute(timeline);
    expect(more.totalMs).toBe(60_000);
    expect(more.cues).toEqual([{ kind: 'bell', atMs: 60_000, bell: 'close' }]);
  });
});

describe('the one word', () => {
  const [inhale, again, exhale] = breathOf(sigh).phases;
  const hold = breathOf({ kind: 'paced', inhale: 4, holdIn: 4, exhale: 4 }).phases[1];

  it('is said in full for two rounds, then short', () => {
    expect([inhale, again, hold, exhale].map((phase) => phase && wordFor(phase, 0))).toEqual([
      'Breathe in',
      'In again',
      'Hold',
      'Breathe out',
    ]);
    expect(inhale && wordFor(inhale, 1)).toBe(breatheCopy.words.full.inhale);
    expect([inhale, again, hold, exhale].map((phase) => phase && wordFor(phase, 2))).toEqual([
      'In',
      'Again',
      'Hold',
      'Out',
    ]);
  });
});
