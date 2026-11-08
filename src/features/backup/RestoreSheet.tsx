import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@/design/tokens';
import { useTone } from '@/features/onboarding/rhythm/tone';
import { Sheet, SheetAction, SheetButton, SheetText, SheetTitle } from '@/features/tab-pages/Sheet';

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
 * Every step of a restore after the file is chosen, in one calm sheet over You, in the cloth every
 * sheet shares: what the backup holds and the question, the restore as it goes, and what happened. A
 * restore under way cannot be waved away, because it cannot be stopped half way.
 */
export function RestoreSheet(props: Props) {
  const { state, visible, thisYear = new Date().getFullYear() } = props;
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

  const footer =
    view.primary || view.secondary ? (
      <>
        {view.primary ? (
          <SheetButton label={view.primary.label} onPress={view.primary.onPress} />
        ) : null}
        {view.secondary ? (
          <SheetAction label={view.secondary.label} onPress={view.secondary.onPress} />
        ) : null}
      </>
    ) : undefined;

  // Under the lock it goes at once: nothing should fade over the lock.
  return (
    <Sheet visible={shown} animated={visible} onClose={back} footer={footer} testID="restore-sheet">
      <SheetTitle>{restoreCopy.title}</SheetTitle>
      <View accessibilityLiveRegion="polite">
        <SheetText>{typeset(view.message)}</SheetText>
      </View>
      {view.progress ? <Progress {...view.progress} /> : null}
      {view.note ? <SheetText soft>{typeset(view.note)}</SheetText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: tokens.radius.pill,
    overflow: 'hidden',
    marginVertical: tokens.space[8],
  },
  fill: { ...StyleSheet.absoluteFill, transformOrigin: 'left' },
});
