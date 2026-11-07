import type { Practice, Step } from '../types';

import { ARRIVE, HOLD_CAUTION, IMAGERY_LINES, PRACTICES, SYNTHETIC_VOICE_NOTE } from './practices';
import { breathParts, totalSeconds } from './timing';

// The library against docs/PRODUCT_V1.md ("1. Breathe" and section 3) and the copy rules in
// docs/DESIGN_QUALITY.md. Where a rule is the brief's own words, the test says so.

const ALL: Practice[] = [...PRACTICES, ARRIVE];
const EACH = ALL.map((practice): [string, Practice] => [practice.name, practice]);
const voices = (practice: Practice) =>
  practice.steps.filter((step): step is Extract<Step, { kind: 'voice' }> => step.kind === 'voice');
const breathSteps = (practice: Practice) =>
  practice.steps.filter(
    (step): step is Extract<Step, { kind: 'breath' }> => step.kind === 'breath',
  );

// The library table, in order: feeling, practice, default minutes, and free or Plus.
const TABLE: [string, string, number, Practice['free']][] = [
  ['Anxious', 'Settle', 3, true],
  ['Panicky', 'Ground', 3, true],
  ['Hurting', 'Soothe', 4, true],
  ['Wanting to feel grateful', 'Heart', 5, { minutes: [3, 5] }],
  ['Angry', 'Cool', 3, false],
  ['Overwhelmed', 'One thing', 4, false],
  ['Can’t sleep', 'Sleep', 10, false],
  ['Low or flat', 'Lift', 3, false],
  ['Before something hard', 'Ready', 4, false],
  ['A craving or an urge', 'Ride the wave', 3, false],
];

// docs/DESIGN_QUALITY.md: filler words, words about AI, and cute interjections.
const BANNED = [
  'revolutionize',
  'supercharge',
  'cutting edge',
  'effortless',
  'seamless',
  'unlock',
  'elevate',
  'empower',
  'journey',
  'holistic',
  'game changer',
  'transformative',
  'dive into',
  'next level',
  'harness',
  'world class',
  'ai powered',
  'magic',
  'insight',
  'smart',
  'wow',
  'yay',
  'awesome',
];

// Hyphens belong to these names and nowhere else, and only in a source's credit.
const NAMES_WITH_HYPHENS = ['Psycho-Cybernetics', '4-7-8', 'self-compassion'];
const DASHES = /[-‐‑‒–—―]/;

/** What a copy check finds wrong with one piece of copy. Empty when it passes. */
function copyProblems(text: string): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();
  for (const word of BANNED) {
    if (new RegExp(`\\b${word}`).test(lower)) problems.push(`uses "${word}"`);
  }
  if (text.includes('!')) problems.push('has an exclamation mark');
  if (DASHES.test(text)) problems.push('has a dash or hyphen');
  if (text !== text.trim() || /\s{2,}/.test(text)) problems.push('has stray spaces');
  if (!/[.?]$/.test(text)) problems.push('does not end a sentence');
  return problems;
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const sentences = (text: string) => text.split(/(?<=[.?])\s+/).filter(Boolean).length;

