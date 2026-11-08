import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoBackground } from '@/components/EchoBackground';
import { EchoText } from '@/components/EchoText';
import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { BookPage, useBookFrame } from '@/features/book/BookPage';
import { controlsBottom, keyboardRise, restingDrop } from '@/features/book/bookPlace';
import type { Inscribing } from '@/features/book/CoverArt';
import {
  NAMED_OPENS_NOTICED,
  countNamedOpen,
  loadBookOwner,
  markAsked,
  useBookOwner,
  writeName,
} from '@/features/book/owner';
import { PaperProvider, usePaperLook, type Surface } from '@/features/book/paper';
import { opensPin, volumePin } from '@/features/book/qaPins';
import { CLOSE_REDUCED_MS, PART_MS, ritualFor } from '@/features/book/ritual';
import { Shelf, ShelfBackdrop, useShelfOffset } from '@/features/book/Shelf';
import { useBookClosing } from '@/features/book/useBookClosing';
import { volumeById, volumeIndex, VOLUMES } from '@/features/book/volumes';
import { useRhythm } from '@/features/journal';
import { usePreferences } from '@/state/preferences';
import { useWhileHere } from '@/features/home/dissolve';
import { usePlateFrame, usePlatePoint } from '@/design/usePlatePoint';
import { useReduceMotion } from '@/design/useReduceMotion';

import { Arrive } from './Arrive';
import { Beacon } from './Beacon';
import { NamePrompt } from './NamePrompt';
import { HEADER_HEIGHT } from './geometry';
import { QuietControls } from './QuietControls';
import { sessionCopy } from './sessionCopy';
import { SessionHeader } from './SessionHeader';
import { CONTROLS, qaKeyboardHeight, useSkyFrame, useSkyInk } from './sky';
import { SkyInput } from './SkyInput';
import type { SessionController } from './useSessionController';
import { useQuietControls } from './useQuietControls';
import { useScreenReader } from './useScreenReader';
import { useStillness } from './useStillness';
import { appendTranscript } from './useTranscription';
import { VOICE_NOTES, VoiceNote } from './VoiceNote';
import { GROUND_FADE, Wash } from './Wash';

/** A book that has not opened by now will not: notes stop waiting for it. A little over the full ritual. */
export const OPEN_GRACE_MS = 8000;
const NOTE_WIDTH = 320;
/** How far the shade behind the words reaches below the sky, and above the controls. */
const SKY_WASH_BELOW = 70;
const DOT = 6;
const SERIF = 'CormorantGaramond_500Medium';

/** The written name is held on the cover this long before the book goes. */
const NAME_HOLD_MS = 400;
/** Not now: the blank line on the cover is taken back over this long, and then the book goes. */
const NAME_UNDRAW_MS = 320;
/** The book keeps this far clear of the question while it is asked. */
const PROMPT_GAP = 22;
/** However tall the question grows, the book steps back no further than this. */
const LEAST_STEP_BACK = 0.5;

/**
 * The daily echo, as the owner asked for it (D-003): when Begin is pressed the phone falls away and
 * only the mountains remain. No header, no timer, no saved mark, no page. The photograph never moves,
 * words appear straight on the sky, and the controls surface only when they are wanted.
 */
