import { useWindowDimensions } from 'react-native';

const CTA_MAX_WIDTH = 382;
const TABLET_COLUMN = 430;
/**
 * The widest a phone gets. The largest iPhones are 440 pt, a little past the 430 pt column, and they
 * are phones: their photograph still frames the scenery as drawn. Anything wider is a tablet or an
 * unfolded foldable, whose crop would carry the scenery controls off the rocks and the river.
 */
const PHONE_MAX_WIDTH = 440;

/** Responsive rules from product-handoff/specs/RESPONSIVE_ACCESSIBILITY.md. */
export function useLayout() {
  const { width: screenWidth, height, fontScale } = useWindowDimensions();
  const width = Math.min(screenWidth, TABLET_COLUMN);
  const compact = width < 375 || height < 800;
  const large = !compact && (width >= 415 || height > 900);
  const gutter = compact ? 20 : large ? 28 : 24;
  const landscape = screenWidth > height;
  const accessibleLayout = fontScale >= 1.25;
  return {
    width,
    height,
    gutter,
    compact,
    large,
    ctaWidth: Math.min(width - gutter * 2, CTA_MAX_WIDTH),
    landscape,
    /** 125-200% text: screens switch to the scrolling accessible layout. */
    accessibleLayout,
    /**
     * Whether controls may be pinned to the portrait photograph: a phone held upright at normal text
     * size. Intent, Horizon, Voice and Arrival fall back to their lists when this is false. The plate
     * itself always fills the screen.
     */
    sceneryFits: !accessibleLayout && !landscape && screenWidth <= PHONE_MAX_WIDTH,
  };
}