describe('the library', () => {
  it('has the ten practices of the table, in order, with their feelings, names, lengths and free flags', () => {
    expect(
      PRACTICES.map((practice) => [
        practice.feeling,
        practice.name,
        practice.minutes,
        practice.free,
      ]),
    ).toEqual(TABLE);
  });

  it('gives Arrive two minutes of Heart and then the theater of the mind, free', () => {
    expect(ARRIVE.name).toBe('Arrive');
    expect(ARRIVE.free).toBe(true);
    const [first] = breathSteps(ARRIVE);
    expect(first).toMatchObject({ pattern: { kind: 'heart' }, seconds: 120 });
    expect(ARRIVE.source).toMatch(/Maxwell Maltz, Psycho-Cybernetics \(the theater of the mind\)/);
    expect(ARRIVE.source).toMatch(/Joe Dispenza \(mental rehearsal\)/);
  });

  it('gives every practice a unique id', () => {
    expect(new Set(ALL.map((practice) => practice.id)).size).toBe(ALL.length);
  });

  it.each(EACH)('%s: its steps add up exactly to its length', (_, practice) => {
    expect(totalSeconds(practice)).toBe(practice.minutes * 60);
  });

  it.each(EACH)(
    '%s: has one stretch breath step, whose breath divides a minute so any length stays whole',
    (_, practice) => {
      const stretches = breathSteps(practice).filter((step) => step.stretch);
      expect(stretches).toHaveLength(1);
      const [stretch] = stretches;
      if (stretch && stretch.pattern.kind !== 'heart') {
        const { inSeconds, outSeconds } = breathParts(stretch.pattern);
        expect(60 % (inSeconds + outSeconds)).toBe(0);
      }
    },
  );

  it.each(EACH)('%s: every breath step with a fixed rhythm is whole breaths', (_, practice) => {
    for (const step of breathSteps(practice)) {
      if (step.pattern.kind === 'heart') continue;
      const { inSeconds, outSeconds } = breathParts(step.pattern);
      expect(Number.isInteger(step.seconds / (inSeconds + outSeconds))).toBe(true);
    }
  });

  it.each(EACH)(
    '%s: says why it helps in one or two sentences, and credits its source',
    (_, practice) => {
      expect(sentences(practice.why)).toBeGreaterThanOrEqual(1);
      expect(sentences(practice.why)).toBeLessThanOrEqual(2);
      expect(practice.source.length).toBeGreaterThan(0);
      expect(sentences(practice.line)).toBe(1);
    },
  );

  it('credits each source as the table does', () => {
    const sources = Object.fromEntries(ALL.map((practice) => [practice.id, practice.source]));
    expect(sources).toEqual({
      settle: 'Balban and others, Stanford, 2023 (cyclic sighing); Dan Siegel (name it to tame it)',
      ground: 'Peter Levine and Deb Dana (orienting)',
      soothe: 'Kristin Neff (the self-compassion break)',
      heart: 'HeartMath Institute (Quick Coherence); Joe Dispenza (elevated emotion)',
      cool: 'Maxwell Maltz, Psycho-Cybernetics (the delayed reaction); humming breath from yoga (bhramari)',
      'one-thing':
        'Mark Divine (box breathing); Maxwell Maltz, Psycho-Cybernetics (the quiet room)',
      sleep: 'Andrew Weil (4-7-8)',
      lift: 'Stephen Porges and Deb Dana (moving gently out of shutdown; glimmers)',
      // The table credits Maltz only; Ready's first two minutes are Divine's box breathing too.
      ready: 'Maxwell Maltz, Psycho-Cybernetics (the winning feeling); Mark Divine (box breathing)',
      'ride-the-wave': 'G. Alan Marlatt (urge surfing)',
      // The brief credits Maltz and Dispenza; Arrive's first two minutes are Heart, from HeartMath.
      arrive:
        'Maxwell Maltz, Psycho-Cybernetics (the theater of the mind); Joe Dispenza (mental rehearsal); HeartMath Institute (Quick Coherence)',
    });
  });

  it('never claims to treat anything', () => {
    const said = ALL.flatMap((practice) => [
      practice.line,
      practice.why,
      ...voices(practice).map((step) => step.text),
    ]).join(' ');
    expect(said).not.toMatch(
      /\b(treat|treats|treatment|cure|cures|heal|heals|therapy|disorder|diagnos)/i,
    );
    expect(said).not.toMatch(/\bfor (anxiety|panic|depression|insomnia|addiction)\b/i);
  });

  it('keeps help for panic, anxiety and hurt free', () => {
    for (const id of ['settle', 'ground', 'soothe']) {
      expect(PRACTICES.find((practice) => practice.id === id)?.free).toBe(true);
    }
  });

  it('offers the support panel after Ground, Soothe and Lift, and only there', () => {
    const offered = ALL.filter((practice) => practice.afterUnsettled === 'support').map(
      (practice) => practice.id,
    );
    // Lift added by the lead: someone low who is still unsettled after it should see where help is.
    expect(offered).toEqual(['ground', 'soothe', 'lift']);
  });
});

