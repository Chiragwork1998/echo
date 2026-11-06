import { Children, Fragment, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { SoftScrim } from '@/components/SoftScrim';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { pageCopy } from './pageCopy';
import { onPlate, supporting } from './textStyles';

const ROW_PADDING = tokens.space[16];

// The same soft local patch the Privacy step puts behind its notes. Day's snow and clouds are
// brighter, so its patch is stronger (docs/SPEC_CONFLICTS.md, C-05: no global scrim).
const SCRIM_ALPHA = { day: 0.36, night: 0.3 } as const;
const SCRIM_INSET = { x: 34, y: 14 };

/** Keeps text set straight on the photograph legible, with a feathered patch behind it. */
export function OnPlate({ children }: PropsWithChildren) {
  const { name } = useTheme();
  return (
    <View>
      <View pointerEvents="none" style={styles.scrim}>
        <SoftScrim alpha={SCRIM_ALPHA[name]} />
      </View>
      {children}
    </View>
  );
}

/** A small caption that names the group beneath it. */
export function Heading({ children }: { children: string }) {
  return (
    <OnPlate>
      <EchoText variant="caption" color="textSecondary" accessibilityRole="header" style={onPlate}>
        {children.toUpperCase()}
      </EchoText>
    </OnPlate>
  );
}

/** A heading with its rows on one piece of plain glass. Hairlines between rows, no decoration. */
export function Section({ title, children }: PropsWithChildren<{ title?: string }>) {
  const { colors } = useTheme();
  const rows = Children.toArray(children);
  return (
    <View style={styles.section}>
      {title ? <Heading>{title}</Heading> : null}
      <GlassCard radius={tokens.radius.medium}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && <View style={[styles.rule, { backgroundColor: colors.borderGlass }]} />}
            {row}
          </Fragment>
        ))}
      </GlassCard>
    </View>
  );
}

type RowProps = {
  label: string;
  detail?: string;
  /** Without onPress the row is read-only text. */
  onPress?: () => void;
  role?: 'button' | 'radio';
  selected?: boolean;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  hint?: string;
  trailing?: ReactNode;
  /** What a screen reader says, when the visible text alone would leave something out. */
  spoken?: string;
};

/** One line of a Section: a label, an optional detail, and at most one control. 44 pt or taller. */
export function Row({
  label,
  detail,
  onPress,
  role = 'button',
  selected,
  busy,
  disabled,
  destructive,
  hint,
  trailing,
  spoken: override,
}: RowProps) {
  const { colors } = useTheme();
  const spoken = override ?? (detail && role === 'button' ? `${label}. ${detail}` : label);
  const body = (
    <View style={styles.row}>
      <View style={styles.text}>
        <EchoText
          variant="bodyM"
          style={destructive ? { color: colors.danger } : undefined}
          maxFontSizeMultiplier={1.6}
        >
          {label}
        </EchoText>
        {detail ? (
          <EchoText
            variant="caption"
            color="textSecondary"
            style={supporting}
            maxFontSizeMultiplier={1.6}
          >
            {detail}
          </EchoText>
        ) : null}
      </View>
      {busy ? <ActivityIndicator color={colors.textPrimary} /> : trailing}
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={override ?? (detail ? `${label}. ${detail}` : label)}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      accessibilityState={
        role === 'radio'
          ? { selected, checked: selected, disabled }
          : { disabled: disabled || busy, busy }
      }
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}
    >
      {body}
    </Pressable>
  );
}

/** An inline message that never replaces the page. Announced politely when it appears. */
export function Notice({
  message,
  actionLabel = pageCopy.retry,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <GlassCard radius={tokens.radius.medium} strength="strong">
      <View style={styles.row} accessibilityLiveRegion="polite">
        <EchoText variant="bodyM" style={styles.text}>
          {message}
        </EchoText>
        {onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            hitSlop={8}
            style={styles.action}
          >
            <EchoText variant="label">{actionLabel.toUpperCase()}</EchoText>
          </Pressable>
        ) : null}
      </View>
    </GlassCard>
  );
}

/** Centred text for empty and waiting states, on glass so that it reads over any part of the plate. */
export function Quiet({ children, busy }: PropsWithChildren<{ busy?: boolean }>) {
  const { colors } = useTheme();
  return (
    <GlassCard radius={tokens.radius.medium}>
      <View
        style={styles.quiet}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityState={{ busy }}
      >
        {busy ? <ActivityIndicator color={colors.textPrimary} /> : null}
        <EchoText variant="bodyM" color="textSecondary" align="center">
          {children}
        </EchoText>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: -SCRIM_INSET.x,
    right: -SCRIM_INSET.x,
    top: -SCRIM_INSET.y,
    bottom: -SCRIM_INSET.y,
  },
  section: { gap: tokens.space[8] },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: ROW_PADDING, opacity: 0.5 },
  row: {
    minHeight: tokens.size.tapTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
    paddingHorizontal: ROW_PADDING,
    paddingVertical: tokens.space[12],
  },
  text: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.42 },
  action: { minHeight: tokens.size.tapTarget, justifyContent: 'center', paddingHorizontal: 6 },
  quiet: {
    alignItems: 'center',
    gap: tokens.space[12],
    padding: tokens.space[20],
  },
});
