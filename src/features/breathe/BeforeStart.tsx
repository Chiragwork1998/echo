import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { OneLineLabel } from '@/components/OneLineLabel';
import { SoftScrim } from '@/components/SoftScrim';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useSkyInk } from '@/features/journal-session/sky';

import { freeAt, lengthsFor, paceIsFree } from './access';
import { breatheCopy } from './breatheCopy';
import { Fade } from './Fade';
import { HEART_PACES } from './timeline';
import type { Practice } from './types';

// The Privacy golden's switch, so a setting here reads as the same control.
const TRACK = { width: 44, height: 25 };
const KNOB = 24;
// The knob rests 1.5 pt in from the track when off and 0.5 pt when on, as the golden has it. The track
// is padded by 1.5 pt on every side whichever way it is set, so the knob travels 18 pt: from 1.5 to 19.5.
const TRACK_PAD = 1.5;
const TRAVEL = TRACK.width - KNOB - 2;
const CHIP_HEIGHT = 34;
const DAY_SCRIM_ALPHA = 0.42;
/**
 * Night's moon and snow are as bright as the pale caption ink, and the moon sits at the very edge of
 * the words, where a round patch fades to nothing. So Night's patch runs wide past the screen and a
 * little above and below the heading: every word sits in its even middle (walk v5).
 */
const NIGHT_SCRIM = { alpha: 0.5, x: 160, y: 48 };
const CREAM_STOPS = ['#FBF8F2', '#EDE6DC'] as const; // tokens.gradient.creamButton

