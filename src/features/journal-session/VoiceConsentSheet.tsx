import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EchoModal } from '@/components/EchoModal';
import { EchoText } from '@/components/EchoText';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { parseColor } from '@/design/mixColor';
import { tokens } from '@/design/tokens';
import { useTone } from '@/features/onboarding/rhythm/tone';

import { sessionCopy } from './sessionCopy';

/**
 * 'voice' is the question before any voice is sent. 'live' is the first time Show words is turned
 * on, which streams the voice while it is spoken and says so (docs/OWNER_DECISIONS.md, D-008).
 */
export type ConsentKind = 'voice' | 'live';

type Props = {
  visible: boolean;
  kind?: ConsentKind;
  /** Allow: this voice, and the ones after it, may be sent. For 'live': Show words. */
  onAllow: () => void;
  /** Keep my voice only: recordings stay on this phone and are never sent. For 'live': keep words hidden. */
  onKeep: () => void;
  /**
   * The system Back button. The sheet cannot be waved away by touching outside it, and nothing is
   * sent unless Allow is chosen, so closing it decides nothing and the question comes back.
   */
  onClose: () => void;
};

/**
 * What leaves the phone, in plain words, with two equal choices. It is a sheet over the session
 * rather than a screen, so the person never loses their place. Used before the first upload and
 * again from You.
 */
/** The same colour, with no opacity: the far end of a fade into it. */
function clear(color: string) {
  const rgba = parseColor(color);
  return rgba ? `rgba(${rgba[0]},${rgba[1]},${rgba[2]},0)` : 'transparent';
}

/** How much text below the window still counts as "more to read", in points. */
const MORE_BELOW = 12;

export function VoiceConsentSheet({ visible, kind = 'voice', onAllow, onKeep, onClose }: Props) {
  const tone = useTone();
  // The facts scroll above the two choices, which stay in view. A person is told there is more: the
  // scrollbar is always drawn, and the foot of the text fades while something is left below it.
  const [window, setWindow] = useState({ height: 0, content: 0, offset: 0 });
  const more = window.content - (window.offset + window.height) > MORE_BELOW;
  const { title, intro, facts, allow, keep, note } =
    kind === 'live' ? sessionCopy.liveConsent : sessionCopy.consent;
  return (
    <EchoModal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.sheet, { backgroundColor: tone.sheet, borderColor: tone.edge }]}
        >
          <View style={styles.scrollArea}>
            <ScrollView
              testID="consent-scroll"
              style={styles.scroll}
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator
              persistentScrollbar
              scrollEventThrottle={16}
              onLayout={(event) => {
                const { height } = event.nativeEvent.layout;
                setWindow((now) => ({ ...now, height }));
              }}
              onContentSizeChange={(_, content) => setWindow((now) => ({ ...now, content }))}
              onScroll={(event) => {
                const offset = event.nativeEvent.contentOffset.y;
                setWindow((now) => ({ ...now, offset }));
              }}
            >
              <EchoText
                variant="displayM"
                accessibilityRole="header"
                style={{ color: tone.ink }}
                maxFontSizeMultiplier={1.5}
              >
                {title}
              </EchoText>
              <EchoText variant="bodyM" style={{ color: tone.inkSoft }} maxFontSizeMultiplier={1.5}>
                {intro}
              </EchoText>
              <View style={styles.facts}>
                {facts.map((fact) => (
                  <View key={fact} style={styles.fact}>
                    <View style={[styles.dot, { backgroundColor: tone.gold }]} />
                    <EchoText
                      variant="bodyM"
                      style={[styles.factText, { color: tone.ink }]}
                      maxFontSizeMultiplier={1.5}
                    >
                      {fact}
                    </EchoText>
                  </View>
                ))}
              </View>
              <EchoText
                variant="caption"
                style={{ color: tone.inkSoft }}
                maxFontSizeMultiplier={1.5}
              >
                {note}
              </EchoText>
            </ScrollView>
            {more && (
              <LinearGradient
                testID="consent-more"
                pointerEvents="none"
                colors={[clear(tone.sheet), tone.sheet]}
                style={styles.fade}
              />
            )}
          </View>
          <View style={styles.choices}>
            <PrimaryCTA label={allow} onPress={onAllow} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={keep}
              onPress={onKeep}
              style={({ pressed }) => [
                styles.keep,
                { borderColor: tone.edge, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <EchoText variant="label" style={{ color: tone.ink }} maxFontSizeMultiplier={1.4}>
                {keep.toUpperCase()}
              </EchoText>
            </Pressable>
          </View>
        </View>
      </View>
    </EchoModal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,11,22,0.5)' },
  sheet: {
    margin: tokens.space[12],
    marginBottom: tokens.space[32],
    maxHeight: '86%',
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    paddingVertical: tokens.space[16],
  },
  // Shrinks to the sheet's height, and carries the fade over its own foot.
  scrollArea: { flexShrink: 1 },
  scroll: { flexGrow: 0 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 48 },
  body: { gap: tokens.space[12], paddingHorizontal: tokens.space[24] },
  facts: { gap: tokens.space[12], paddingVertical: tokens.space[8] },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space[12] },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 9 },
  factText: { flex: 1 },
  choices: {
    alignItems: 'center',
    gap: tokens.space[12],
    paddingHorizontal: tokens.space[24],
    paddingTop: tokens.space[16],
  },
  keep: {
    minHeight: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: tokens.space[16],
  },
});
