// PLACEHOLDER until the content agent's library lands: the ten rows of the brief's table with simple
// steps, so the engine and the screens can be built and tested. The content agent's file replaces
// this one whole, with the practices' real words, lines and timings.
import type { Practice } from '../types';

const sigh = { kind: 'sigh', inhale: 2.5, topUp: 1, exhale: 6 } as const;
const longOut = { kind: 'paced', inhale: 4, exhale: 6 } as const;
const box = { kind: 'paced', inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 } as const;

export const PRACTICES: Practice[] = [
  {
    id: 'settle',
    feeling: 'Anxious',
    name: 'Settle',
    line: 'Two breaths in through the nose, then one long breath out.',
    why: 'Long, slow sighs bring the body down quickly.',
    source: 'Balban and others, Stanford, 2023; Dan Siegel, name it to tame it',
    minutes: 3,
    free: true,
    steps: [
      { kind: 'breath', pattern: sigh, seconds: 160, stretch: true },
      { kind: 'voice', line: 'settle.name', text: 'Name what you feel in one word, silently.' },
      { kind: 'breath', pattern: sigh, seconds: 20 },
    ],
  },
  {
    id: 'ground',
    feeling: 'Panicky',
    name: 'Ground',
    line: 'Long, slow breaths out, as if through a straw.',
    why: 'A long out breath and eyes that find the room tell the body it is safe here.',
    source: 'Peter Levine and Deb Dana, orienting',
    minutes: 3,
    free: true,
    steps: [
      { kind: 'breath', pattern: longOut, seconds: 60 },
      { kind: 'voice', line: 'ground.look', text: 'Let your eyes find three things around you.' },
      { kind: 'breath', pattern: longOut, seconds: 60, stretch: true },
      { kind: 'voice', line: 'ground.wave', text: 'This is a wave. It passes.' },
      { kind: 'breath', pattern: longOut, seconds: 60 },
    ],
    afterUnsettled: 'support',
  },
  {
    id: 'soothe',
    feeling: 'Hurting',
    name: 'Soothe',
    line: 'A hand on your heart, and slow breaths with a longer breath out.',
    why: 'Speaking to yourself kindly calms the same way kindness from a friend does.',
    source: 'Kristin Neff, the self-compassion break',
    minutes: 4,
    free: true,
    steps: [
      { kind: 'voice', line: 'soothe.hand', text: 'Rest a hand on your heart.' },
      { kind: 'breath', pattern: longOut, seconds: 120, stretch: true },
      {
        kind: 'voice',
        line: 'soothe.kind',
        text: 'This is hard. Others feel this too. May I be kind to myself.',
      },
      { kind: 'breath', pattern: longOut, seconds: 120 },
    ],
    afterUnsettled: 'support',
  },
  {
    id: 'heart',
    feeling: 'Wanting to feel grateful',
    name: 'Heart',
    line: 'Slow, even breaths at your own pace, as if through the heart.',
    why: 'Near five or six breaths a minute, the heart rate rises and falls with each breath in a smooth wave.',
    source: 'HeartMath Institute, Quick Coherence; Joe Dispenza, elevated emotion',
    minutes: 5,
    free: { minutes: [3, 5] },
    steps: [
      { kind: 'breath', pattern: { kind: 'heart' }, seconds: 150, stretch: true },
      { kind: 'bell' },
      {
        kind: 'voice',
        line: 'heart.feel',
        text: 'Remember a moment you felt grateful, and feel it again.',
      },
      { kind: 'breath', pattern: { kind: 'heart' }, seconds: 150, stretch: true },
    ],
  },
  {
    id: 'cool',
    feeling: 'Angry',
    name: 'Cool',
    line: 'In through the nose, then a long breath out with a quiet hum.',
    why: 'Waiting before you answer gives the heat time to pass.',
    source: 'Maxwell Maltz, Psycho-Cybernetics, the delayed reaction; bhramari',
    minutes: 3,
    free: false,
    steps: [
      { kind: 'voice', line: 'cool.wait', text: 'You do not have to answer yet.' },
      {
        kind: 'breath',
        pattern: { kind: 'paced', inhale: 4, exhale: 8, hum: true },
        seconds: 180,
        stretch: true,
      },
    ],
  },
  {
    id: 'one-thing',
    feeling: 'Overwhelmed',
    name: 'One thing',
    line: 'Four counts in, hold, out, hold, and a small quiet room inside you.',
    why: 'Even counts give the mind one simple thing to hold.',
    source: 'Mark Divine, box breathing; Maxwell Maltz, Psycho-Cybernetics, the quiet room',
    minutes: 4,
    free: false,
    steps: [
      { kind: 'breath', pattern: box, seconds: 120, stretch: true },
      {
        kind: 'voice',
        line: 'one-thing.room',
        text: 'Picture a small, quiet room inside you, and rest there.',
      },
      { kind: 'breath', pattern: box, seconds: 120 },
    ],
  },
  {
    id: 'sleep',
    feeling: 'Can’t sleep',
    name: 'Sleep',
    line: 'Four rounds of in for four, hold for seven, out for eight. Then long breaths out.',
    why: 'Long, slow out breaths favour the body’s rest response.',
    source: 'Andrew Weil, 4-7-8',
    minutes: 10,
    free: false,
    steps: [
      { kind: 'breath', pattern: { kind: 'paced', inhale: 4, holdIn: 7, exhale: 8 }, seconds: 76 },
      { kind: 'fade', seconds: 120 },
      {
        kind: 'breath',
        pattern: { kind: 'paced', inhale: 4, exhale: 8 },
        seconds: 524,
        stretch: true,
      },
    ],
  },
  {
    id: 'lift',
    feeling: 'Low or flat',
    name: 'Lift',
    line: 'Sit up, with fuller breaths in and even breaths out.',
    why: 'Gentle, fuller breaths help the body move out of shutdown.',
    source: 'Stephen Porges and Deb Dana, glimmers',
    minutes: 3,
    free: false,
    steps: [
      {
        kind: 'breath',
        pattern: { kind: 'paced', inhale: 4, exhale: 4 },
        seconds: 150,
        stretch: true,
      },
      { kind: 'voice', line: 'lift.okay', text: 'Notice one small thing that is still okay.' },
      { kind: 'breath', pattern: { kind: 'paced', inhale: 4, exhale: 4 }, seconds: 30 },
    ],
  },
  {
    id: 'ready',
    feeling: 'Before something hard',
    name: 'Ready',
    line: 'Two minutes of box breathing, then a time it went well.',
    why: 'Remembering a success brings back the feeling that carried you through it.',
    source: 'Maxwell Maltz, Psycho-Cybernetics, the winning feeling',
    minutes: 4,
    free: false,
    steps: [
      { kind: 'breath', pattern: box, seconds: 120 },
      {
        kind: 'voice',
        line: 'ready.remember',
        text: 'Remember a time you did something hard, and it went well.',
      },
      { kind: 'breath', pattern: longOut, seconds: 120, stretch: true },
    ],
  },
  {
    id: 'ride-the-wave',
    feeling: 'A craving or an urge',
    name: 'Ride the wave',
    line: 'Slow breaths while the urge rises, peaks and falls.',
    why: 'An urge rises and falls like a wave when you watch it without acting.',
    source: 'G. Alan Marlatt, urge surfing',
    minutes: 3,
    free: false,
    steps: [
      { kind: 'breath', pattern: longOut, seconds: 90, stretch: true },
      { kind: 'voice', line: 'ride.watch', text: 'Watch the urge rise and fall, like a wave.' },
      { kind: 'breath', pattern: longOut, seconds: 90 },
    ],
  },
];

/** Become's morning practice: two minutes of Heart, then the theater of the mind. Free. */
export const ARRIVE: Practice = {
  id: 'arrive',
  feeling: 'Arriving',
  name: 'Arrive',
  line: 'Two minutes of slow breathing, then see yourself in one moment of today.',
  why: 'Seeing yourself act as the person you are becoming makes it easier to be them.',
  source:
    'Maxwell Maltz, Psycho-Cybernetics, the theater of the mind; Joe Dispenza, mental rehearsal',
  minutes: 3,
  free: true,
  steps: [
    { kind: 'breath', pattern: { kind: 'heart' }, seconds: 120 },
    { kind: 'voice', line: 'arrive.see', text: 'See yourself in one ordinary moment of today.' },
    { kind: 'breath', pattern: { kind: 'heart' }, seconds: 30 },
    { kind: 'voice', line: 'arrive.feel', text: 'Feel it, as if it is already true.' },
    { kind: 'breath', pattern: { kind: 'heart' }, seconds: 30 },
  ],
};
