import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import type { ReflectionCardState } from './cardState';
import { LIGHT_SANS, LIGHT_SERIF } from './fonts';
import { Seal } from './Seal';
import { bindLastWords, completionText } from './text';

// Measured from the golden, which draws the card with a tighter corner than the spec's 22 pt radius
// and in tighter bands than its 24 pt padding. The golden wins (docs/SPEC_CONFLICTS.md).
const RADIUS = 14;
const SEAL_INSET = 25.3;
const BODY_INSET = 33;
const BAND = {
  top: 18.4,
  header: 24,
  toBody: 12.85,
  afterBody: 8.9,
  afterRule: 11.1,
  footer: 20,
  bottom: 13.9,
};
const TITLE_GAP = 18;
const BODY = { fontFamily: LIGHT_SANS, fontSize: 14.1, lineHeight: 18.75, opacity: 0.78 } as const;
const SAVED = { fontFamily: LIGHT_SANS, fontSize: 10.9, lineHeight: 14, opacity: 0.7 } as const;
// The golden's glass is a lighter, warmer frost than the glass token, which would leave this card
// the darkest thing on the screen. A faint warm lift over regular glass closes the gap. Strong glass,
// used at large text, stays as dark as the token for legibility.
const GLASS_LIFT = { night: 'rgba(250,196,100,0.12)', day: 'rgba(240,215,170,0.13)' } as const;
const RULE_HEIGHT = 0.6;
const RULE_OPACITY = 0.3;
const LOCK_SIZE = 16;
const ACTION_GAP = 28;

/** Fades its content in over 180 ms. Reduce Motion makes this instant through the system setting. */
function Reveal({ visible = true, children }: { visible?: boolean; children: ReactNode }) {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withTiming(visible ? 1 : 0, {
        duration: tokens.motion.fast,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [shown, visible]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={styles.action}
    >
      <EchoText variant="label" style={styles.actionText}>
        {label}
      </EchoText>
    </Pressable>
  );
}

type Props = {
  state: ReflectionCardState;
  /** The reflection, shown only in the success state. */
  text?: string;
  /** “Saved privately · 7 minutes”, with the real time. Hidden until the entry has been read. */
  saved: string;
  savedVisible: boolean;
  onRetry: () => void;
  onContinue: () => void;
};

/**
 * Today's echo. Offline is a first-class state, not a failure: with no reflection provider it is
 * the private saved-entry card, and it is complete as it stands.
 */
export function ReflectionCard({ state, text, saved, savedVisible, onRetry, onContinue }: Props) {
  const { colors, name } = useTheme();
  const { accessibleLayout } = useLayout();
  const body =
    state === 'loading' ? completionText.pending : state === 'error' ? completionText.error : text;

  return (
    <GlassCard strength={accessibleLayout ? 'strong' : 'regular'} radius={RADIUS}>
      {!accessibleLayout && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_LIFT[name] }]}
        />
      )}
      <View style={styles.content}>
        <View style={styles.header}>
          <Seal listening={state === 'loading'} />
          <View style={[styles.divider, { backgroundColor: colors.textPrimary }]} />
          <EchoText variant="bodyL" serif accessibilityRole="header" style={styles.title}>
            {copy.completion.cardTitle}
          </EchoText>
        </View>

        {body ? (
          <Reveal key={state}>
            <EchoText
              variant="bodyM"
              style={[styles.body, BODY]}
              accessibilityLabel={body}
              accessibilityLiveRegion="polite"
              accessibilityState={{ busy: state === 'loading' }}
            >
              {bindLastWords(body)}
            </EchoText>
            {state === 'error' && (
              <View style={styles.actions}>
                <TextAction label={completionText.retry} onPress={onRetry} />
                <TextAction label={completionText.continue} onPress={onContinue} />
              </View>
            )}
          </Reveal>
        ) : null}

        <View
          style={[
            styles.rule,
            { backgroundColor: colors.textPrimary, marginTop: body ? BAND.afterBody : BAND.toBody },
          ]}
        />
        <Reveal visible={savedVisible}>
          <View style={styles.footer}>
            <Icon name="lock" size={LOCK_SIZE} color={colors.textSecondary} />
            <EchoText variant="bodyM" color="textSecondary" style={SAVED}>
              {saved}
            </EchoText>
          </View>
        </Reveal>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: BAND.top, paddingBottom: BAND.bottom },
  header: {
    height: BAND.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SEAL_INSET,
    gap: TITLE_GAP,
  },
  divider: { width: 1, height: BAND.header, opacity: 0.32 },
  title: { flex: 1, fontFamily: LIGHT_SERIF, fontSize: 18.4 },
  body: { marginTop: BAND.toBody, paddingHorizontal: BODY_INSET },
  actions: {
    marginTop: 4,
    paddingHorizontal: BODY_INSET,
    flexDirection: 'row',
    gap: ACTION_GAP,
  },
  action: { minHeight: tokens.size.tapTarget, justifyContent: 'center' },
  actionText: { letterSpacing: 1.6 },
  rule: {
    height: RULE_HEIGHT,
    marginHorizontal: BODY_INSET,
    opacity: RULE_OPACITY,
  },
  footer: {
    height: BAND.footer,
    marginTop: BAND.afterRule,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BODY_INSET - 2,
    gap: 8,
  },
});
