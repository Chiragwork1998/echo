import { Pressable, StyleSheet } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { copy } from '@/content/copy';
import { tokens } from '@/design/tokens';

import { Glass } from './Glass';
import type { ClockText } from './time';
import { useTone } from './tone';

/**
 * Large text and landscape replace the dial with this: the time in display type on glass, which
 * opens the native picker. The same choice, without a drag.
 */
export function TimeButton({ clock, onPress }: { clock: ClockText; onPress: () => void }) {
  const tone = useTone();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={clock.spoken} onPress={onPress}>
      <Glass
        radius={tokens.radius.large}
        fill={tone.dial}
        edge={tone.rim}
        contentStyle={styles.body}
      >
        <EchoText variant="displayL" serif align="center" style={{ color: tone.ink }}>
          {clock.main}
          {clock.period ? (
            <EchoText variant="displayM" serif style={{ color: tone.ink }}>
              {` ${clock.period}`}
            </EchoText>
          ) : null}
        </EchoText>
        <EchoText
          variant="caption"
          align="center"
          style={[styles.caption, { color: tone.inkSoft }]}
        >
          {copy.rhythm.dialCaption.toUpperCase()}
        </EchoText>
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: tokens.space[8], paddingVertical: tokens.space[24] },
  caption: { letterSpacing: 2.4 },
});
