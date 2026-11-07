import { afterArrive, arriveOffered } from './arrive';
import { isMorning, nextTurn } from './morning';
import { phraseMs, phrasesOf, PHRASE_MAX, rehearsalText, REHEARSE_LIMIT } from './phrases';
import {
  COMPLETE_PATH,
  heldRehearsal,
  releaseRehearsal,
  REHEARSE_PATH,
  routeAfterReflect,
} from './rehearsal';

const at = (hour: number, minute = 0) => new Date(2026, 10, 8, hour, minute);

describe('the morning window', () => {
  it('runs from 4:00 to 11:59, local time', () => {
    expect(isMorning(at(3, 59))).toBe(false);
    expect(isMorning(at(4, 0))).toBe(true);
    expect(isMorning(at(9, 41))).toBe(true);
    expect(isMorning(at(11, 59))).toBe(true);
    expect(isMorning(at(12, 0))).toBe(false);
    expect(isMorning(at(21, 30))).toBe(false);
    expect(isMorning(at(0, 30))).toBe(false);
  });

  it('knows when it next turns', () => {
    expect(nextTurn(at(2, 15))).toEqual(at(4));
    expect(nextTurn(at(7, 15))).toEqual(at(12));
    expect(nextTurn(at(23, 15))).toEqual(new Date(2026, 10, 9, 4, 0));
  });
});

describe('the words that come back', () => {
  it('keeps a short entry whole, with its spacing tidied', () => {
    expect(rehearsalText('  Calm,   honest.\n\nUnhurried.  ')).toBe('Calm, honest. Unhurried.');
  });

  it('keeps at most 240 characters, ending where a sentence ends', () => {
    const sentence = 'I will listen before I answer, and I will answer slowly.'; // 57
    const body = Array.from({ length: 6 }, () => sentence).join(' ');
    const kept = rehearsalText(body);
    expect(kept.length).toBeLessThanOrEqual(REHEARSE_LIMIT);
    expect(kept.endsWith('slowly.')).toBe(true);
    expect(kept).toBe(Array.from({ length: 4 }, () => sentence).join(' '));
  });

  it('cuts one long first sentence at a pause or a space, never inside a word', () => {
    const run = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const kept = rehearsalText(run);
    expect(kept.length).toBeLessThanOrEqual(REHEARSE_LIMIT);
    expect(run.startsWith(kept)).toBe(true);
    expect(run[kept.length]).toBe(' ');
  });

  it('splits into sentences, then clauses, and never more than two lines a phrase', () => {
    const phrases = phrasesOf(
      'I will be calm with my team today. When the meeting gets tense, I will listen first and answer slowly. I will leave by six.',
    );
    expect(phrases).toEqual([
      'I will be calm with my team today.',
      'When the meeting gets tense,',
      'I will listen first and answer slowly.',
      'I will leave by six.',
    ]);
    for (const phrase of phrases) expect(phrase.length).toBeLessThanOrEqual(PHRASE_MAX);
  });

  it('breaks a long clause into even runs of words', () => {
    const phrases = phrasesOf(
      'I am going to walk to the river after breakfast and sit there quietly for twenty minutes without my phone',
    );
    expect(phrases.length).toBeGreaterThan(1);
    for (const phrase of phrases) expect(phrase.length).toBeLessThanOrEqual(PHRASE_MAX);
    expect(phrases.join(' ')).toBe(
      'I am going to walk to the river after breakfast and sit there quietly for twenty minutes without my phone',
    );
  });

  it('joins a fragment too short to stand alone to its neighbour', () => {
    expect(phrasesOf('Calm. Honest. Unhurried.')).toEqual(['Calm. Honest. Unhurried.']);
  });

  it('has nothing to say for an entry without words', () => {
    expect(phrasesOf('')).toEqual([]);
    expect(phrasesOf('   ')).toEqual([]);
  });

  it('gives each phrase time to be taken in slowly, longer for longer ones', () => {
    expect(phraseMs('Calm.')).toBe(2600);
    expect(phraseMs('I will listen first and answer slowly.')).toBeGreaterThan(phraseMs('Calm.'));
    expect(phraseMs('x'.repeat(200))).toBe(5200);
  });
});

describe('after Reflect', () => {
  afterEach(releaseRehearsal);

  it('sends a morning entry to Rehearse, with its words held in memory only', () => {
    const words = 'A made-up intention for the test.';
    expect(routeAfterReflect({ promptId: 'become', body: words })).toBe(REHEARSE_PATH);
    expect(heldRehearsal()).toBe(words);
    releaseRehearsal();
    expect(heldRehearsal()).toBeNull();
  });

  it('sends any other entry straight to Completion, holding nothing', () => {
    expect(routeAfterReflect({ promptId: 'daily', body: 'Evening words.' })).toBe(COMPLETE_PATH);
    expect(routeAfterReflect({ promptId: undefined, body: 'Older words.' })).toBe(COMPLETE_PATH);
    expect(heldRehearsal()).toBeNull();
  });
});

describe('Arrive', () => {
  it('stops being offered after three mornings skipped in a row', () => {
    let state = { arriveSkips: 0, arriveSkipDay: null as string | null };
    state = afterArrive(state, false, '2026-11-08');
    state = afterArrive(state, false, '2026-11-09');
    expect(arriveOffered(state)).toBe(true);
    state = afterArrive(state, false, '2026-11-10');
    expect(state.arriveSkips).toBe(3);
    expect(arriveOffered(state)).toBe(false);
  });

  it('counts a morning once, however often it is skipped that morning', () => {
    let state = { arriveSkips: 0, arriveSkipDay: null as string | null };
    state = afterArrive(state, false, '2026-11-08');
    state = afterArrive(state, false, '2026-11-08');
    expect(state).toEqual({ arriveSkips: 1, arriveSkipDay: '2026-11-08' });
  });

  it('starts the count again on a morning it runs to the end', () => {
    let state = { arriveSkips: 2, arriveSkipDay: '2026-11-09' as string | null };
    state = afterArrive(state, true, '2026-11-10');
    expect(state).toEqual({ arriveSkips: 0, arriveSkipDay: null });
  });
});
