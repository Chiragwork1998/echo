import { StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { SoftScrim } from '@/components/SoftScrim';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';

import { LIGHT_SANS, LIGHT_SERIF } from './fonts';

// Measured from the golden. This step sets its title larger and its subtitle a little larger and
// brighter than the shared heading does, so it has its own. Day's scrim is the shared one.
const TOP = 41.4;
const COMPACT_LIFT = 14;
const TITLE = { fontFamily: LIGHT_SERIF, fontSize: 40, lineHeight: 38 } as const;
// The golden breaks after "space". At large text the title simply wraps.
const TITLE_MAX_WIDTH = 280;
const SUBTITLE = {
  fontFamily: LIGHT_SANS,
  fontSize: 14.9,
  lineHeight: 20,
  marginTop: 11,
  opacity: 0.95,
} as const;
const DAY_SCRIM_ALPHA = 0.3;
const SCRIM_INSET = { x: 28, top: 14, bottom: 20 };
const SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.32)',
  textShadowRadius: 10,
  textShadowOffset: { width: 0, height: 1 },
} as const;

export function CompletionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  const { name } = useTheme();
  const { compact, accessibleLayout } = useLayout();
  return (
    <View style={{ marginTop: compact ? TOP - COMPACT_LIFT : TOP }}>
      {name === 'day' && (
        <View pointerEvents="none" style={styles.scrim}>
          <SoftScrim alpha={DAY_SCRIM_ALPHA} />
        </View>
      )}
      <EchoText
        variant="displayM"
        align="center"
        accessibilityRole="header"
        style={[
          SHADOW,
          TITLE,
          { alignSelf: 'center', maxWidth: accessibleLayout ? undefined : TITLE_MAX_WIDTH },
        ]}
      >
        {title}
      </EchoText>
      <EchoText variant="bodyM" color="textSecondary" align="center" style={[SHADOW, SUBTITLE]}>
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
