import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceMarker } from '@/components/ChoiceMarker';
import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import type { Plan } from '@/services/plus/types';

import { plusCopy } from './plusCopy';

const ROW_PADDING = tokens.space[16];
/** Two lines of text and their padding: the height a plan row has, loaded or not. */
const ROW_HEIGHT = 66;
const DETAIL = { fontSize: 14, lineHeight: 19 } as const;

function Rule() {
  const { colors } = useTheme();
  return <View style={[styles.rule, { backgroundColor: colors.borderGlass }]} />;
}

/** The store's plans, one surface, one choice. Yearly comes first and is chosen when it opens. */
export function PlanChoice({
  plans,
  selectedId,
  onChoose,
  disabled,
}: {
  plans: Plan[];
  selectedId: string | null;
  onChoose: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <GlassCard radius={tokens.radius.medium}>
      <View accessibilityRole="radiogroup" accessibilityLabel={plusCopy.plansLabel}>
        {plans.map((plan, index) => {
          const selected = plan.id === selectedId;
          const name = plusCopy.planName[plan.period];
          const line = plusCopy.planLine(plan.period, plan.price, plan.trial);
          return (
            <Fragment key={plan.id}>
              {index > 0 && <Rule />}
              <Pressable
                testID={`plan-${plan.period}`}
                accessibilityRole="radio"
                accessibilityLabel={`${name}. ${line}`}
                accessibilityState={{ selected, checked: selected, disabled }}
                disabled={disabled}
                onPress={() => onChoose(plan.id)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.text}>
                  <EchoText variant="bodyM" maxFontSizeMultiplier={1.6}>
                    {name}
                  </EchoText>
                  <EchoText
                    variant="bodyM"
                    color="textSecondary"
                    style={DETAIL}
                    maxFontSizeMultiplier={1.6}
                  >
                    {line}
                  </EchoText>
                </View>
                <ChoiceMarker selected={selected} disabled={disabled && !selected} />
              </Pressable>
            </Fragment>
          );
        })}
      </View>
    </GlassCard>
  );
}

/** Shaped like the two plans that are coming: the same rows, with quiet bars for their words. */
export function PlanSkeleton() {
  const { colors } = useTheme();
  return (
    <GlassCard radius={tokens.radius.medium}>
      <View
        accessible
        accessibilityLabel={plusCopy.loadingPlans}
        accessibilityState={{ busy: true }}
        testID="plans-loading"
      >
        {[0.26, 0.2].map((width, index) => (
          <Fragment key={width}>
            {index > 0 && <Rule />}
            <View style={styles.row}>
              <View style={[styles.text, styles.bars]}>
                <View style={[styles.bar, { width: `${width * 100}%` }]} />
                <View style={[styles.bar, { width: `${(width + 0.38) * 100}%` }]} />
              </View>
              <View style={[styles.ring, { borderColor: colors.borderGlass }]} />
            </View>
          </Fragment>
        ))}
      </View>
    </GlassCard>
  );
}

/** In place of the plans when there are none to show: what happened, and what to do. */
export function PlanMessage({ message }: { message: string }) {
  return (
    <GlassCard radius={tokens.radius.medium} strength="strong">
      <View style={styles.message} accessibilityLiveRegion="polite">
        <EchoText variant="bodyM" maxFontSizeMultiplier={1.6}>
          {message}
        </EchoText>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
    paddingHorizontal: ROW_PADDING,
    paddingVertical: tokens.space[12],
  },
  pressed: { opacity: 0.72 },
  text: { flex: 1, gap: 2 },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: ROW_PADDING, opacity: 0.5 },
  // Home's card skeleton, so that every wait in ECHO looks the same.
  bars: { gap: tokens.space[12] },
  bar: { height: 9, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.14)' },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, opacity: 0.35 },
  message: { padding: tokens.space[20] },
});
