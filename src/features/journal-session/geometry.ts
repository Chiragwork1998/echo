// Measured from product-handoff/golden/{day,night}/07-first-echo.png, normalised to the 393 x 852
// reference (1 pt = 2 px). The goldens win over the handoff's written sizes (docs/SPEC_CONFLICTS.md).

/** Wordmark, rule and the progress beneath it, from the top of the header. */
export const HEADER_HEIGHT = 74;
export const PROGRESS = { width: 12, height: 3, gap: 3.5, top: 69.7 };
/** The ring measures 47 pt across in the golden. The spec's 52 pt would ghost in the overlay. */
export const TIMER = { size: 47, stroke: 1.25, right: -9.5, top: 2 };

/** Space between the header and the title, and the title and the surface. */
export const TITLE_TOP = 28;
export const TITLE_SIZE = 34.2;
export const TITLE_LINE = 34;
export const TITLE_GAP = 25;

/** Surface and segmented control sit 30 pt from the screen edge: the gutter plus this. */
export const SURFACE_INSET = 6;
export const SURFACE_RADIUS = 20;
export const SURFACE_MIN_HEIGHT = 280;
/** With the keyboard up the page gives way to the controls, and scrolls inside. */
export const SURFACE_KEYBOARD_MIN_HEIGHT = 120;

export const CONTROL = { height: 52, gap: 6, radius: 12, rim: 2.5, marginTop: 24, lead: 2 };
/** The caption sits 21 pt under the control. The slot ends where the CTA begins. */
export const NOTICE = { slot: 95, compactSlot: 44, top: 21 };
export const CAPTION = { size: 10.5, tracking: 1.6 };
export const CTA_FOOTER = 18;
/** Clear space kept between the CTA and the top of the keyboard. */
export const KEYBOARD_GAP = 12;
/** Keyboard height at which the title has fully folded away. */
export const KEYBOARD_FOLD = 120;

export const SESSION_SECONDS = 7 * 60;

export const formatClock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
