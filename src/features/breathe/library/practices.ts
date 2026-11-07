import type { Pattern, Practice, Step } from '../types';

// The library of Breathe: one practice for each feeling in docs/PRODUCT_V1.md, and Become's Arrive.
//
// Every idea here is paraphrased in ECHO's own words. Nothing quotes a book, a talk or a paper, and
// no author has reviewed or endorsed ECHO: names are given only to credit where an idea comes from.
// No practice claims to treat anything. What each source teaches, how strong its evidence is, what
// ECHO must not claim, and the safety notes are in docs/BREATHE_SOURCES.md.
//
// The lines are written for docs/DESIGN_QUALITY.md and the voice of Breathe: calm, plain, second
// person and short. A breathing line is at most 14 words, comes at most once a minute, and ends
// before the next in breath. An imagery line (Arrive, One thing, Ready) is at most 22 words and
// comes every 15 to 20 seconds while it guides, then the voice is quiet. timing.ts sets out the
// timing the steps are written for, and the tests beside this file hold every line to these rules
// at every length and pace.
//
// Each voice line is also an audio file. After changing a line's words, run
// scripts/generate-breath-voice.mjs, which makes only the lines that changed.

const bell: Step = { kind: 'bell' };

const say = (line: string, text: string): Step => ({ kind: 'voice', line, text });

type Paced = Extract<Pattern, { kind: 'paced' }>;

const paced = (
  inhale: number,
  exhale: number,
  more: Omit<Paced, 'kind' | 'inhale' | 'exhale'> = {},
): Paced => ({ kind: 'paced', inhale, exhale, ...more });

/** A number of whole breaths of a pattern with a fixed rhythm. */
function breaths(
  pattern: Exclude<Pattern, { kind: 'heart' }>,
  count: number,
  stretch?: true,
): Step {
  const breath =
    pattern.kind === 'sigh'
      ? pattern.inhale + pattern.topUp + pattern.exhale
      : pattern.inhale + (pattern.holdIn ?? 0) + pattern.exhale + (pattern.holdOut ?? 0);
  const seconds = breath * count;
  return stretch
    ? { kind: 'breath', pattern, seconds, stretch }
    : { kind: 'breath', pattern, seconds };
}

/** Heart breathing at the person's own pace, for about this many seconds. */
const heart = (seconds: number, stretch?: true): Step =>
  stretch
    ? { kind: 'breath', pattern: { kind: 'heart' }, seconds, stretch }
    : { kind: 'breath', pattern: { kind: 'heart' }, seconds };

// Rhythms shared by more than one practice.

/** Cyclic sighing: a breath in through the nose, a short second one on top, a long breath out. */
const SIGH: Pattern = { kind: 'sigh', inhale: 3, topUp: 1, exhale: 6 };
/** Box breathing, four counts each. */
const BOX: Pattern = paced(4, 4, { holdIn: 4, holdOut: 4 });
/** An easy slow breath, about six a minute, with the out breath a little longer. */
const EASY: Pattern = paced(4, 6);

const settle: Practice = {
  id: 'settle',
  feeling: 'Anxious',
  name: 'Settle',
  line: 'Two breaths in through the nose and one long breath out, then one quiet word for what you feel.',
  why: 'In a 2023 Stanford study, five minutes a day of cyclic sighing lifted mood more than mindfulness meditation did. Naming a feeling tends to take some of its edge off.',
  source: 'Balban and others, Stanford, 2023 (cyclic sighing); Dan Siegel (name it to tame it)',
  minutes: 3,
  free: true,
  steps: [
    bell,
    say('settle.open', 'Let it out slowly through your mouth, a long, easy sigh.'),
    breaths(SIGH, 6),
    say('settle.soften', 'Each time you breathe out, let your jaw and shoulders soften.'),
    breaths(SIGH, 6, true),
    bell,
    // The last minute slows a little more, and the word is found on a long breath out.
    say('settle.name', 'Now silently name what you feel in one word. Any word is fine.'),
    breaths({ kind: 'sigh', inhale: 3, topUp: 1, exhale: 8 }, 5),
    bell,
  ],
};

