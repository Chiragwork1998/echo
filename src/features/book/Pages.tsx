import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { bookCopy } from './bookCopy';
import { ArrivalFade } from '@/features/journal-session/ArrivalFade';

import { linesOf, measuredText, pageCount, pageOfLine } from './pagination';
import { Sheet, type PaperLook } from './paper';
import type { Volume } from './volumes';

// The leaf turns as the original did: 760 ms, in and out, hinged at the spine with a deep
// perspective, and the back of the leaf is blank paper.
export const TURN_MS = 760;
const PERSPECTIVE = 1800;
const SERIF = 'CormorantGaramond_500Medium';
/** Words on the page: Cormorant Garamond at 22 pt on a 32 pt line, as on the sky. */
export const PAGE_TEXT = { size: 22, line: 32, tracking: 0.15 };
const PAD = { top: 10, left: 30, right: 24, bottom: 20 };
const HEAD = 34;
const MIN_LINES = 3;
const FADE_MS = tokens.motion.fast;
/** Words fade away, and back, over this long. */
const VEIL_MS = 450;
/** A drag shorter than this does not turn the page. */
const SWIPE = 60;

/** Where the lines fall on a page of this size and at this text size. */
export function usePageMetrics(height: number, lead: number) {
  const { fontScale } = useWindowDimensions();
  const scale = Math.min(fontScale, 2);
  const line = PAGE_TEXT.line * scale;
  const head = HEAD * Math.min(Math.max(scale, 1), 1.5);
  const room = height - PAD.top - head - PAD.bottom;
  const per = Math.max(MIN_LINES, Math.floor(room / line));
  return { scale, line, head, per, lead, window: per * line };
}
type Metrics = ReturnType<typeof usePageMetrics>;

/** Web draws a focus ring around a text field, and an `auto` ring ignores a width of nothing. */
const noRing = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

// On web a focused field scrolls an `overflow: hidden` parent to bring its caret into view, which
// would slide the page out of its window. `clip` cannot be scrolled.
const webClip = (Platform.OS === 'web' ? { overflow: 'clip' } : {}) as unknown as ViewStyle;

const textStyle = {
  fontFamily: SERIF,
  fontSize: PAGE_TEXT.size,
  lineHeight: PAGE_TEXT.line,
  letterSpacing: PAGE_TEXT.tracking,
  includeFontPadding: false,
} as const;

type Lead = { lines: number; text: string };

type Props = {
  width: number;
  height: number;
  look: PaperLook;
  volume: Volume;
  value: string;
  onChangeText: (text: string) => void;
  editable: boolean;
  /** Touches reach the words. Otherwise they pass to `onTap`: Speak is a tap on the page. */
  interactive: boolean;
  label: string;
  placeholder?: string;
  inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  onFocus: () => void;
  onBlur: () => void;
  onTap?: () => void;
  /** A heading that takes the first lines of the first page, such as First Echo's question. */
  lead?: Lead;
  /** Nothing is readable until the cover is open. */
  hidden?: boolean;
  /**
   * The words are kept but not shown: the page is empty, and the breathing light is all there is
   * (D-008). They fade away and back, and every page, line and word is still where it was.
   */
  concealed?: boolean;
  /** Counts the times spoken words have landed, so they settle in rather than jump. */
  arrival?: number;
  children?: ReactNode;
};

/**
 * The open page. The entry is one string, always, and it lives in one text field. A page is a window
 * of `per` whole lines over that field, slid up by whole pages, so a page turn only changes which
 * lines are in view: no word can be lost, split, duplicated or reordered by it, and the field never
 * hands the caret from one box to another. The leaf that turns is a picture of the page being left.
 */
