/**
 * Reference geometry for the onboarding screens, measured from
 * `product-handoff/golden/{day,night}` at the 393 x 852 reference viewport.
 *
 * All values are logical points in the golden's screen frame. Screens apply
 * `useEchoInsets()` so the same numbers reproduce the golden composition on a
 * 393 x 852 preview and shift with the real safe area on device.
 */
export const FRAME = { width: 393, height: 852 } as const;

export const HEADER = {
  /** Distance from the safe-area top to the header box. */
  topOffset: 2,
  height: 44,
  backGlyph: { width: 9.5, height: 17, strokeWidth: 1.6, left: 24 },
  /**
   * The golden wordmark measures 98 pt wide with a 17.4 pt cap height, which is
   * a 26 pt New York / Cormorant cap with 9 pt tracking — not 28 / 12.
   */
  wordmark: { size: 26, tracking: 9, lineHeight: 32, nudgeY: 0 },
  rule: { width: 21, height: 1.6, offsetY: 0, opacity: 0.78 },
  progress: {
    right: 21.3,
    labelSize: 10,
    labelLineHeight: 13,
    labelTop: 1.4,
    /**
     * Eight equal segments read from the golden header ruler, which measures
     * ~90 pt of track ending at the 21.3 pt right inset: 8 pt segments with a
     * 4 pt gap. No segment is widened, so the track never reaches the wordmark.
     */
    segmentWidth: 8,
    segmentHeight: 3,
    segmentGap: 4,
    trackGap: 6.8,
  },
} as const;

export const HERO = {
  /**
   * Cap tops measured from the top of the screen in the golden plates. The
   * title, subtitle and body bands sit 13 pt lower than the first pass because
   * the plate's status-bar region is 59 pt, not 30 pt.
   */
  titleCapTop: 144,
  title: { size: 32, lineHeight: 36, tracking: -0.2, capTopOffset: 5.5 },
  /** Subtitle cap top for a one-line title. */
  subtitleCapTop: 184.8,
  /** Subtitle cap top for a two-line title (Horizon and Voice). */
  subtitleCapTopTwoLine: 219.4,
  subtitle: { size: 16, lineHeight: 22, capTopOffset: 5 },
} as const;

export const CTA = {
  height: 56,
  maxWidth: 345,
  radius: 28,
  /** Gap between the safe-area bottom and the primary action. */
  bottomInsetOffset: 16,
  gutter: 24,
  label: { size: 15, tracking: 0.2, lineHeight: 20 },
  arrow: { width: 22, height: 16, strokeWidth: 1.5, gap: 10 },
} as const;

/** Intent (01) choice markers sit on a hand-placed trail. */
export const INTENT_CHOICES = [
  { id: 'quiet_noise', label: 'Quiet the noise', center: { x: 64.4, y: 413.4 } },
  { id: 'understand_self', label: 'Understand myself', center: { x: 193.8, y: 492 } },
  { id: 'hold_moments', label: 'Hold onto moments', center: { x: 59.8, y: 586.4 } },
  { id: 'find_direction', label: 'Find my direction', center: { x: 266.9, y: 668.8 } },
] as const;

/** Decorative dotted trail, traced through the four Intent marker centres. */
export const INTENT_TRAIL = [
  'M 64.4 413.4',
  'C 78 437, 112 465, 140 475',
  'C 162 483, 180 488, 193.8 492',
  'C 216 521, 208 537, 186 549',
  'C 158 564, 92 569, 59.8 586.4',
  'C 34 601, 60 619, 118 630',
  'C 172 639, 238 649, 266.9 668.8',
].join(' ');

export const INTENT_MARKER = { ringSize: 22, ringStroke: 2, selectedRing: 30, selectedStroke: 2, core: 18 };

/** Horizon (02) and Voice (03) columns. */
export const COLUMN = {
  markerCenterY: 409.8,
  markerSize: 22,
  markerStroke: 2,
  selectedCore: 18,
  connector: { width: 1, height: 24.6, gap: 1.4, color: 'rgba(255,249,239,0.74)' },
  label: { size: 18, lineHeight: 22, topOffset: 1.5 },
  subtitle: { size: 12, lineHeight: 15.5, topOffset: 1 },
} as const;