// Panic: the in breaths stay small and easy, the out breaths grow long, and nothing is held. It
// starts near a fast breath and slows over the first minute.
const ground: Practice = {
  id: 'ground',
  feeling: 'Panicky',
  name: 'Ground',
  line: 'Long, slow breaths out with no holding, while your eyes and feet find where you are.',
  why: 'Panic often brings fast breathing, and long, slow breaths out help to slow it down. Finding things you can see, and the floor under your feet, brings your attention back to where you are.',
  source: 'Peter Levine and Deb Dana (orienting)',
  minutes: 3,
  free: true,
  steps: [
    bell,
    say('ground.open', 'Breathe out as if through a straw.'),
    breaths(paced(2, 5), 2),
    breaths(paced(3, 6), 4),
    breaths(paced(3, 7), 1),
    say('ground.look', 'Look around slowly. Find three things you can see, one at a time.'),
    breaths(paced(3, 7), 6),
    say('ground.feet', 'Feel the floor under your feet. Waves like this pass.'),
    breaths(paced(3, 7), 6, true),
    bell,
  ],
  afterUnsettled: 'support',
};

// Hurt: a minute between each kind sentence, so each one has room, then quiet with a hand on the
// heart.
const soothe: Practice = {
  id: 'soothe',
  feeling: 'Hurting',
  name: 'Soothe',
  line: 'A hand on your heart, slow breaths with a longer out breath, and three kind sentences to yourself.',
  why: 'Studies find that meeting your own pain with the kindness you would give a friend eases stress and makes you less hard on yourself. A warm hand on your heart can help the kindness feel real.',
  source: 'Kristin Neff (the self-compassion break)',
  minutes: 4,
  free: true,
  steps: [
    bell,
    say('soothe.open', 'Rest a hand on your heart, if you like.'),
    breaths(paced(3, 5), 5),
    breaths(EASY, 2),
    say('soothe.hard', 'Tell yourself: this is hard. Others feel it too.'),
    breaths(EASY, 6),
    say('soothe.kind', 'Now say something kind to yourself, as you would to a friend.'),
    breaths(EASY, 12, true),
    bell,
  ],
  afterUnsettled: 'support',
};

// The bell for the feeling comes after about a minute of heart breathing, at every length, rather
// than half way. HeartMath brings the feeling in after half a minute or so and then holds it, and
// someone who came wanting to feel grateful should spend most of the practice feeling it. A longer
// practice holds the feeling longer. A bell half way would also leave the free three minute Heart
// with two lines thirty seconds apart, or with twenty five seconds of feeling.
const heartPractice: Practice = {
  id: 'heart',
  feeling: 'Wanting to feel grateful',
  name: 'Heart',
  line: 'Slow breaths at your own pace, as if through your heart, then a moment of gratitude or love, felt again.',
  why: 'Breathing at about six breaths a minute makes the heart’s rhythm rise and fall in slow, even waves, and practising it is linked with less stress. Feeling gratitude on purpose gives that calm something warm to rest on.',
  source: 'HeartMath Institute (Quick Coherence); Joe Dispenza (elevated emotion)',
  minutes: 5,
  free: { minutes: [3, 5] },
  steps: [
    bell,
    say('heart.open', 'Breathe slowly and easily, as if through your heart.'),
    heart(70),
    bell,
    say('heart.feel', 'Remember a moment you felt grateful, or loved. Feel it again now.'),
    heart(70),
    say('heart.stay', 'If the feeling fades, gently bring it back.'),
    heart(160, true),
    bell,
  ],
};

const cool: Practice = {
  id: 'cool',
  feeling: 'Angry',
  name: 'Cool',
  line: 'Breathe in through your nose and out with a quiet hum, lips closed, and let your answer wait.',
  why: 'Anger pushes you to answer now, and a pause lets you choose how you answer. In a 2024 review of 154 studies, things that calm the body, like slow breathing, lowered anger, and venting did not.',
  source:
    'Maxwell Maltz, Psycho-Cybernetics (the delayed reaction); humming breath from yoga (bhramari)',
  minutes: 3,
  free: false,
  steps: [
    bell,
    say('cool.open', 'You do not have to answer yet. Hum softly as you breathe out.'),
    breaths(paced(4, 6, { hum: true }), 6),
    say('cool.hum', 'Keep your lips closed and the hum low. Feel it in your face.'),
    breaths(paced(4, 8, { hum: true }), 5),
    say('cool.later', 'You can answer later, and choose your words then.'),
    breaths(paced(4, 8, { hum: true }), 5, true),
    bell,
  ],
};

