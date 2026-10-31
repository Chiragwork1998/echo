import { MotionButton } from "./MotionButton";
import type { StyleProp, ViewStyle } from "react-native";
type PrimaryCTAProps = {
  accessibilityHint?: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  showArrow?: boolean;
  style?: StyleProp<ViewStyle>;
  busy?: boolean;
};
export function PrimaryCTA(props: PrimaryCTAProps) {
  return <MotionButton {...props} />;
}
