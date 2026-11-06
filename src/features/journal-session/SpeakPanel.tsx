import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';

import { formatClock } from './geometry';
import { useSurfaceInk } from './GlassPanel';
import { sessionCopy } from './sessionCopy';

/** What the Speak surface is showing. The session decides, this only draws it. */
export type SpeakView =
  | 'ready'
  | 'starting'
  | 'recording'
  | 'saving'
  | 'recorded'
  | 'explain'
  | 'denied'
  | 'unavailable'
  | 'failed'
  | 'kept'
  /** Spoken words are on their way. The next take can already begin. */
  | 'listening'
  /** A recording is safe but has no words yet. */
  | 'untranscribed'
  | 'transcribe_failed'
  | 'transcribe_unavailable';

const STATUS: Record<SpeakView, string> = {
  ready: sessionCopy.speak.ready,
  starting: sessionCopy.speak.starting,
  recording: sessionCopy.speak.recording,
  saving: sessionCopy.speak.saving,
  recorded: sessionCopy.speak.recorded,
  explain: sessionCopy.speak.explain,
  denied: sessionCopy.speak.denied,
  unavailable: sessionCopy.speak.unavailable,
  failed: sessionCopy.speak.failed,
  kept: sessionCopy.speak.kept,
  listening: sessionCopy.transcribe.listening,
  untranscribed: sessionCopy.transcribe.untranscribed,
  // The session says why, from the failure's code. These are the fallbacks.
  transcribe_failed: sessionCopy.transcribe.failed.server,
  transcribe_unavailable: sessionCopy.transcribe.unavailable,
};
const CLOCK_VIEWS: SpeakView[] = ['recording', 'saving', 'recorded'];
const NO_BUTTON_VIEWS: SpeakView[] = ['explain', 'unavailable', 'failed', 'kept'];
const CREAM_STOPS = ['#FBF8F2', '#EDE6DC'] as const; // tokens.gradient.creamButton
const BUTTON = 76;
const BREATH_MS = 1200;

function RecordButton(props: { recording: boolean; disabled: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const breath = useSharedValue(0);
  const { recording, disabled, onPress } = props;

  useEffect(() => {
    if (!recording || reduceMotion) {
      cancelAnimation(breath);
      breath.set(0);
      return;
    }
    const ease = Easing.inOut(Easing.ease);
    breath.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: BREATH_MS, easing: ease }),
          withTiming(0, { duration: BREATH_MS, easing: ease }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(breath);
  }, [breath, recording, reduceMotion]);

  const ring = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.3 * breath.get(),
    transform: [{ scale: 1.1 + 0.1 * breath.get() }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={recording ? sessionCopy.speak.stop : sessionCopy.speak.record}
      accessibilityState={{ disabled }}
      style={[styles.buttonSlot, { opacity: disabled ? 0.42 : 1 }]}
    >
      {recording && (
        <Animated.View
          pointerEvents="none"
          style={[styles.breath, { borderColor: colors.accentWarm }, ring]}
        />
      )}
      <LinearGradient
        colors={CREAM_STOPS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.button}
      >
        {recording ? (
          <View style={[styles.stop, { backgroundColor: colors.textInk }]} />
        ) : (
          <Icon name="mic" size={30} color={colors.textInk} />
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { text, shadow } = useSurfaceInk();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.action}
    >
      <EchoText variant="bodyM" style={[styles.actionLabel, { color: text }, shadow]}>
        {label}
      </EchoText>
    </Pressable>
  );
}

type Props = {
  view: SpeakView;
  seconds: number;
  /** The saved recording was rescued after a crash and may end early. */
  recovered: boolean;
  onRecord: () => void;
  onStop: () => void;
  onAllow: () => void;
  onSettings: () => void;
  onWrite: () => void;
  /** Try again, or turn a recording with no words yet into words. */
  onRetry: () => void;
  /** The sentence for the transcription states. */
  line: string | null;
};

/** One record-and-stop control, the time, and a calm line of status. Nothing else. */
export function SpeakPanel({
  view,
  seconds,
  recovered,
  onRecord,
  onStop,
  onAllow,
  onSettings,
  onWrite,
  onRetry,
  line,
}: Props) {
  const { text, shadow } = useSurfaceInk();
  const recording = view === 'recording';
  return (
    <View style={styles.root} accessibilityLiveRegion="polite">
      {!NO_BUTTON_VIEWS.includes(view) && (
        <RecordButton
          recording={recording}
          disabled={view === 'starting' || view === 'saving'}
          onPress={recording ? onStop : onRecord}
        />
      )}
      {CLOCK_VIEWS.includes(view) && (
        <EchoText variant="displayM" style={[styles.clock, { color: text }, shadow]}>
          {formatClock(seconds)}
        </EchoText>
      )}
      <EchoText variant="bodyM" align="center" style={[{ color: text, opacity: 0.9 }, shadow]}>
        {line ?? STATUS[view]}
      </EchoText>
      {view === 'recorded' && recovered && (
        <EchoText variant="caption" align="center" style={[{ color: text, opacity: 0.8 }, shadow]}>
          {sessionCopy.speak.recovered}
        </EchoText>
      )}
      {view === 'explain' && <TextAction label={sessionCopy.speak.allow} onPress={onAllow} />}
      {view === 'untranscribed' && (
        <TextAction label={sessionCopy.transcribe.action} onPress={onRetry} />
      )}
      {view === 'transcribe_failed' && (
        <TextAction label={sessionCopy.errors.retry} onPress={onRetry} />
      )}
      {view === 'denied' && <TextAction label={sessionCopy.speak.settings} onPress={onSettings} />}
      {(view === 'explain' ||
        view === 'denied' ||
        view === 'unavailable' ||
        view === 'failed' ||
        view === 'transcribe_unavailable' ||
        view === 'kept') && <TextAction label={sessionCopy.speak.writeInstead} onPress={onWrite} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  buttonSlot: { width: BUTTON, height: BUTTON, alignItems: 'center', justifyContent: 'center' },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breath: {
    position: 'absolute',
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    borderWidth: 1.5,
  },
  stop: { width: 22, height: 22, borderRadius: 5 },
  clock: { fontVariant: ['tabular-nums'], marginTop: 6 },
  action: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionLabel: { textDecorationLine: 'underline' },
});
