import { Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { OneLineLabel } from '@/components/OneLineLabel';

import { sessionCopy } from './sessionCopy';
import { useSkyInk } from './sky';
import type { SpeakView } from './SpeakPanel';

const SERIF = 'CormorantGaramond_500Medium';

/** The recording states that have something to say. The rest are the light, or nothing at all. */
export const VOICE_NOTES: readonly SpeakView[] = [
  'explain',
  'denied',
  'unavailable',
  'failed',
  'kept',
  'untranscribed',
  'transcribe_failed',
  'transcribe_unavailable',
];

const LINES: Partial<Record<SpeakView, string>> = {
  explain: sessionCopy.speak.explain,
  denied: sessionCopy.speak.denied,
  unavailable: sessionCopy.speak.unavailable,
  failed: sessionCopy.speak.failed,
  kept: sessionCopy.speak.kept,
  untranscribed: sessionCopy.transcribe.untranscribed,
  transcribe_failed: sessionCopy.transcribe.failed.server,
  transcribe_unavailable: sessionCopy.transcribe.unavailable,
};

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  const { text, shadow } = useSkyInk();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={styles.action}
    >
      <OneLineLabel
        variant="bodyL"
        serif
        maxFontSizeMultiplier={1.4}
        style={[styles.actionLabel, { color: text }, shadow]}
      >
        {label}
      </OneLineLabel>
    </Pressable>
  );
}

type Props = {
  view: SpeakView;
  onAllow: () => void;
  onSettings: () => void;
  onWrite: () => void;
  /** Try again, or turn a recording with no words yet into words. */
  onRetry: () => void;
  /** The sentence for the transcription states, from the failure's code. */
  line: string | null;
};

/**
 * What the microphone needs the person to know: why it asks, that it is off, that it could not
 * start. Plain words on the sky with one or two quiet actions, never a card.
 */
export function VoiceNote({ view, onAllow, onSettings, onWrite, onRetry, line }: Props) {
  const { text, shadow } = useSkyInk();
  return (
    <View style={styles.root} accessibilityLiveRegion="polite">
      <EchoText
        variant="bodyL"
        serif
        align="center"
        accessibilityRole="alert"
        maxFontSizeMultiplier={1.5}
        style={[styles.line, { color: text }, shadow]}
      >
        {line ?? LINES[view]}
      </EchoText>
      {view === 'explain' && <Action label={sessionCopy.speak.allow} onPress={onAllow} />}
      {view === 'denied' && <Action label={sessionCopy.speak.settings} onPress={onSettings} />}
      {view === 'untranscribed' && (
        <Action label={sessionCopy.transcribe.action} onPress={onRetry} />
      )}
      {view === 'transcribe_failed' && (
        <Action label={sessionCopy.errors.retry} onPress={onRetry} />
      )}
      <Action label={sessionCopy.speak.writeInstead} onPress={onWrite} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 4, paddingHorizontal: 40 },
  line: { fontFamily: SERIF, fontSize: 20, lineHeight: 27 },
  action: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontFamily: SERIF, fontSize: 21, lineHeight: 27, textDecorationLine: 'underline' },
});
