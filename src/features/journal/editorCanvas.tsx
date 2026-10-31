import { useEffect, useRef, useState } from "react";
import { BlurTargetView } from "expo-blur";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { ContentBackdrop } from "@/components/ContentBackdrop";
import { EchoBackground } from "@/components/EchoBackground";
import { EchoIcon } from "@/components/EchoIcon";
import { GlassBackdrop } from "@/components/GlassCard";
import { MotionButton } from "@/components/MotionButton";
import { screenBackgrounds, screenFocalPoints } from "@/design/backgrounds";
import { useReduceMotion } from "@/design/press";
import { useEchoInsets } from "@/design/safeArea";
import { useEchoTheme } from "@/design/ThemeProvider";
import { tokens } from "@/design/tokens";
import { haptics } from "@/services/haptics";
import { canReflect, type SessionState } from "@/state/session";
import type { JournalMode } from "@/state/journal";
import { wordCount } from "./prompts";

type EditorCanvasProps = {
  session: SessionState;
  saving: boolean;
  transcribing: boolean;
  voiceBusy: boolean;
  hasRecording: boolean;
  memoryOnly: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  notice: string | null;
  voiceNotice: string | null;
  onBack: () => void;
  onChangeText: (text: string) => void;
  onChangeMode: (mode: JournalMode) => void;
  onFinish: () => void;
  onRecord: () => void;
  onTranscribe: () => void;
};

const INK = tokens.color.night.textInk;
const LIGHT = tokens.color.night.textPrimary;
const MUTED = tokens.color.night.textSecondary;
const CONTENT = tokens.color.night.textContent;
const CONTENT_MUTED = tokens.color.night.textContentSecondary;
const STARTERS = [
  "Right now, I feel",
  "What I haven’t said is",
  "One thing I want to remember is",
];

