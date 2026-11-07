import manifest from '../../../../assets/breathe/voice/manifest.json';
import type { Practice } from '../types';

import { ARRIVE, IMAGERY_LINES, PRACTICES } from './practices';
import { breathParts, HEART_PACE, OTHER_LENGTHS, schedule, type Rounding } from './timing';

// Where each line falls, by the timing in timing.ts, checked at every length a person may choose,
// at Heart's slowest, default and fastest pace, and with whole breaths rounded to the nearest or
// down, in case the engine does either. The rules are the brief's:
//
// - In breathing, the voice speaks at most once a minute and never over an in breath.
// - In guided imagery (Arrive, One thing, Ready) it speaks every 15 to 20 seconds while it guides,
//   then is quiet.
//
// A line's length is its recorded audio, from the manifest the voice script writes.

const AUDIO: Record<string, { seconds: number }> = manifest.lines;
/** The quiet the voice script keeps at each end of every file. */
const EDGE = manifest.settings.edgeSeconds;
const EPSILON = 1e-9;

const PACES = [HEART_PACE.slowest, HEART_PACE.default, HEART_PACE.fastest];
const ROUNDINGS: Rounding[] = ['nearest', 'down'];

/** The ten practices may run at 3, 5, 10 or 20 minutes; Arrive keeps its own length, or longer. */
function lengths(practice: Practice): number[] {
  const others = practice.id === 'arrive' ? [5, 10, 20] : OTHER_LENGTHS;
  return [...new Set([practice.minutes, ...others])].sort((a, b) => a - b);
}

function seconds(line: string): number {
  const audio = AUDIO[line];
  if (!audio)
    throw new Error(`${line} has no recorded audio. Run scripts/generate-breath-voice.mjs.`);
  return audio.seconds;
}

/** Everything wrong with where the lines fall in one run of a practice. Empty when all is well. */
function problems(practice: Practice, minutes: number, pace: number, rounding: Rounding): string[] {
  const run = `${practice.id} at ${minutes} min, ${pace} a minute, rounding ${rounding}`;
  const found: string[] = [];
  const { spoken, seconds: total } = schedule(practice, { minutes, pace, rounding });
  spoken.forEach((now, index) => {
    const imagery = IMAGERY_LINES.has(now.line);
    const end = now.at + seconds(now.line);
    if (!imagery && seconds(now.line) - EDGE > now.room + EPSILON) {
      found.push(`${run}: ${now.line} runs over the next in breath`);
    }
    if (end > total - 10) found.push(`${run}: ${now.line} ends too close to the end`);
    const next = spoken[index + 1];
    if (!next) return;
    const gap = next.at - now.at;
    if (end > next.at) found.push(`${run}: ${now.line} is still speaking when ${next.line} starts`);
    if (imagery && IMAGERY_LINES.has(next.line)) {
      if (gap < 15 - EPSILON || gap > 20 + EPSILON) {
        found.push(`${run}: ${now.line} to ${next.line} is ${gap.toFixed(1)} s, not 15 to 20`);
      }
    } else if (gap < 60 - EPSILON) {
      found.push(`${run}: ${now.line} to ${next.line} is ${gap.toFixed(1)} s, under a minute`);
    }
  });
  return found;
}

describe('where the lines fall', () => {
  it.each([...PRACTICES, ARRIVE].map((practice): [string, Practice] => [practice.name, practice]))(
    '%s keeps to the spacing rules at every length and pace',
    (_, practice) => {
      const found = lengths(practice).flatMap((minutes) =>
        PACES.flatMap((pace) =>
          ROUNDINGS.flatMap((rounding) => problems(practice, minutes, pace, rounding)),
        ),
      );
      expect(found).toEqual([]);
    },
  );

  it.each([...PRACTICES, ARRIVE].map((practice): [string, Practice] => [practice.name, practice]))(
    '%s runs within a breath or so of the length chosen',
    (_, practice) => {
      for (const minutes of lengths(practice)) {
        for (const pace of PACES) {
          const { seconds: total } = schedule(practice, { minutes, pace });
          expect(Math.abs(total - minutes * 60)).toBeLessThanOrEqual(15);
        }
      }
    },
  );

  it('leaves the guide quiet for at least half a minute after its last imagery line', () => {
    for (const practice of [...PRACTICES, ARRIVE]) {
      const { spoken, seconds: total } = schedule(practice);
      const guided = spoken.filter((line) => IMAGERY_LINES.has(line.line));
      const last = guided.at(-1);
      if (!last) continue;
      expect(total - (last.at + seconds(last.line))).toBeGreaterThanOrEqual(30);
      expect(spoken.at(-1)).toBe(last);
    }
  });

  it('speaks the first line on the first out breath, so no one starts in silence', () => {
    for (const practice of [...PRACTICES, ARRIVE]) {
      const [first] = schedule(practice).spoken;
      const firstBreath = practice.steps.find((step) => step.kind === 'breath');
      if (!first || !firstBreath || firstBreath.kind !== 'breath') throw new Error(practice.id);
      expect(first.at).toBeCloseTo(breathParts(firstBreath.pattern).inSeconds);
    }
  });
});