export function Pages({
  width,
  height,
  look,
  volume,
  value,
  onChangeText,
  editable,
  interactive,
  label,
  placeholder,
  inputRef,
  onFocus,
  onBlur,
  onTap,
  lead,
  hidden = false,
  concealed = false,
  arrival = 0,
  children,
}: Props) {
  const { name } = useTheme();
  const reduced = useReduceMotion();
  const metrics = usePageMetrics(height, lead?.lines ?? 0);
  const { line, per } = metrics;
  const leadLines = lead?.lines ?? 0;

  // How many lines the text wraps to, and the line the caret is on. Both are measured on copies of
  // the field's own text that are never seen: the height of a copy is its number of lines. That works
  // the same on every platform, and never needs the text itself to be cut up.
  // Null is the end of the text, which is where a caret that has not been placed is.
  const [caretAt, setCaretAt] = useState<number | null>(null);
  const [heights, setHeights] = useState({ all: 0, caret: 0 });
  const mirror = measuredText(value);
  const lines = linesOf(heights.all, line);
  const caretIn = Math.min(caretAt ?? value.length, value.length);
  const atEnd = caretIn >= value.length;
  const caretLine = atEnd ? lines - 1 : linesOf(heights.caret, line) - 1;
  const count = pageCount(lines, leadLines, per);

  const [page, setPage] = useState(0);
  const shown = Math.min(page, count - 1);
  const [turn, setTurn] = useState<{ from: number; to: number } | null>(null);
  const flip = useSharedValue(0);
  const dim = useSharedValue(1);
  const veil = useSharedValue(concealed ? 0 : 1);
  useEffect(() => {
    veil.set(
      withTiming(concealed ? 0 : 1, {
        duration: reduced ? FADE_MS : VEIL_MS,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [concealed, reduced, veil]);
  const veiled = useAnimatedStyle(() => ({ opacity: veil.get() }));

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  const later = (task: () => void, ms: number) => {
    timers.current.push(setTimeout(task, ms));
  };

  const fading = useRef<number | null>(null);
  const turnTo = (to: number) => {
    if (turn || to < 0 || to >= count || to === shown) return;
    if (concealed) {
      // Nothing is on show, so there is nothing to turn: the view moves, and no leaf carries words.
      setPage(to);
      return;
    }
    if (reduced) {
      // A short fade in place of the swing: the old words go, the new ones come.
      if (fading.current === to) return;
      fading.current = to;
      dim.set(withTiming(0, { duration: FADE_MS / 2, reduceMotion: ReduceMotion.Never }));
      later(() => {
        setPage(to);
        fading.current = null;
        dim.set(withTiming(1, { duration: FADE_MS / 2, reduceMotion: ReduceMotion.Never }));
      }, FADE_MS / 2);
      return;
    }
    flip.set(0);
    setTurn({ from: shown, to });
    flip.set(
      withTiming(1, {
        duration: TURN_MS,
        easing: Easing.inOut(Easing.cubic),
        reduceMotion: ReduceMotion.Never,
      }),
    );
    later(() => {
      setPage(to);
      setTurn(null);
    }, TURN_MS);
  };

  // The newest words are always in view. Typing follows the caret; words that arrive some other
  // way, such as a transcript, follow the end when the person was already at the end. Turning a page
  // by hand lets go of both, so that reading back is not undone by the next word.
  const follow = useRef<'caret' | 'end' | null>(null);
  const before = useRef({ length: value.length, count });
  useEffect(() => {
    const grew = value.length !== before.current.length;
    if (grew && follow.current === null && shown >= before.current.count - 1) {
      follow.current = 'end';
    }
    before.current = { length: value.length, count };
    if (turn || !follow.current) return;
    const target = follow.current === 'end' ? count - 1 : pageOfLine(caretLine, leadLines, per);
    if (target !== shown) turnTo(target);
    // turnTo is rebuilt every render and reads what is current: this runs after every render.
  });
  const turnByHand = (to: number) => {
    follow.current = null;
    turnTo(to);
  };

  const change = (next: string) => {
    follow.current = 'caret';
    setCaretAt((at) =>
      at === null ? null : Math.max(0, Math.min(next.length, at + next.length - value.length)),
    );
    onChangeText(next);
  };

  // A sideways drag turns the page, over the words too. Taps and slow drags stay with the text.
  const now = useRef({ shown, turnTo: turnByHand });
  useEffect(() => {
    now.current = { shown, turnTo: turnByHand };
  });
  /* eslint-disable react-hooks/refs -- the handler reads the page only when a finger lifts. */
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, g) => {
          const { shown: at, turnTo: go } = now.current;
          if (g.dx < -SWIPE) go(at + 1);
          else if (g.dx > SWIPE) go(at - 1);
        },
      }),
    [],
  );
  /* eslint-enable react-hooks/refs */

  const forward = turn !== null && turn.to > turn.from;
  const base = turn ? turn.to : shown;
  const leaf = turn ? (forward ? turn.from : turn.to) : null;
  const turned = Math.min(turn ? Math.min(turn.from, turn.to) : shown, look.leaves.length);

  const angle = useAnimatedStyle(() => {
    const t = flip.get();
    return {
      transform: [
        { perspective: PERSPECTIVE },
        { rotateY: `${interpolate(t, [0, 1], forward ? [0, -180] : [-180, 0])}deg` },
      ],
    };
  }, [forward]);
  const backShown = useAnimatedStyle(() => {
    const t = flip.get();
    return { opacity: forward ? (t < 0.5 ? 0 : 1) : t < 0.5 ? 1 : 0 };
  }, [forward]);
  const shade = useAnimatedStyle(() => {
    const t = flip.get();
    const level = forward
      ? interpolate(t, [0, 0.5, 1], [0.18, 0.1, 0])
      : interpolate(t, [0, 0.5, 1], [0, 0.1, 0.18]);
    return { opacity: level * look.shade };
  }, [forward, look.shade]);
  // Beneath a turning leaf the new words wait, then come once it is past upright; coming back, the
  // words being left fade as the leaf arrives, and the new ones take over at the very end.
  const turning = turn !== null;
  const fresh = useAnimatedStyle(() => {
    const t = flip.get();
    if (!turning) return { opacity: dim.get() };
    return {
      opacity: forward
        ? interpolate(t, [0, 0.5, 0.95], [0, 0, 1])
        : interpolate(t, [0, 0.9, 1], [0, 0, 1]),
    };
  }, [forward, turning]);
  const old = useAnimatedStyle(() => {
    const t = flip.get();
    return { opacity: interpolate(t, [0, 0.5], [1, 0], 'clamp') };
  });
  const arriving = useAnimatedStyle(() => {
    const t = flip.get();
    return { opacity: interpolate(t, [0.9, 1], [1, 0], 'clamp') };
  });

  const face = (index: number) => (
    <Face look={look} metrics={metrics} page={index} text={value} lead={lead} volume={volume} />
  );

  return (
    <View style={{ width, height }} {...swipe.panHandlers} testID="book-page">
      {turned > 0 && (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.spine,
              { left: -4 - 3 * turned, width: 4 + 3 * turned, backgroundColor: volume.cloth },
            ]}
          />
          {look.leaves
            .slice(0, turned)
            .map((colour, i) => (
              <View
                key={i}
                pointerEvents="none"
                style={[styles.turnedLeaf, { left: -3 * (i + 1), backgroundColor: colour }]}
              />
            ))
            .reverse()}
        </>
      )}
      <Sheet look={look}>
        <Pressable
          accessible={false}
          disabled={interactive}
          onPress={onTap}
          style={StyleSheet.absoluteFill}
        >
          <Head look={look} metrics={metrics} volume={volume} />
          <ArrivalFade arrival={arrival} style={[styles.fill, { opacity: hidden ? 0 : 1 }]}>
            <Animated.View
              style={[styles.fill, veiled]}
              accessibilityElementsHidden={concealed}
              importantForAccessibility={concealed ? 'no-hide-descendants' : 'auto'}
            >
              <Animated.View style={[styles.fill, fresh]}>
                <View
                  style={[styles.window, { top: PAD.top + metrics.head, height: metrics.window }]}
                >
                  <View style={{ transform: [{ translateY: -base * per * line }] }}>
                    {lead && <Heading look={look} metrics={metrics} text={lead.text} />}
                    <TextInput
                      ref={inputRef}
                      value={value}
                      onChangeText={change}
                      onSelectionChange={(event) => {
                        const end = event.nativeEvent.selection.end;
                        setCaretAt(end >= value.length ? null : end);
                      }}
                      onFocus={onFocus}
                      onBlur={onBlur}
                      editable={editable}
                      pointerEvents={interactive ? 'auto' : 'none'}
                      multiline
                      scrollEnabled={false}
                      textAlignVertical="top"
                      placeholder={placeholder}
                      placeholderTextColor={look.muted}
                      accessibilityLabel={label}
                      // Autofill and suggestion stores sit outside encryption (docs/DATA_CONTRACT.md).
                      autoComplete="off"
                      importantForAutofill="no"
                      textContentType="none"
                      keyboardAppearance={name === 'night' ? 'dark' : 'light'}
                      selectionColor={look.glow}
                      cursorColor={look.glow}
                      underlineColorAndroid="transparent"
                      maxFontSizeMultiplier={2}
                      style={[
                        styles.input,
                        noRing,
                        textStyle,
                        {
                          color: look.ink,
                          paddingTop: leadLines * line,
                          height: (lines + leadLines + 2) * line,
                        },
                      ]}
                    />
                  </View>
                </View>
              </Animated.View>
            </Animated.View>
          </ArrivalFade>
          {/* Never seen: these only tell us how many lines the words take, and where the caret is. */}
          <Text
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            maxFontSizeMultiplier={2}
            testID="book-measure"
            onLayout={(event) => {
              const all = event.nativeEvent.layout.height;
              setHeights((h) => (h.all === all ? h : { ...h, all }));
            }}
            style={[styles.mirror, textStyle]}
          >
            {mirror}
          </Text>
          {!atEnd && (
            <Text
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              maxFontSizeMultiplier={2}
              onLayout={(event) => {
                const upTo = event.nativeEvent.layout.height;
                setHeights((h) => (h.caret === upTo ? h : { ...h, caret: upTo }));
              }}
              style={[styles.mirror, textStyle]}
            >
              {measuredText(value.slice(0, caretIn))}
            </Text>
          )}
        </Pressable>

        {/* The words being left stay under an arriving leaf, then go as it covers them. */}
        {turn && !forward && (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, old]}>
            {face(turn.from)}
          </Animated.View>
        )}
      </Sheet>

      {turn && leaf !== null && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.shade, shade]}
          />
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.hinge, angle, !forward && arriving]}
          >
            <Sheet look={look}>{face(leaf)}</Sheet>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.hinge, styles.leafBack, angle, backShown]}
          >
            <Sheet look={look} />
          </Animated.View>
        </>
      )}

      {!concealed && (
        <Pager
          look={look}
          metrics={metrics}
          page={shown}
          count={count}
          busy={turn !== null}
          onTurn={(by) => turnByHand(shown + by)}
        />
      )}
      {children}
    </View>
  );
}

