import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GlassCard } from "./GlassCard";
import { SecondaryButton } from "./SecondaryButton";
import { useEchoTheme } from "@/design/ThemeProvider";
import { tokens } from "@/design/tokens";

export function JourneySheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { theme } = useEchoTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.limit} accessibilityViewIsModal>
          <GlassCard inModal padding={24} style={styles.card} variant="strong">
            <ScrollView
              style={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text
                accessibilityRole="header"
                style={[styles.title, { color: theme.color.textPrimary }]}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  style={[styles.body, { color: theme.color.textSecondary }]}
                >
                  {subtitle}
                </Text>
              ) : null}
              <View style={styles.content}>{children}</View>
              <SecondaryButton
                label="Close"
                onPress={onClose}
                variant="ghost"
                style={styles.close}
              />
            </ScrollView>
          </GlassCard>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(2,10,20,0.78)",
  },
  limit: {
    maxWidth: 430,
    width: "100%",
    maxHeight: "90%",
    alignSelf: "center",
  },
  card: { flexShrink: 1 },
  scroll: { flexShrink: 1 },
  title: { ...tokens.type.display, fontSize: 30, lineHeight: 36 },
  body: { ...tokens.type.ui, fontSize: 13, lineHeight: 21, marginTop: 8 },
  content: { gap: 16, marginTop: 24 },
  close: { marginTop: 16 },
});
