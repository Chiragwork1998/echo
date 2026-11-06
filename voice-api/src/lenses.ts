// The ideas Pattern Cards may borrow a way of seeing from. Every idea is a paraphrase in ECHO's own
// words: nothing here quotes a book, a talk, or a paper, and no author has reviewed or endorsed
// ECHO. Names are given only to credit where an idea comes from.
//
// These are ways of looking at what a person wrote, never findings about them. Several come from
// traditions that are debated or that rest on contested science (polyvagal theory, and Joe Dispenza's
// accounts of the brain and body), so each lens carries `careWith`: what a card must not claim.
//
// Reviewed against: Dispenza, Breaking the Habit of Being Yourself (2012); Porges, The Polyvagal
// Theory (2011); Dana, The Polyvagal Theory in Therapy (2018); Siegel, The Developing Mind (1999,
// window of tolerance) and Siegel and Bryson, The Whole-Brain Child (2011, "name it to tame it");
// Pennebaker, Opening Up (1990) and Writing to Heal (2004); Neff, Self-Compassion (2011); Schwartz,
// Internal Family Systems Therapy (1995); Maté, The Myth of Normal (2022); Brach, Radical Compassion
// (2019), RAIN originating with Michele McDonald; Levine, Waking the Tiger (1997).

export const LENS_IDS = [
  'dispenza_loop',
  'dispenza_past_in_present',
  'dispenza_automatic',
  'dispenza_rehearsal',
  'porges_states',
  'dana_safety_moments',
  'siegel_window',
  'siegel_naming',
  'pennebaker_expressing',
  'pennebaker_meaning',
  'neff_self_compassion',
  'schwartz_parts',
  'mate_attachment_authenticity',
  'brach_rain',
  'levine_completion',
] as const;

export type LensId = (typeof LENS_IDS)[number];

export type Lens = {
  id: LensId;
  /** Credited by name on the card. */
  author: string;
  /** Short name of the idea, shown beside the author. */
  concept: string;
  /** The idea in ECHO's words. */
  idea: string;
  /** What in a person's writing makes this lens a fair fit. */
  fitsWhen: string;
  /** What a card must not claim when it uses this lens. */
  careWith: string;
  /** Starting points for a practice under two minutes. A card adapts one to what the person wrote. */
  practices: string[];
};