export function ImmersiveSession({
  session,
  page = 'sky',
  concealed = false,
}: {
  session: SessionController;
  /**
   * The words are kept but not shown, so the page is empty with only the breathing light (D-008).
   * They fade away and back; every word is still in the draft.
   */
  concealed?: boolean;
  /**
   * What the words sit on. `sky`: straight on the mountains, as D-003 first drew it. `vellum`: a
   * translucent page in a book that rises and opens (D-004). `paper`: the same book with an opaque
   * page, for First Echo, which begins at the shelf.
   */
  page?: 'sky' | Surface;
}) {
  const { colors } = useTheme();
  const ink = useSkyInk();
  const insets = useSafeAreaInsets();
  const { width, height: screenHeight } = usePlateFrame();
  const plate = usePlatePoint();
  const reduced = useReduceMotion();
  const screenReader = useScreenReader();
  const here = useWhileHere();
  // The ritual of opening plays in full for the first few sessions and then shortens (D-008). What
  // applies is what it was when this session began, so it never changes under the person's eyes.
  const [ritual] = useState(() => ritualFor(opensPin() ?? usePreferences.getState().bookOpens));
  const countOpen = usePreferences((state) => state.countBookOpen);
  // A tap anywhere before the page is open says enough: it comes at once, and softly.
  const [tapped, setTapped] = useState(false);
  const stilled = useStillness(reduced, ritual.stillness);
  const settled = stilled || tapped;
  // The book shutting, once the entry is kept: it plays the ritual it opened with. A screen reader is
  // not made to wait for it: it closes as it does under Reduce Motion, in a blink.
  const {
    closing,
    begin: shut,
    hurry: hurryClosing,
  } = useBookClosing(ritual, reduced || screenReader);
  const parting = closing !== null;
  // From the moment the entry begins to be kept until the screen goes, unless keeping it fails: the
  // book makes its cover ready and holds the count it was opened with. The draft says it is done
  // before the closing has begun, so its own state would let both go for a moment in between.
  const [keeping, setKeeping] = useState(false);
  const frame = useSkyFrame(plate, insets.top);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);

  const { draft, mode, speakView, ready, canReflect, failure, retryable } = session;
  if (draft.commitState === 'committing' && !keeping) setKeeping(true);
  if (draft.commitState === 'error' && keeping) setKeeping(false);
  // Spoken words on their way are a quiet line above the controls, not a card over the sky.
  const notice = session.notice ?? session.quietLine;
  const writing = mode === 'write';
  const recording = speakView === 'recording';
  const busy = speakView === 'starting' || speakView === 'saving';
  const voiceNote = !writing && VOICE_NOTES.includes(speakView);
  const pinned = retryable || failure !== null || voiceNote;
  // Shade only comes with words on the sky: the mountains are left alone until then.
  // Words hidden (D-008): a spoken session shows the photograph and the breathing light, and nothing
  // else. The words are still in the draft. Writing always shows what is typed.
  const hidden = concealed || !session.bodyVisible;
  const shownBody = hidden
    ? ''
    : writing
      ? draft.content.body
      : appendTranscript(draft.content.body, session.liveText);
  const washed = shownBody.length > 0 || voiceNote || failure !== null;
  const quiet = useQuietControls({ always: screenReader, pinned });

  // The book (D-004). First Echo begins at the shelf, and the person chooses a volume. The daily
  // echo has no shelf: after the stillness their own book rises and opens.
  const book = page !== 'sky';
  const onboarding = !session.daily;
  const look = usePaperLook(page === 'paper' ? 'paper' : 'vellum');
  const { gutter, width: column } = useLayout();
  const remembered = usePreferences((state) => state.volume);
  const rememberVolume = usePreferences((state) => state.setVolume);
  const [picked, setPicked] = useState<string | null>(null);
  const [opened, setOpened] = useState(!book);
  const volume = volumeById(picked ?? volumePin() ?? remembered ?? undefined);
  // How many echoes the book holds: a count and nothing else, so that a thicker book riffles a few
  // leaves as it opens. It arrives long before the cover starts, a second or more after the screen.
  const echoes = useRhythm().data?.totalReflections ?? 0;
  const clearOfKeyboard = useBookFrame(insets.top + (onboarding ? HEADER_HEIGHT - 5 : 0));
  // The daily book rests in the middle of the screen. First Echo keeps its place under the header.
  const bookDrop = onboarding
    ? 0
    : restingDrop(screenHeight, clearOfKeyboard.top, clearOfKeyboard.height);
  const bookFrame = { ...clearOfKeyboard, top: clearOfKeyboard.top + bookDrop };
  const bookBottom = bookFrame.top + bookFrame.height;
  const shelfOffset = useShelfOffset();
  // A draft that is being continued is not a reason to choose a book again.
  const resumed = ready && draft.resumed && draft.hasContent;
  const shelf = onboarding && book && picked === null && !resumed;
  const studio = useSharedValue(shelf ? 1 : 0);
  useEffect(() => {
    studio.set(
      withTiming(shelf ? 1 : 0, {
        duration: reduced ? tokens.motion.fast : 700,
        easing: Easing.inOut(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [shelf, studio, reduced]);
  const choose = (index: number) => {
    const chosen = VOLUMES[index];
    if (!chosen) return;
    setPicked(chosen.id);
    rememberVolume(chosen.id);
  };
  const bookInView = book && !shelf;
  const pageOpen = !book || opened;

  // Whose book this is (./NamePrompt.tsx). Only the daily book can be named: First Echo is onboarding,
  // and onboarding never asks. Read from its sealed record when the book first needs it.
  const ownable = session.daily && page === 'vellum';
  useEffect(() => {
    if (ownable) void loadBookOwner();
  }, [ownable]);
  const owner = useBookOwner();
  // How the name in the page's head arrives this session, decided once and kept, like the ritual.
  const [nameArrives, setNameArrives] = useState<'wipe' | 'fade' | null>(null);
  if (owner.loaded && nameArrives === null) {
    setNameArrives(owner.namedOpens < NAMED_OPENS_NOTICED ? 'wipe' : 'fade');
  }
  const named = ownable && owner.name ? { name: owner.name, arrives: nameArrives ?? 'fade' } : null;

  // The question on the closed book, and how it is answered. Asked at most once, ever: `asked` is kept
  // the moment it appears. The closing waits for the answer before the book sinks.
  const [inscribing, setInscribing] = useState<Inscribing | null>(null);
  const answer = useRef<(() => void) | null>(null);
  const asking = useRef<Inscribing['phase'] | null>(null);
  const later = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = later.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  const after = (ms: number, task: () => void) => {
    const id = setTimeout(() => {
      later.current.delete(id);
      task();
    }, ms);
    later.current.add(id);
  };
  const answered = () => {
    const release = answer.current;
    answer.current = null;
    release?.();
  };
  const ask = useCallback(
    () =>
      new Promise<void>((resolve) => {
        answer.current = resolve;
        asking.current = 'ask';
        setInscribing({ phase: 'ask' });
        void markAsked();
      }),
    [],
  );
  const writeOwnName = (name: string) => {
    if (asking.current !== 'ask') return;
    asking.current = 'stamp';
    Keyboard.dismiss();
    // Sealed at once; nothing drawn waits for it.
    void writeName(name);
    setInscribing({ phase: 'stamp', name });
  };
  // The stamp has landed: felt once, held a moment, and the book goes.
  const stamped = () => {
    cue('fine');
    after(NAME_HOLD_MS, answered);
  };
  const notNow = () => {
    if (asking.current !== 'ask') return;
    asking.current = 'decline';
    Keyboard.dismiss();
    setInscribing({ phase: 'decline' });
    after(reduced || screenReader ? CLOSE_REDUCED_MS : NAME_UNDRAW_MS, answered);
  };
  // Back, while the book asks, is Not now. Once it is answered there is nothing to go back to.
  const latestNotNow = useRef(notNow);
  useEffect(() => {
    latestNotNow.current = notNow;
  });
  const promptShown = inscribing !== null;
  useEffect(() => {
    if (!promptShown) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      latestNotNow.current();
      return true;
    });
    return () => subscription.remove();
  }, [promptShown]);

  // Once the entry is kept, the book shuts before the next screen comes (the session asks for it
  // when it is ready to go). The keys go first, so the book settles back to its place as it closes
  // (D-010). The first time, the closed book asks whose it is.
  const { onLeave } = session;
  useEffect(() => {
    if (!bookInView || !pageOpen) return;
    return onLeave(() => {
      const { loaded, asked } = useBookOwner.getState();
      const question = ownable && loaded && !asked;
      // The closing first: letting the keys go blurs the page, and on web that draws at once.
      const closed = shut(question ? { atContact: ask, asking: true } : undefined);
      Keyboard.dismiss();
      return closed;
    });
  }, [ask, bookInView, onLeave, ownable, pageOpen, shut]);

  // The quiet things leave as the closing begins, and the notes on the page with them.
  const away = useSharedValue(0);
  useEffect(() => {
    away.set(
      withTiming(parting ? 1 : 0, {
        duration: reduced ? CLOSE_REDUCED_MS : PART_MS,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [away, parting, reduced]);
  const leaving = useAnimatedStyle(() => ({ opacity: 1 - away.get() }));
  // A note about the voice, or about a draft that will not open, is words on a page. Said before the
  // cover has opened it sits on the closed book or the bare scenery, over bright river and lit
  // windows. So it waits for the page. A book that cannot open must not swallow it: after a grace the
  // note comes anyway, because a person with nothing to read is worse off.
  const [openingStalled, setOpeningStalled] = useState(false);
  useEffect(() => {
    if (!bookInView || opened) return;
    const timer = setTimeout(() => setOpeningStalled(true), OPEN_GRACE_MS);
    return () => clearTimeout(timer);
  }, [bookInView, opened]);
  const notesMayShow = !book || (bookInView && (opened || openingStalled));
  // A note is actually drawn: the words behind it drop to a faint trace so neither fights the other.
  const noteDrawn = (voiceNote || failure !== null) && notesMayShow;

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
    return { bottom: controlsBottom(height, resting, CONTROLS.aboveKeyboard) };
  });

  // The shade under the controls reaches from the bottom of the screen to above them.
  const span = useAnimatedStyle(() => {
    const height = Math.max(keyboard.height.get(), qaKeyboard);
    return { height: controlsBottom(height, resting, CONTROLS.aboveKeyboard) + GROUND_FADE };
  });

  // The book rises with the keyboard, just far enough for the words being typed to stay in view.
  // While the closed book asks whose it is, it also keeps clear of the question beneath it: it steps
  // back from its top as the keys come up, and comes forward again as they go.
  const promptRoom = useSharedValue(0);
  const bookTop = bookFrame.top;
  const bookHeight = bookFrame.height;
  const bookRise = useAnimatedStyle(() => {
    const height = Math.max(keyboard.height.get(), qaKeyboard);
    const rise = keyboardRise(height, screenHeight, bookBottom, bookDrop);
    const room = promptRoom.get();
    if (room <= 0) return { transform: [{ translateY: -rise }] };
    const below = screenHeight - controlsBottom(height, resting, CONTROLS.aboveKeyboard) - room;
    const fits = (below - PROMPT_GAP - (bookTop - rise)) / bookHeight;
    const scale = Math.min(1, Math.max(LEAST_STEP_BACK, fits));
    return { transform: [{ translateY: -rise }, { scale }] };
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
    // While the book is shutting, any touch says enough: what is left finishes at once.
    if (parting) return hurryClosing();
    // Before the book is open, any touch skips the rest of the ritual.
    if (book && (!settled || !pageOpen)) return setTapped(true);
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
      {/* The daily echo draws no photograph of its own. This screen is transparent, and the one
          photograph Home was showing, still or alive (D-009), is drawn beneath the stack by
          app/home/_layout.tsx. Another copy here would cover the loop and cut it off. */}
      {onboarding && book && <EchoBackground screen="first-echo" />}
      {/* The studio colour is the book's ground: it sits above the photograph and below the book, so a
          book coming forward is never drawn through a veil that has not cleared yet. */}
      {onboarding && book && <ShelfBackdrop offset={shelfOffset} visible={studio} />}
      {book && <Stack.Screen options={{ gestureEnabled: false }} />}
      {/* The clock and the icons go with everything else. */}
      <StatusBar hidden={here ? true : undefined} animated />

      <Pressable
        {...scenery}
        disabled={!ready && (!book || pageOpen)}
        onPress={touchScenery}
        style={StyleSheet.absoluteFill}
        testID="session-scenery"
      />

      {!book && (
        <>
          <Wash
            kind="sky"
            visible={washed}
            style={{ top: 0, height: frame.top + frame.height + SKY_WASH_BELOW }}
          />

          <SkyInput
            inputRef={inputRef}
            // Spoken words stay off the sky unless the person chose to see them. Writing always shows.
            value={shownBody}
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
        </>
      )}

      {bookInView && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            StyleSheet.absoluteFill,
            // It steps back from its own top, so the head of the book stays where it was.
            { transformOrigin: `${width / 2}px ${bookTop}px` },
            bookRise,
          ]}
        >
          <BookPage
            frame={bookFrame}
            surface={page === 'paper' ? 'paper' : 'vellum'}
            volume={volume}
            entrance={onboarding ? 'forward' : 'rise'}
            start={onboarding ? true : settled}
            riseFrom={bookFrame.top + bookFrame.height + 40}
            ritual={ritual}
            // A screen reader is not made to wait for the book either.
            hurry={tapped || screenReader}
            echoes={echoes}
            preparing={keeping}
            closing={closing}
            owner={named}
            inscribing={inscribing}
            onStamped={stamped}
            concealed={hidden}
            dimmed={noteDrawn}
            arrival={session.arrival}
            onOpened={() => {
              setOpened(true);
              countOpen();
              if (named) void countNamedOpen();
            }}
            inputRef={inputRef}
            value={
              writing ? draft.content.body : appendTranscript(draft.content.body, session.liveText)
            }
            label={session.prompt}
            placeholder={onboarding ? copy.firstEcho.placeholder : undefined}
            lead={onboarding ? { lines: 2, text: copy.firstEcho.title } : undefined}
            // Once the entry is kept the page is only a picture: a touch on it is a touch on the
            // scenery, which says enough to the closing, and nothing typed would go anywhere.
            editable={ready && writing && !parting}
            interactive={writing && !parting}
            onChangeText={(body) => {
              if (parting) return;
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
            onTap={touchScenery}
          >
            {(open) =>
              !writing && (
                <Beacon
                  kind="light"
                  visible={open && ready && !voiceNote && failure === null && !parting}
                  live={recording || busy || session.listening}
                  x={bookFrame.width / 2}
                  y={
                    hidden || draft.content.body.length === 0
                      ? bookFrame.height / 2
                      : bookFrame.height - 30
                  }
                />
              )
            }
          </BookPage>
        </Animated.View>
      )}

      {!book && !writing && (
        <Beacon
          kind="light"
          visible={settled && ready && !voiceNote && failure === null}
          live={recording || busy || session.listening}
          x={width / 2}
          y={frame.top + frame.height / 2}
        />
      )}

      {noteDrawn && (
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, leaving]}>
          <Arrive
            testID="session-note"
            delay={120}
            ms={350}
            pointerEvents="box-none"
            style={[
              styles.centre,
              book
                ? {
                    top: bookFrame.top,
                    height: bookFrame.height,
                    left: bookFrame.left,
                    right: bookFrame.left,
                  }
                : { top: frame.top, height: frame.height },
            ]}
          >
            <PaperProvider look={look}>
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
                  onPlus={session.getPlus}
                  line={session.speakLine}
                  detail={session.speakDetail}
                />
              )}
            </PaperProvider>
          </Arrive>
        </Animated.View>
      )}

      {onboarding && book && (
        <>
          <View
            pointerEvents="box-none"
            style={[
              styles.header,
              { width: column, paddingHorizontal: gutter, paddingTop: Math.max(insets.top - 5, 8) },
            ]}
          >
            <SessionHeader
              step={session.target.step}
              onBack={session.back}
              remaining={session.timer.remaining}
              timerState={session.timer.state}
            />
          </View>
          {shelf && (
            <View pointerEvents="box-none" style={styles.shelf}>
              <Shelf
                initial={volumeIndex(remembered ?? undefined)}
                offset={shelfOffset}
                onChoose={choose}
              />
            </View>
          )}
        </>
      )}

      <Wash
        kind="ground"
        quiet
        visible={
          // The question on the closed book is cream words low on the scenery, as the quiet row is.
          inscribing?.phase === 'ask' ||
          (!parting && ((quiet.visible && pageOpen && !shelf) || notice !== null))
        }
        style={[styles.ground, span]}
      />

      <Animated.View pointerEvents="box-none" style={[styles.bottom, lift]}>
        {notice !== null && (
          // A line that appears because the state changed comes up, while its shade does.
          <Animated.View style={leaving}>
            <Arrive>
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
            </Arrive>
          </Animated.View>
        )}
        {inscribing !== null ? (
          // The question takes the quiet row's place, its two words where Back and Reflect were.
          <NamePrompt
            leaving={inscribing.phase !== 'ask'}
            onWrite={writeOwnName}
            onNotNow={notNow}
            onLayout={(event) => promptRoom.set(event.nativeEvent.layout.height)}
          />
        ) : (
          <QuietControls
            visible={quiet.visible && pageOpen && !shelf && !parting}
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
        )}
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
  header: { position: 'absolute', top: 0, alignSelf: 'center' },
  shelf: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
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
