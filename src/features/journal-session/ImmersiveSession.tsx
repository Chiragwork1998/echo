import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoText } from '@/components/EchoText';
import { backgroundSources } from '@/design/generated/backgrounds';
import { useTheme } from '@/design/theme';
import { useWhileHere } from '@/features/home/dissolve';
import { usePlateFrame, usePlatePoint } from '@/design/usePlatePoint';
import { useReduceMotion } from '@/design/useReduceMotion';

import { Beacon } from './Beacon';
import { QuietControls } from './QuietControls';
import { sessionCopy } from './sessionCopy';
import { CONTROLS, qaKeyboardHeight, useSkyFrame, useSkyInk } from './sky';
import { SkyInput } from './SkyInput';
import type { SessionController } from './useSessionController';
import { useQuietControls } from './useQuietControls';
import { useScreenReader } from './useScreenReader';
import { useStillness } from './useStillness';
import { appendTranscript } from './useTranscription';
import { VOICE_NOTES, VoiceNote } from './VoiceNote';
import { GROUND_FADE, Wash } from './Wash';

const NOTE_WIDTH = 320;
/** How far the shade behind the words reaches below the sky, and above the controls. */
const SKY_WASH_BELOW = 70;
const DOT = 6;
const SERIF = 'CormorantGaramond_500Medium';

/**
 * The daily echo, as the owner asked for it (D-003): when Begin is pressed the phone falls away and
 * only the mountains remain. No header, no timer, no saved mark, no page. The photograph never moves,
 * words appear straight on the sky, and the controls surface only when they are wanted.
 */
