import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppShell } from "@/components/AppShell";
import { EchoBackground } from "@/components/EchoBackground";
import { ContentBackdrop } from "@/components/ContentBackdrop";
import { EchoIcon } from "@/components/EchoIcon";
import { MoodStone } from "@/components/MoodStone";
import { PrimaryCTA } from "@/components/PrimaryCTA";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { screenBackgrounds, screenFocalPoints } from "@/design/backgrounds";
import { useEchoTheme } from "@/design/ThemeProvider";
import { useReduceMotion } from "@/design/press";
import { tokens } from "@/design/tokens";
import {
  getJournalStorageKind,
  updateJournalEntry,
  useJournal,
} from "@/state/journal";
import {
  flushOnboardingPersistence,
  markOnboardingComplete,
  type MoodSelection,
} from "@/state/onboardingSelections";
import { MOODS, entryDate } from "./prompts";

export default function ClosingScreen({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();
  const entries = useJournal();
  const entry = entryId
    ? entries.find((item) => item.id === entryId)
    : onboarding
      ? entries[0]
      : undefined;
  const { name, theme } = useEchoTheme();
  const reduceMotion = useReduceMotion();
  const [mood, setMood] = useState<MoodSelection | null>(
    entry?.moodAfter ?? null,
  );
  const [takeaway, setTakeaway] = useState(entry?.takeaway ?? "");
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const [reveal] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(reveal, {
      toValue: 1,
      duration: reduceMotion ? 0 : 800,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, reveal]);
  const finish = async (target: "home" | "entry" = "home", skip = false) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (
        entry &&
        !skip &&
        (mood !== (entry.moodAfter ?? null) ||
          takeaway.trim() !== (entry.takeaway ?? ""))
      )
        await updateJournalEntry(entry.id, {
          moodAfter: mood,
          takeaway: takeaway.trim() || null,
        });
      if (onboarding) {
        markOnboardingComplete();
        await flushOnboardingPersistence();
      }
      router.replace(
        target === "entry" && entry ? (`/entry/${entry.id}` as Href) : "/home",
      );
    } catch {
      setError(
        "Your echo is safe. Your closing note could not be saved. Try again, or leave the note for later.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <AppShell
      theme={theme}
      background={
        <><EchoBackground
          fallbackColor={theme.color.textInk}
          focalPoint={screenFocalPoints.completion}
          source={screenBackgrounds[name].completion}
        /><View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,16,30,0.32)' }]} /></>
      }
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ThemeToggle>
            <Text style={[styles.wordmark, { color: theme.color.textPrimary }]}>
              ECHO
            </Text>
          </ThemeToggle>
          <Animated.View
            style={[
              styles.ceremony,
              {
                opacity: reveal,
                transform: [
                  {
                    translateY: reveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [18, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View
              style={styles.outerRing}
            >
              <View
                style={styles.innerRing}
              >
                <EchoIcon
                  name="cairn-filled"
                  color={theme.color.accentWarm}
                  size={44}
                />
              </View>
            </View>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: theme.color.textPrimary }]}
            >
              {entry
                ? "You made room.\nLet that be enough."
                : "Your next page\nis waiting."}
            </Text>
            <Text
              style={[styles.subtitle, { color: theme.color.textSecondary }]}
            >
              {entry
                ? "Whatever changed—or didn’t—you showed up.\nThat is enough for today.".replace(
                    /\\n/g,
                    "\n",
                  )
                : "Begin with whatever is on your mind."}
            </Text>
          </Animated.View>
          {entry ? (
            <View
              style={styles.kept}
            >
              <EchoIcon name="lock" color={theme.color.accentWarm} size={15} />
              <View style={{ gap: 4, flex: 1 }}>
                <Text
                  style={[styles.keptTitle, { color: theme.color.textPrimary }]}
                >
                  {getJournalStorageKind() === "memory"
                    ? "Kept for this preview"
                    : "Your echo is saved"}
                </Text>
                <Text
                  style={[
                    styles.keptCaption,
                    { color: theme.color.textSecondary },
                  ]}
                >
                  {entryDate(entry.createdAt)} ·{" "}
                  {getJournalStorageKind() === "memory"
                    ? "until reload"
                    : "encrypted on this device"}
                </Text>
              </View>
              <Text style={[styles.check, { color: theme.color.accentWarm }]}>
                ✓
              </Text>
            </View>
          ) : null}
          {entry ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: reflectionOpen }}
                onPress={() => setReflectionOpen(!reflectionOpen)}
                style={styles.optional}
              >
                <Text
                  style={[
                    styles.optionalText,
                    { color: theme.color.textPrimary },
                  ]}
                >
                  {reflectionOpen
                    ? "One last moment with yourself"
                    : "Leave a closing thought"}
                </Text>
                <Text
                  style={[
                    styles.optionalHint,
                    { color: theme.color.textSecondary },
                  ]}
                >
                  {reflectionOpen ? "−" : "Optional +"}
                </Text>
              </Pressable>
              {reflectionOpen ? (
                <View style={styles.reflection}>
                  <ContentBackdrop />
                  <Text
                    style={[styles.label, { color: theme.color.textContentSecondary }]}
                  >
                    HOW ARE YOU LEAVING?
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {MOODS.map((item) => (
                      <MoodStone
                        key={item.id}
                        label={item.label}
                        onContent
                        selected={mood === item.id}
                        onPress={() =>
                          setMood(mood === item.id ? null : item.id)
                        }
                      />
                    ))}
                  </View>
                  <TextInput
                    underlineColorAndroid="transparent"
                    accessibilityLabel="Closing thought"
                    placeholder="One thing I want to carry with me…"
                    placeholderTextColor={theme.color.textContentSecondary}
                    value={takeaway}
                    onChangeText={setTakeaway}
                    maxLength={280}
                    multiline
                    editable={!busy}
                    style={[
                      styles.input,
                      {
                        color: theme.color.textContent,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.keptCaption,
                      { color: theme.color.textContentSecondary },
                    ]}
                  >
                    A feeling. A sentence. Or nothing at all.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: theme.color.textPrimary }]}
            >
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <PrimaryCTA
              label={
                busy
                  ? "Keeping your note…"
                  : onboarding
                    ? "Enter your space"
                    : "Return to today"
              }
              disabled={busy}
              onPress={() => void finish()}
            />
            {entry ? (
              <SecondaryButton
                label="Read my echo"
                variant="ghost"
                disabled={busy}
                onPress={() => void finish("entry")}
              />
            ) : null}
            {error ? (
              <SecondaryButton
                label="Leave the closing note for later"
                disabled={busy}
                onPress={() => void finish("home", true)}
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppShell>
  );
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 16 },
  progress: {
    ...tokens.type.uiMedium,
    fontSize: tokens.typography.caption.size,
    lineHeight: tokens.typography.caption.lineHeight,
    letterSpacing: tokens.typography.caption.tracking,
    textAlign: "center",
    marginTop: tokens.space[12],
  },
  wordmark: {
    ...tokens.type.display,
    fontSize: 21,
    letterSpacing: 7,
    textAlign: "center",
    marginTop: 8,
  },
  ceremony: { alignItems: "center", paddingTop: 34 },
  outerRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  innerRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,23,37,0.18)",
  },
  title: {
    ...tokens.type.display,
    fontSize: 40,
    lineHeight: 43,
    textAlign: "center",
    marginTop: 28,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...tokens.type.ui,
    fontSize: 12,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 14,
  },
  kept: {
    marginTop: 30,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  keptTitle: { ...tokens.type.uiMedium, fontSize: 12 },
  keptCaption: {
    ...tokens.type.ui,
    fontSize: 10,
    lineHeight: 16,
    opacity: 0.8,
  },
  check: { fontSize: 18 },
  optional: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  optionalText: { ...tokens.type.displayItalic, fontSize: 22 },
  optionalHint: { ...tokens.type.ui, fontSize: 9 },
  // Frosted warm-white content surface (ContentBackdrop) with ink text, legible over any photo.
  reflection: { zIndex: 0, overflow: "hidden", padding: 16, borderRadius: 18, gap: 16, marginBottom: 20 },
  label: { ...tokens.type.uiMedium, fontSize: 9, letterSpacing: 1.5 },
  input: {
    outlineWidth: 0,
    outlineStyle: "solid",
    ...tokens.type.display,
    fontSize: 23,
    lineHeight: 29,
    minHeight: 80,
    paddingBottom: 12,
  },
  error: { ...tokens.type.ui, fontSize: 12, lineHeight: 20 },
  actions: { marginTop: "auto", paddingTop: 24, alignItems: "center", gap: 4 },
});
