import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { useReduceMotion } from "@/design/press";
import { useEchoTheme } from "@/design/ThemeProvider";
import { haptics } from "@/services/haptics";
/** Jitter On / Off Toggle motion, rendered as a real accessible switch. */
export function MotionToggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const { theme } = useEchoTheme();
  const reduced = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    const motion = Animated.spring(progress, {
      toValue: value ? 1 : 0,
      stiffness: 260,
      damping: 20,
      mass: 0.65,
      useNativeDriver: false,
    });
    if (reduced) progress.setValue(value ? 1 : 0);
    else motion.start();
    return () => motion.stop();
  }, [value, reduced, progress]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.light();
        onValueChange(!value);
      }}
      style={[styles.target, disabled && { opacity: 0.45 }]}
    >
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: progress.interpolate({
              inputRange: [0, 1],
              outputRange: ["rgba(255,255,255,0.16)", theme.color.accentWarm],
            }),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: theme.color.surfacePrimary,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 22],
                  }),
                },
              ],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  target: {
    width: 60,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  track: { width: 52, height: 30, padding: 3, borderRadius: 15 },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
