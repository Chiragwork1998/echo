import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { EchoIcon } from '@/components/EchoIcon';
import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SegmentedMode } from '@/components/SegmentedMode';
import { TimerRing } from '@/components/TimerRing';
import { WritingSurface } from '@/components/WritingSurface';
import { tokens } from '@/design/tokens';
import { useEchoTheme } from '@/design/ThemeProvider';
import { deviceCapabilities } from '@/services/capabilities';
import { voiceCapture } from '@/services/voice';
import {
  commitEntry,
  discardDraft,
  getDraft,
  saveDraft,
  useJournalDraft,
  type JournalMode,
} from '@/state/journal';
import {
  canReflect,
  endSession,
  getSession,
  setSessionMode,
  setSessionText,
  startRecordingSession,
  startSession,
  stopRecordingSession,
  tickSession,
  useSession,
} from '@/state/session';
import {
  setCurrentStep,
  useOnboardingRestore,
  useOnboardingState,
} from '@/state/onboardingSelections';

const TITLE = 'What are you carrying that no one can see?';
const PLACEHOLDER = 'Start wherever it feels true…';
const PROMPT_ID = 'first_echo';
const NEXT = '/onboarding/completion' as Href;

export default function FirstEchoScreen() {
  const router = useRouter();
  const { theme } = useEchoTheme();
  const session = useSession();
  const preferredMode = useOnboardingState((state) => state.mode);
  const mood = useOnboardingState((state) => state.mood);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [freshAudioPath, setFreshAudioPath] = useState<string | null>(null);
  // The draft lives in the external store, so a recording recovered or saved
  // earlier is read from there instead of being mirrored into component state.
  const storedDraft = useJournalDraft();
  const audioPath = freshAudioPath ?? storedDraft?.audioPath ?? null;

  useOnboardingRestore();

  useEffect(() => {
    setCurrentStep(7);
    if (getSession().active) {
      return;
    }
    const mode: JournalMode = preferredMode === 'let_me_speak' ? 'voice' : 'text';
    startSession(mode);
    const existing = getDraft();
    if (existing?.body) {
      setSessionText(existing.body);
    }
  }, [preferredMode]);

  // Stopping capture on unmount keeps a partial recording from being orphaned.
  useEffect(() => {
    return () => {
      if (voiceCapture.isRecording()) {
        void voiceCapture.stop();
      }
    };
  }, []);

  // Autosave so writing and recordings survive app termination, not just the
  // explicit "Keep draft" path. Journal text never leaves the encrypted store.
  useEffect(() => {
    if (!session.active) {
      return;
    }
    const hasContent = session.text.trim().length > 0 || session.audioSeconds > 0 || audioPath !== null;
    if (!hasContent) {
      return;
    }
    const timer = setTimeout(() => {
      saveDraft({
        promptId: PROMPT_ID,
        promptTextSnapshot: TITLE,
        mode: session.mode,
        body: session.mode === 'text' ? session.text : null,
        audioPath,
        // Read the live duration at write time so a periodic re-render does not
        // turn every timer tick into another encrypted write.
        durationSeconds: getSession().elapsedSeconds,
        moodBefore: mood,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [audioPath, mood, session.active, session.audioSeconds, session.mode, session.text]);

  useEffect(() => {
    if (!session.active) {
      return;
    }
    const timer = setInterval(() => tickSession(), 1000);
    return () => clearInterval(timer);
  }, [session.active]);

  const reflect = () => {
    if (voiceCapture.isRecording()) {
      return;
    }
    commitEntry({
      promptId: PROMPT_ID,
      promptTextSnapshot: TITLE,
      mode: session.mode,
      body: session.mode === 'text' ? session.text : null,
      audioPath,
      durationSeconds: session.elapsedSeconds,
      moodBefore: mood,
    });
    discardDraft();
    endSession();
    router.push(NEXT);
  };

  const keepDraftAndLeave = () => {
    saveDraft({
      promptId: PROMPT_ID,
      promptTextSnapshot: TITLE,
      mode: session.mode,
      body: session.mode === 'text' ? session.text : null,
      audioPath,
      durationSeconds: session.elapsedSeconds,
      moodBefore: mood,
    });
    endSession();
    router.back();
  };

  const goBack = () => {
    const hasDraft =
      session.text.trim().length > 0 || session.audioSeconds > 0 || audioPath !== null;
    if (!hasDraft) {
      endSession();
      router.back();
      return;
    }
    if (voiceCapture.isRecording()) {
      setVoiceNotice('Stop the recording first — nothing is lost.');
      return;
    }
    Alert.alert('Keep your draft?', 'Your words are not saved anywhere else yet.', [
      {
        onPress: () => {
          discardDraft();
          endSession();
          router.back();
        },
        style: 'destructive',
        text: 'Discard',
      },
      { style: 'cancel', text: 'Stay' },
      { onPress: keepDraftAndLeave, text: 'Keep draft' },
    ]);
  };

  const startVoice = async () => {
    const availability = await voiceCapture.availability();
    if (availability === 'unavailable') {
      setVoiceNotice('Voice capture needs the microphone module. Write instead — nothing is lost.');
      return;
    }
    const permission = await deviceCapabilities.microphone.request();
    if (permission !== 'granted') {
      setVoiceNotice('Microphone access is off. Write instead — nothing is lost.');
      return;
    }
    const started = await voiceCapture.start({ promptId: PROMPT_ID, promptText: TITLE });
    if (started === 'available') {
      setVoiceNotice(null);
      startRecordingSession();
      return;
    }
    if (voiceCapture.lastFailure() === 'encryption') {
      setVoiceNotice(
        'This device cannot encrypt audio yet, so the recording was kept for recovery. Write instead.',
      );
      return;
    }
    setVoiceNotice('Recording could not start. Write instead — nothing is lost.');
  };

  const stopVoice = async () => {
    const result = await voiceCapture.stop();
    if (result?.localPath) {
      setFreshAudioPath(result.localPath);
      stopRecordingSession(result.durationSeconds);
      setVoiceNotice(null);
      saveDraft({
        promptId: PROMPT_ID,
        promptTextSnapshot: TITLE,
        mode: 'voice',
        body: null,
        audioPath: result.localPath,
        durationSeconds: result.durationSeconds,
        moodBefore: mood,
      });
      return;
    }
    const failure = voiceCapture.lastFailure();
    setVoiceNotice(
      failure === 'encryption'
        ? 'Audio could not be encrypted yet; the recording is held for recovery and never stored in the clear.'
        : 'The recording could not be saved. Write instead — nothing is lost.',
    );
  };

  return (
    <OnboardingScaffold
      currentStep={7}
      footer={
        <PrimaryCTA
          accessibilityHint={
            canReflect(session)
              ? undefined
              : 'Write ten characters or record three seconds to reflect.'
          }
          disabled={!canReflect(session)}
          label="Reflect"
          onPress={reflect}
        />
      }
      onBack={goBack}
      screen="first-echo"
      title={TITLE}
    >
      <SegmentedMode
        disabled={session.recording}
        onChange={(mode) => {
          setVoiceNotice(null);
          setSessionMode(mode);
        }}
        value={session.mode}
      />

      <View style={styles.surface}>
        {session.mode === 'text' ? (
          <WritingSurface
            onChangeText={setSessionText}
            placeholder={PLACEHOLDER}
            value={session.text}
          />
        ) : (
          <View
            style={[
              styles.voiceSurface,
              { backgroundColor: theme.color.surfaceGlass, borderColor: theme.color.borderGlass },
            ]}
          >
            <EchoIcon color={theme.color.textPrimary} name="mic" size={28} />
            <Text style={[styles.voiceLabel, { color: theme.color.textPrimary }]}>
              {session.recording ? 'Recording' : 'Ready when you are'}
            </Text>
            <Pressable
              accessibilityLabel={session.recording ? 'Stop recording' : 'Start recording'}
              accessibilityRole="button"
              onPress={() => {
                void (session.recording ? stopVoice() : startVoice());
              }}
              style={({ pressed }) => [
                styles.micButton,
                {
                  backgroundColor: theme.color.surfacePrimary,
                  borderColor: theme.color.hairlineStrong,
                },
                pressed && styles.pressed,
              ]}
            >
              <EchoIcon color={theme.color.textInk} name="mic" size={22} />
            </Pressable>
            {voiceNotice ? (
              <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: theme.color.textSecondary }]}>
                {voiceNotice}
              </Text>
            ) : null}
            <SecondaryButton
              icon="pen"
              label="Write instead"
              onPress={() => setSessionMode('text')}
              variant="ghost"
            />
          </View>
        )}
      </View>

      <View style={styles.meta}>
        <Text style={[styles.caption, { color: theme.color.textSecondary }]}>
          There is no right way to say it.
        </Text>
        <TimerRing active={session.recording || session.text.length > 0} elapsedSeconds={session.elapsedSeconds} />
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  surface: { marginTop: tokens.space[16] },
  voiceSurface: {
    minHeight: 280,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[24],
    gap: tokens.space[12],
  },
  voiceLabel: {
    ...tokens.type.uiMedium,
    fontSize: tokens.typography.bodyM.size,
    letterSpacing: tokens.typography.bodyM.tracking,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    backgroundColor: '#F6F1E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    lineHeight: tokens.typography.caption.lineHeight + 2,
    textAlign: 'center',
  },
  meta: {
    marginTop: tokens.space[16],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space[12],
  },
  caption: {
    flex: 1,
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size + 1,
    lineHeight: tokens.typography.caption.lineHeight + 3,
  },
  pressed: { opacity: 0.76 },
});
