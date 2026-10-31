import { Stack, useRouter, type Href } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { JourneySheet } from "@/components/JourneySheet";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FIRST_PROMPT, BLANK_PROMPT, promptsFor, wordCount } from "./prompts";
import { haptics } from "@/services/haptics";
import { EchoIcon, type EchoIconName } from "@/components/EchoIcon";
import {
  JournalShelf,
  PAPER,
  ShelfBackdrop,
  useJournalShelf,
} from "@/components/JournalShelf";
import { OnboardingScaffold } from "@/components/OnboardingScaffold";
import { PrimaryCTA } from "@/components/PrimaryCTA";
import { tokens } from "@/design/tokens";
import { useEchoTheme } from "@/design/ThemeProvider";
import { deviceCapabilities } from "@/services/capabilities";
import {
  transcriptionService,
  type TranscriptionResult,
} from "@/services/transcription";
import { voiceCapture, type VoiceDraft } from "@/services/voice";
import { getWorkspaceScope } from "@/storage/workspace";
import { registerWebHistoryGuard } from "@/navigation/webHistoryGuard";
import {
  commitEntry,
  flushJournalWrites,
  getJournalStorageKind,
  useDraftSaveState,
  discardDraft,
  getDraft,
  saveDraft,
  useJournalDraft,
  type JournalMode,
} from "@/state/journal";
import {
  canReflect,
  endSession,
  getSession,
  setSessionMode,
  setSessionAudio,
  setSessionText,
  startRecordingSession,
  startSession,
  stopRecordingSession,
  tickSession,
  useSession,
} from "@/state/session";
import {
  setCurrentStep,
  useOnboardingRestore,
  useOnboardingState,
} from "@/state/onboardingSelections";

const PLACEHOLDER = "Start wherever it feels true…";

