import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoText } from '@/components/EchoText';
import { OnboardingHeading } from '@/components/OnboardingHeading';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { copy } from '@/content/copy';
import { backPath, nextPath, onboardingSteps } from '@/features/onboarding/flow';
import { useDraft, useVoiceRecorder, type JournalErrorCode } from '@/features/journal';
import { requestMicrophonePermission, openAppSettings } from '@/services/permissions';
import { useOnboarding } from '@/state/onboarding';

import {
  CONTROL,
  CAPTION,
  CTA_FOOTER,
  KEYBOARD_FOLD,
  KEYBOARD_GAP,
  NOTICE,
  TITLE_GAP,
  TITLE_LINE,
  TITLE_SIZE,
  TITLE_TOP,
} from './geometry';
import { SegmentedMode, type SessionMode } from './SegmentedMode';
import { SessionHeader } from './SessionHeader';
import { sessionCopy } from './sessionCopy';
import { SpeakPanel, TextAction, type SpeakView } from './SpeakPanel';
import { useSessionTimer } from './useSessionTimer';
import { WritingSurface } from './WritingSurface';

const FIRST_ECHO_STEP = onboardingSteps.indexOf('first-echo') + 1;
const SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.32)',
  textShadowRadius: 10,
  textShadowOffset: { width: 0, height: 1 },
} as const;

export type SessionVariant = 'onboarding' | 'daily';

// Where each variant goes. Onboarding follows the flow. The daily session returns to Home, and
// reflects through Completion, which another screen owns.
const TARGETS = {
  onboarding: { back: backPath('first-echo'), next: nextPath('first-echo'), step: FIRST_ECHO_STEP },
  daily: { back: '/home', next: '/home/complete', step: undefined },
} as const;
const go = (path: string | undefined) => path && router.navigate(path as never);

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setOpen(true),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/** Text for a failure, from its code alone: a code never carries what the person wrote. */
function draftError(code: JournalErrorCode | undefined) {
  return code === 'unreadable' ? sessionCopy.errors.unreadable : sessionCopy.errors.open;
}

type Props = {
  variant: SessionVariant;
  /** Opens in Speak. Without it, the mode chosen in onboarding decides. */
  initialMode?: SessionMode;
  /** Continues this draft. Without it, the newest draft resumes, or a new one begins. */
  draftId?: string;
};

/**
 * The writing session, used by First Echo and by the daily echo. Write or speak, seven minutes, and
 * a Reflect that waits until the entry is safely on the device.
 */
