import { useWindowDimensions } from 'react-native';

const CTA_MAX_WIDTH = 382;
const TABLET_COLUMN = 430;

/** Responsive rules from product-handoff/specs/RESPONSIVE_ACCESSIBILITY.md. */
export function useLayout() {
  const { width: screenWidth, height, fontScale } = useWindowDimensions();
  const width = Math.min(screenWidth, TABLET_COLUMN);
  const compact = width < 375 || height < 800;
  const large = !compact && (width >= 415 || height > 900);
  const gutter = compact ? 20 : large ? 28 : 24;
  return {
    width,
    height,
    gutter,
    compact,
    large,
    ctaWidth: Math.min(width - gutter * 2, CTA_MAX_WIDTH),
    /** 125-200% text: screens switch to the scrolling accessible layout. */
    accessibleLayout: fontScale >= 1.25,
  };
}