export function ImmersiveSession({ session }: { session: SessionController }) {
  const { name, colors } = useTheme();
  const ink = useSkyInk();
  const insets = useSafeAreaInsets();
  const { width } = usePlateFrame();
  const plate = usePlatePoint();
  const reduced = useReduceMotion();
  const screenReader = useScreenReader();
  const here = useWhileHere();
  const settled = useStillness(reduced);
  const frame = useSkyFrame(plate, insets.top);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);

  const { draft, mode, speakView, ready, canReflect, failure, retryable } = session;
  // Spoken words on their way are a quiet line above the controls, not a card over the sky.
  const notice = session.notice ?? session.quietLine;
  const writing = mode === 'write';
  const recording = speakView === 'recording';
  const busy = speakView === 'starting' || speakView === 'saving';
  const voiceNote = !writing && VOICE_NOTES.includes(speakView);
  const pinned = retryable || failure !== null || voiceNote;
  // Shade only comes with words on the sky: the mountains are left alone until then.
  const washed =
    (session.bodyVisible && draft.content.body.length > 0) ||
    session.liveText.length > 0 ||
    voiceNote ||
    failure !== null;
  const quiet = useQuietControls({ always: screenReader, pinned });

  // The keyboard rises over the lower scenery. The photograph and the words stay where they are:
  // only the quiet controls ride above it.
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });
  const resting = insets.bottom + CONTROLS.aboveEdge;
  const qaKeyboard = qaKeyboardHeight();
  const lift = useAnimatedStyle(() => {
    const height = Math.max(keyboard.height.get(), qaKeyboard);
    return { bottom: height > 0 ? height + CONTROLS.aboveKeyboard : resting };
  });

  // The shade under the controls reaches from the bottom of the screen to above them.
  const span = useAnimatedStyle(() => {
    const height = Math.max(keyboard.height.get(), qaKeyboard);
    return { height: (height > 0 ? height + CONTROLS.aboveKeyboard : resting) + GROUND_FADE };
  });

  // Recording is a point of light, and Stop is always one glance away in the quiet row. A pause,
  // with a take to show for it, brings the controls too.
  const { hide, show, arm } = quiet;
  useEffect(() => {
    if (speakView === 'starting') hide();
    else if (speakView === 'recording') show();
    else if (speakView === 'recorded' && !writing) show();
    // Waiting on the light: after the same few quiet seconds as writing, Back and Write come.
    else if (speakView === 'ready' && !writing) arm();
  }, [speakView, writing, hide, show, arm]);

  // Choosing Write from the controls puts the caret straight back on the sky.
  const refocus = useRef(false);
  useEffect(() => {
    if (!writing || !refocus.current) return;
    refocus.current = false;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [writing]);

  const focusEnd = () => {
    const end = draft.content.body.length;
    inputRef.current?.setSelection?.(end, end);
    inputRef.current?.focus();
  };

  // Anywhere on the scenery. Writing: the keyboard comes, and the caret lands. Speaking: tap to
  // start, tap to pause.
  const touchScenery = () => {
    if (!ready || failure !== null) return;
    if (writing) {
      if (focused) quiet.show();
      else focusEnd();
      return;
    }
    // Speaking: stop what is recording, or begin another take. That includes after words failed to
    // arrive, and while the last take is still becoming words.
    if (!session.touchSky()) quiet.show();
  };

  const onMiddle = () => {
    if (recording) return void session.stop();
    if (writing) {
      session.choose('speak');
      session.record();
      return;
    }
    refocus.current = true;
    session.writeInstead();
  };

  const scenery =
    writing || !ready
      ? { accessible: false }
      : {
          accessible: true,
          accessibilityRole: 'button' as const,
          accessibilityLabel: recording ? sessionCopy.speak.stop : sessionCopy.speak.record,
        };

  return (
    <View style={styles.root}>
      {/* The same photograph Home was showing, on a transparent screen above the same layer. */}
      <Image
        source={backgroundSources[name].home}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
        transition={0}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      {/* The clock and the icons go with everything else. */}
      <StatusBar hidden={here ? true : undefined} animated />

      <Pressable
        {...scenery}
        disabled={!ready}
        onPress={touchScenery}
        style={StyleSheet.absoluteFill}
        testID="session-scenery"
      />

      <Wash
        kind="sky"
        visible={washed}
        style={{ top: 0, height: frame.top + frame.height + SKY_WASH_BELOW }}
      />

      <SkyInput
        inputRef={inputRef}
        // Spoken words stay off the sky unless the person chose to see them. Writing always shows.
        value={
          session.bodyVisible
            ? writing
              ? draft.content.body
              : appendTranscript(draft.content.body, session.liveText)
            : ''
        }
        label={session.prompt}
        editable={ready && writing}
        onChangeText={(body) => {
          session.change(body);
          quiet.typed();
        }}
        onFocus={() => {
          setFocused(true);
          quiet.arm();
        }}
        onBlur={() => {
          setFocused(false);
          quiet.show();
        }}
        frame={frame}
        arrival={session.arrival}
        caret={settled && writing && ready && failure === null}
        focused={focused}
        interactive={writing}
      />

      {!writing && (
        <Beacon
          kind="light"
          visible={settled && ready && !voiceNote && failure === null}
          live={recording || busy || session.listening}
          x={width / 2}
          y={frame.top + frame.height / 2}
        />
      )}

      {(voiceNote || failure !== null) && (
        <View
          pointerEvents="box-none"
          style={[styles.centre, { top: frame.top, height: frame.height }]}
        >
          {failure !== null ? (
            <FailedDraft
              message={failure}
              retry={session.failedCode !== 'unreadable'}
              onRetry={() => void draft.reload()}
            />
          ) : (
            <VoiceNote
              view={speakView}
              onAllow={() => void session.allowMicrophone()}
              onSettings={session.openSettings}
              onWrite={() => {
                refocus.current = true;
                session.writeInstead();
              }}
              onRetry={session.retryTranscription}
              line={session.speakLine}
            />
          )}
        </View>
      )}

      <Wash
        kind="ground"
        visible={quiet.visible || notice !== null}
        style={[styles.ground, span]}
      />

      <Animated.View pointerEvents="box-none" style={[styles.bottom, lift]}>
        {notice !== null && (
          <View style={styles.notice} accessibilityLiveRegion="polite">
            <View style={[styles.dot, { backgroundColor: colors.accentWarm }]} />
            <EchoText
              variant="bodyL"
              serif
              accessibilityRole="alert"
              maxFontSizeMultiplier={1.5}
              style={[styles.noticeText, { color: ink.text }, ink.shadow]}
            >
              {notice}
            </EchoText>
          </View>
        )}
        <QuietControls
          visible={quiet.visible}
          middle={recording ? 'stop' : writing ? 'speak' : 'write'}
          middleDisabled={busy || !ready}
          canReflect={canReflect}
          reflecting={draft.commitState === 'committing'}
          words={
            writing || !session.daily
              ? undefined
              : { label: session.wordsLabel, onPress: session.toggleWords }
          }
          onBack={session.back}
          onMiddle={onMiddle}
          onReflect={() => void session.reflect()}
        />
      </Animated.View>
    </View>
  );
}

function FailedDraft(props: { message: string; retry: boolean; onRetry: () => void }) {
  const { text, shadow } = useSkyInk();
  return (
    <View style={styles.failed} accessibilityLiveRegion="polite">
      <EchoText
        variant="bodyL"
        serif
        align="center"
        accessibilityRole="alert"
        maxFontSizeMultiplier={1.5}
        style={[styles.failedText, { color: text }, shadow]}
      >
        {props.message}
      </EchoText>
      {props.retry && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sessionCopy.errors.retry}
          onPress={props.onRetry}
          style={styles.retry}
        >
          <EchoText variant="bodyL" serif style={[styles.retryText, { color: text }, shadow]}>
            {sessionCopy.errors.retry}
          </EchoText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0 },
  ground: { bottom: 0 },
  notice: {
    alignSelf: 'center',
    maxWidth: NOTE_WIDTH,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginTop: 8 },
  noticeText: { flexShrink: 1, fontFamily: SERIF, fontSize: 18, lineHeight: 23 },
  failed: { alignItems: 'center', gap: 4, paddingHorizontal: 40 },
  failedText: { fontFamily: SERIF, fontSize: 20, lineHeight: 27 },
  retry: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontFamily: SERIF, fontSize: 21, lineHeight: 26, textDecorationLine: 'underline' },
});
