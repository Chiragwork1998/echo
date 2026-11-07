import type { BreathPhase } from './engine';

/**
 * WORKING COPY for Breathe, from docs/PRODUCT_V1.md where the brief gives the words, and the lead's
 * to approve where it does not. The practices' own words live in ./library, which the content agent
 * owns.
 */
export const breatheCopy = {
  title: 'What are you feeling?',
  back: 'Back',
  minutes: (minutes: number) => `${minutes} min`,
  /** Marks a practice or length that needs ECHO Plus, for someone without it. */
  plus: 'Plus',
  whyTitle: 'Why this helps',
  source: (source: string) => `From ${source}`,
  length: 'Length',
  pace: 'Your pace',
  paceHint: 'The pace that feels easy, never forced.',
  paceValue: (pace: number) => `${pace} breaths a minute`,
  voice: 'Voice',
  sound: 'Sound',
  /** With the voice off, its lines are read before the practice instead. */
  linesTitle: 'What the voice would say',
  begin: 'Begin',
  safety: 'If you feel dizzy or unwell, stop and breathe normally.',
  end: 'End',
  check: {
    title: 'How do you feel now?',
    choices: { calmer: 'Calmer', same: 'About the same', unsettled: 'Still unsettled' },
    skip: 'Skip',
  },
  actions: { echo: 'Begin your echo', more: 'One more minute', done: 'Done' },
  /** Home's way in, beside Write instead. */
  breatheFirst: 'Breathe first',
  /** On a pattern card whose practice is about breath. */
  cardLink: 'Breathe',
  words: {
    full: { inhale: 'Breathe in', again: 'In again', hold: 'Hold', exhale: 'Breathe out' },
    short: { inhale: 'In', again: 'Again', hold: 'Hold', exhale: 'Out' },
  },
} as const;

/** Rounds that get the full words before they shorten. */
export const FULL_WORD_ROUNDS = 2;

/** The one word on the screen for a phase, full for the first rounds and then short. */
export function wordFor(phase: BreathPhase, round: number): string {
  const words = round < FULL_WORD_ROUNDS ? breatheCopy.words.full : breatheCopy.words.short;
  if (phase.action === 'inhale') return phase.cue === 'again' ? words.again : words.inhale;
  return phase.action === 'hold' ? words.hold : words.exhale;
}
