import { qa } from '@/testing/qa';

import type { SavedReading } from './readingStore';

/**
 * Two invented cards for the web visual harness only (`?cards=1`, or `?cards=fresh` to see them
 * arrive face down). The words are made up for the harness, never anyone's journal. Outside the
 * harness this is never read.
 */
export const QA_READING: SavedReading = {
  readAt: new Date(2026, 10, 7, 21, 30).getTime(),
  entriesRead: 6,
  cards: [
    {
      name: 'Saying yes too quickly',
      noticed:
        'It seems a quick yes keeps returning, followed by resentment about the week or feeling tired. You also keep writing about a pause before answering, whether a short moment or an hour.',
      evidence: [
        { quote: 'I say yes too fast. Then I resent the week', date: '2026-11-03' },
        { quote: 'I keep saying yes too quickly. Then I feel tired', date: '2026-11-05' },
      ],
      lens: {
        id: 'dispenza_automatic',
        text: 'One way to see this is as a familiar response you can notice as it happens, without having to change it straight away.',
        source: 'Joe Dispenza · the automatic program',
      },
      practice:
        'For thirty seconds, write one line about what you notice just before a quick yes, if anything comes to mind. You can stop at any time.',
      question: 'What would a slower yes sound like?',
    },
    {
      name: 'Rest that has to be earned',
      noticed:
        'Rest seems to arrive only once everything is finished, and even then it comes with a list.',
      evidence: [
        { quote: 'I only let myself sit down when everything is done', date: '2026-11-04' },
        { quote: 'Even on Sunday I made a list for resting', date: '2026-11-06' },
      ],
      lens: {
        id: 'neff_self_compassion',
        text: 'One way to see this is as a moment that could meet the same kindness you would offer a friend who was tired.',
        source: 'Kristin Neff · self-compassion',
      },
      practice: 'Sit for two minutes before the list is done, and notice what your body does.',
      question: 'What would rest feel like if it did not have to be earned?',
    },
  ],
};

function cardsParam(): string | null {
  if (!qa.enabled) return null;
  return new URLSearchParams(window.location.search).get('cards');
}

/** The harness's reading, when it asks for one. */
export const qaHeldReading = (): SavedReading | null => (cardsParam() ? QA_READING : null);

/** When the harness asks to see cards arrive face down, the reading they came from. */
export const qaFreshAt = (): number | null => (cardsParam() === 'fresh' ? QA_READING.readAt : null);