describe('the copy', () => {
  const copy = ALL.flatMap((practice) => [
    [`${practice.id} name`, practice.name],
    [`${practice.id} feeling`, practice.feeling],
    [`${practice.id} line`, practice.line],
    [`${practice.id} why`, practice.why],
    ...voices(practice).map((step) => [step.line, step.text]),
  ]);

  it.each(copy.filter(([label]) => !label?.endsWith(' name') && !label?.endsWith(' feeling')))(
    '%s passes the copy check',
    (_, text) => {
      expect(copyProblems(text ?? '')).toEqual([]);
    },
  );

  it.each(copy.filter(([label]) => label?.endsWith(' name') || label?.endsWith(' feeling')))(
    '%s has no banned word, exclamation mark or dash',
    (_, text) => {
      expect(copyProblems(`${text}.`)).toEqual([]);
    },
  );

  it('keeps hyphens in a source to the names that carry them', () => {
    for (const practice of ALL) {
      let rest = practice.source;
      for (const name of NAMES_WITH_HYPHENS) rest = rest.split(name).join('');
      expect(rest).not.toMatch(DASHES);
      expect(practice.source).not.toContain('!');
    }
  });

  it('says plainly that the voice is AI generated, not a person, and made with OpenAI', () => {
    expect(SYNTHETIC_VOICE_NOTE).toMatch(/AI generated/);
    expect(SYNTHETIC_VOICE_NOTE).toMatch(/OpenAI/);
    expect(SYNTHETIC_VOICE_NOTE).toMatch(/not a real person/);
    expect(copyProblems(SYNTHETIC_VOICE_NOTE)).toEqual([]);
  });
});

describe('the lines', () => {
  const lines = ALL.flatMap(voices);

  it('gives every line an id of the form practice.word, used for one text only', () => {
    const texts = new Map<string, string>();
    for (const practice of ALL) {
      for (const step of voices(practice)) {
        expect(step.line.startsWith(`${practice.id}.`)).toBe(true);
        expect(step.line).toMatch(/^[a-z]+(-[a-z]+)*\.[a-z]+$/);
        expect(texts.get(step.line) ?? step.text).toBe(step.text);
        texts.set(step.line, step.text);
      }
    }
    expect(texts.size).toBe(lines.length);
  });

  it.each(lines.map((step): [string, string] => [step.line, step.text]))(
    '%s is short enough: 14 words for breathing, 22 for imagery',
    (line, text) => {
      expect(words(text)).toBeLessThanOrEqual(IMAGERY_LINES.has(line) ? 22 : 14);
    },
  );

  it('guides imagery only in Arrive, One thing and Ready', () => {
    const owners = new Set([...IMAGERY_LINES].map((line) => line.split('.')[0]));
    expect([...owners].sort()).toEqual(['arrive', 'one-thing', 'ready']);
    const known = new Set(lines.map((step) => step.line));
    for (const line of IMAGERY_LINES) expect(known.has(line)).toBe(true);
  });

  it('asks nothing demanding of someone panicking or hurting', () => {
    for (const id of ['ground', 'soothe']) {
      const practice = PRACTICES.find((candidate) => candidate.id === id);
      for (const step of practice ? voices(practice) : []) {
        expect(step.text).not.toMatch(
          /\b(must|should|need to|have to|try harder|relax|calm down|deeper|harder|stop)\b/i,
        );
      }
    }
  });
});

