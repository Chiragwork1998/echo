import { useEffect, useRef, type ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { keepTogether } from '@/features/tab-pages/keepTogether';
import { Rule, Surface, TextAction } from '@/features/tab-pages/parts';
import { detail, prose, question, supporting } from '@/features/tab-pages/textStyles';

import { patternsCopy } from './patternsCopy';

type Props = {
  /** How many entries this reading will send. */
  count: number;
  onAgree: () => void;
  onDecline: () => void;
};

const DOT = 5;

/**
 * Asked once, before the first reading, and again if the wording ever changes. It cannot be skipped:
 * nothing is sent until the person agrees, and "Not now" sends nothing. Plain facts only, set as a
 * short list with small marks, as the voice consent sets its own. Working copy: the owner approves
 * the wording before release.
 */
export function ConsentPanel({ count, onAgree, onDecline }: Props) {
  const { colors } = useTheme();
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
    <View style={styles.root}>
      <Surface strength="strong" radius={tokens.radius.card}>
        <View style={styles.panel}>
          <View
            ref={title}
            accessible
            accessibilityRole="header"
            accessibilityLabel={consent.title}
          >
            <EchoText variant="bodyL" style={question} maxFontSizeMultiplier={1.5}>
              {keepTogether(consent.title)}
            </EchoText>
          </View>
          <EchoText variant="bodyM" color="textSecondary" style={prose} maxFontSizeMultiplier={1.6}>
            {keepTogether(consent.lead)}
          </EchoText>
          <View
            style={styles.sends}
            accessible
            accessibilityLabel={`${consent.sends(count)} ${consent.limit}`}
          >
            <EchoText variant="bodyM" style={prose} maxFontSizeMultiplier={1.6}>
              {consent.sends(count)}
            </EchoText>
            <EchoText
              variant="caption"
              color="textSecondary"
              style={supporting}
              maxFontSizeMultiplier={1.6}
            >
              {keepTogether(consent.limit)}
            </EchoText>
          </View>
          <Rule inset={0} />
          <View style={styles.facts}>
            {consent.facts.map((fact) => (
              <View key={fact} style={styles.fact} accessible accessibilityLabel={fact}>
                <View style={[styles.dot, { backgroundColor: colors.accentWarm }]} />
                <EchoText
                  variant="bodyM"
                  style={[detail, styles.factText]}
                  maxFontSizeMultiplier={1.6}
                >
                  {keepTogether(fact)}
                </EchoText>
              </View>
            ))}
          </View>
        </View>
      </Surface>
      <View style={styles.choices}>
        <PrimaryCTA label={consent.agree} onPress={onAgree} />
        <TextAction label={consent.notNow} onPress={onDecline} style={styles.decline} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: tokens.space[16] },
  panel: {
    gap: tokens.space[16],
    paddingHorizontal: tokens.space[24],
    paddingTop: tokens.space[24],
    paddingBottom: tokens.space[24],
  },
  sends: { gap: tokens.space[4] },
  facts: { gap: tokens.space[12] },
  fact: { flexDirection: 'row', gap: tokens.space[12], alignItems: 'flex-start' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginTop: 8 },
  factText: { flex: 1 },
  choices: { alignItems: 'center', gap: tokens.space[4] },
  decline: { alignSelf: 'center', paddingHorizontal: tokens.space[16] },
});
