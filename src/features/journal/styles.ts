import { StyleSheet } from "react-native";
import { tokens } from "@/design/tokens";

export const journalStyles = StyleSheet.create({
  label: {
    ...tokens.type.ui,
    fontSize: 10,
    letterSpacing: 1.8,
    lineHeight: 16,
  },
  heading: { ...tokens.type.display, fontSize: 28, lineHeight: 34 },
  body: { ...tokens.type.ui, fontSize: 14, lineHeight: 23 },
  small: { ...tokens.type.ui, fontSize: 12, lineHeight: 19 },
  gap: { gap: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  section: { marginTop: 28 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...tokens.type.ui,
    fontSize: 14,
  },
  prose: { ...tokens.type.display, fontSize: 23, lineHeight: 35 },
});
