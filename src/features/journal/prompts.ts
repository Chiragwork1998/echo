import type {
  HorizonSelection,
  IntentSelection,
  MoodSelection,
} from "@/state/onboardingSelections";

export type JournalPrompt = { id: string; text: string; opening: string };

export const FIRST_PROMPT: JournalPrompt = {
  id: "first_echo",
  text: "What are you carrying that no one can see?",
  opening: "You can begin with: “Today, I’m carrying…”",
};
export const BLANK_PROMPT: JournalPrompt = {
  id: "free_space",
  text: "A page that asks nothing of you.",
  opening: "A sentence, a list, a little of today. Begin anywhere.",
};
const PROMPTS: Record<IntentSelection, JournalPrompt[]> = {
  quiet_noise: [
    {
      id: "noise_1",
      text: "What can you put down for a moment?",
      opening: "One thing taking up room in my mind is…",
    },
    {
      id: "noise_2",
      text: "Where did you find a little quiet today?",
      opening: "Even for a moment, I felt…",
    },
    {
      id: "noise_3",
      text: "What needs your attention, and what can wait?",
      opening: "Right now, what matters most is…",
    },
  ],
  understand_self: [
    {
      id: "self_1",
      text: "What is asking for your attention?",
      opening: "I keep coming back to…",
    },
    {
      id: "self_2",
      text: "When did you feel most like yourself today?",
      opening: "There was a moment when…",
    },
    {
      id: "self_3",
      text: "What feeling have you not found words for yet?",
      opening: "If I’m honest, underneath it all…",
    },
  ],
  hold_moments: [
    {
      id: "moment_1",
      text: "What small moment would you like to keep?",
      opening: "I don’t want to forget…",
    },
    {
      id: "moment_2",
      text: "What ordinary thing felt different today?",
      opening: "Today, I noticed…",
    },
    {
      id: "moment_3",
      text: "Who or what made today a little warmer?",
      opening: "I felt a little warmth when…",
    },
  ],
  find_direction: [
    {
      id: "direction_1",
      text: "What is one small thing you can choose next?",
      opening: "A small step that feels possible is…",
    },
    {
      id: "direction_2",
      text: "What would you make room for if you could?",
      opening: "I would like more space for…",
    },
    {
      id: "direction_3",
      text: "What matters to you beneath the uncertainty?",
      opening: "Even without knowing everything, I know…",
    },
  ],
};

export function promptsFor(
  intent: IntentSelection | null,
  horizon: HorizonSelection,
): JournalPrompt[] {
  const prompts = PROMPTS[intent ?? "understand_self"];
  const horizonPrompt: JournalPrompt =
    horizon === "behind_me"
      ? {
          id: "horizon_past",
          text: "What would you tell the person you were then?",
          opening: "Looking back with a little kindness…",
        }
      : horizon === "ahead_of_me"
        ? {
            id: "horizon_future",
            text: "What do you hope your future self remembers?",
            opening: "When I look back on this season…",
          }
        : {
            id: "horizon_now",
            text: "What is true for you in this moment?",
            opening: "Right here, right now…",
          };
  return [...prompts, horizonPrompt];
}

export const MOODS: readonly { id: MoodSelection; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "steady", label: "Steady" },
  { id: "unsettled", label: "Unsettled" },
  { id: "heavy", label: "Heavy" },
  { id: "numb", label: "Numb" },
];

export function wordCount(text: string | null | undefined): number {
  return text?.trim() ? text.trim().split(/\s+/u).length : 0;
}

export function entryDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