export const LENSES: readonly Lens[] = [
  {
    id: 'dispenza_loop',
    author: 'Joe Dispenza',
    concept: 'thoughts and feelings in a loop',
    idea: 'A thought brings a feeling, and the feeling brings more of the same thought. Round and round, the pair can become a familiar place we keep returning to without choosing it.',
    fitsWhen:
      'the same worry, judgement or story returns across entries, and the same feeling goes with it each time',
    careWith:
      'Offer it as a way of looking at repetition. Make no claim about the brain, the body, or what changing the loop will do.',
    practices: [
      'Next time the thought arrives, say silently: "there is the loop", and take one slow breath before anything else.',
      'Write the thought and the feeling it brings as two short lines, side by side.',
    ],
  },
  {
    id: 'dispenza_past_in_present',
    author: 'Joe Dispenza',
    concept: 'the past running the present',
    idea: 'A feeling that was strong long ago can quietly set the tone of an ordinary day, so that today is met as though it were yesterday.',
    fitsWhen:
      'the person describes meeting a present moment with a feeling that seems larger than the moment, or that they have felt before in other places',
    careWith:
      'Never say what the older feeling came from, and never say it is from childhood or from any event. Only point to the match between then and now if the writer made it themselves.',
    practices: [
      'Ask, once today: "Is this feeling about right now, or is it an old visitor?" Write one line either way.',
      'Look around the room and name three things that are only true today.',
    ],
  },
  {
    id: 'dispenza_automatic',
    author: 'Joe Dispenza',
    concept: 'the automatic program',
    idea: 'Much of what we think, feel and do each day runs on habit, as if on autopilot. The first step is only to catch it while it runs, with no need to change anything yet.',
    fitsWhen:
      'the person describes doing, saying or thinking something again and again, and seems to wish it were otherwise, or notes that it happened "without thinking"',
    careWith:
      'Offer it as noticing, not as a verdict that they are stuck. Make no promise that noticing changes anything.',
    practices: [
      'Choose one small habit today and, when it starts, say "there it goes" and carry on as you like.',
      'Write the first thing you did this morning without deciding to.',
    ],
  },
  {
    id: 'dispenza_rehearsal',
    author: 'Joe Dispenza',
    concept: 'rehearsing a new self',
    idea: 'We can picture, in some detail, how we would think, feel and act as the person we are growing toward, and return to that picture often, the way an actor goes back to a scene.',
    fitsWhen:
      'the person writes about who they want to become, or about wanting to respond differently to something that keeps recurring',
    careWith:
      'Offer it as an imaginative exercise. Claim nothing about results, the brain or the body, and do not describe who the person "really" is.',
    practices: [
      'Picture one ordinary moment tomorrow, handled the way you would like. See what you wear, say and feel. Stay for one minute.',
      'Write one sentence beginning "The version of me I am growing toward would..."',
    ],
  },
  {
    id: 'porges_states',
    author: 'Stephen Porges',
    concept: 'safety, mobilisation and shutdown',
    idea: 'The body keeps checking, below awareness, whether it is safe. When it feels safe we are open and connected. When it does not, it can move into mobilisation (keyed up, driven, on guard) or into shutdown (flat, heavy, withdrawn). These shifts are automatic, not a failing.',
    fitsWhen:
      'the entries move between being wound up and being flat or numb, or the person describes tension, restlessness, heaviness or withdrawal in the body or the day',
    careWith:
      'Polyvagal theory is debated. Use it as a vocabulary for states, never as a measurement of this person or a claim about their nervous system. Never say which state they are in as a fact.',
    practices: [
      'Ask your body: "keyed up, flat, or somewhere steadier?" Write one word, no explanation.',
      'Let your eyes move slowly around the room and rest on whatever feels neutral or kind.',
    ],
  },
  {
    id: 'dana_safety_moments',
    author: 'Deb Dana',
    concept: 'small moments of safety',
    idea: 'We can learn our own states by noticing and naming them as they come and go, and by catching tiny moments of ease or connection, such as a warm cup, a kind face, or a loosening in the shoulders, so that they register rather than slip past.',
    fitsWhen:
      'the entries are dominated by difficulty, and small pleasant, calm or connected moments are mentioned in passing or not at all',
    careWith:
      'Do not claim that noticing such moments changes the nervous system. Do not suggest the hard things are exaggerated.',
    practices: [
      'Find one small thing right now that is okay or good. Look at it for twenty seconds.',
      'Write down one tiny moment of ease from today, however ordinary.',
    ],
  },
  {
    id: 'siegel_window',
    author: 'Dan Siegel',
    concept: 'the window of tolerance',
    idea: 'There is a range in which we can feel a lot and still think clearly. Outside it, on one side we are flooded and overwhelmed, and on the other we are numb and shut down. Stress narrows the range, and rest and support widen it.',
    fitsWhen:
      'the person describes being overwhelmed, or going blank or numb, or swinging between the two',
    careWith:
      'Offer it as a map of the edges. Do not say where this person is or tell them their window is small.',
    practices: [
      'Rate how full you feel from 1 to 10 and write the number. Then name one small thing that would turn it down a notch.',
      'Press your feet into the floor for ten seconds and notice what changes, even slightly.',
    ],
  },
  {
    id: 'siegel_naming',
    author: 'Dan Siegel',
    concept: 'naming a feeling to settle it',
    idea: 'Putting a precise word to a feeling tends to take some of its edge off, because finding the word engages the part of us that reflects, rather than only the part that reacts.',
    fitsWhen:
      'the person writes around a feeling without naming it, uses a vague word, or writes mostly about events with few feeling words',
    careWith: 'Say "tends to" and "often". Do not promise that a name will make a feeling go.',
    practices: [
      'Write the feeling in three different words and keep the one that fits best.',
      'Finish the sentence: "Right now, if I had to name it, I feel..." and stop.',
    ],
  },
  {
    id: 'pennebaker_expressing',
    author: 'James Pennebaker',
    concept: 'expressive writing',
    idea: 'Writing honestly about what weighs on us, for a short stretch and with no audience, can ease the effort of holding it in. The writing does not need to be good. It needs to be true.',
    fitsWhen:
      'the person circles something they seem to be holding back, or writes around it in a guarded way',
    careWith:
      'The research on expressive writing is mixed. Do not claim it improves health. Say only that some people find it a relief.',
    practices: [
      'Set a timer for two minutes and write without stopping about the thing you keep circling. Do not reread.',
      'Write one sentence you have not said to anyone. You do not have to keep it.',
    ],
  },
  {
    id: 'pennebaker_meaning',
    author: 'James Pennebaker',
    concept: 'from raw feeling toward meaning',
    idea: 'Across several rounds of writing about the same thing, people often move from pure feeling toward a story with a because in it, and toward a slightly wider view. Staying with the feeling comes first, and the meaning tends to come later and is not forced.',
    fitsWhen:
      'the entries describe the same raw feeling again and again without much sense of why, or the person has just begun to write "maybe it is because..."',
    careWith:
      'Do not supply the meaning for them. Do not imply they should have reached one by now.',
    practices: [
      'Write one sentence about the feeling, then one beginning "Maybe part of it is..." Leave the second unfinished if you need to.',
      'Reread one old entry and underline one line that still feels true and one that has softened.',
    ],
  },
  {
    id: 'neff_self_compassion',
    author: 'Kristin Neff',
    concept: 'self-compassion',
    idea: 'Meeting our own struggle with the care we would offer a friend rests on three things: speaking to ourselves kindly rather than harshly, remembering that struggling is part of being human, and noticing pain without being swallowed by it.',
    fitsWhen:
      'the person is harsh with themselves, writes about failing or falling short, or treats their struggle as proof they are alone or unusually flawed',
    careWith:
      'Do not tell them to stop being hard on themselves. Offer the kindness as an invitation.',
    practices: [
      'Place a hand on your chest or arm for thirty seconds and say, in your own words, what a kind friend would say.',
      'Write the harsh sentence, then write what you would say to someone you love who wrote it.',
    ],
  },
  {
    id: 'schwartz_parts',
    author: 'Richard Schwartz',
    concept: 'protective parts',
    idea: 'It can help to think of the mind as made of parts, each with a role. Some parts work hard to protect us, by pushing, pleasing, controlling, numbing or distracting, and each of them is trying to help, even when its methods cost us.',
    fitsWhen:
      'the person writes about an inner voice, a pull or a habit that seems to be guarding them from something, or describes feeling "part of me wants X and part of me wants Y"',
    careWith:
      'Talk about "a part of you" only in the writer\'s own words, and never name or describe a part they did not mention. Do not interpret what it is protecting them from.',
    practices: [
      'Give the voice a plain name and write: "Thank you for trying to help. What are you afraid would happen if you stopped?"',
      'Write what this protective voice sounds like, in its own words, for one minute.',
    ],
  },
  {
    id: 'mate_attachment_authenticity',
    author: 'Gabor Maté',
    concept: 'the pull between closeness and being true',
    idea: 'There is often a tension between wanting to stay close and accepted, and wanting to say what is true for us. When the two collide we may hold back, please, or hide what we feel in order to keep the closeness.',
    fitsWhen:
      'the person writes about saying yes when they mean no, about swallowing what they feel to keep the peace, or about fearing that being honest would cost them a relationship',
    careWith:
      'Never say why the person learned this or point to their childhood or their parents. Do not judge anyone they mention. Speak only about the writer\'s own choice in the moment.',
    practices: [
      'Think of one small thing you held back this week. Write it in one honest sentence, for yourself only.',
      'Ask: "What would I say here if I knew I would still be okay?" Write the answer.',
    ],
  },
  {
    id: 'brach_rain',
    author: 'Tara Brach',
    concept: 'RAIN',
    idea: 'A way of staying with a hard feeling in four small steps: recognise what is happening, allow it to be there without fixing it, look into it with gentle curiosity, and offer yourself some care. The practice began with Michele McDonald and was developed further by Tara Brach.',
    fitsWhen:
      'the person is in the middle of a difficult feeling, resisting it, or trying to get rid of it',
    careWith:
      'Offer it as an invitation to try, not an instruction. If a feeling is overwhelming, say it is fine to stop.',
    practices: [
      'Take the four steps in under two minutes: name it, let it be, ask "what does this want me to know?", then offer one kind phrase. Stop whenever you like.',
      'Write the feeling in one line, then write the kindest true sentence you can find for it.',
    ],
  },
  {
    id: 'levine_completion',
    author: 'Peter Levine',
    concept: 'the body finishing what it could not at the time',
    idea: 'When a strong response such as bracing, pulling away or pushing back could not be carried through when it was needed, the body can carry that unfinished effort. Small, gentle movements can let a response complete, a little at a time.',
    fitsWhen:
      'the person describes holding tension, clenching, freezing, or an urge to move, run or push that they did not act on',
    careWith:
      'Never suggest any event or past experience as the cause. Never call it trauma. Keep any movement tiny and gentle, and say they can stop at any time.',
    practices: [
      'Push your palms against a wall, or against each other, gently for ten seconds, then let go and notice what your body does.',
      'Let your shoulders rise and fall once, slowly, then shake out your hands. Notice any change, however small.',
    ],
  },
];

export const lensById = (id: string): Lens | undefined => LENSES.find((lens) => lens.id === id);

export const isLensId = (id: unknown): id is LensId =>
  typeof id === 'string' && (LENS_IDS as readonly string[]).includes(id);

/** What a card shows beneath its lens sentence. Fixed here, never written by the model. */
export const lensSource = (id: LensId): string => {
  const lens = lensById(id);
  return lens ? `${lens.author} · ${lens.concept}` : '';
};

/** The catalogue as the model reads it. */
export function lensesForPrompt(): string {
  return LENSES.map(
    (lens) =>
      `- id: ${lens.id}\n  from: ${lens.author}, ${lens.concept}\n  idea: ${lens.idea}\n  fits when: ${lens.fitsWhen}\n  care: ${lens.careWith}\n  practice starting points: ${lens.practices.join(' | ')}`,
  ).join('\n');
}
