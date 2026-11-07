import { Pressable, StyleSheet, View } from 'react-native';

import { OneLineLabel } from '@/components/OneLineLabel';
import { OnboardingHeading } from '@/components/OnboardingHeading';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { SupportPanel } from '@/features/patterns/SupportPanel';
import { useSkyInk } from '@/features/journal-session/sky';

import { breatheCopy } from './breatheCopy';
import type { Feeling } from './feelingStore';

const FEELINGS: Feeling[] = ['calmer', 'same', 'unsettled'];
const HEADING_TOP = 120;

/** A quiet word to tap, low on the sky: the session's controls are drawn the same way. */
function QuietWord(props: {
  label: string;
  onPress: () => void;
  strong?: boolean;
  testID?: string;
}) {
  const ink = useSkyInk();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.word, pressed && styles.pressed]}
      testID={props.testID}
    >
      <OneLineLabel
        variant="bodyL"
        serif
        style={[styles.wordText, { color: props.strong ? ink.text : ink.quiet }, ink.shadow]}
      >
        {props.label}
      </OneLineLabel>
    </Pressable>
  );
}

/** "How do you feel now?" Three quiet answers, or skip. One tap, and it is gone. */
export function FeelingCheck({ onAnswer }: { onAnswer: (feeling: Feeling | null) => void }) {
  return (
    <View>
      <OnboardingHeading title={breatheCopy.check.title} top={HEADING_TOP} />
      <View style={styles.answers} accessibilityRole="radiogroup">
        {FEELINGS.map((feeling) => (
          <QuietWord
            key={feeling}
            label={breatheCopy.check.choices[feeling]}
            onPress={() => onAnswer(feeling)}
            strong
            testID={`feeling-check-${feeling}`}
          />
        ))}
      </View>
      <View style={styles.skip}>
        <QuietWord
          label={breatheCopy.check.skip}
          onPress={() => onAnswer(null)}
          testID="feeling-check-skip"
        />
      </View>
    </View>
  );
}

type ActionsProps = {
  /** "If you are struggling", offered after Ground or Soothe when the person is still unsettled. */
  support: boolean;
  onCloseSupport: () => void;
  onEcho: () => void;
  onMore: () => void;
  onDone: () => void;
};

/** Then: into today's journal, one more minute, or done. */
export function AfterActions({ support, onCloseSupport, onEcho, onMore, onDone }: ActionsProps) {
  return (
    <View style={styles.after}>
      {support && (
        <View style={styles.support}>
          <SupportPanel onClose={onCloseSupport} />
        </View>
      )}
      <View style={styles.actions}>
        <PrimaryCTA label={breatheCopy.actions.echo} onPress={onEcho} arrow />
        <View style={styles.quiet}>
          <QuietWord label={breatheCopy.actions.more} onPress={onMore} testID="after-more" />
          <QuietWord label={breatheCopy.actions.done} onPress={onDone} testID="after-done" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  answers: { marginTop: 28, alignItems: 'center', gap: 4 },
  skip: { marginTop: 18, alignItems: 'center' },
  word: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  wordText: {
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: 0.5,
  },
  after: { flex: 1, justifyContent: 'flex-end' },
  support: { marginBottom: 20 },
  actions: { gap: 10 },
  quiet: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18 },
});
