import { useRouter, type Href } from "expo-router";
import { useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppShell } from "@/components/AppShell";
import { ContentBackdrop } from "@/components/ContentBackdrop";
import { MotionButton } from "@/components/MotionButton";
import { EchoBackground } from "@/components/EchoBackground";
import { EchoIcon, type EchoIconName } from "@/components/EchoIcon";
import { TabBar } from "@/components/TabBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WeekRhythm } from "@/components/WeekRhythm";
import { screenBackgrounds, screenFocalPoints } from "@/design/backgrounds";
import { useEchoTheme } from "@/design/ThemeProvider";
import { tokens } from "@/design/tokens";
import { useReduceMotion } from "@/design/press";
import { haptics } from "@/services/haptics";
import { deriveRhythmWeek, useJournal, useJournalDraft } from "@/state/journal";
import { startSession } from "@/state/session";
import { useOnboardingState } from "@/state/onboardingSelections";
import {
  BLANK_PROMPT,
  promptsFor,
  entryDate,
} from "@/features/journal/prompts";

const MODES: {
  id: "guided" | "blank" | "voice";
  label: string;
  icon: EchoIconName;
}[] = [
  { id: "guided", label: "Guide me", icon: "pen" },
  { id: "blank", label: "Free write", icon: "book" },
  { id: "voice", label: "Speak", icon: "mic" },
];
export default function HomeScreen() {
  const router = useRouter();
  const { name, theme } = useEchoTheme();
  const entries = useJournal();
  const draft = useJournalDraft();
  const preferences = useOnboardingState((state) => state);
  const [mode, setMode] = useState<"guided" | "blank" | "voice">(
    preferences.mode === "give_me_space"
      ? "blank"
      : preferences.mode === "let_me_speak"
        ? "voice"
        : "guided",
  );
  const [offset, setOffset] = useState(0);
  const switching = useRef(false);
  const navigating = useRef(false);
  const [fade] = useState(() => new Animated.Value(1));
  const reduceMotion = useReduceMotion();
  const prompts = promptsFor(preferences.intent, preferences.horizon);
  const prompt = prompts[(entries.length + offset) % prompts.length]!;
  const today = entries.some(
    (entry) =>
      new Date(entry.createdAt).toDateString() === new Date().toDateString(),
  );
  const date = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const changePrompt = () => {
    if (switching.current) return;
    haptics.light();
    if (reduceMotion) {
      setOffset((value) => value + 1);
      return;
    }
    switching.current = true;
    Animated.timing(fade, {
      toValue: 0,
      duration: 110,
      useNativeDriver: true,
    }).start(() => {
      setOffset((value) => value + 1);
      Animated.timing(fade, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }).start(() => {
        switching.current = false;
      });
    });
  };
  const begin = () => {
    if (navigating.current) return;
    navigating.current = true;
    haptics.light();
    if (draft)
      startSession(
        draft.mode,
        { id: draft.promptId, text: draft.promptTextSnapshot, opening: "" },
        draft.moodBefore,
        draft,
      );
    else
      startSession(
        mode === "voice" ? "voice" : "text",
        mode === "blank" ? BLANK_PROMPT : prompt,
        null,
      );
    router.push("/journal" as Href);
    setTimeout(() => {
      navigating.current = false;
    }, 600);
  };
  const ink = theme.color.textInk;
  const light = theme.color.textPrimary;
  return (
    <AppShell
      theme={theme}
      insetBottom={false}
      background={
        <><EchoBackground
          fallbackColor={ink}
          focalPoint={screenFocalPoints.home}
          source={screenBackgrounds[name].home}
        /><View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4,12,22,0.28)' }]} /></>
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.top}>
          <Text style={[styles.date, { color: light }]}>
            {date.toUpperCase()}
          </Text>
          <ThemeToggle><Text style={[styles.wordmark, { color: light }]}>ECHO</Text></ThemeToggle>
        </View>
        <View style={styles.hero}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: light }]}
          >
            {draft
              ? "A thought,\nwaiting for you."
              : today
                ? "A little more\nroom to be you."
                : "Let the day\nland here."}
          </Text>
          <Text style={[styles.subtitle, { color: theme.color.textSecondary }]}>
            {draft
              ? "Pick up exactly where you left yourself."
              : today
                ? "You have already made space. You can always return."
                : "You don’t have to hold it all in your head."}
          </Text>
        </View>
        {!draft ? (
          <View accessibilityRole="radiogroup" style={styles.modes}>
            {MODES.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityLabel={item.label}
                accessibilityState={{ checked: mode === item.id }}
                onPress={() => {
                  setMode(item.id);
                  haptics.light();
                }}
                style={[
                  styles.mode,
                  mode === item.id && {
                    backgroundColor: theme.color.surfacePrimary,
                  },
                ]}
              >
                <EchoIcon
                  name={item.icon}
                  size={17}
                  color={mode === item.id ? ink : light}
                />
                <Text
                  style={[
                    styles.modeLabel,
                    { color: mode === item.id ? ink : light },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View
          style={[
            styles.paper,
          ]}
        >
          <ContentBackdrop />
          <View
            pointerEvents="none"
            style={[styles.ribbon, { backgroundColor: theme.color.accentWarm }]}
          />
          <View style={styles.paperHeading}>
            <Text style={[styles.eyebrow, { color: theme.color.textContentSecondary }]}>
              {draft
                ? "YOUR UNFINISHED PAGE"
                : mode === "voice"
                  ? "A MOMENT IN YOUR VOICE"
                  : mode === "blank"
                    ? "NO PROMPT. JUST YOU."
                    : "ONE QUESTION. YOUR OWN WORDS."}
            </Text>
            <EchoIcon color={theme.color.textContent} name="pen" size={19} />
          </View>
          <Animated.View style={{ opacity: fade }}>
            <Text style={[styles.question, { color: theme.color.textContent }]}>
              {draft
                ? draft.promptTextSnapshot
                : mode === "blank"
                  ? "Begin anywhere.\nThis page is yours."
                  : prompt.text}
            </Text>
          </Animated.View>
          <Text numberOfLines={2} style={[styles.paperNote, { color: theme.color.textContentSecondary }]}>
            {draft
              ? draft.body || "Your recording is kept with this page."
              : mode === "voice"
                ? "Say it as it comes. Your voice is enough."
                : mode === "blank"
                  ? "A list. A memory. One unfinished sentence."
                  : "Let the first honest sentence find you."}
          </Text>
          <MotionButton
            tone="ink"
            accessibilityLabel={
              draft ? "Return to your page" : "Open my journal"
            }
            label={
              draft
                ? "Continue my page"
                : mode === "voice"
                  ? "Speak my echo"
                  : "Open my journal"
            }
            onPress={begin}
            style={{ marginTop: 22 }}
          />
          {!draft && mode !== "blank" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="A different question"
              onPress={changePrompt}
              style={styles.another}
            >
              <Text style={[styles.anotherText, { color: theme.color.textContentSecondary }]}>
                Try another question
              </Text>
            </Pressable>
          ) : null}
        </View>
        {entries[0] ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read your latest echo"
            onPress={() => router.push(`/entry/${entries[0]!.id}` as Href)}
            style={styles.memory}
          >
            <View
              style={[
                styles.memoryMark,
                { backgroundColor: theme.color.accentWarm },
              ]}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Text
                style={[styles.eyebrow, { color: theme.color.textSecondary }]}
              >
                LAST TIME YOU WERE HERE · {entryDate(entries[0].createdAt)}
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.memoryText, { color: light }]}
              >
                {entries[0].takeaway ||
                  entries[0].body ||
                  entries[0].promptTextSnapshot}
              </Text>
            </View>
            <EchoIcon name="arrow-right" color={light} size={22} />
          </Pressable>
        ) : null}
        <View style={styles.rhythm}>
          <View style={styles.rhythmHeading}>
            <Text style={[styles.eyebrow, { color: light }]}>
              A PRACTICE, AT YOUR PACE
            </Text>
            <Text
              style={[styles.optional, { color: theme.color.textSecondary }]}
            >
              {deriveRhythmWeek(entries).filter((day) => day.completed).length}{" "}
              days this week
            </Text>
          </View>
          <WeekRhythm days={deriveRhythmWeek(entries)} />
        </View>
      </ScrollView>
      <TabBar active="today" />
    </AppShell>
  );
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 32,
  },
  date: { ...tokens.type.uiMedium, fontSize: 9, letterSpacing: 1.5 },
  wordmark: { ...tokens.type.display, fontSize: 19, letterSpacing: 5 },
  hero: { paddingTop: 22, paddingBottom: 24 },
  title: {
    ...tokens.type.display,
    fontSize: 44,
    lineHeight: 43,
    letterSpacing: -0.7,
  },
  subtitle: {
    ...tokens.type.ui,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 12,
    maxWidth: 290,
  },
  modes: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    borderRadius: 999,
    backgroundColor: "rgba(6,17,30,0.65)",
    marginBottom: 18,
  },
  mode: {
    minHeight: 44,
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    flexDirection: "row",
  },
  modeLabel: { ...tokens.type.uiMedium, fontSize: 11 },
  paper: {
    zIndex: 0,
    overflow: "hidden",
    borderRadius: 8,
    paddingTop: 25,
    paddingBottom: 8,
    paddingHorizontal: 25,
    shadowColor: "#061423",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 22,
    elevation: 8,
  },
  ribbon: { position: "absolute", right: 27, top: -6, height: 25, width: 9 },
  paperHeading: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    ...tokens.type.uiMedium,
    fontSize: 8,
    lineHeight: 14,
    letterSpacing: 1.25,
  },
  question: {
    ...tokens.type.display,
    fontSize: 31,
    lineHeight: 34,
    letterSpacing: -0.3,
    marginTop: 20,
  },
  paperNote: {
    ...tokens.type.ui,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 12,
    opacity: 0.9,
  },
  begin: {
    marginTop: 22,
    minHeight: 52,
    borderRadius: 999,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  beginText: { ...tokens.type.uiMedium, fontSize: 13 },
  arrow: { fontSize: 22 },
  another: { minHeight: 40, alignItems: "center", justifyContent: "center" },
  anotherText: { ...tokens.type.ui, fontSize: 10, opacity: 0.9 },
  optional: { ...tokens.type.ui, fontSize: 9, lineHeight: 16, opacity: 0.8 },
  memory: {
    marginTop: 24,
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    paddingVertical: 20,
  },
  memoryMark: { width: 0, height: 48 },
  memoryText: { ...tokens.type.displayItalic, fontSize: 21, lineHeight: 26 },
  rhythm: {
    marginTop: 24,
    paddingTop: 20,
  },
  rhythmHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 20,
  },
});
