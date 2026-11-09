import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useScreenReader } from '@/features/journal-session/useScreenReader';
import { keepTogether } from '@/features/tab-pages/keepTogether';
import { Rule, TextAction } from '@/features/tab-pages/parts';
import { detail, prose, question, supporting } from '@/features/tab-pages/textStyles';

import { patternsCopy } from './patternsCopy';

const DOT = 5;

/**
 * Asked once, before the first reading, and again if the wording ever changes. It cannot be skipped:
 * nothing is sent until the person agrees, and "Not now" sends nothing. Plain facts only, set as a
 * short list with small marks, as the voice consent sets its own. Working copy: the owner approves
 * the wording before release.
 *
 * These are its words, for the strong glass of the panel it is a face of (see PanelSwap), and
 * ConsentChoices its two answers, under the glass.
 */
export function ConsentWords({ count }: { count: number }) {
  const { colors } = useTheme();
  const title = useRef<ComponentRef<typeof View>>(null);
  const screenReader = useScreenReader();
  const [placed, setPlaced] = useState(false);
  const moved = useRef(false);

  // Moves a screen reader to the heading when the panel appears, so the facts are heard first. Asked
  // for once the heading has been laid out, and a frame after that: an effect of the commit that adds
  // the panel runs before the phone has made its views, and a request for a view it does not have yet
  // goes nowhere (Android logs it: "Unable to find viewState for tag", the walk, v11). Never asked
  // without a screen reader, where it has nobody to move.
  useEffect(() => {
    if (!placed || !screenReader || moved.current) return;
    const frame = requestAnimationFrame(() => {
      moved.current = true;
      try {
        const node = findNodeHandle(title.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      } catch {
        // Nothing to focus on this platform.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [placed, screenReader]);

  const { consent } = patternsCopy;
  return (
    <View style={styles.panel}>
      <View
        ref={title}
        accessible
        accessibilityRole="header"
        accessibilityLabel={consent.title}
        onLayout={placed ? undefined : () => setPlaced(true)}
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
      <ConsentFacts mark={colors.accentWarm} />
    </View>
  );
}

/**
 * The agreement's facts, a short list with small marks: on the glass in Patterns, and on a sheet's
 * cloth on Completion, where `ink` is the sheet's. The same facts wherever it is asked.
 */
export function ConsentFacts({ mark, ink }: { mark: string; ink?: string }) {
  return (
    <View style={styles.facts}>
      {patternsCopy.consent.facts.map((fact) => (
        <View key={fact} style={styles.fact} accessible accessibilityLabel={fact}>
          <View style={[styles.dot, { backgroundColor: mark }]} />
          <EchoText
            variant="bodyM"
            style={[detail, styles.factText, ink ? { color: ink } : null]}
            maxFontSizeMultiplier={1.6}
          >
            {keepTogether(fact)}
          </EchoText>
        </View>
      ))}
    </View>
  );
}

/** The consent's two answers: agree and read, or not now, which sends nothing. */
export function ConsentChoices({
  onAgree,
  onDecline,
}: {
  onAgree: () => void;
  onDecline: () => void;
}) {
  const { consent } = patternsCopy;
  return (
    <View style={styles.choices}>
      <PrimaryCTA label={consent.agree} onPress={onAgree} />
      <TextAction label={consent.notNow} onPress={onDecline} style={styles.decline} />
    </View>
  );
}

const styles = StyleSheet.create({
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
