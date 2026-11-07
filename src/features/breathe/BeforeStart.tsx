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
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { freeAt, lengthsFor, paceIsFree } from './access';
import { breatheCopy } from './breatheCopy';
import { HEART_PACES } from './timeline';
import type { Practice } from './types';

// The Privacy golden's switch, so a setting here reads as the same control.
const TRACK = { width: 44, height: 25 };
const KNOB = 24;
const TRAVEL = TRACK.width - KNOB - 1;
const CHIP_HEIGHT = 34;
const CREAM_STOPS = ['#FBF8F2', '#EDE6DC'] as const; // tokens.gradient.creamButton
const SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.32)',
  textShadowRadius: 10,
  textShadowOffset: { width: 0, height: 1 },
} as const;

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
      <View
        style={[
          styles.track,
          value
            ? { backgroundColor: `${colors.accentWarm}B3` }
            : { borderColor: colors.borderGlass, borderWidth: 1 },
        ]}
      >
        <Animated.View style={[styles.knob, knob]} />
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
        <EchoText variant="caption" color="textSecondary" style={styles.chipPlus}>
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
  const { colors } = useTheme();
  const [why, setWhy] = useState(false);
  const heart = practice.steps.some(
    (step) => step.kind === 'breath' && step.pattern.kind === 'heart',
  );
  const lines = practice.steps.flatMap((step) => (step.kind === 'voice' ? [step.text] : []));

  return (
    <View>
      <EchoText
        variant="caption"
        color="textSecondary"
        align="center"
        style={[styles.feeling, SHADOW]}
      >
        {practice.feeling}
      </EchoText>
      <EchoText
        variant="displayM"
        align="center"
        accessibilityRole="header"
        style={[styles.name, SHADOW]}
      >
        {practice.name}
      </EchoText>
      <EchoText variant="bodyM" color="textSecondary" align="center" style={[styles.line, SHADOW]}>
        {practice.line}
      </EchoText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={breatheCopy.whyTitle}
        accessibilityState={{ expanded: why }}
        onPress={() => setWhy((open) => !open)}
        hitSlop={{ top: 10, bottom: 10, left: 24, right: 24 }}
        style={styles.whyLink}
        testID="breathe-why"
      >
        <OneLineLabel variant="caption" color="textSecondary" style={styles.whyLinkText}>
          {breatheCopy.whyTitle}
        </OneLineLabel>
      </Pressable>
      {why && (
        <View style={styles.why} accessibilityLiveRegion="polite">
          <EchoText variant="bodyM" style={[styles.whyText, SHADOW]}>
            {practice.why}
          </EchoText>
          <EchoText variant="caption" color="textSecondary" style={[styles.source, SHADOW]}>
            {breatheCopy.source(practice.source)}
          </EchoText>
        </View>
      )}

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
        <View style={styles.lines}>
          <EchoText variant="caption" color="textSecondary" style={[styles.linesTitle, SHADOW]}>
            {breatheCopy.linesTitle}
          </EchoText>
          {lines.map((line) => (
            <EchoText key={line} variant="bodyM" style={[styles.lineText, SHADOW]}>
              {line}
            </EchoText>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    padding: 0.5,
    justifyContent: 'center',
  },
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
  paceHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  paceValue: { fontSize: 11.5, letterSpacing: 0.3 },
  paceHint: { fontSize: 11.5, lineHeight: 16, letterSpacing: 0.2, opacity: 0.85 },
  lines: { marginTop: 18, gap: 6, paddingHorizontal: 8 },
  linesTitle: { fontSize: 11.5, letterSpacing: 0.4 },
  lineText: { fontFamily: 'Inter_300Light', fontSize: 14, lineHeight: 20 },
});
