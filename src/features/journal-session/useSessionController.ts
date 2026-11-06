import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard } from 'react-native';

import { copy } from '@/content/copy';
import { holdTheme } from '@/design/themeHold';
import { useDraft, useVoiceRecorder, type JournalErrorCode } from '@/features/journal';
import { backPath, nextPath, onboardingSteps } from '@/features/onboarding/flow';
import { requestMicrophonePermission, openAppSettings } from '@/services/permissions';
import { useOnboarding } from '@/state/onboarding';

import type { SessionMode } from './SegmentedMode';
import { sessionCopy } from './sessionCopy';
import type { SpeakView } from './SpeakPanel';
import { useSessionTimer } from './useSessionTimer';

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

export type SessionOptions = {
  variant: SessionVariant;
  /** Opens in Speak. Without it, the mode chosen in onboarding decides. */
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
  const preferred = useOnboarding((state) => state.mode);
  const [mode, setMode] = useState<SessionMode>(
    initialMode ?? (preferred === 'speak' ? 'speak' : 'write'),
  );
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
  const [base, setBase] = useState(0);
  const timer = useSessionTimer(base);

  const ready = draft.status === 'ready';
  const recordingBusy =
    voice.state === 'starting' || voice.state === 'recording' || voice.state === 'saving';
  const hasWork = draft.hasContent || recordingBusy;
  const canReflect = ready && draft.canReflect && !recordingBusy;

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
    draft.update({ body, durationSeconds: elapsed });
  };

  const choose = (next: SessionMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (next === 'speak') Keyboard.dismiss();
    setMode(next);
  };
  const writeInstead = () => {
    setPermission('none');
    choose('write');
  };

  const beginRecording = async () => {
    setPermission('none');
    const code = await voice.start();
    if (code === 'permission_required') setPermission('explain');
  };
  const record = () => {
    if (!draft.audio) return void beginRecording();
    Alert.alert(sessionCopy.speak.replaceTitle, sessionCopy.speak.replaceMessage, [
      { text: sessionCopy.speak.cancel, style: 'cancel' },
      { text: sessionCopy.speak.replace, onPress: () => void beginRecording() },
    ]);
  };
  const stop = async () => {
    const result = await voice.stop();
    if (result.ok) draft.update({ durationSeconds: elapsed });
  };
  const allowMicrophone = async () => {
    // The in-app explanation has been read: only now does the system ask.
    const asked = await requestMicrophonePermission();
    if (asked.status === 'granted') await beginRecording();
    else setPermission('denied');
  };

  const reflect = async () => {
    if (reflecting.current || !canReflect) return;
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

  const keepDraft = async () => {
    if (voice.state === 'recording') await voice.stop();
    draft.update({ durationSeconds: elapsed });
    const saved = await draft.flush();
    if (saved.ok) go(target.back);
    else setProblem(sessionCopy.errors.save);
  };
  const discardDraft = async () => {
    if (voice.state === 'recording') await voice.cancel();
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
    return draft.audio ? 'recorded' : 'ready';
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
