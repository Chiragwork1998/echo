import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { Icon, type IconName } from '@/components/Icon';
import { copy } from '@/content/copy';
import { useTheme } from '@/design/theme';

import { CONTROL, SURFACE_INSET } from './geometry';
import { GlassPanel } from './GlassPanel';

export type SessionMode = 'write' | 'speak';

const CREAM_STOPS = ['#FBF8F2', '#EDE6DC'] as const; // tokens.gradient.creamButton
const DISABLED_OPACITY = 0.42;
// The unchosen half is neutral grey glass in both goldens: cooler at Night, warmer by Day.
const SEGMENT_TINT = { night: 'rgba(54,56,60,0.8)', day: 'rgba(70,68,66,0.75)' } as const;
const SEGMENT_BLUR = 6;
const MODES: { mode: SessionMode; icon: IconName; label: string }[] = [
  { mode: 'write', icon: 'pen', label: copy.firstEcho.write },
  { mode: 'speak', icon: 'mic', label: copy.firstEcho.speak },
];

type Props = {
  mode: SessionMode;
  onChange: (mode: SessionMode) => void;
  /** Held while a recording is being made or saved, so a tap cannot strand it. */
  disabled?: boolean;
};

/** Write or Speak: two equal halves, the chosen one filled cream with a warm rim. */
export function SegmentedMode({ mode, onChange, disabled = false }: Props) {
  const { name, colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.row, { opacity: disabled ? DISABLED_OPACITY : 1 }]}
    >
      {MODES.map((item) => {
        const selected = item.mode === mode;
        const ink = selected ? colors.textInk : colors.textPrimary;
        const content = (
          <View style={styles.content}>
            <Icon name={item.icon} size={24} color={ink} />
            <EchoText variant="bodyM" style={[styles.label, { color: ink }]}>
              {item.label}
            </EchoText>
          </View>
        );
        return (
          <Pressable
            key={item.mode}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => !selected && onChange(item.mode)}
            style={[styles.cell, selected && styles.lead]}
          >
            {selected ? (
              <>
                <View
                  pointerEvents="none"
                  style={[styles.rim, { borderColor: colors.accentWarm }]}
                />
                <LinearGradient
                  colors={CREAM_STOPS}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.fill}
                >
                  {content}
                </LinearGradient>
              </>
            ) : (
              <GlassPanel
                radius={CONTROL.radius}
                blur={SEGMENT_BLUR}
                tint={SEGMENT_TINT[name]}
                style={styles.fill}
              >
                {content}
              </GlassPanel>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // The writing surface and this control share an edge, 30 pt in from the screen.
  row: { flexDirection: 'row', gap: CONTROL.gap, marginHorizontal: SURFACE_INSET },
  cell: { flex: 1, height: CONTROL.height },
  lead: { marginLeft: CONTROL.lead },
  fill: { flex: 1, borderRadius: CONTROL.radius, overflow: 'hidden' },
  rim: {
    position: 'absolute',
    top: -CONTROL.rim,
    left: -CONTROL.rim,
    right: -CONTROL.rim,
    bottom: -CONTROL.rim,
    borderRadius: CONTROL.radius + CONTROL.rim,
    borderWidth: 1.5,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  label: { fontSize: 13, lineHeight: 18 },
});
