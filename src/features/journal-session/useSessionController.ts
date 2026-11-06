import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard } from 'react-native';

import { copy } from '@/content/copy';
import { holdTheme } from '@/design/themeHold';
import { useDraft, useVoiceRecorder, type JournalErrorCode } from '@/features/journal';
import { backPath, nextPath, onboardingSteps } from '@/features/onboarding/flow';
import { requestMicrophonePermission, openAppSettings } from '@/services/permissions';
import { UNAVAILABLE_CODES } from '@/services/transcription';
import { useOnboarding } from '@/state/onboarding';
import { usePreferences, useVoiceStatus } from '@/state/preferences';

import type { SessionMode } from './SegmentedMode';
import { sessionCopy } from './sessionCopy';
import type { SpeakView } from './SpeakPanel';
import { useSessionTimer } from './useSessionTimer';
import { STUCK_CODES, useTranscription, type TranscriptionFailure } from './useTranscription';

const FIRST_ECHO_STEP = onboardingSteps.indexOf('first-echo') + 1;

export type SessionVariant = 'onboarding' | 'daily';

// Where each variant goes. Onboarding follows the flow. The daily session returns to Home, and
// reflects through Completion, which another screen owns.
const TARGETS = {
  onboarding: { back: backPath('first-echo'), next: nextPath('first-echo'), step: FIRST_ECHO_STEP },
  daily: { back: '/home', next: '/home/complete', step: undefined },
} as const;
const go = (path: string | undefined) => path && router.navigate(path as never);

/** Text for a failure, from its code alone: a code never carries what the person wrote. */
function draftError(code: JournalErrorCode | undefined) {
  return code === 'unreadable' ? sessionCopy.errors.unreadable : sessionCopy.errors.open;
}

/** What the person is told when words did not come back. Never what they said. */
function failureLine(code: TranscriptionFailure): string {
  const lines = sessionCopy.transcribe.failed;
  switch (code) {
    case 'offline':
      return lines.offline;
    case 'timeout':
      return lines.timeout;
    case 'too_long':
      return lines.tooLong;
    case 'no_speech':
      return lines.noSpeech;
    case 'unsupported':
      return lines.unsupported;
    case 'audio_unavailable':
      return lines.audio;
    case 'lost':
      return lines.lost;
    case 'unauthorized':
    case 'not_configured':
    case 'unavailable':
      return sessionCopy.transcribe.unavailable;
    default:
      return lines.server;
  }
}

export type SessionOptions = {
  variant: SessionVariant;
  /**
   * Opens in this mode. Without it, the mode the person last chose decides, and Speak is the
   * default (D-006).
   */
  initialMode?: SessionMode;
  /** Continues this draft. Without it, the newest draft resumes, or a new one begins. */
  draftId?: string;
};

/**
 * Everything the writing session does, with none of how it looks: the draft, the recording, the
 * timer, and the ways out. First Echo's page and the daily echo's open sky both draw from this, so
 * what is safe in one is safe in the other.
 */
