import { StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { SoftScrim } from '@/components/SoftScrim';
import type { fontMap } from '@/design/fonts';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';

// This step's golden sets its heading larger than the other steps: the title about 43 pt across
// 286 pt, the subtitle about 16.5 pt. OnboardingHeading cannot take a subtitle size (Lead request).
const TITLE = { size: 43.3, line: 48, top: 16.5 };
// The golden's words sit about 2 pt right of the screen's centre.
const CENTRE_SHIFT = 4;
/** Width of "Arrive as you are." in ems, so a narrow phone sets it smaller instead of wrapping. */
const TITLE_WIDTH_EM = 6.61;
const SUBTITLE_FONT: keyof typeof fontMap = 'Inter_300Light';
const SUBTITLE = { size: 16.5, line: 22, gap: 8, opacity: 0.88 };
const COMPACT_LIFT = 14;
// The Day plate puts cloud and glare behind the heading. See OnboardingHeading.
const DAY_SCRIM_ALPHA = 0.3;
const SCRIM_INSET = { x: 28, top: 14, bottom: 20 };
const SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.32)',
  textShadowRadius: 10,
  textShadowOffset: { width: 0, height: 1 },
} as const;

type Props = { title: string; subtitle: string };

/** Title and subtitle of the Arrival step. */
export function ArrivalHeading({ title, subtitle }: Props) {
  const { name } = useTheme();
  const { compact, accessibleLayout, width, gutter } = useLayout();
  // The title fits one line at the golden's size on a 393 pt phone. Narrower ones shrink it a little.
  // Large text wraps instead, in the scrolling layout.
  const fit = Math.floor(((width - gutter * 2) * 0.99 * 10) / TITLE_WIDTH_EM) / 10;
  const size = accessibleLayout ? TITLE.size : Math.min(TITLE.size, fit);
  return (
    <View
      style={{
        marginTop: compact ? TITLE.top - COMPACT_LIFT : TITLE.top,
        paddingLeft: CENTRE_SHIFT,
      }}
    >
      {name === 'day' && (
        <View pointerEvents="none" style={styles.scrim}>
          <SoftScrim alpha={DAY_SCRIM_ALPHA} />
        </View>
      )}
      <EchoText
        variant="displayM"
        align="center"
        accessibilityRole="header"
        style={[SHADOW, { fontSize: size, lineHeight: size * (TITLE.line / TITLE.size) }]}
      >
        {title}
      </EchoText>
      <EchoText
        variant="bodyM"
        color="textSecondary"
        align="center"
        style={[
          SHADOW,
          {
            opacity: SUBTITLE.opacity,
            fontFamily: SUBTITLE_FONT,
            fontSize: SUBTITLE.size,
            lineHeight: SUBTITLE.line,
            marginTop: SUBTITLE.gap,
          },
        ]}
      >
        {subtitle}
      </EchoText>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: -SCRIM_INSET.x,
    right: -SCRIM_INSET.x,
    top: -SCRIM_INSET.top,
    bottom: -SCRIM_INSET.bottom,
  },
});
