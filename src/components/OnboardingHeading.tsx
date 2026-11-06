import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';

import { EchoText } from './EchoText';
import { SoftScrim } from './SoftScrim';

// Measured from the goldens, and shared by the onboarding steps.
const TITLE_TOP = 34;
const SUBTITLE = {
  fontFamily: 'Inter_300Light',
  fontSize: 14.1,
  lineHeight: 20,
  marginTop: 5,
  opacity: 0.86,
};
// On compact phones the cover crop lifts the scenery, so the heading rises with it.
const COMPACT_LIFT = 14;
// The Day plates put cloud and glare behind headings, unlike the goldens' skies. A feathered patch
// keeps them legible without darkening the screen. Night's sky needs none.
const DAY_SCRIM_ALPHA = 0.3;
const SCRIM_INSET = { x: 28, top: 14, bottom: 20 };
const SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.32)',
  textShadowRadius: 10,
  textShadowOffset: { width: 0, height: 1 },
} as const;

type Props = {
  title: string;
  subtitle?: string;
  /** Override for a screen-specific fit, such as keeping one line on narrow phones. */
  titleStyle?: StyleProp<TextStyle>;
  /** Space above the title, for goldens that sit lower or higher than the default. */
  top?: number;
};

/** Title and subtitle at the top of an onboarding step. */
export function OnboardingHeading({ title, subtitle, titleStyle, top = TITLE_TOP }: Props) {
  const { name } = useTheme();
  const { compact } = useLayout();
  return (
    <View style={{ marginTop: compact ? top - COMPACT_LIFT : top }}>
      {name === 'day' && (
        <View pointerEvents="none" style={styles.scrim}>
          <SoftScrim alpha={DAY_SCRIM_ALPHA} />
        </View>
      )}
      <EchoText
        variant="displayM"
        align="center"
        accessibilityRole="header"
        style={[SHADOW, titleStyle]}
      >
        {title}
      </EchoText>
      {subtitle && (
        <EchoText variant="bodyM" color="textSecondary" align="center" style={[SUBTITLE, SHADOW]}>
          {subtitle}
        </EchoText>
      )}
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