export function useSessionController({ variant, initialMode, draftId }: SessionOptions) {
  // The theme never changes in the middle of a writing session, whoever asks for it. It waits here
  // while the session is on screen, and is made when the person leaves.
  useFocusEffect(useCallback(() => holdTheme(), []));

  const daily = variant === 'daily';
  const target = TARGETS[variant];
  const prompt = daily ? copy.home.prompt : copy.firstEcho.title;
  const [permission, setPermission] = useState<'none' | 'explain' | 'denied'>('none');
  const [problem, setProblem] = useState<string | null>(null);
  const reflecting = useRef(false);

  const draft = useDraft({
    draftId,
    seed: {
      mode: 'text',
      promptId: daily ? 'daily' : 'first-echo',
      promptText: prompt,
      // The mood from Arrival belongs to the first echo, not to every day after it.
      moodBefore: daily ? undefined : useOnboarding.getState().mood,
    },
  });
  const voice = useVoiceRecorder(draft);
  const transcription = useTranscription(draft);
  const voiceChoice = useVoiceStatus();
  // Speak, unless the person last chose to write. Where there is no microphone to speak into, the
  // page they can use opens instead.
  const [mode, setMode] = useState<SessionMode>(
    () => initialMode ?? (voice.available ? usePreferences.getState().lastMode : 'write'),
  );
  const [base, setBase] = useState(0);
  const timer = useSessionTimer(base);

  const ready = draft.status === 'ready';
  const recordingBusy =
    voice.state === 'starting' || voice.state === 'recording' || voice.state === 'saving';
  const hasWork = draft.hasContent || recordingBusy || transcription.active;
  const canReflect = ready && draft.canReflect && !recordingBusy;

  // First Echo shows only one thing at a time, so the words are brought to the page as they land. The
  // open sky already shows them, and stays ready for the next take.
  const [seenArrival, setSeenArrival] = useState(0);
  if (transcription.arrival !== seenArrival) {
    setSeenArrival(transcription.arrival);
    if (!daily) setMode('write');
  }

  // Time already spent on a draft being continued, so the ring shows what remains of it.
  const counted = useRef(false);
  useEffect(() => {
    if (!ready || counted.current) return;
    counted.current = true;
    setBase(draft.content.durationSeconds);
  }, [ready, draft.content.durationSeconds]);
  const { elapsed, start: startTimer } = timer;
  useEffect(() => {
    if (voice.state === 'recording') startTimer();
  }, [voice.state, startTimer]);

  // Opening a draft that no longer needs this screen.
  const failedCode = draft.status === 'error' ? draft.error?.code : undefined;
  useEffect(() => {
    if (failedCode === 'not_found') go(target.back);
    if (failedCode === 'not_draft') go(target.next);
  }, [failedCode, target]);

  const change = (body: string) => {
    if (body.length > 0) startTimer();
    setProblem(null);
    transcription.noteBody(body);
    draft.update({ body, durationSeconds: elapsed });
  };

  const choose = (next: SessionMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (next === 'speak') Keyboard.dismiss();
    // The next session opens the way this one was last used.
    usePreferences.getState().setLastMode(next);
    setMode(next);
  };
  const writeInstead = () => {
    setPermission('none');
    choose('write');
  };

  const beginRecording = async () => {
    setPermission('none');
    // A take still waiting for its words keeps a copy of its recording, which this one will replace.
    await transcription.holdCurrent();
    const code = await voice.start();
    if (code === 'permission_required') setPermission('explain');
  };
  /** A recording whose words are not in the draft, and are not on their way either. */
  const unsent =
    draft.audio !== null &&
    draft.content.transcribedAudioId !== draft.audio.id &&
    !transcription.hasQueue();
  const stuck =
    transcription.phase.kind === 'failed' && STUCK_CODES.includes(transcription.phase.code);
  const record = () => {
    if (!unsent && !stuck) return void beginRecording();
    // Only a recording that has not become words is lost by recording again. One that has is in
    // the page, so speaking a second time just adds to it.
    const { replaceTitle, replaceMessage, replace, cancel } = sessionCopy.speak;
    Alert.alert(
      replaceTitle,
      voiceChoice === 'voice_only' || stuck
        ? replaceMessage
        : sessionCopy.transcribe.replaceMessage,
      [
        { text: cancel, style: 'cancel' },
        { text: replace, onPress: () => void beginRecording() },
      ],
    );
  };
  const stop = async () => {
    const result = await voice.stop();
    if (!result.ok) return;
    draft.update({ durationSeconds: elapsed });
    // The recording is sealed on the phone. Only now do its words follow, in the order spoken.
    transcription.enqueue(result.value);
  };
  const allowMicrophone = async () => {
    // The in-app explanation has been read: only now does the system ask.
    const asked = await requestMicrophonePermission();
    if (asked.status === 'granted') await beginRecording();
    else setPermission('denied');
  };

  const finish = async () => {
    if (reflecting.current) return;
    reflecting.current = true;
    try {
      const result = await draft.commit({ durationSeconds: elapsed });
      // Only once the entry is durable. A failure leaves the draft whole, and Reflect ready to retry.
      if (result.ok || result.error.code === 'not_draft') go(target.next);
      else if (result.error.code === 'not_found') go(target.back);
    } finally {
      reflecting.current = false;
    }
  };
  const latestFinish = useRef(finish);
  useEffect(() => {
    latestFinish.current = finish;
  });

  // Words are never abandoned for a person who is waiting: Reflect asks, and either answer keeps
  // the recording with the echo.
  const waitingToReflect = useRef(false);
  const transcribing = transcription.active;
  const transcriptionKind = transcription.phase.kind;
  useEffect(() => {
    if (!waitingToReflect.current || transcribing) return;
    waitingToReflect.current = false;
    if (transcriptionKind === 'idle') void latestFinish.current();
  }, [transcribing, transcriptionKind]);

  const wordsMissing =
    (transcription.phase.kind === 'failed' &&
      !UNAVAILABLE_CODES.includes(transcription.phase.code)) ||
    (unsent && transcription.phase.kind === 'idle' && voiceChoice !== 'voice_only');

  const reflect = async () => {
    if (reflecting.current || !canReflect) return;
    if (transcription.active) {
      const { title, message, wait, goOn } = sessionCopy.transcribe.waiting;
      Alert.alert(title, message, [
        { text: wait, onPress: () => void (waitingToReflect.current = true) },
        {
          text: goOn,
          onPress: () => {
            transcription.abandon();
            void finish();
          },
        },
      ]);
      return;
    }
    if (wordsMissing) {
      const { title, message, retry, goOn } = sessionCopy.transcribe.missing;
      Alert.alert(title, message, [
        {
          text: retry,
          onPress: () => {
            waitingToReflect.current = true;
            transcription.retry();
          },
        },
        { text: goOn, onPress: () => void finish() },
      ]);
      return;
    }
    await finish();
  };

  const keepDraft = async () => {
    if (voice.state === 'recording') await voice.stop();
    draft.update({ durationSeconds: elapsed });
    const saved = await draft.flush();
    if (saved.ok) go(target.back);
    else setProblem(sessionCopy.errors.save);
  };
  const discardDraft = async () => {
    if (voice.state === 'recording') await voice.cancel();
    transcription.abandon();
    const removed = await draft.discard();
    if (removed.ok) go(target.back);
    else setProblem(sessionCopy.errors.save);
  };
  const back = () => {
    if (!hasWork) {
      void draft.discard();
      go(target.back);
      return;
    }
    const { title, message, keep, discard, stay } = sessionCopy.leave;
    Alert.alert(title, message, [
      { text: keep, onPress: () => void keepDraft() },
      { text: discard, style: 'destructive', onPress: () => void discardDraft() },
      { text: stay, style: 'cancel' },
    ]);
  };
  const latestBack = useRef(back);
  useEffect(() => {
    latestBack.current = back;
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      latestBack.current();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const speakView = ((): SpeakView => {
    if (!voice.available || voice.error === 'unavailable') return 'unavailable';
    if (permission !== 'none') return permission;
    if (voice.state === 'starting' || voice.state === 'recording' || voice.state === 'saving') {
      return voice.state;
    }
    if (voice.error === 'save_failed') return 'kept';
    if (voice.error === 'start_failed') return 'failed';
    const words = transcription.phase;
    if (words.kind === 'listening') return 'listening';
    if (words.kind === 'failed') {
      return UNAVAILABLE_CODES.includes(words.code)
        ? 'transcribe_unavailable'
        : 'transcribe_failed';
    }
    if (unsent && voiceChoice !== 'voice_only') return 'untranscribed';
    return draft.audio ? 'recorded' : 'ready';
  })();

  /** What the note on the sky says for the transcription states, from the code alone. */
  const speakLine = ((): string | null => {
    const words = transcription.phase;
    if (speakView === 'untranscribed') return sessionCopy.transcribe.untranscribed;
    if (words.kind === 'failed') return failureLine(words.code);
    return null;
  })();

  const notice =
    problem ??
    (draft.commitState === 'error' ? sessionCopy.errors.commit : null) ??
    (draft.saveState === 'error' ? sessionCopy.errors.save : null);

  return {
    daily,
    target,
    prompt,
    draft,
    voice,
    timer,
    ready,
    recordingBusy,
    hasWork,
    canReflect,
    failedCode,
    failure: draft.status === 'error' ? draftError(failedCode) : null,
    mode,
    speakView,
    notice,
    /** Spoken words are on their way: a quiet line, and the light keeps breathing. */
    listening: transcription.phase.kind === 'listening',
    quietLine: transcription.phase.kind === 'listening' ? sessionCopy.transcribe.listening : null,
    /** The sentence for the transcription states that have actions. */
    speakLine,
    /** Counts the times words have landed, so they can be let in softly. */
    arrival: transcription.arrival,
    consentOpen: transcription.phase.kind === 'consent',
    chooseConsent: transcription.choose,
    /** Try again, or turn a recording that has no words yet into words. */
    retryTranscription: transcription.retry,
    retryable: draft.commitState === 'error',
    change,
    choose,
    writeInstead,
    record,
    stop,
    allowMicrophone,
    openSettings: () => void openAppSettings(),
    reflect,
    back,
  };
}

export type SessionController = ReturnType<typeof useSessionController>;
