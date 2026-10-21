import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from './GlassCard';
import { SecondaryButton } from './SecondaryButton';
import { useReduceMotion } from '@/design/press';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

export const REFLECTION_CARD = { radius: 22, padding: 24 } as const;

export type ReflectionCardState = 'loading' | 'complete' | 'offline' | 'error';

type ReflectionCardProps = {
  onContinue: () => void;
  onRetry?: () => void;
  state: ReflectionCardState;
  text?: string | null;
};

/**
 * Reflection result card (radius 22, padding 24). Loading keeps the completion
 * composition with a slow 1.2 s breathing indicator; offline and error copy is
 * inline and never replaces the scenic screen.
 */
export function ReflectionCard({ onContinue, onRetry, state, text }: ReflectionCardProps) {
  const { theme } = useEchoTheme();
  const reduceMotion = useReduceMotion();
  const [breath] = useState(() => new Animated.Value(0.42));

  useEffect(() => {
    if (state !== 'loading' || reduceMotion) {
      breath.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          toValue: 0.42,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, reduceMotion, state]);

  return (
    <GlassCard padding={REFLECTION_CARD.padding} style={styles.card} variant="strong">
      <Text style={[styles.eyebrow, { color: theme.color.textSecondary }]}>TODAY’S ECHO</Text>
      {state === 'loading' ? (
        <View style={styles.loadingRow}>
          <Animated.View
            style={[styles.breath, { backgroundColor: theme.color.accentWarm, opacity: breath }]}
          />
          <Text style={[styles.body, { color: theme.color.textPrimary }]}>
            Listening for what returned…
          </Text>
        </View>
      ) : null}
      {state === 'complete' && text ? (
        <Text accessibilityLiveRegion="polite" style={[styles.body, { color: theme.color.textPrimary }]}>
          {text}
        </Text>
      ) : null}
      {state === 'offline' || state === 'error' ? (
        <>
          <Text style={[styles.body, { color: theme.color.textPrimary }]}>
            Your words are saved. The reflection can wait.
          </Text>
          <View style={styles.actions}>
            {onRetry ? (
              <SecondaryButton label="Try again" onPress={onRetry} style={styles.action} variant="ghost" />
            ) : null}
            <SecondaryButton label="Continue" onPress={onContinue} style={styles.action} variant="ghost" />
          </View>
        </>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch' },
  eyebrow: {
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[12], marginTop: tokens.space[12] },
  breath: { width: 10, height: 10, borderRadius: 5 },
  body: {
    marginTop: tokens.space[12],
    ...tokens.type.display,
    fontSize: tokens.typography.bodyL.size + 2,
    lineHeight: tokens.typography.bodyL.lineHeight + 6,
  },
  actions: { flexDirection: 'row', gap: tokens.space[20], marginTop: tokens.space[20] },
  action: { alignSelf: 'flex-start', width: 'auto' },
});
