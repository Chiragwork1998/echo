import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoText } from '@/components/EchoText';
import { OnboardingHeading } from '@/components/OnboardingHeading';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { copy } from '@/content/copy';

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
import { ImmersiveSession } from './ImmersiveSession';
import { SegmentedMode } from './SegmentedMode';
import { SessionHeader } from './SessionHeader';
import { sessionCopy } from './sessionCopy';
import { SpeakPanel, TextAction } from './SpeakPanel';
import {
  useSessionController,
  type SessionController,
  type SessionOptions,
  type SessionVariant,
} from './useSessionController';
import { VoiceConsentSheet } from './VoiceConsentSheet';
import { WritingSurface } from './WritingSurface';

export type { SessionVariant } from './useSessionController';

const SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.32)',
  textShadowRadius: 10,
  textShadowOffset: { width: 0, height: 1 },
} as const;

/**
 * Which variants take the open sky (D-003): no page, no header, no timer, only the mountains and
 * the person's words. First Echo keeps its golden. Setting `onboarding` to true is the whole change
 * to give First Echo the same moment.
 */
const IMMERSIVE: Record<SessionVariant, boolean> = { onboarding: true, daily: true };

/**
 * What the daily echo writes on (D-004). `vellum`: the person's book rises after the stillness, the
 * cover opens, and the words sit on translucent vellum with the mountains showing through. `sky`
 * returns to D-003 as first built: words directly on the mountains, with no book at all.
 */
const DAILY_PAGE: 'vellum' | 'sky' = 'vellum';

/**
 * First Echo (D-004): the shelf, a volume chosen, the cover opening, and the first page. False
 * returns to the golden's glass writing card, header, heading and Reflect button.
 */
const ONBOARDING_BOOK = true;

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

type Props = SessionOptions & {
  /**
   * The surfaces as they were before the book (D-004): First Echo's glass writing card, and the daily
   * echo's words straight on the sky. For tests of the session itself, and as a way back.
   */
  plain?: boolean;
};

/**
 * The writing session, used by First Echo and by the daily echo. Write or speak, seven minutes, and
 * a Reflect that waits until the entry is safely on the device. What it does lives in
 * useSessionController: this only chooses how it looks.
 */
export function JournalSession(props: Props) {
  const session = useSessionController(props);
  const written =
    props.variant === 'onboarding' ? props.plain === true || !ONBOARDING_BOOK : !IMMERSIVE.daily;
  const page = props.variant === 'daily' ? (props.plain ? 'sky' : DAILY_PAGE) : 'paper';
  return (
    <>
      {written ? (
        <WrittenSession session={session} />
      ) : (
        <ImmersiveSession session={session} page={page} />
      )}
      {/* Before a voice first leaves the phone, over whichever page this is. */}
      <VoiceConsentSheet
        visible={session.consentOpen}
        kind={session.consentKind}
        onAllow={() => session.chooseConsent('allowed')}
        onKeep={() => session.chooseConsent('voice_only')}
        onClose={() => session.chooseConsent('later')}
      />
    </>
  );
}

/** First Echo's page: header, prompt, a glass writing surface, Write or Speak, and Reflect. */
export function WrittenSession({ session }: { session: SessionController }) {
  const {
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
    mode,
    speakView,
    failure,
    notice,
    retryable,
    back,
    change,
    choose,
    writeInstead,
    record,
    stop,
    allowMicrophone,
    openSettings,
    reflect,
  } = session;
  const [headingHeight, setHeadingHeight] = useState(0);
  const keyboardOpen = useKeyboardOpen();

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

  const surfaceProps = {
    value: draft.content.body,
    placeholder: copy.firstEcho.placeholder,
    label: prompt,
    editable: ready,
    onChangeText: change,
    saveState: draft.saveState,
    squeezed: keyboardOpen,
    arrival: session.arrival,
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
                {failure}
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
              onSettings={openSettings}
              onWrite={writeInstead}
              onRetry={session.retryTranscription}
              line={session.speakLine}
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
