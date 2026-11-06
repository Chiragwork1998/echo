import { useEffect, useRef, type ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { tokens } from '@/design/tokens';

import { patternsCopy } from './patternsCopy';
import { QuietAction } from './QuietAction';

type Props = {
  /** How many entries this reading will send. */
  count: number;
  onAgree: () => void;
  onDecline: () => void;
};

/**
 * Asked once, before the first reading, and again if the wording ever changes. It cannot be skipped:
 * nothing is sent until the person agrees, and "Not now" sends nothing. Plain facts only. Working
 * copy: the owner approves the wording before release.
 */
export function ConsentPanel({ count, onAgree, onDecline }: Props) {
  const title = useRef<ComponentRef<typeof View>>(null);

  // Moves a screen reader to the heading when the panel appears, so the facts are heard first.
  useEffect(() => {
    try {
      const node = findNodeHandle(title.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    } catch {
      // Nothing to focus on this platform.
    }
  }, []);

  const { consent } = patternsCopy;
  return (
    <GlassCard radius={tokens.radius.medium} strength="strong">
      <View style={styles.panel}>
        <View ref={title} accessible accessibilityRole="header" accessibilityLabel={consent.title}>
          <EchoText variant="bodyL" serif style={styles.title}>
            {consent.title}
          </EchoText>
        </View>
        <EchoText variant="bodyM" color="textSecondary" style={styles.text}>
          {consent.lead}
        </EchoText>
        <View accessible accessibilityLabel={`${consent.sends(count)} ${consent.limit}`}>
          <EchoText variant="bodyM" style={styles.text}>
            {consent.sends(count)}
          </EchoText>
          <EchoText variant="caption" color="textSecondary" style={styles.small}>
            {consent.limit}
          </EchoText>
        </View>
        <View style={styles.facts}>
          {consent.facts.map((fact) => (
            <View key={fact} style={styles.fact} accessible accessibilityLabel={fact}>
              <EchoText variant="bodyM" color="textSecondary" accessibilityElementsHidden>
                ✦
              </EchoText>
              <EchoText variant="bodyM" style={styles.factText}>
                {fact}
              </EchoText>
            </View>
          ))}
        </View>
        <QuietAction flat label={consent.agree} onPress={onAgree} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={consent.notNow}
          onPress={onDecline}
          style={styles.decline}
        >
          <EchoText variant="label" color="textSecondary">
            {consent.notNow.toUpperCase()}
          </EchoText>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  panel: { padding: tokens.space[20], gap: tokens.space[16] },
  title: { fontSize: 26, lineHeight: 32 },
  text: { lineHeight: 24 },
  small: { marginTop: 4, fontSize: 12.5, lineHeight: 17, letterSpacing: 0.1 },
  facts: { gap: tokens.space[12] },
  fact: { flexDirection: 'row', gap: tokens.space[12], alignItems: 'flex-start' },
  factText: { flex: 1, lineHeight: 23 },
  decline: {
    minHeight: tokens.size.tapTarget,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[16],
  },
});