export default function JournalSessionScreen({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
  const router = useRouter();
  const [exitRoute, setExitRoute] = useState<Href | null>(null);
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);
  const [replaceRecordingOpen, setReplaceRecordingOpen] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const voiceOperation = useRef(false);
  const componentActive = useRef(true);
  const [pendingVoice, setPendingVoice] = useState<VoiceDraft | null>(() => {
    const draft = getDraft();
    return draft?.audioPath
      ? { localPath: draft.audioPath, durationSeconds: draft.durationSeconds }
      : null;
  });
  const saveState = useDraftSaveState();
  const memoryOnly = getJournalStorageKind() === "memory";
  const { theme } = useEchoTheme();
  const session = useSession();
  const preferredMode = useOnboardingState((state) => state.mode);
  const onboardingMood = useOnboardingState((state) => state.mood);
  const intent = useOnboardingState((state) => state.intent);
  const horizon = useOnboardingState((state) => state.horizon);
  const mood = session.mood;
  const TITLE = session.prompt.text;
  const PROMPT_ID = session.prompt.id;
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [freshAudioPath, setFreshAudioPath] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [quickOpen] = useState(() => !onboarding || getDraft() !== null);
  const [bookOpen, setBookOpen] = useState(quickOpen);
  const markBookOpen = useCallback(() => setBookOpen(true), []);
  const shelf = useJournalShelf();
  // The entry stays one text; a break is only where it continues on the next leaf.
  // ponytail: words only move forward, so text removed from an earlier page
  // leaves room there instead of pulling the next page back.
  const [breaks, setBreaks] = useState<number[]>([]);
  const breaksRef = useRef<number[]>([]);
  const [page, setPage] = useState(quickOpen ? 1 : 0);
  // The page being read, for handlers: only it paginates. A leaf mid-turn still
  // shows its old words and would otherwise look overfull.
  const shownPage = useRef(quickOpen ? 1 : 0);
  const showPage = useCallback((next: number) => {
    shownPage.current = next;
    setPage(next);
  }, []);
  const pageSizes = useRef<Record<number, { box?: number; content?: number }>>({});
  const pageInputs = useRef<Record<number, TextInput>>({});
  const caret = useRef<{ page: number; at: number } | null>(null);
  // Words wait to move on until the next page has focus, so keys typed during
  // the turn stay in order instead of landing before the words that moved.
  const handoff = useRef<{ from: number; at: number } | null>(null);
  const pendingCaret = useRef<{ page: number; at: number; after: number[] } | null>(null);

  // Put the caret where writing continues once the page shows its new words
  // (a web textarea sends it to the end whenever its value is replaced).
  useLayoutEffect(() => {
    const pending = pendingCaret.current;
    if (!pending || pending.after !== breaks) return;
    pendingCaret.current = null;
    const input = pageInputs.current[pending.page];
    if (!input) return;
    caret.current = { page: pending.page, at: pending.at };
    if (Platform.OS === "web") {
      (input as unknown as HTMLTextAreaElement).setSelectionRange(pending.at, pending.at);
    } else {
      input.setSelection(pending.at, pending.at);
    }
  });
  // The draft lives in the external store, so a recording recovered or saved
  // earlier is read from there instead of being mirrored into component state.
  const storedDraft = useJournalDraft();
  const audioPath =
    freshAudioPath ?? session.audioPath ?? storedDraft?.audioPath ?? null;
  const hasPageToKeep = Boolean(session.text.trim() || audioPath || session.recording || voiceBusy || saving || transcribing);

  useOnboardingRestore();

  useEffect(() => {
    if (onboarding) setCurrentStep(7);
    if (getSession().active) return;
    const mode: JournalMode =
      preferredMode === "let_me_speak" ? "voice" : "text";
    const prompt = onboarding ? FIRST_PROMPT : preferredMode === "give_me_space" ? BLANK_PROMPT : promptsFor(intent, horizon)[0]!;
    startSession(mode, prompt, onboarding ? onboardingMood : null, getDraft());
  }, [horizon, intent, onboarding, onboardingMood, preferredMode]);

  const stash = useCallback(() => {
    const current = getSession();
    if (!current.active || submitting.current) return;
    if (!current.text.trim() && !current.audioPath) return;
    saveDraft({
      promptId: current.prompt.id,
      promptTextSnapshot: current.prompt.text,
      mode: current.mode,
      body: current.text,
      audioPath: current.audioPath,
      durationSeconds:
        current.mode === "voice"
          ? current.audioSeconds
          : current.elapsedSeconds,
      moodBefore: current.mood,
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") stash();
    });
    return () => subscription.remove();
  }, [stash]);

  usePreventRemove(session.active && exitRoute === null, () => {
    const current = getSession();
    if (submitting.current || current.recording || voiceOperation.current || transcribing) {
      setNotice(
        current.recording
          ? "Stop your recording before leaving."
          : transcribing
            ? "Finishing your transcription…"
            : "Finishing your save…",
      );
      return;
    }
    if (!current.text.trim() && !current.audioPath) {
      endSession();
      setExitRoute(onboarding ? "/onboarding/arrival" : "/home");
      return;
    }
    setLeaveOpen(true);
  });

  // The next render disables native-stack removal prevention before routing.
  useEffect(() => {
    if (exitRoute) router.replace(exitRoute);
  }, [exitRoute, router]);

  useEffect(() => {
    if (Platform.OS !== "web" || exitRoute || !hasPageToKeep) return;
    // Expo web resets its root on history navigation. Catch Back before that
    // reset so the native-style draft decision also works in a browser.
    const pageUrl = window.location.href;
    const pageState: unknown = window.history.state;
    const protectPage = (event: PopStateEvent) => {
      const current = getSession();
      if (!current.active) return;
      if (!current.text.trim() && !current.audioPath && !current.recording && !voiceOperation.current) return;
      event.stopImmediatePropagation();
      window.history.pushState(pageState, "", pageUrl);
      if (current.recording || submitting.current || voiceOperation.current || transcribing) {
        setNotice(current.recording ? "Stop your recording before leaving." : "One moment — your page is still being saved.");
        return;
      }
      setLeaveOpen(true);
    };
    return registerWebHistoryGuard(protectPage);
  }, [exitRoute, hasPageToKeep, transcribing]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const warn = (event: BeforeUnloadEvent) => {
      const current = getSession();
      const draft = getDraft();
      const needsSaving =
        memoryOnly ||
        saveState !== "saved" ||
        draft?.body !== current.text ||
        draft?.audioPath !== current.audioPath ||
        draft?.mode !== current.mode;
      if (
        current.active &&
        (current.recording ||
          ((current.text.trim() || current.audioPath) && needsSaving))
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [memoryOnly, saveState]);

  // An unexpected route reset still keeps the last keystroke, without waiting
  // for the autosave debounce. Intentional save/leave has already ended session.
  useEffect(() => {
    componentActive.current = true;
    return () => {
      componentActive.current = false;
      const current = getSession();
      const keepUnexpectedDraft = current.active && !submitting.current;
      if (keepUnexpectedDraft) stash();
      if (voiceCapture.isRecording()) {
        void voiceCapture.stop().then((recording) => {
          if (!keepUnexpectedDraft || !recording?.localPath || (recording.workspace && recording.workspace !== getWorkspaceScope())) return;
          saveDraft({
            promptId: current.prompt.id,
            promptTextSnapshot: current.prompt.text,
            mode: "voice",
            body: current.text,
            audioPath: recording.localPath,
            durationSeconds: recording.durationSeconds,
            moodBefore: current.mood,
          });
        }).catch(() => undefined);
      }
      if (keepUnexpectedDraft) endSession();
    };
  }, [stash]);

  // Autosave so writing and recordings survive app termination, not just the
  // explicit "Keep draft" path. Journal text never leaves the encrypted store.
  useEffect(() => {
    if (!session.active || saving) {
      return;
    }
    const hasContent =
      session.text.trim().length > 0 ||
      session.audioSeconds > 0 ||
      audioPath !== null;
    if (!hasContent) {
      return;
    }
    const timer = setTimeout(stash, 600);
    return () => clearTimeout(timer);
  }, [
    audioPath,
    mood,
    session.active,
    session.audioSeconds,
    session.mode,
    session.text,
    saving,
    stash,
  ]);

  useEffect(() => {
    if (!session.active) {
      return;
    }
    const timer = setInterval(() => tickSession(), 1000);
    return () => clearInterval(timer);
  }, [session.active]);

  const leave = () => {
    endSession();
    setExitRoute(onboarding ? "/onboarding/arrival" : "/home");
  };

  const reflect = async () => {
    if (
      submitting.current ||
      voiceCapture.isRecording() ||
      transcribing ||
      voiceOperation.current ||
      !canReflect(getSession())
    )
      return;
    stash();
    submitting.current = true;
    setSaving(true);
    setNotice(null);
    const current = getSession();
    try {
      const entry = await commitEntry({
        promptId: current.prompt.id,
        promptTextSnapshot: current.prompt.text,
        mode: current.mode,
        body: current.text || null,
        audioPath: current.audioPath,
        durationSeconds:
          current.mode === "voice"
            ? current.audioSeconds
            : current.elapsedSeconds,
        moodBefore: current.mood,
      });
      endSession();
      haptics.light();
      setExitRoute({
        pathname: onboarding ? "/onboarding/completion" : "/journal-complete",
        params: { entryId: entry.id },
      } as Href);
    } catch {
      setNotice(
        "Your page is still here. Saving did not finish. Please try again.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const keepDraftAndLeave = async () => {
    if (submitting.current) return;
    setNotice(null);
    stash();
    submitting.current = true;
    try {
      await flushJournalWrites();
      setLeaveOpen(false);
      leave();
    } catch {
      setNotice("Your draft could not be stored. Stay here and try again.");
    } finally {
      submitting.current = false;
    }
  };

  const goBack = () => {
    if (submitting.current || transcribing || voiceOperation.current) return;
    if (voiceCapture.isRecording()) {
      setNotice("Stop your recording before leaving.");
      return;
    }
    const current = getSession();
    if (!current.text.trim() && !current.audioPath) {
      leave();
      return;
    }
    setLeaveOpen(true);
  };

  const startVoice = async () => {
    if (voiceOperation.current || voiceCapture.isRecording() || submitting.current || transcribing) return;
    voiceOperation.current = true;
    setVoiceBusy(true);
    try {
      const availability = await voiceCapture.availability();
      if (!componentActive.current) return;
      if (availability === "unavailable") {
        setVoiceNotice("Voice recording is available in the mobile app. You can write here.");
        return;
      }
      const permission = await deviceCapabilities.microphone.request();
      if (!componentActive.current) return;
      if (permission !== "granted") {
        setVoiceNotice("Microphone access is off. Write instead — nothing is lost.");
        return;
      }
      const started = await voiceCapture.start({ promptId: PROMPT_ID, promptText: TITLE });
      if (!componentActive.current) {
        if (started === "available") await voiceCapture.stop();
        return;
      }
      if (started === "available") {
        setVoiceNotice(null);
        startRecordingSession();
        return;
      }
      setVoiceNotice(
        voiceCapture.lastFailure() === "encryption"
          ? "This device cannot encrypt audio yet, so the recording was kept for recovery. Write instead."
          : "Recording could not start. You can try again or write instead.",
      );
    } catch {
      setVoiceNotice("Recording could not start. You can try again or write instead.");
    } finally {
      voiceOperation.current = false;
      setVoiceBusy(false);
    }
  };

  const stopVoice = async () => {
    if (voiceOperation.current) return;
    // The recorder can end on its own (an OS interruption); free the page
    // instead of leaving it stuck on "Recording" with a Stop that does nothing.
    if (!voiceCapture.isRecording()) {
      stopRecordingSession(getSession().audioSeconds);
      setVoiceNotice("The recording was interrupted. Please try again, or write instead.");
      return;
    }
    voiceOperation.current = true;
    setVoiceBusy(true);
    try {
      const result = await voiceCapture.stop();
      if (result?.localPath) {
        setFreshAudioPath(result.localPath);
        stopRecordingSession(result.durationSeconds);
        setSessionAudio(result.localPath, result.durationSeconds);
        saveDraft({
          promptId: PROMPT_ID,
          promptTextSnapshot: TITLE,
          mode: "voice",
          body: getSession().text,
          audioPath: result.localPath,
          durationSeconds: result.durationSeconds,
          moodBefore: mood,
        });
        setPendingVoice(result);
        setVoiceNotice("Recording kept. Save it as it is, or turn it into text.");
        return;
      }
      stopRecordingSession(getSession().audioSeconds);
      setVoiceNotice(
        voiceCapture.lastFailure() === "encryption"
          ? "Audio could not be encrypted yet; the recording is held for recovery and never stored in the clear."
          : "The recording could not be saved. Please try again, or write instead.",
      );
    } catch {
      stopRecordingSession(getSession().audioSeconds);
      setVoiceNotice("The recording could not be finished. Please try again, or write instead.");
    } finally {
      voiceOperation.current = false;
      setVoiceBusy(false);
    }
  };

  const toggleRecording = () => {
    if (voiceOperation.current || submitting.current || transcribing) return;
    if (getSession().recording) {
      void stopVoice();
    } else if (audioPath) {
      setReplaceRecordingOpen(true);
    } else {
      void startVoice();
    }
  };

  // Saaras v4 runs behind the API; the words land on the writing page, appended
  // to anything already written, and the recording stays with the entry.
  const writeDownRecording = async (draft: VoiceDraft) => {
    setTranscribing(true);
    let result: TranscriptionResult;
    try {
      result = await transcriptionService.transcribe(draft);
    } catch {
      result = { status: "error", retryable: true };
    } finally {
      setTranscribing(false);
    }
    if (!getSession().active) {
      return;
    }
    if (result.status === "complete") {
      const written = getSession().text.trim();
      setSessionText(written ? `${written}\n${result.text}` : result.text);
      setSessionMode("text");
      return;
    }
    setVoiceNotice(TRANSCRIPTION_NOTICES[result.status]);
  };

  const moveBreaks = (next: number[]) => {
    breaksRef.current = next;
    setBreaks(next);
  };

  const writePage = (index: number, value: string) => {
    const text = getSession().text;
    const starts = pageStarts(breaksRef.current, text.length);
    const start = starts[index]!;
    const end = starts[index + 1] ?? text.length;
    const delta = value.length - (end - start);
    if (delta !== 0) moveBreaks(breaksRef.current.map((at, i) => (i >= index ? at + delta : at)));
    setSessionText(text.slice(0, start) + value + text.slice(end));
  };

  // A page that grows past its lines sends its last words on to the next page.
  // When the caret is among them, the book turns and writing carries on there.
  const fitPage = (index: number) => {
    const { box, content } = pageSizes.current[index] ?? {};
    if (!box || !content || box < LINE_HEIGHT * 2 || content <= box + 2) return;
    if (handoff.current?.from === index) return;
    const text = getSession().text;
    const starts = pageStarts(breaksRef.current, text.length);
    const start = starts[index]!;
    const slice = text.slice(start, starts[index + 1] ?? text.length);
    if (slice.length < 2) return;
    // One line over is the word being typed; more (a paste, a resumed draft) is cut by proportion.
    const limit =
      content - box <= LINE_HEIGHT * 1.5
        ? slice.length - 1
        : Math.floor((slice.length * box) / content);
    // Break after a space, or before a newline so the new line starts the next page.
    let cut = Math.max(slice.lastIndexOf(" ", limit - 1) + 1, slice.lastIndexOf("\n", limit));
    if (cut <= 0 || cut >= slice.length) cut = Math.max(1, Math.min(limit, slice.length - 1));
    // Wait for a fresh measurement before cutting this page again.
    pageSizes.current[index] = { box };
    const at = start + cut;
    const isLast = index === breaksRef.current.length;
    const writing = caret.current?.page === index ? caret.current.at : -1;
    if (writing >= cut) {
      // Turn first (opening a blank page if this was the last); pageRef moves the words.
      handoff.current = { from: index, at };
      if (isLast) moveBreaks([...breaksRef.current, text.length]);
      showPage(index + 2);
      return;
    }
    const next = isLast
      ? [...breaksRef.current, at]
      : breaksRef.current.map((existing, i) => (i === index ? at : existing));
    moveBreaks(next);
    if (writing >= 0) pendingCaret.current = { page: index, at: writing, after: next };
  };

  const measurePage = (index: number, size: { box?: number; content?: number }) => {
    if (shownPage.current !== index + 1) return;
    pageSizes.current[index] = { ...pageSizes.current[index], ...size };
    // After the current event: web reports the new size before the text change lands.
    queueMicrotask(() => fitPage(index));
  };

  // The page receiving a handoff takes the words and the focus in one step, so
  // no key can arrive in between. Other ref calls (react-native-web re-attaches
  // refs on every render) only record the input.
  const pageRef = (index: number, input: TextInput | null) => {
    if (!input) return;
    pageInputs.current[index] = input;
    const pending = handoff.current;
    if (pending?.from !== index - 1) return;
    handoff.current = null;
    const end = breaksRef.current[pending.from] ?? pending.at;
    const next = breaksRef.current.map((existing, i) =>
      i === pending.from ? Math.min(pending.at, existing) : existing,
    );
    moveBreaks(next);
    const at = Math.max(0, end - pending.at);
    caret.current = { page: index, at };
    pendingCaret.current = { page: index, at, after: next };
    input.focus();
  };

  const introPage = (
    <View key="intro" style={styles.page}>
      <PageHeader left="ECHO VOLUMES" right={onboarding ? "07" : "TODAY"} />
      <Text style={styles.kicker}>
        {onboarding ? "YOUR FIRST ECHO" : "A LITTLE SPACE FOR YOU"}
      </Text>
      <Text accessibilityRole="header" style={styles.pageTitle}>
        {TITLE}
      </Text>
      <View style={styles.grow} />
      <Text style={styles.pageBody}>{session.prompt.opening}</Text>
      <View style={styles.pageRule} />
    </View>
  );

  const pageCount = session.mode === "text" ? breaks.length + 1 : 1;
  const starts = pageStarts(breaks, session.text.length);
  const words = wordCount(session.text);

  // The first page carries the question and Write/Speak; later pages are all writing.
  const writingPage = (index: number) => (
    <View key={`writing-${index}`} style={styles.page}>
      <PageHeader
        left={onboarding ? "NOTES / FIRST ECHO" : "NOTES / YOUR ECHO"}
        right={pageCount > 1 ? `${index + 1} / ${pageCount}` : ""}
      />
      {index === 0 ? (
        <>
          <Text
            numberOfLines={2}
            style={{
              ...tokens.type.display,
              fontSize: 18,
              lineHeight: 22,
              color: PAPER.ink,
              marginTop: 10,
            }}
          >
            {TITLE}
          </Text>
          <View accessibilityRole="tablist" style={styles.modes}>
            {MODES.map((option) => {
              const selected = session.mode === option.mode;
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{
                    disabled: session.recording || transcribing || saving || voiceBusy,
                    selected,
                  }}
                  disabled={session.recording || transcribing || saving || voiceBusy}
                  key={option.mode}
                  onPress={() => {
                    setVoiceNotice(null);
                    setSessionMode(option.mode);
                  }}
                  style={[styles.mode, selected && styles.modeSelected]}
                >
                  <EchoIcon
                    color={selected ? PAPER.ink : PAPER.muted}
                    name={option.icon}
                    size={16}
                  />
                  <Text
                    style={[
                      styles.modeLabel,
                      { color: selected ? PAPER.ink : PAPER.muted },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {session.mode === "text" ? (
        <View style={styles.lined}>
          <TextInput
            ref={(input) => pageRef(index, input)}
            underlineColorAndroid="transparent"
            accessibilityLabel={index === 0 ? "Your journal entry" : `Your journal entry, page ${index + 1}`}
            multiline
            onChangeText={(value) => writePage(index, value)}
            onContentSizeChange={(event) => measurePage(index, { content: event.nativeEvent.contentSize.height })}
            onLayout={(event) => measurePage(index, { box: event.nativeEvent.layout.height })}
            onSelectionChange={(event) => {
              caret.current = { page: index, at: event.nativeEvent.selection.end };
            }}
            editable={!saving}
            placeholder={
              index > 0
                ? undefined
                : session.prompt.id === "free_space"
                  ? PLACEHOLDER
                  : session.prompt.opening
            }
            placeholderTextColor={PAPER.muted}
            scrollEnabled={false}
            style={styles.input}
            textAlignVertical="top"
            value={session.text.slice(starts[index], starts[index + 1] ?? session.text.length)}
          />
        </View>
      ) : (
        <View style={styles.voice}>
          <Text accessibilityLiveRegion="polite" style={styles.voiceLabel}>
            {session.recording
              ? "Recording"
              : transcribing
                ? "Writing it down…"
                : "Ready when you are"}
          </Text>
          <Pressable
            accessibilityLabel={
              session.recording ? "Stop recording" : "Start recording"
            }
            accessibilityRole="button"
            accessibilityState={{ busy: transcribing || voiceBusy, disabled: transcribing || voiceBusy || saving }}
            disabled={transcribing || voiceBusy || saving}
            onPress={toggleRecording}
            style={({ pressed }) => [
              styles.micButton,
              (pressed || transcribing) && styles.pressed,
            ]}
          >
            <EchoIcon color={PAPER.page} name="mic" size={24} />
          </Pressable>
          {voiceNotice ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.notice, { color: PAPER.ink }]}
            >
              {voiceNotice}
            </Text>
          ) : null}
          {pendingVoice && !session.recording && !transcribing ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setTranscriptionOpen(true)}
            >
              <Text style={styles.link}>Turn audio into words</Text>
            </Pressable>
          ) : null}
          <Pressable
            disabled={session.recording || transcribing || voiceBusy || saving}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setSessionMode("text")}
          >
            <Text style={styles.link}>Write instead</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.clock}>
        {words} {words === 1 ? "word" : "words"} · {clock(session.elapsedSeconds)} · no rush
      </Text>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <OnboardingScaffold
        background={<ShelfBackdrop shelf={shelf} />}
        currentStep={onboarding ? 7 : 0}
        footer={
          bookOpen ? (
            <>
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.notice, { color: theme.color.textSecondary }]}
              >
                {notice ??
                  (saveState === "error"
                    ? "Draft could not be saved. Keep this page open."
                    : memoryOnly
                      ? "Preview only · kept until this page reloads"
                      : saveState === "saving"
                        ? "Saving your draft…"
                        : saveState === "saved"
                          ? "Draft saved on this device"
                          : "Private by default. Take your time.")}
              </Text>
              {canReflect(session) ? null : (
                <Text
                  style={[
                    styles.notice,
                    styles.reflectHint,
                    { color: theme.color.textSecondary },
                  ]}
                >
                  A few honest words are enough. Write ten characters or record
                  three seconds.
                </Text>
              )}
              <PrimaryCTA
                accessibilityHint={
                  canReflect(session)
                    ? undefined
                    : "A few honest words are enough. Write ten characters or record three seconds."
                }
                disabled={!canReflect(session) || transcribing || saving || voiceBusy}
                label={saving ? "Saving your echo…" : "Reflect"}
                onPress={() => {
                  void reflect();
                }}
              />
            </>
          ) : null
        }
        onBack={goBack}
        screen="first-echo"
      >
        <JournalShelf
          startOpen={quickOpen}
          onOpened={markBookOpen}
          onPageChange={showPage}
          page={page}
          pages={[introPage, ...Array.from({ length: pageCount }, (_, index) => writingPage(index))]}
          shelf={shelf}
        />
      </OnboardingScaffold>
      <JourneySheet
        visible={replaceRecordingOpen}
        title="A new take?"
        subtitle="Your current recording stays safe until the new one is saved. The new take will then replace it on this page."
        onClose={() => setReplaceRecordingOpen(false)}
      >
        <PrimaryCTA
          label="Record a new take"
          onPress={() => {
            setReplaceRecordingOpen(false);
            void startVoice();
          }}
        />
        <SecondaryButton label="Keep this recording" onPress={() => setReplaceRecordingOpen(false)} />
      </JourneySheet>
      <JourneySheet
        visible={leaveOpen}
        title="Leave this page for now?"
        subtitle={
          memoryOnly
            ? "Your draft stays here while this browser preview is open."
            : "Keep your draft and come back when you have space."
        }
        onClose={() => setLeaveOpen(false)}
      >
        <PrimaryCTA
          label="Keep draft & leave"
          onPress={() => {
            void keepDraftAndLeave();
          }}
        />
        <SecondaryButton
          label="Stay with this page"
          onPress={() => setLeaveOpen(false)}
        />
        <SecondaryButton
          label="Discard this draft"
          variant="ghost"
          onPress={() => {
            if (submitting.current) return;
            submitting.current = true;
            void discardDraft()
              .then(() => {
                setLeaveOpen(false);
                leave();
              })
              .catch(() =>
                setNotice(
                  "The draft could not be discarded. Please try again.",
                ),
              )
              .finally(() => {
                submitting.current = false;
              });
          }}
        />
        {notice ? (
          <Text style={[styles.notice, { color: theme.color.textSecondary }]}>
            {notice}
          </Text>
        ) : null}
      </JourneySheet>
      <JourneySheet
        visible={transcriptionOpen}
        title="Turn your voice into words?"
        subtitle="This sends this recording to ECHO’s configured transcription service. It is optional; your original audio stays with your entry. Continue only if you want this recording processed online."
        onClose={() => setTranscriptionOpen(false)}
      >
        <PrimaryCTA
          label="Transcribe this recording"
          onPress={() => {
            setTranscriptionOpen(false);
            if (pendingVoice) void writeDownRecording(pendingVoice);
          }}
        />
        <SecondaryButton
          label="Keep audio only"
          onPress={() => setTranscriptionOpen(false)}
        />
      </JourneySheet>
    </>
  );
}

const TRANSCRIPTION_NOTICES: Record<
  Exclude<TranscriptionResult["status"], "complete">,
  string
> = {
  unavailable: "Voice-to-text is not set up yet. Your recording is kept.",
  unauthenticated:
    "Sign in to turn your voice into words. Your recording is kept.",
  error:
    "Could not write this down. Your recording is kept — try again or write instead.",
};

const LINE_HEIGHT = 30;
const MODES: readonly {
  icon: EchoIconName;
  label: string;
  mode: JournalMode;
}[] = [
  { icon: "pen", label: "Write", mode: "text" },
  { icon: "mic", label: "Speak", mode: "voice" },
];

function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

/** Where each writing page starts in the entry text. */
function pageStarts(breaks: readonly number[], length: number): number[] {
  return [0, ...breaks.map((at) => Math.min(at, length))];
}

function PageHeader({ left, right }: { left: string; right: string }) {
  return (
    <View style={styles.pageHeader}>
      <Text style={styles.pageLabel}>{left}</Text>
      <Text style={styles.pageLabel}>{right}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingTop: 22,
    paddingRight: 22,
    paddingBottom: 18,
    paddingLeft: 30,
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  pageLabel: {
    ...tokens.type.ui,
    fontSize: 9,
    letterSpacing: 1.6,
    color: PAPER.muted,
  },
  kicker: {
    marginTop: 56,
    ...tokens.type.ui,
    fontSize: 10,
    letterSpacing: 2,
    color: PAPER.ink,
  },
  pageTitle: {
    marginTop: 14,
    ...tokens.type.display,
    fontSize: 34,
    lineHeight: 40,
    color: PAPER.ink,
  },
  grow: { flex: 1 },
  pageBody: {
    ...tokens.type.display,
    fontSize: 19,
    lineHeight: 26,
    color: PAPER.muted,
  },
  pageRule: {
    marginTop: 20,
    marginBottom: 30,
    height: StyleSheet.hairlineWidth,
  },
  modes: { flexDirection: "row", gap: 22, marginTop: 14 },
  mode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 6,
    borderRadius: 8,
  },
  modeSelected: { backgroundColor: "rgba(11,29,53,0.08)" },
  modeLabel: { ...tokens.type.uiMedium, fontSize: 13, letterSpacing: 0.4 },
  lined: { flex: 1, marginTop: 12, overflow: "hidden" },
  input: {
    outlineWidth: 0,
    outlineStyle: "solid",
    flex: 1,
    padding: 0,
    paddingTop: 5,
    ...tokens.type.display,
    fontSize: 19,
    lineHeight: LINE_HEIGHT,
    color: PAPER.ink,
    // A full page moves on to the next leaf instead of scrolling inside itself.
    overflow: "hidden",
  },
  voice: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space[16],
  },
  voiceLabel: { ...tokens.type.display, fontSize: 22, color: PAPER.ink },
  micButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: PAPER.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  link: {
    ...tokens.type.uiMedium,
    fontSize: 13,
    color: PAPER.ink,
  },
  clock: {
    marginTop: 8,
    alignSelf: "center",
    ...tokens.type.ui,
    fontSize: 11,
    letterSpacing: 1.6,
    color: PAPER.muted,
  },
  notice: {
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    lineHeight: tokens.typography.caption.lineHeight + 2,
    textAlign: "center",
  },
  reflectHint: { marginBottom: tokens.space[8] },
  pressed: { opacity: 0.76 },
});