/** A daily page is deliberately more direct than the first-run bookshelf. */
export function EditorCanvas({
  session,
  saving,
  transcribing,
  voiceBusy,
  hasRecording,
  memoryOnly,
  saveState,
  notice,
  voiceNotice,
  onBack,
  onChangeText,
  onChangeMode,
  onFinish,
  onRecord,
  onTranscribe,
}: EditorCanvasProps) {
  const { name, theme } = useEchoTheme();
  const insets = useEchoInsets();
  const backdrop = useRef<View>(null);
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [startersOpen, setStartersOpen] = useState(false);
  const [inputHeight, setInputHeight] = useState(200);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [date] = useState(() =>
    new Date().toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
  );
  const count = wordCount(session.text);
  const busy = saving || transcribing || voiceBusy;
  const ready = canReflect(session) && !busy;
  const storageText =
    saveState === "error"
      ? "Draft needs attention"
      : memoryOnly
        ? "Browser preview"
        : saveState === "saving"
          ? "Saving quietly…"
          : saveState === "saved"
            ? "Draft saved privately"
            : "A space of your own";

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const toggleFocus = () => {
    haptics.light();
    setFocused((value) => !value);
    setStartersOpen(false);
  };

  return (
    <View style={styles.root}>
      <BlurTargetView ref={backdrop} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <EchoBackground source={screenBackgrounds[name].home} focalPoint={screenFocalPoints.home} fallbackColor={theme.color.textInk} />
        <View style={[StyleSheet.absoluteFill, styles.readabilityVeil]} />
      </BlurTargetView>
    <GlassBackdrop.Provider value={backdrop}>
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      enabled={Platform.OS !== "web"}
      style={styles.keyboard}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityHint="Leave this page or keep it as a draft."
            accessibilityRole="button"
            disabled={busy}
            onPress={onBack}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          >
            <Text style={styles.closeGlyph}>×</Text>
            <Text style={styles.headerActionText}>Close</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.date}>{date}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.saveState}>
              {storageText}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={focused ? "Exit focus mode" : "Enter focus mode"}
            accessibilityState={{ selected: focused }}
            onPress={toggleFocus}
            style={({ pressed }) => [styles.headerAction, styles.focusAction, pressed && styles.pressed]}
          >
            <FocusIcon focused={focused} />
            <Text style={styles.headerActionText}>{focused ? "Return" : "Focus"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.paper}>
        <ContentBackdrop />
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            focused && styles.focusContent,
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          {!focused ? (
            <View style={styles.promptBlock}>
              <View style={styles.eyebrowRow}>
                <View style={styles.smallRule} />
                <Text style={styles.eyebrow}>
                  {session.prompt.id === "free_space" ? "THE OPEN PAGE" : "A MOMENT TO YOURSELF"}
                </Text>
              </View>
              <Text accessibilityRole="header" style={styles.prompt}>
                {session.prompt.text}
              </Text>
            </View>
          ) : (
            <Text style={styles.focusNote}>Nothing to do. Just be here.</Text>
          )}

          {!focused ? (
            <View style={styles.toolsRow}>
              <View accessibilityRole="tablist" style={styles.modeControl}>
                {(["text", "voice"] as const).map((mode) => {
                  const selected = session.mode === mode;
                  return (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected, disabled: busy || session.recording }}
                      disabled={busy || session.recording}
                      key={mode}
                      onPress={() => {
                        Keyboard.dismiss();
                        haptics.light();
                        onChangeMode(mode);
                      }}
                      style={[styles.mode, selected && styles.modeSelected]}
                    >
                      <EchoIcon name={mode === "text" ? "pen" : "mic"} color={selected ? LIGHT : CONTENT_MUTED} size={16} />
                      <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>
                        {mode === "text" ? "Write" : "Speak"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {session.mode === "text" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="A little help getting started"
                  accessibilityState={{ expanded: startersOpen }}
                  onPress={() => setStartersOpen((value) => !value)}
                  style={styles.starterToggle}
                >
                  <Text style={styles.starterToggleText}>
                    {startersOpen ? "Hide starters −" : "Need a start? +"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {startersOpen && session.mode === "text" && !focused ? (
            <View style={styles.starters}>
              <Text style={styles.startersLabel}>Borrow a beginning. Make it yours.</Text>
              {STARTERS.map((starter) => (
                <Pressable
                  accessibilityRole="button"
                  key={starter}
                  onPress={() => {
                    onChangeText(`${session.text.trimEnd()}${session.text.trim() ? "\n\n" : ""}${starter} `);
                    setStartersOpen(false);
                    input.current?.focus();
                  }}
                  style={({ pressed }) => [styles.starter, pressed && styles.pressed]}
                >
                  <Text style={styles.starterText}>{starter}…</Text>
                  <EchoIcon name="arrow-right" color={CONTENT} size={20} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {session.mode === "text" ? (
            <View style={styles.writingSpace}>
              <TextInput
                underlineColorAndroid="transparent"
                ref={input}
                accessibilityLabel="Your journal entry"
                autoCapitalize="sentences"
                editable={!saving && !transcribing}
                multiline
                onChangeText={onChangeText}
                onContentSizeChange={(event) => {
                  const next = Math.max(200, event.nativeEvent.contentSize.height);
                  setInputHeight((previous) => Math.abs(previous - next) > 1 ? next : previous);
                }}
                placeholder={session.prompt.id === "free_space" ? "Start anywhere. This page is yours…" : session.prompt.opening}
                placeholderTextColor={CONTENT_MUTED}
                scrollEnabled={false}
                selectionColor={CONTENT}
                style={[styles.input, { height: inputHeight }]}
                textAlignVertical="top"
                value={session.text}
              />
              {hasRecording ? (
                <View style={styles.attachedAudio}>
                  <EchoIcon name="mic" color={CONTENT_MUTED} size={15} />
                  <Text style={styles.attachedAudioText}>Your voice recording is attached</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <VoiceSpace
              key={session.recording ? "recording" : "ready"}
              busy={voiceBusy}
              hasRecording={hasRecording}
              notice={voiceNotice}
              onRecord={onRecord}
              onTranscribe={onTranscribe}
              recording={session.recording}
              savedSeconds={session.audioSeconds}
              transcribing={transcribing}
              saving={saving}
            />
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: keyboardVisible ? 12 : Math.max(insets.bottom, 16) }]}>
          {notice || saveState === "error" ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {notice ?? "Your draft could not be saved. Keep this page open and try again."}
            </Text>
          ) : null}
          {!keyboardVisible && !focused ? (
            <View style={styles.footerMeta}>
              <Text style={styles.wordCount}>
                {session.mode === "text" ? `${count} ${count === 1 ? "word" : "words"}` : hasRecording ? "A moment, held in your voice" : "You don’t have to find the right words"}
              </Text>
              {session.mode === "text" ? <Text style={styles.footerNote}>No rush.</Text> : null}
            </View>
          ) : null}
          <MotionButton
            tone="ink"
            busy={saving}
            label={saving ? "Saving your echo…" : "Keep this echo"}
            accessibilityLabel={saving ? "Saving your echo…" : "Keep this echo"}
            accessibilityHint={ready ? "Save this entry and take a moment to close." : session.recording ? "Stop recording first." : "Write a few words, or record at least three seconds, to save."}
            disabled={!ready}
            onPress={() => {
              Keyboard.dismiss();
              onFinish();
            }}
            showArrow={ready}
          />
          {!keyboardVisible ? (
            <Text style={styles.privacyNote}>
              {memoryOnly ? "Browser preview · this page resets on reload" : ready ? "Only for you. Saved on this device." : "A few honest words are enough."}
            </Text>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
    </GlassBackdrop.Provider>
    </View>
  );
}

function FocusIcon({ focused }: { focused: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d={focused
          ? "M9 3v6H3M15 3v6h6M3 15h6v6M21 15h-6v6"
          : "M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"}
        fill="none"
        stroke={LIGHT}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function VoiceSpace({
  busy,
  hasRecording,
  notice,
  onRecord,
  onTranscribe,
  recording,
  savedSeconds,
  transcribing,
  saving,
}: {
  busy: boolean;
  hasRecording: boolean;
  notice: string | null;
  onRecord: () => void;
  onTranscribe: () => void;
  recording: boolean;
  savedSeconds: number;
  transcribing: boolean;
  saving: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    pulse.setValue(1);
    if (!recording || reduceMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.14, duration: 1300, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, recording, reduceMotion]);

  const seconds = recording ? recordingSeconds : savedSeconds;
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const disabled = busy || transcribing || saving;

  return (
    <View style={styles.voiceSpace}>
      <Text accessibilityLiveRegion="polite" style={styles.voiceTitle}>
        {recording ? "Let it out." : transcribing ? "Finding your words…" : hasRecording ? "Your voice is here." : "Say it as it comes."}
      </Text>
      <Text style={styles.voiceDescription}>
        {recording ? "Pauses belong here, too." : hasRecording ? "Keep it in your voice, or turn it into words." : "No script. No right way to begin."}
      </Text>
      <View style={styles.recordArea}>
        <Animated.View pointerEvents="none" style={[styles.recordHalo, { transform: [{ scale: pulse }] }]} />
        <Pressable
          accessibilityLabel={recording ? "Stop recording" : hasRecording ? "Record again" : "Start recording"}
          accessibilityRole="button"
          accessibilityState={{ busy: disabled, disabled }}
          disabled={disabled}
          onPress={onRecord}
          style={({ pressed }) => [styles.recordButton, disabled && styles.pressed, pressed && styles.finishPressed]}
        >
          {recording ? <View style={styles.stopIcon} /> : <EchoIcon name="mic" color={LIGHT} size={30} />}
        </Pressable>
      </View>
      <Text style={styles.recordTime}>{time}</Text>
      <Text style={styles.recordHint}>
        {busy ? "One moment…" : recording ? "Tap to finish recording" : hasRecording ? "Tap to record a new take" : "Tap when you’re ready"}
      </Text>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.voiceNotice}>{notice}</Text> : null}
      {hasRecording && !recording ? (
        <Pressable accessibilityRole="button" disabled={disabled} onPress={onTranscribe} style={styles.transcribe}>
          <Text style={styles.transcribeText}>{transcribing ? "Writing it down…" : "Turn audio into words"}</Text>
          <EchoIcon name="arrow-right" color={CONTENT} size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  keyboard: { flex: 1 },
  readabilityVeil: { backgroundColor: "rgba(5,16,30,0.48)" },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8 },
  headerAction: { minWidth: 62, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5 },
  headerActionText: { ...tokens.type.ui, fontSize: 12, color: LIGHT },
  closeGlyph: { ...tokens.type.uiLight, color: LIGHT, fontSize: 25, lineHeight: 28 },
  headerCenter: { flex: 1, alignItems: "center", gap: 5 },
  date: { ...tokens.type.uiMedium, fontSize: 12, letterSpacing: 0.7, color: LIGHT },
  saveState: { ...tokens.type.ui, fontSize: 10, color: MUTED, textAlign: "center" },
  focusAction: { justifyContent: "flex-end" },
  paper: { zIndex: 0, flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 32, paddingBottom: 24, width: "100%", maxWidth: 680, alignSelf: "center" },
  focusContent: { paddingTop: 24 },
  promptBlock: { gap: 16, marginBottom: 22 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  smallRule: { height: 1, width: 24 },
  eyebrow: { ...tokens.type.uiMedium, fontSize: 9, letterSpacing: 1.5, color: CONTENT_MUTED, flexShrink: 1 },
  prompt: { ...tokens.type.display, fontSize: 38, lineHeight: 41, letterSpacing: -0.5, color: CONTENT },
  focusNote: { ...tokens.type.displayItalic, fontSize: 19, lineHeight: 26, color: CONTENT_MUTED, marginBottom: 24 },
  toolsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4, marginBottom: 20 },
  modeControl: { flexDirection: "row", backgroundColor: "rgba(11,29,53,0.07)", borderRadius: 24, padding: 3 },
  mode: { minHeight: 44, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 22 },
  modeSelected: { backgroundColor: INK },
  modeLabel: { ...tokens.type.uiMedium, fontSize: 12, color: CONTENT_MUTED },
  modeLabelSelected: { color: LIGHT },
  starterToggle: { minHeight: 44, justifyContent: "center", paddingHorizontal: 2 },
  starterToggleText: { ...tokens.type.ui, fontSize: 11, color: CONTENT_MUTED },
  starters: { marginBottom: 20, paddingTop: 16 },
  startersLabel: { ...tokens.type.ui, fontSize: 11, lineHeight: 16, color: CONTENT_MUTED, marginBottom: 8 },
  starter: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  starterText: { ...tokens.type.displayItalic, fontSize: 21, lineHeight: 28, color: CONTENT, flex: 1 },
  writingSpace: { flex: 1, paddingTop: 6 },
  input: { outlineStyle: "solid", outlineWidth: 0, padding: 0, margin: 0, minHeight: 200, ...tokens.type.display, fontSize: 25, lineHeight: 35, color: CONTENT, backgroundColor: "transparent" },
  attachedAudio: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 24 },
  attachedAudioText: { ...tokens.type.ui, fontSize: 11, lineHeight: 17, color: CONTENT_MUTED },
  footer: { paddingHorizontal: 24, paddingTop: 14, alignItems: "center", gap: 11 },
  footerMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 345, gap: 12 },
  wordCount: { ...tokens.type.ui, color: CONTENT_MUTED, fontSize: 10, lineHeight: 16, flexShrink: 1 },
  footerNote: { ...tokens.type.displayItalic, fontSize: 16, lineHeight: 18, color: CONTENT_MUTED },
  finishPressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  privacyNote: { ...tokens.type.ui, fontSize: 10, lineHeight: 15, color: CONTENT_MUTED, textAlign: "center" },
  error: { ...tokens.type.ui, color: "#903D32", fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 345 },
  pressed: { opacity: 0.65 },
  voiceSpace: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 12, paddingBottom: 16 },
  voiceTitle: { ...tokens.type.display, fontSize: 29, lineHeight: 34, color: CONTENT, textAlign: "center" },
  voiceDescription: { ...tokens.type.ui, fontSize: 12, lineHeight: 19, color: CONTENT_MUTED, textAlign: "center", marginTop: 8 },
  recordArea: { width: 116, height: 116, alignItems: "center", justifyContent: "center", marginTop: 26, marginBottom: 12 },
  recordHalo: { width: 112, height: 112, borderRadius: 56, backgroundColor: "rgba(11,29,53,0.05)", position: "absolute" },
  recordButton: { width: 88, height: 88, borderRadius: 44, backgroundColor: INK, alignItems: "center", justifyContent: "center" },
  stopIcon: { width: 22, height: 22, backgroundColor: LIGHT, borderRadius: 5 },
  recordTime: { ...tokens.type.uiLight, fontSize: 22, lineHeight: 28, color: CONTENT, fontVariant: ["tabular-nums"] },
  recordHint: { ...tokens.type.ui, fontSize: 11, lineHeight: 17, color: CONTENT_MUTED, marginTop: 6, textAlign: "center" },
  voiceNotice: { ...tokens.type.ui, fontSize: 12, lineHeight: 19, color: CONTENT_MUTED, textAlign: "center", marginTop: 20 },
  transcribe: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 },
  transcribeText: { ...tokens.type.uiMedium, fontSize: 12, color: CONTENT },
});
