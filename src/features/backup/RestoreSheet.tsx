import { useEffect } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { useLayout } from '@/design/layout';
import { tokens } from '@/design/tokens';
import { useTone } from '@/features/onboarding/rhythm/tone';
import { supporting } from '@/features/tab-pages/textStyles';

import { restoreCopy, type RestoreProblem } from './restoreCopy';
import type { RestoreState } from './useRestore';

type Action = { label: string; onPress: () => void };

type Props = {
  state: RestoreState;
  /** False while the journal is locked: the lock covers the app, and a sheet would sit above it. */
  visible: boolean;
  /** Draws the year into a span only when it is not this one. */
  thisYear?: number;
  onRestore: () => void;
  onChoose: () => void;
  onClose: () => void;
};

/** The states that show the sheet. Idle is the row alone, and reading is the row at work. */
export const SHEET_STATES: readonly RestoreState['kind'][] = [
  'preview',
  'restoring',
  'done',
  'stopped',
  'failed',
];

/** Problems that a second try at the same thing may fix, rather than another file. */
const RETRY: readonly RestoreProblem[] = ['picker', 'unreadable', 'not_ready'];
/** Problems no file chosen here can get past: the answer is elsewhere, so the only action is Close. */
const NO_WAY_ON: readonly RestoreProblem[] = ['unavailable', 'newer'];

type SheetView = {
  message: string;
  note?: string;
  progress?: { done: number; total: number };
  primary?: Action;
  secondary?: Action;
};

function viewOf(state: RestoreState, thisYear: number, props: Props): SheetView {
  const close = { label: restoreCopy.close, onPress: props.onClose };
  switch (state.kind) {
    case 'preview':
      return {
        message: restoreCopy.preview(state.summary, thisYear),
        note: restoreCopy.previewNote,
        primary: { label: restoreCopy.restore, onPress: props.onRestore },
        secondary: { label: restoreCopy.notNow, onPress: props.onClose },
      };
    case 'restoring':
      return {
        message: restoreCopy.restoring(state.done, state.total),
        note: restoreCopy.keepOpen,
        progress: { done: state.done, total: state.total },
      };
    case 'done':
      return {
        message: restoreCopy.done(state.counts),
        primary: { label: restoreCopy.doneAction, onPress: props.onClose },
      };
    case 'stopped':
      return {
        message: restoreCopy.stopped(state.done, state.total),
        primary: { label: restoreCopy.chooseAgain, onPress: props.onChoose },
        secondary: close,
      };
    case 'failed':
      if (NO_WAY_ON.includes(state.problem)) {
        return { message: restoreCopy.failed[state.problem], primary: close };
      }
      return {
        message: restoreCopy.failed[state.problem],
        primary: {
          label: RETRY.includes(state.problem) ? restoreCopy.tryAgain : restoreCopy.chooseAnother,
          onPress: props.onChoose,
        },
        secondary: close,
      };
    default:
      return { message: '' };
  }
}

const MONTH =
  /(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December)/g;

/**
 * Keeps a day with its month, and the last two words together, so that no line breaks a date or is
 * left holding one word alone. Screen readers read the joins as spaces.
 */
export const typeset = (text: string): string =>
  text.replace(MONTH, '$1\u00a0$2').replace(/ (\S+)$/, '\u00a0$1');

const MOVE = {
  duration: tokens.motion.standard,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  reduceMotion: ReduceMotion.System,
};

/** How far the restore has come: a hairline that fills from the left, and is read as a value. */
function Progress({ done, total }: { done: number; total: number }) {
  const tone = useTone();
  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  const fill = useSharedValue(fraction);
  useEffect(() => {
    fill.set(withTiming(fraction, MOVE));
  }, [fill, fraction]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.get() }] }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={restoreCopy.restoringLabel}
      accessibilityValue={{ min: 0, max: total, now: done }}
      style={[styles.track, { backgroundColor: tone.track }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: tone.gold }, style]} />
    </View>
  );
}

/**
 * Every step of a restore after the file is chosen, in one calm sheet over You: what the backup
 * holds and the question, the restore as it goes, and what happened. A restore under way cannot be
 * waved away, because it cannot be stopped half way.
 */
export function RestoreSheet(props: Props) {
  const { state, visible, thisYear = new Date().getFullYear() } = props;
  const tone = useTone();
  const { ctaWidth } = useLayout();
  const shown = visible && SHEET_STATES.includes(state.kind);
  const view = viewOf(state, thisYear, props);
  const settled = state.kind === 'done' || state.kind === 'stopped' || state.kind === 'failed';
  const back = state.kind === 'restoring' ? () => undefined : props.onClose;

  // A result arrives without a tap, so it is read out. iOS has no live regions.
  useEffect(() => {
    if (shown && settled && view.message) {
      void AccessibilityInfo.announceForAccessibility?.(view.message);
    }
  }, [settled, shown, view.message]);

  return (
    <Modal
      testID="restore-sheet"
      transparent
      animationType={visible ? 'fade' : 'none'}
      visible={shown}
      onRequestClose={back}
    >
      <View style={styles.scrim}>
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={back}
          style={[styles.sheet, { backgroundColor: tone.sheet, borderColor: tone.edge }]}
        >
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
            <EchoText
              variant="displayM"
              accessibilityRole="header"
              style={{ color: tone.ink }}
              maxFontSizeMultiplier={1.5}
            >
              {typeset(restoreCopy.title)}
            </EchoText>
            <View accessibilityLiveRegion="polite">
              <EchoText variant="bodyM" style={{ color: tone.ink }} maxFontSizeMultiplier={1.5}>
                {typeset(view.message)}
              </EchoText>
            </View>
            {view.progress ? <Progress {...view.progress} /> : null}
            {view.note ? (
              <EchoText
                variant="caption"
                style={[supporting, { color: tone.inkSoft }]}
                maxFontSizeMultiplier={1.5}
              >
                {typeset(view.note)}
              </EchoText>
            ) : null}
          </ScrollView>
          {view.primary || view.secondary ? (
            <View style={styles.choices}>
              {view.primary ? (
                <PrimaryCTA label={view.primary.label} onPress={view.primary.onPress} />
              ) : null}
              {view.secondary ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={view.secondary.label}
                  onPress={view.secondary.onPress}
                  style={({ pressed }) => [
                    styles.secondary,
                    { width: ctaWidth, borderColor: tone.edge, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <EchoText variant="label" style={{ color: tone.ink }} maxFontSizeMultiplier={1.4}>
                    {view.secondary.label.toUpperCase()}
                  </EchoText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
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
  scroll: { flexGrow: 0 },
  body: { gap: tokens.space[12], paddingHorizontal: tokens.space[24] },
  track: {
    height: 3,
    borderRadius: tokens.radius.pill,
    overflow: 'hidden',
    marginVertical: tokens.space[8],
  },
  fill: { ...StyleSheet.absoluteFill, transformOrigin: 'left' },
  choices: {
    alignItems: 'center',
    gap: tokens.space[12],
    paddingHorizontal: tokens.space[24],
    paddingTop: tokens.space[16],
  },
  // As wide as the primary action above it.
  secondary: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: tokens.space[16],
  },
});