export function JournalSession({ variant, initialMode, draftId }: Props) {
  const daily = variant === 'daily';
  const target = TARGETS[variant];
  const prompt = daily ? copy.home.prompt : copy.firstEcho.title;
  const preferred = useOnboarding((state) => state.mode);
  const [mode, setMode] = useState<SessionMode>(
    initialMode ?? (preferred === 'speak' ? 'speak' : 'write'),
  );
  const [permission, setPermission] = useState<'none' | 'explain' | 'denied'>('none');
  const [problem, setProblem] = useState<string | null>(null);
  const [headingHeight, setHeadingHeight] = useState(0);
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
  const keyboardOpen = useKeyboardOpen();

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

  // Reflect and Back are never hidden by the keyboard: it lifts them, and the title folds away.
  const insets = useSafeAreaInsets();
  // Without these Android leaves edge-to-edge, and the plate stops short of the system bars.
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });
  const resting = insets.bottom + CTA_FOOTER;
  const lift = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, keyboard.height.get() + KEYBOARD_GAP - resting),
  }));
  const fold = useAnimatedStyle(() => {
    const folded = Math.min(1, keyboard.height.get() / KEYBOARD_FOLD);
    return {
      opacity: 1 - Math.min(1, folded * 2),
      ...(headingHeight > 0 ? { height: headingHeight * (1 - folded) } : null),
    };
  });
  const slot = useAnimatedStyle(() => {
    const folded = Math.min(1, keyboard.height.get() / KEYBOARD_FOLD);
    return { minHeight: NOTICE.slot - (NOTICE.slot - NOTICE.compactSlot) * folded };
  });

  const notice =
    problem ??
    (draft.commitState === 'error' ? sessionCopy.errors.commit : null) ??
    (draft.saveState === 'error' ? sessionCopy.errors.save : null);
  const retryable = draft.commitState === 'error';

  const surfaceProps = {
    value: draft.content.body,
    placeholder: copy.firstEcho.placeholder,
    label: prompt,
    editable: ready,
    onChangeText: change,
    saveState: draft.saveState,
    squeezed: keyboardOpen,
  };

  return (
    <ScreenShell
      screen="first-echo"
      header={
        <SessionHeader
          step={target.step}
          onBack={back}
          remaining={timer.remaining}
          timerState={timer.state}
        />
      }
    >
      <Stack.Screen options={{ gestureEnabled: !hasWork }} />
      <Animated.View style={[styles.column, lift]}>
        <Animated.View style={[styles.fold, fold]}>
          <View
            style={styles.heading}
            onLayout={(event) => setHeadingHeight(event.nativeEvent.layout.height)}
          >
            <OnboardingHeading title={prompt} titleStyle={styles.title} top={TITLE_TOP} />
          </View>
        </Animated.View>

        {draft.status === 'error' ? (
          <WritingSurface {...surfaceProps} hideField>
            <View style={styles.failure}>
              <EchoText variant="bodyM" align="center" accessibilityRole="alert">
                {draftError(failedCode)}
              </EchoText>
              {failedCode !== 'unreadable' && (
                <TextAction label={sessionCopy.errors.retry} onPress={() => void draft.reload()} />
              )}
            </View>
          </WritingSurface>
        ) : (
          <WritingSurface {...surfaceProps} hideField={mode === 'speak'}>
            <SpeakPanel
              view={speakView}
              seconds={
                speakView === 'recorded'
                  ? (draft.audio?.durationSeconds ?? 0)
                  : voice.elapsedSeconds
              }
              recovered={draft.audio?.recovered ?? false}
              onRecord={record}
              onStop={() => void stop()}
              onAllow={() => void allowMicrophone()}
              onSettings={() => void openAppSettings()}
              onWrite={writeInstead}
            />
          </WritingSurface>
        )}

        <View style={styles.control}>
          <SegmentedMode mode={mode} onChange={choose} disabled={recordingBusy || !ready} />
        </View>
        <Animated.View style={[styles.slot, slot]}>
          {notice ? (
            <>
              <EchoText
                variant="bodyM"
                align="center"
                accessibilityRole="alert"
                style={[styles.problem, SHADOW]}
              >
                {notice}
              </EchoText>
              {retryable && (
                <TextAction label={sessionCopy.errors.retry} onPress={() => void reflect()} />
              )}
            </>
          ) : (
            <EchoText
              variant="caption"
              color="textSecondary"
              align="center"
              style={[styles.caption, SHADOW]}
            >
              {copy.firstEcho.caption}
            </EchoText>
          )}
        </Animated.View>
        <PrimaryCTA
          label={copy.firstEcho.cta}
          variant={canReflect ? 'cream' : 'glass'}
          disabled={!canReflect}
          disabledHint={sessionCopy.reflectHint}
          loading={draft.commitState === 'committing'}
          onPress={() => void reflect()}
        />
      </Animated.View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  fold: { overflow: 'hidden' },
  heading: { paddingBottom: TITLE_GAP, flexShrink: 0 },
  title: { fontSize: TITLE_SIZE, lineHeight: TITLE_LINE },
  control: { marginTop: CONTROL.marginTop },
  slot: { paddingTop: NOTICE.top, alignItems: 'center', gap: 4 },
  caption: { fontSize: CAPTION.size, letterSpacing: CAPTION.tracking },
  problem: { paddingHorizontal: 12 },
  failure: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
});