function Head({ look, metrics, volume }: { look: PaperLook; metrics: Metrics; volume: Volume }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.head, { top: PAD.top, height: metrics.head }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <EchoText
        variant="caption"
        maxFontSizeMultiplier={1.4}
        style={[styles.running, { color: look.muted }]}
      >
        {volume.subtitle}
      </EchoText>
    </View>
  );
}

function Heading({ look, metrics, text }: { look: PaperLook; metrics: Metrics; text: string }) {
  return (
    <View style={[styles.heading, { height: metrics.lead * metrics.line }]}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1.4}
        numberOfLines={metrics.lead + 1}
        style={[styles.headingText, { color: look.ink, lineHeight: metrics.line * 0.78 }]}
      >
        {text}
      </Text>
    </View>
  );
}

/** A picture of a page: the same head, heading and lines, drawn as plain text slid to the page. */
function Face(props: {
  look: PaperLook;
  metrics: Metrics;
  page: number;
  text: string;
  lead?: Lead;
  volume: Volume;
}) {
  const { look, metrics, page, text, lead, volume } = props;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Head look={look} metrics={metrics} volume={volume} />
      <View style={[styles.window, { top: PAD.top + metrics.head, height: metrics.window }]}>
        <View style={{ transform: [{ translateY: -page * metrics.per * metrics.line }] }}>
          {lead && <Heading look={look} metrics={metrics} text={lead.text} />}
          <Text
            maxFontSizeMultiplier={2}
            style={[
              styles.face,
              textStyle,
              { color: look.ink, paddingTop: metrics.lead * metrics.line },
            ]}
          >
            {text}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Previous page, the page you are on, next page. Real buttons, so no gesture is needed. */
function Pager(props: {
  look: PaperLook;
  metrics: Metrics;
  page: number;
  count: number;
  busy: boolean;
  onTurn: (by: -1 | 1) => void;
}) {
  const { look, metrics, page, count, busy, onTurn } = props;
  if (count < 2) return null;
  const arrow = (by: -1 | 1, enabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={by < 0 ? bookCopy.page.previous : bookCopy.page.next}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled || busy}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={() => onTurn(by)}
      style={[styles.arrow, { opacity: enabled ? 1 : 0.28 }]}
      testID={by < 0 ? 'book-previous' : 'book-next'}
    >
      <Text style={[styles.glyph, { color: look.muted }]}>{by < 0 ? '‹' : '›'}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.pager, { top: PAD.top, height: metrics.head }]} pointerEvents="box-none">
      {arrow(-1, page > 0)}
      <EchoText
        variant="caption"
        maxFontSizeMultiplier={1.4}
        accessibilityLabel={bookCopy.page.of(page + 1, count)}
        accessibilityLiveRegion="polite"
        style={[styles.count, { color: look.muted }]}
      >
        {`${page + 1} / ${count}`}
      </EchoText>
      {arrow(1, page < count - 1)}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  window: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', ...webClip },
  input: {
    paddingLeft: PAD.left,
    paddingRight: PAD.right,
    paddingBottom: 0,
    margin: 0,
  },
  face: { paddingLeft: PAD.left, paddingRight: PAD.right },
  mirror: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
    paddingLeft: PAD.left,
    paddingRight: PAD.right,
  },
  head: {
    position: 'absolute',
    left: PAD.left,
    right: PAD.right,
    justifyContent: 'center',
  },
  running: { fontSize: 9.5, lineHeight: 12, letterSpacing: 1.8 },
  heading: { paddingLeft: PAD.left, paddingRight: PAD.right, justifyContent: 'flex-start' },
  headingText: { fontFamily: SERIF, fontSize: 17, letterSpacing: 0.1 },
  pager: {
    position: 'absolute',
    right: PAD.right - 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrow: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 24, lineHeight: 26 },
  count: { fontSize: 9.5, letterSpacing: 1.2, minWidth: 34, textAlign: 'center' },
  spine: {
    position: 'absolute',
    top: -6,
    bottom: -8,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  turnedLeaf: { position: 'absolute', top: 2, bottom: -2, width: 3, borderRadius: 1.5 },
  shade: { backgroundColor: '#1A140C', borderRadius: 3 },
  hinge: { transformOrigin: 'left center', backfaceVisibility: 'hidden' },
  leafBack: { backfaceVisibility: 'visible' },
});
