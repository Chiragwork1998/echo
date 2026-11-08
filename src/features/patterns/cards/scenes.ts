import type { ImageSourcePropType } from 'react-native';

import type { PatternCard } from '@/services/patterns';

/**
 * The scenes on the face of ECHO's pattern cards: the painted card art from the owner's first Echo
 * (D-014), cropped to a playing card's 5:7. One figure, warm light, navy dusk: ECHO's own world.
 * Each scene is chosen by the words a pattern is made of, so a card looks like what it is about.
 */
export const SCENES = {
  'abandoned-caretaker': require('../../../../assets/cards/abandoned-caretaker.webp'),
  'approval-addict': require('../../../../assets/cards/approval-addict.webp'),
  bypasser: require('../../../../assets/cards/bypasser.webp'),
  'chronic-over-explainer': require('../../../../assets/cards/chronic-over-explainer.webp'),
  'devoted-orphan': require('../../../../assets/cards/devoted-orphan.webp'),
  'frozen-feeler': require('../../../../assets/cards/frozen-feeler.webp'),
  'held-back-brilliance': require('../../../../assets/cards/held-back-brilliance.webp'),
  'hyper-vigilant': require('../../../../assets/cards/hyper-vigilant.webp'),
  'inherited-apologist': require('../../../../assets/cards/inherited-apologist.webp'),
  'invisible-achiever': require('../../../../assets/cards/invisible-achiever.webp'),
  'invisible-witness': require('../../../../assets/cards/invisible-witness.webp'),
  'lone-protector': require('../../../../assets/cards/lone-protector.webp'),
  'love-tester': require('../../../../assets/cards/love-tester.webp'),
  'mask-virtuoso': require('../../../../assets/cards/mask-virtuoso.webp'),
  'never-enough': require('../../../../assets/cards/never-enough.webp'),
  'over-functioner': require('../../../../assets/cards/over-functioner.webp'),
  'performing-child': require('../../../../assets/cards/performing-child.webp'),
  'perpetual-observer': require('../../../../assets/cards/perpetual-observer.webp'),
  'pleasure-exiler': require('../../../../assets/cards/pleasure-exiler.webp'),
  'pre-emptive-leaver': require('../../../../assets/cards/pre-emptive-leaver.webp'),
  'rage-filled-peacekeeper': require('../../../../assets/cards/rage-filled-peacekeeper.webp'),
  'self-betrayer': require('../../../../assets/cards/self-betrayer.webp'),
  'silent-contract-maker': require('../../../../assets/cards/silent-contract-maker.webp'),
  'size-shrinker': require('../../../../assets/cards/size-shrinker.webp'),
  'smile-masker': require('../../../../assets/cards/smile-masker.webp'),
  unwritten: require('../../../../assets/cards/unwritten.webp'),
} satisfies Record<string, ImageSourcePropType>;

export type SceneId = keyof typeof SCENES;

/**
 * The words that call each scene. Whole words or phrases, matched in the card's name, what it
 * noticed and the person's quoted words. A scene with no match never wins.
 */
const CALLS: Record<Exclude<SceneId, 'unwritten'>, readonly string[]> = {
  'approval-addict': [
    'yes',
    'please',
    'pleasing',
    'approval',
    'disappoint',
    'let down',
    'liked',
    'agree',
  ],
  'never-enough': ['enough', 'perfect', 'better', 'achieve', 'behind', 'not good', 'more'],
  'over-functioner': [
    'tired',
    'exhausted',
    'everything',
    'too much',
    'busy',
    'carry',
    'responsible',
  ],
  'self-betrayer': ['myself', 'what i want', 'ignore', 'betray', 'gut', 'should have'],
  'hyper-vigilant': [
    'anxious',
    'anxiety',
    'worry',
    'worried',
    'panic',
    'fear',
    'scared',
    'nervous',
  ],
  'frozen-feeler': ['frozen', 'stuck', 'numb', 'freeze', 'cannot feel', "can't feel"],
  'love-tester': ['love', 'partner', 'relationship', 'trust', 'jealous'],
  'pre-emptive-leaver': ['leave', 'leaving', 'quit', 'walk away', 'before they'],
  'lone-protector': ['protect', 'alone', 'nobody', 'strong', 'on my own'],
  'held-back-brilliance': ['hold back', 'holding back', 'potential', 'create', 'creative', 'dream'],
  'invisible-achiever': ['work', 'office', 'credit', 'recognition', 'noticed', 'launch'],
  'rage-filled-peacekeeper': ['anger', 'angry', 'rage', 'conflict', 'argue', 'argument', 'peace'],
  'inherited-apologist': ['sorry', 'apologise', 'apologize', 'apology', 'guilt', 'guilty', 'fault'],
  'chronic-over-explainer': ['explain', 'explaining', 'justify', 'overthink', 'overthinking'],
  'performing-child': ['parents', 'mother', 'father', 'mom', 'dad', 'prove', 'perform'],
  'perpetual-observer': ['watch', 'watching', 'observe', 'sidelines', 'outside'],
  'pleasure-exiler': ['rest', 'joy', 'fun', 'deserve', 'pleasure', 'break'],
  'size-shrinker': ['small', 'shrink', 'space', 'speak up', 'voice'],
  'silent-contract-maker': ['resent', 'resentment', 'expect', 'unspoken', 'owe'],
  'abandoned-caretaker': ['care', 'caring', 'look after', 'looking after', 'caretaker'],
  'devoted-orphan': ['belong', 'home', 'lonely', 'family'],
  bypasser: ['positive', 'avoid', 'avoiding', 'distract', 'distraction', 'scroll'],
  'invisible-witness': ['seen', 'unseen', 'invisible', 'witness'],
  'mask-virtuoso': ['mask', 'role', 'pretend', 'pretending', 'act'],
  'smile-masker': ['smile', 'smiling', 'fine', 'okay', 'happy face'],
};

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = Object.entries(CALLS).map(
  ([scene, words]) =>
    [scene as SceneId, words.map((word) => new RegExp(`\\b${escape(word)}\\b`, 'g'))] as const,
);

/** A small, stable number for a string, so the same card always wears the same scene. */
export function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/**
 * The scene for a card: the one its words call most, the name counting three times over. Ties go
 * the same way every time. A card whose words call nothing is the unwritten page.
 */
export function sceneFor(card: Pick<PatternCard, 'name' | 'noticed' | 'evidence'>): SceneId {
  const name = card.name.toLowerCase();
  const body = [card.noticed, ...card.evidence.map((item) => item.quote)].join(' ').toLowerCase();
  let best: SceneId = 'unwritten';
  let bestScore = 0;
  let bestTie = 0;
  for (const [scene, patterns] of PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      score += (name.match(pattern)?.length ?? 0) * 3 + (body.match(pattern)?.length ?? 0);
    }
    if (score === 0) continue;
    const tie = hash(`${card.name}|${scene}`);
    if (score > bestScore || (score === bestScore && tie > bestTie)) {
      best = scene;
      bestScore = score;
      bestTie = tie;
    }
  }
  return best;
}