describe('the breath', () => {
  const byId = (id: string) => {
    const practice = ALL.find((candidate) => candidate.id === id);
    if (!practice) throw new Error(`No practice ${id}`);
    return practice;
  };

  it('never holds the breath in Ground, and keeps its in breaths small', () => {
    for (const step of breathSteps(byId('ground'))) {
      expect(step.pattern.kind).toBe('paced');
      if (step.pattern.kind !== 'paced') continue;
      expect(step.pattern.holdIn ?? 0).toBe(0);
      expect(step.pattern.holdOut ?? 0).toBe(0);
      expect(step.pattern.inhale).toBeLessThanOrEqual(3);
      expect(step.pattern.exhale).toBeGreaterThan(step.pattern.inhale);
    }
  });

  it('never holds the breath in Soothe, and breathes out for longer than in', () => {
    for (const step of breathSteps(byId('soothe'))) {
      if (step.pattern.kind !== 'paced') throw new Error('Soothe is paced');
      expect(step.pattern.holdIn ?? 0).toBe(0);
      expect(step.pattern.holdOut ?? 0).toBe(0);
      expect(step.pattern.exhale).toBeGreaterThan(step.pattern.inhale);
    }
  });

  it('sighs in Settle: two breaths in, one long breath out', () => {
    for (const step of breathSteps(byId('settle'))) {
      expect(step.pattern.kind).toBe('sigh');
      if (step.pattern.kind === 'sigh') {
        expect(step.pattern.exhale).toBeGreaterThan(step.pattern.inhale + step.pattern.topUp);
      }
    }
  });

  it('breathes at the person’s own pace in Heart', () => {
    expect(breathSteps(byId('heart')).every((step) => step.pattern.kind === 'heart')).toBe(true);
  });

  it('hums every out breath in Cool', () => {
    for (const step of breathSteps(byId('cool'))) {
      expect(step.pattern).toMatchObject({ kind: 'paced', hum: true });
    }
  });

  it('counts four each way in the box breathing of One thing and Ready, for about two minutes in Ready', () => {
    const box = { kind: 'paced', inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 };
    expect(breathSteps(byId('one-thing'))[0]?.pattern).toEqual(box);
    const [first] = breathSteps(byId('ready'));
    expect(first?.pattern).toEqual(box);
    expect(first?.seconds).toBeGreaterThanOrEqual(105);
    expect(first?.seconds).toBeLessThanOrEqual(135);
  });

  it('gives Sleep four rounds of in 4, hold 7, out 8, then a fade to black, and no bell to wake anyone', () => {
    const sleep = byId('sleep');
    expect(breathSteps(sleep)[0]).toEqual({
      kind: 'breath',
      pattern: { kind: 'paced', inhale: 4, holdIn: 7, exhale: 8 },
      seconds: 76,
    });
    expect(sleep.steps.some((step) => step.kind === 'fade')).toBe(true);
    expect(sleep.steps.at(-1)?.kind).toBe('breath');
    // No more than Weil's four breaths with the hold.
    const held = breathSteps(sleep).filter(
      (step) => step.pattern.kind === 'paced' && (step.pattern.holdIn ?? 0) > 0,
    );
    expect(held).toHaveLength(1);
  });

  it('opens every practice with a bell, and closes every one but Sleep with one', () => {
    for (const practice of ALL) {
      expect(practice.steps[0]?.kind).toBe('bell');
      if (practice.id !== 'sleep') expect(practice.steps.at(-1)?.kind).toBe('bell');
    }
  });
});

describe('safety before a practice', () => {
  const holds = (practice: Practice) =>
    practice.steps.some(
      (step) =>
        step.kind === 'breath' &&
        step.pattern.kind === 'paced' &&
        ((step.pattern.holdIn ?? 0) > 0 || (step.pattern.holdOut ?? 0) > 0),
    );

  it('warns before every practice that holds the breath, and before no other', () => {
    for (const practice of [...PRACTICES, ARRIVE]) {
      expect([practice.id, practice.caution]).toEqual([
        practice.id,
        holds(practice) ? HOLD_CAUTION : undefined,
      ]);
    }
  });
});