function Switch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
}) {
  const { colors } = useTheme();
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    on.set(
      withSpring(value ? 1 : 0, { ...tokens.motion.spring, reduceMotion: ReduceMotion.System }),
    );
  }, [on, value]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: on.get() * TRAVEL }] }));
  // The fill and the outline cross over as the knob travels, by opacity: the track is never one
  // thing while the knob is still on its way to being the other, and no border comes and goes to
  // nudge the knob a point.
  const fill = useAnimatedStyle(() => ({ opacity: on.get() }));
  const rim = useAnimatedStyle(() => ({ opacity: 1 - on.get() }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={onChange}
      style={styles.setting}
      testID={`setting-${label.toLowerCase()}`}
    >
      <EchoText variant="bodyM" style={styles.settingLabel}>
        {label}
      </EchoText>
      <View style={styles.track}>
        <Animated.View
          pointerEvents="none"
          testID={`setting-${label.toLowerCase()}-fill`}
          style={[
            StyleSheet.absoluteFill,
            styles.trackShape,
            { backgroundColor: `${colors.accentWarm}B3` },
            fill,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          testID={`setting-${label.toLowerCase()}-rim`}
          style={[
            StyleSheet.absoluteFill,
            styles.trackShape,
            { borderColor: colors.borderGlass, borderWidth: 1 },
            rim,
          ]}
        />
        <Animated.View testID={`setting-${label.toLowerCase()}-knob`} style={[styles.knob, knob]} />
      </View>
    </Pressable>
  );
}

function Chip(props: {
  label: string;
  spoken: string;
  selected: boolean;
  /** Marked Plus where it can be seen. */
  plus: boolean;
  /** Said to be Plus, where the row as a whole is marked instead. */
  spokenPlus?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const { label, spoken, selected, plus, onPress, testID } = props;
  const plusSpoken = plus || props.spokenPlus === true;
  const text = (
    <View style={styles.chipText}>
      <OneLineLabel
        variant="caption"
        style={[styles.chipLabel, { color: selected ? colors.textInk : colors.textPrimary }]}
      >
        {label}
      </OneLineLabel>
      {plus && (
        <EchoText
          variant="caption"
          color={selected ? 'textInk' : 'textSecondary'}
          style={styles.chipPlus}
        >
          {breatheCopy.plus}
        </EchoText>
      )}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={plusSpoken ? `${spoken}, ${breatheCopy.plus}` : spoken}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 5, bottom: 5 }}
      style={({ pressed }) => [pressed && styles.pressed]}
      testID={testID}
    >
      {selected ? (
        <LinearGradient
          colors={CREAM_STOPS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.chip}
        >
          {text}
        </LinearGradient>
      ) : (
        <View style={[styles.chip, { borderColor: colors.borderGlass }, styles.open]}>{text}</View>
      )}
    </Pressable>
  );
}

type Props = {
  practice: Practice;
  minutes: number;
  pace: number;
  sound: boolean;
  voice: boolean;
  /** Mark what needs ECHO Plus. Only for someone without it. */
  markPlus: boolean;
  onMinutes: (minutes: number) => void;
  onPace: (pace: number) => void;
  onSound: () => void;
  onVoice: () => void;
};

/**
 * Before it starts: the practice, one sentence of what will happen, why it helps (on a tap), its
 * length, Heart's pace, and the voice and sound. Then one Begin, which the screen draws below.
 */
export function BeforeStart(props: Props) {
  const { practice, minutes, pace, sound, voice, markPlus } = props;
  const { colors, name } = useTheme();
  // Words on the open sky take the session's shadow. Night's moon and snow are as bright as the
  // pale caption ink, and the hold caution, which is about safety, sat unread on them (walk v5).
  const { shadow } = useSkyInk();
  const [why, setWhy] = useState(false);
  const heart = practice.steps.some(
    (step) => step.kind === 'breath' && step.pattern.kind === 'heart',
  );
  const lines = practice.steps.flatMap((step) => (step.kind === 'voice' ? [step.text] : []));

  return (
    <View>
      <View>
        {/* Day's sky is bright cloud behind the heading, and Night's has the moon and the snow: a
            feathered patch keeps the words legible, as the onboarding headings do. */}
        <View
          pointerEvents="none"
          style={name === 'day' ? styles.dayScrim : styles.nightScrim}
          testID="breathe-heading-patch"
        >
          <SoftScrim alpha={name === 'day' ? DAY_SCRIM_ALPHA : NIGHT_SCRIM.alpha} />
        </View>
        <EchoText
          variant="caption"
          color="textSecondary"
          align="center"
          style={[styles.feeling, shadow]}
        >
          {practice.feeling}
        </EchoText>
        <EchoText
          variant="displayM"
          align="center"
          accessibilityRole="header"
          style={[styles.name, shadow]}
        >
          {practice.name}
        </EchoText>
        <EchoText
          variant="bodyM"
          color="textSecondary"
          align="center"
          style={[styles.line, shadow]}
        >
          {practice.line}
        </EchoText>
        {practice.caution ? (
          <EchoText
            variant="caption"
            color="textSecondary"
            align="center"
            style={[styles.caution, shadow]}
            testID="breathe-caution"
          >
            {practice.caution}
          </EchoText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={breatheCopy.whyTitle}
          accessibilityState={{ expanded: why }}
          onPress={() => setWhy((open) => !open)}
          hitSlop={{ top: 10, bottom: 10, left: 24, right: 24 }}
          style={({ pressed }) => [styles.whyLink, pressed && styles.linkPressed]}
          testID="breathe-why"
        >
          <OneLineLabel
            variant="caption"
            color="textSecondary"
            style={[styles.whyLinkText, shadow]}
          >
            {breatheCopy.whyTitle}
          </OneLineLabel>
        </Pressable>
        {why && (
          // The words come up rather than appearing whole. (The card below still steps down: a
          // moving blur is for a phone to judge before it is added.)
          <Fade inMs={tokens.motion.standard} style={styles.why} accessibilityLiveRegion="polite">
            <EchoText variant="bodyM" style={[styles.whyText, shadow]}>
              {practice.why}
            </EchoText>
            <EchoText variant="caption" color="textSecondary" style={[styles.source, shadow]}>
              {breatheCopy.source(practice.source)}
            </EchoText>
          </Fade>
        )}
      </View>

      <View style={styles.group}>
        <GlassCard radius={tokens.radius.card}>
          <View style={styles.block}>
            <EchoText variant="bodyM" style={styles.settingLabel}>
              {breatheCopy.length}
            </EchoText>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {lengthsFor(practice).map((length) => (
                <Chip
                  key={length}
                  label={breatheCopy.minutes(length)}
                  spoken={breatheCopy.minutes(length)}
                  selected={length === minutes}
                  plus={markPlus && !freeAt(practice, length)}
                  onPress={() => props.onMinutes(length)}
                  testID={`length-${length}`}
                />
              ))}
            </View>
          </View>
          {heart && (
            <View style={[styles.block, styles.rule, { borderTopColor: colors.borderGlass }]}>
              <View style={styles.paceHead}>
                <EchoText variant="bodyM" style={styles.settingLabel}>
                  {breatheCopy.pace}
                  {markPlus && (
                    <EchoText variant="caption" color="textSecondary" style={styles.chipPlus}>
                      {`  ${breatheCopy.plus}`}
                    </EchoText>
                  )}
                </EchoText>
                <EchoText variant="caption" color="textSecondary" style={styles.paceValue}>
                  {breatheCopy.paceValue(pace)}
                </EchoText>
              </View>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {HEART_PACES.map((value) => (
                  <Chip
                    key={value}
                    label={String(value)}
                    spoken={breatheCopy.paceValue(value)}
                    selected={value === pace}
                    plus={false}
                    spokenPlus={markPlus && !paceIsFree(value)}
                    onPress={() => props.onPace(value)}
                    testID={`pace-${value}`}
                  />
                ))}
              </View>
              <EchoText variant="caption" color="textSecondary" style={styles.paceHint}>
                {breatheCopy.paceHint}
              </EchoText>
            </View>
          )}
          <View style={[styles.rule, { borderTopColor: colors.borderGlass }]}>
            <Switch label={breatheCopy.voice} value={voice} onChange={props.onVoice} />
          </View>
          <View style={[styles.rule, { borderTopColor: colors.borderGlass }]}>
            <Switch label={breatheCopy.sound} value={sound} onChange={props.onSound} />
          </View>
        </GlassCard>
      </View>

      {!voice && lines.length > 0 && (
        <Fade inMs={tokens.motion.standard} style={styles.lines}>
          <EchoText variant="caption" color="textSecondary" style={[styles.linesTitle, shadow]}>
            {breatheCopy.linesTitle}
          </EchoText>
          {lines.map((line) => (
            <EchoText key={line} variant="bodyM" style={[styles.lineText, shadow]}>
              {line}
            </EchoText>
          ))}
        </Fade>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dayScrim: { position: 'absolute', left: -28, right: -28, top: 4, height: 260 },
  nightScrim: {
    position: 'absolute',
    left: -NIGHT_SCRIM.x,
    right: -NIGHT_SCRIM.x,
    top: -NIGHT_SCRIM.y,
    bottom: -NIGHT_SCRIM.y,
  },
  feeling: { marginTop: 22, fontSize: 12, letterSpacing: 1.2, opacity: 0.9 },
  name: { marginTop: 4 },
  line: {
    marginTop: 8,
    fontFamily: 'Inter_300Light',
    fontSize: 14.1,
    lineHeight: 20,
    opacity: 0.9,
    paddingHorizontal: 8,
  },
  caution: { marginTop: 8, fontSize: 11.5, lineHeight: 16, letterSpacing: 0.2 },
  whyLink: { alignSelf: 'center', minHeight: 32, justifyContent: 'center', marginTop: 4 },
  whyLinkText: {
    fontSize: 11.5,
    lineHeight: 15,
    letterSpacing: 0.6,
    textDecorationLine: 'underline',
  },
  why: { marginTop: 4, gap: 6, paddingHorizontal: 8 },
  whyText: { fontFamily: 'Inter_300Light', fontSize: 14, lineHeight: 20 },
  source: { fontSize: 11.5, lineHeight: 16, letterSpacing: 0.2 },
  group: { marginTop: 18 },
  block: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, gap: 10 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth },
  setting: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  settingLabel: { fontSize: 14, lineHeight: 19 },
  track: {
    width: TRACK.width,
    height: TRACK.height,
    borderRadius: TRACK.height / 2,
    padding: TRACK_PAD,
    justifyContent: 'center',
  },
  trackShape: { borderRadius: TRACK.height / 2 },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#FDFCFC' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: CHIP_HEIGHT,
    borderRadius: CHIP_HEIGHT / 2,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  open: { borderWidth: StyleSheet.hairlineWidth },
  chipText: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  chipLabel: { fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  chipPlus: { fontSize: 9.5, lineHeight: 12, letterSpacing: 0.6, opacity: 0.8 },
  pressed: { opacity: 0.8 },
  linkPressed: { opacity: 0.6 },
  paceHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  paceValue: { fontSize: 11.5, letterSpacing: 0.3 },
  paceHint: { fontSize: 11.5, lineHeight: 16, letterSpacing: 0.2, opacity: 0.85 },
  lines: { marginTop: 18, gap: 6, paddingHorizontal: 8 },
  linesTitle: { fontSize: 11.5, letterSpacing: 0.4 },
  lineText: { fontFamily: 'Inter_300Light', fontSize: 14, lineHeight: 20 },
});
