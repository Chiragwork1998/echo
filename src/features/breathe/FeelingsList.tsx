import { Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { OnboardingHeading } from '@/components/OnboardingHeading';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { freeAtAll } from './access';
import { breatheCopy } from './breatheCopy';
import type { Practice } from './types';

// Measured by eye against the onboarding goldens' headings and the Completion card.
const HEADING_TOP = 18;
const ROW_HEIGHT = 56;
const ROW_INSET = 20;

type Props = {
  practices: Practice[];
  /** Marks the practices that need ECHO Plus. Only for someone without it. */
  markPlus: boolean;
  onChoose: (practice: Practice) => void;
};

/**
 * "What are you feeling?" The question on the plate, and the feelings as one quiet list in a single
 * glass surface with hairlines between them: the feeling in Cormorant, its practice and length in
 * small type. No icons and no card for each.
 */
export function FeelingsList({ practices, markPlus, onChoose }: Props) {
  const { colors } = useTheme();
  return (
    <View>
      <OnboardingHeading title={breatheCopy.title} top={HEADING_TOP} />
      <View style={styles.list}>
        <GlassCard radius={tokens.radius.card}>
          {practices.map((practice, index) => {
            const plus = markPlus && !freeAtAll(practice);
            const detail = [practice.name, breatheCopy.minutes(practice.minutes)];
            if (plus) detail.push(breatheCopy.plus);
            const label = `${practice.feeling}. ${detail.join(', ')}`;
            return (
              <Pressable
                key={practice.id}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => onChoose(practice)}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && { borderTopColor: colors.borderGlass, ...styles.rule },
                  pressed && styles.pressed,
                ]}
                testID={`feeling-${practice.id}`}
              >
                <EchoText variant="bodyL" serif style={styles.feeling}>
                  {practice.feeling}
                </EchoText>
                <EchoText variant="caption" color="textSecondary" style={styles.detail}>
                  {detail.join(' · ')}
                </EchoText>
              </Pressable>
            );
          })}
        </GlassCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 20 },
  row: {
    minHeight: ROW_HEIGHT,
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: ROW_INSET,
    paddingVertical: 8,
  },
  rule: { borderTopWidth: StyleSheet.hairlineWidth },
  pressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  feeling: { fontSize: 19.5, lineHeight: 24, letterSpacing: 0 },
  detail: { fontSize: 11, lineHeight: 15, letterSpacing: 0.4, opacity: 0.86 },
});