// Overwhelm: counting gives the mind one thing to do, then the counting stops and the voice builds
// the quiet room, then leaves the person in it.
const oneThing: Practice = {
  id: 'one-thing',
  feeling: 'Overwhelmed',
  name: 'One thing',
  line: 'Box breathing, four counts each, then a small quiet room inside you to rest in.',
  why: 'In a 2023 Stanford study, five minutes a day of box breathing eased anxiety about as much as mindfulness meditation. Picturing a quiet room of your own gives a crowded mind somewhere to rest.',
  source: 'Mark Divine (box breathing); Maxwell Maltz, Psycho-Cybernetics (the quiet room)',
  minutes: 4,
  free: false,
  steps: [
    bell,
    say('one-thing.open', 'For now there is only one thing to do: count to four.'),
    breaths(BOX, 5),
    bell,
    say(
      'one-thing.room',
      'Let the counting go. Picture a small, quiet room inside you, with the door closed.',
    ),
    breaths(EASY, 2),
    say(
      'one-thing.simple',
      'Keep it simple and restful. Soft light, somewhere to sit, nothing that asks anything of you.',
    ),
    breaths(EASY, 2),
    say(
      'one-thing.door',
      'Everything that needs you is outside the door. It can wait a few minutes.',
    ),
    breaths(EASY, 2),
    say(
      'one-thing.rest',
      'Sit down and rest here. You can come back to this room whenever you need it.',
    ),
    breaths(EASY, 10, true),
    bell,
  ],
};

// Sleep has no closing bell, so it cannot wake someone who has drifted off, and the voice stops
// early. The screen goes to black over a minute once the counted breaths are done.
const sleep: Practice = {
  id: 'sleep',
  feeling: 'Can’t sleep',
  name: 'Sleep',
  line: 'Four rounds of in for four, hold for seven and out for eight, then long breaths out as the screen goes dark.',
  why: 'Slow breathing with long breaths out quiets the body. In a small study, people with insomnia who breathed slowly for twenty minutes before bed fell asleep sooner and woke less in the night.',
  source: 'Andrew Weil (4-7-8)',
  minutes: 10,
  free: false,
  steps: [
    bell,
    say('sleep.open', 'Breathe out through your mouth, slowly, with a soft whoosh.'),
    breaths(paced(4, 8, { holdIn: 7 }), 4),
    say('sleep.free', 'No more holding now. Let each breath out be long and slow.'),
    { kind: 'fade', seconds: 60 },
    breaths(paced(4, 8), 7),
    say('sleep.rest', 'Let the bed hold your weight. There is nothing left to do tonight.'),
    breaths(EASY, 44, true),
  ],
};

// Low or flat: upright, fuller breaths, then a little quicker, then one small thing that is okay.
const lift: Practice = {
  id: 'lift',
  feeling: 'Low or flat',
  name: 'Lift',
  line: 'Sit up, take fuller breaths in and even breaths out, then notice one small thing that is still okay.',
  why: 'In a 2017 study, people with low mood who sat upright felt more energy and less tiredness than those who sat as they usually did. Noticing small moments that are okay, which Deb Dana calls glimmers, helps them register instead of slipping past.',
  source: 'Stephen Porges and Deb Dana (moving gently out of shutdown; glimmers)',
  minutes: 3,
  free: false,
  steps: [
    bell,
    say('lift.open', 'Sit up a little, if you can.'),
    breaths(paced(4, 4), 8),
    say('lift.fuller', 'Let each breath in be a little fuller.'),
    breaths(paced(4, 4), 1),
    breaths(paced(3, 3), 9, true),
    bell,
    say('lift.glimmer', 'Now find one small thing that is still okay.'),
    breaths(paced(4, 5), 6),
    bell,
  ],
};

