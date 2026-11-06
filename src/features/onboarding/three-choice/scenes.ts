import type { Horizon, Mode } from '@/state/onboarding';

export type Point = { x: number; y: number };

// Everything here was measured from the Night and Day goldens, which agree to under a point, in the
// 393 x 852 reference viewport. usePlatePoint maps the anchors onto the real screen.

export type ChoiceSpec<V extends string> = {
  value: V;
  /** Centre of the ring on the plate. */
  ring: Point;
  /** Words on the first line of the detail, where the golden breaks it. Unset keeps one line. */
  detailBreak?: number;
  /** Voice only: where a second stem drops onto the path, and the path's centre line to light. */
  path?: { stemEnd: number; line: readonly Point[] };
};

export type Scene<V extends string> = {
  /** Outer diameter of the idle ring. The golden's Voice rings are a little larger than Horizon's. */
  ring: number;
  /** Text sizes in points. The goldens set Horizon's text smaller than Voice's. */
  type: { title: number; detail: number; detailLine: number };
  choices: readonly ChoiceSpec<V>[];
};

export const HORIZON_VALUES = ['past', 'present', 'future'] as const satisfies readonly Horizon[];
export const VOICE_VALUES = ['guide', 'space', 'speak'] as const satisfies readonly Mode[];

const p = (x: number, y: number): Point => ({ x, y });

export const HORIZON_SCENE: Scene<Horizon> = {
  ring: 11.2,
  type: { title: 15.4, detail: 9.6, detailLine: 12.5 },
  choices: [
    { value: 'past', ring: p(60, 400.5), detailBreak: 3 },
    { value: 'present', ring: p(196.5, 400.5) },
    { value: 'future', ring: p(334.25, 400.5), detailBreak: 3 },
  ],
};

export const VOICE_SCENE: Scene<Mode> = {
  ring: 12.6,
  type: { title: 17.2, detail: 10.5, detailLine: 13 },
  choices: [
    {
      value: 'guide',
      ring: p(66.1, 400),
      detailBreak: 2,
      path: {
        stemEnd: 514,
        line: [
          p(66.2, 508.5),
          p(59, 517),
          p(57.2, 523.1),
          p(63, 530),
          p(74, 536.5),
          p(92.5, 540.5),
          p(113, 552),
          p(124, 560.5),
          p(126.5, 571),
          p(119.5, 581),
          p(107.5, 590),
          p(110.5, 597),
          p(123.5, 605),
          p(139.6, 610),
          p(150, 618),
          p(165.5, 625),
          p(186.7, 638.5),
          p(198, 651),
          p(209, 661),
          p(221.5, 673),
          p(234.7, 688.5),
          p(243, 702),
        ],
      },
    },
    {
      value: 'space',
      ring: p(197.25, 402.25),
      path: {
        stemEnd: 514,
        line: [
          p(192, 517),
          p(203, 525),
          p(219, 535.5),
          p(221.8, 538.4),
          p(218.1, 545.5),
          p(209, 551.4),
          p(197.5, 556.5),
          p(189.4, 563.5),
          p(183.6, 571.8),
          p(183, 583),
          p(190.9, 586.5),
          p(202.5, 594.5),
          p(221.1, 602.5),
          p(230.5, 606.5),
          p(244, 618),
          p(251, 627.5),
          p(254.5, 644.5),
          p(263, 653.5),
        ],
      },
    },
    {
      value: 'speak',
      ring: p(326.25, 401.75),
      detailBreak: 2,
      path: {
        stemEnd: 523,
        line: [
          p(326, 523),
          p(330, 536),
          p(321.8, 544.5),
          p(315.5, 552),
          p(298.8, 561),
          p(286, 570.5),
          p(282.5, 575.5),
          p(279, 584),
          p(270.5, 595.6),
          p(259.5, 610.5),
          p(254.9, 623.1),
          p(250, 630),
        ],
      },
    },
  ],
};

/** Splits a detail line where the golden does, so the two lines balance as drawn. */
export function breakDetail(detail: string, wordsInFirstLine?: number): string {
  if (!wordsInFirstLine) return detail;
  const words = detail.split(' ');
  return `${words.slice(0, wordsInFirstLine).join(' ')}\n${words.slice(wordsInFirstLine).join(' ')}`;
}
