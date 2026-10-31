import { useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useEchoTheme } from "@/design/ThemeProvider";
import { useReduceMotion } from "@/design/press";
import { tokens } from "@/design/tokens";
import { haptics } from "@/services/haptics";
import { EchoIcon } from "@/components/EchoIcon";

/** Interactive adaptation of Jitter's free Glass Button / Continue Button motion.
 * Real input stays immediate; decorative motion never delays an action. */
export function MotionButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  tone = "cream",
  showArrow = true,
  accessibilityHint,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "cream" | "ink" | "glass";
  showArrow?: boolean;
  accessibilityHint?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useEchoTheme();
  const reduced = useReduceMotion();
  const [focused, setFocused] = useState(false);
  const [press] = useState(() => new Animated.Value(0));
  const [sheen] = useState(() => new Animated.Value(-1));
  const blocked = disabled || busy;
  const dark = tone === "ink";
  const ink =
    focused ? theme.color.textInk : dark || tone === "glass" ? theme.color.surfacePrimary : theme.color.textInk;
  const fill = dark
    ? theme.color.textInk
    : tone === "glass"
      ? theme.color.surfaceGlassStrong
      : theme.color.surfacePrimary;
  const move = (value: number) => {
    if (reduced) {
      press.setValue(0);
      return;
    }
    Animated.spring(press, {
      toValue: value,
      stiffness: value ? 360 : 250,
      damping: value ? 27 : 16,
      mass: 0.55,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };
  const sweep = () => {
    if (blocked || reduced) return;
    sheen.stopAnimation();
    sheen.setValue(-1);
    Animated.timing(sheen, {
      toValue: 1,
      duration: 720,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };
  return (
    <Animated.View
      style={[
        styles.wrap,
        style,
        {
          opacity: disabled && !busy ? 0.5 : 1,
          transform: [
            {
              scale: press.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.967],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: blocked, busy }}
        disabled={blocked}
        onPress={() => {
          haptics.light();
          onPress();
        }}
        onPressIn={() => {
          move(1);
          sweep();
        }}
        onPressOut={() => move(0)}
        onHoverIn={sweep}
        onFocus={() => {
          setFocused(true);
          sweep();
        }}
        onBlur={() => setFocused(false)}
        style={[
          styles.button,
          {
            backgroundColor: focused ? theme.color.accentWarm : fill,
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sheen,
            {
              opacity: sheen.interpolate({
                inputRange: [-1, -0.8, 0.8, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateX: sheen.interpolate({
                    inputRange: [-1, 1],
                    outputRange: [-400, 400],
                  }),
                },
                { skewX: "-18deg" },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[
              "transparent",
              dark ? "rgba(255,255,255,0.17)" : "rgba(255,255,255,0.7)",
              "transparent",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Text style={[styles.label, { color: ink }]}>{label}</Text>
        {busy ? (
          <ActivityIndicator color={ink} size="small" />
        ) : showArrow ? (
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.arrow,
              {
                transform: [
                  {
                    translateX: press.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 3],
                    }),
                  },
                ],
              },
            ]}
          >
            <EchoIcon name="arrow-right" color={ink} size={20} />
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  wrap: { width: "100%", maxWidth: 345, minHeight: 56, borderRadius: 28 },
  button: {
    minHeight: 56,
    borderRadius: 28,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    overflow: "hidden",
    borderWidth: 0,
    outlineWidth: 0,
    outlineStyle: "solid",
  },
  sheen: {
    position: "absolute",
    top: -10,
    bottom: -10,
    width: 120,
    left: "50%",
  },
  label: {
    ...tokens.type.uiMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    flexShrink: 1,
  },
  arrow: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