const ready: Practice = {
  id: 'ready',
  feeling: 'Before something hard',
  name: 'Ready',
  line: 'Two minutes of box breathing, then you remember a time you did something hard and it went well.',
  why: 'Remembering a time something went well has been found to soften the body’s response to stress. It also reminds you that you have done hard things before.',
  source: 'Maxwell Maltz, Psycho-Cybernetics (the winning feeling); Mark Divine (box breathing)',
  minutes: 4,
  free: false,
  steps: [
    bell,
    say('ready.open', 'Four counts in, hold, out, and hold. Let it steady you.'),
    breaths(BOX, 7),
    bell,
    say(
      'ready.recall',
      'Now remember a time you did something hard, and it went well. It can be small.',
    ),
    breaths(paced(3, 5), 2),
    say('ready.scene', 'Where were you? What could you see and hear? Let it come back in detail.'),
    breaths(paced(3, 5), 2),
    say('ready.moment', 'Find the moment you knew it was going well. Notice how that felt.'),
    breaths(paced(3, 5), 2),
    say('ready.now', 'Let that feeling come back now, in your body. Stay with it.'),
    breaths(EASY, 8, true),
    bell,
  ],
};

const rideTheWave: Practice = {
  id: 'ride-the-wave',
  feeling: 'A craving or an urge',
  name: 'Ride the wave',
  line: 'Slow breaths while you watch the urge rise, peak and fall like a wave, without acting on it.',
  why: 'Urges rise, peak and fade, and watching one without acting on it lets you see that for yourself. In a 2009 study, smokers taught to watch their urges this way smoked fewer cigarettes over the next week.',
  source: 'G. Alan Marlatt (urge surfing)',
  minutes: 3,
  free: false,
  steps: [
    bell,
    say('ride-the-wave.notice', 'Notice the urge. Where in your body do you feel it?'),
    breaths(EASY, 6),
    say('ride-the-wave.watch', 'Watch it rise like a wave. You do not have to act on it.'),
    breaths(EASY, 6),
    say('ride-the-wave.pass', 'Urges rise, peak and fall. Ride this one with your breath.'),
    breaths(EASY, 6, true),
    bell,
  ],
};

/** The ten practices of Breathe, in the order the feelings are listed. */
export const PRACTICES: Practice[] = [
  settle,
  ground,
  soothe,
  heartPractice,
  cool,
  oneThing,
  sleep,
  lift,
  ready,
  rideTheWave,
];

/**
 * Become's morning practice: two minutes of Heart, then the theater of the mind. Two minutes is a
 * whole number of breaths at every pace a person may choose (9 to 13), so the theater always
 * begins on time.
 */
export const ARRIVE: Practice = {
  id: 'arrive',
  feeling: 'Starting the day',
  name: 'Arrive',
  line: 'Two minutes of slow breathing, then you see yourself in one moment of today as the person you are becoming.',
  why: 'Studies of mental rehearsal find that picturing yourself doing something, in detail, helps you do it for real. Seeing who you are becoming as if it is already true is at the heart of what Maltz and Dispenza teach.',
  source:
    'Maxwell Maltz, Psycho-Cybernetics (the theater of the mind); Joe Dispenza (mental rehearsal); HeartMath Institute (Quick Coherence)',
  minutes: 4,
  free: true,
  steps: [
    bell,
    say('arrive.open', 'Good morning. Breathe slowly, as if through your heart.'),
    heart(120, true),
    bell,
    say(
      'arrive.see',
      'Now picture one ordinary moment from the day ahead. Where are you? Who is there?',
    ),
    breaths(EASY, 2),
    say(
      'arrive.you',
      'See yourself there as the person you are becoming. Notice how you stand and move.',
    ),
    breaths(EASY, 2),
    say('arrive.say', 'Hear what you say, and how you say it, as this person.'),
    breaths(EASY, 2),
    say('arrive.true', 'Notice how it feels to be this person, here, as if it is already true.'),
    breaths(EASY, 6),
    bell,
  ],
};

/**
 * The lines that guide imagery, in One thing, Ready and Arrive. These may come every 15 to 20
 * seconds and run to 22 words; every other line keeps to one a minute and 14 words.
 */
export const IMAGERY_LINES: ReadonlySet<string> = new Set([
  'one-thing.room',
  'one-thing.simple',
  'one-thing.door',
  'one-thing.rest',
  'ready.recall',
  'ready.scene',
  'ready.moment',
  'ready.now',
  'arrive.see',
  'arrive.you',
  'arrive.say',
  'arrive.true',
]);

/**
 * For You. OpenAI's usage policies ask that people are told plainly that a voice made with its
 * text to speech is AI generated and not a human voice.
 */
export const SYNTHETIC_VOICE_NOTE =
  'The voice in Breathe is AI generated, made with OpenAI. It is not a real person.';
