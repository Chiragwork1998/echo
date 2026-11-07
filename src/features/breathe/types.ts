export type Pattern =
  | { kind: 'sigh'; inhale: number; topUp: number; exhale: number }
  | {
      kind: 'paced';
      inhale: number;
      holdIn?: number;
      exhale: number;
      holdOut?: number;
      hum?: boolean;
    }
  | { kind: 'heart' }; // the person's own pace, in 40 percent and out 60 percent
export type Step =
  | { kind: 'breath'; pattern: Pattern; seconds: number; stretch?: boolean } // stretch takes up a longer chosen length
  | { kind: 'voice'; line: string; text: string } // spoken at the start of the next out breath; the breath goes on underneath
  | { kind: 'bell' }
  | { kind: 'fade'; seconds: number }; // the screen goes to black (Sleep)
export type Practice = {
  id: string;
  feeling: string; // "Anxious"
  name: string; // "Settle"
  line: string; // one sentence shown before it starts
  why: string; // why this helps, one or two sentences
  source: string; // "Kristin Neff, the self-compassion break"
  minutes: number; // default length
  free: boolean | { minutes: number[] };
  steps: Step[];
  afterUnsettled?: 'support';
};
