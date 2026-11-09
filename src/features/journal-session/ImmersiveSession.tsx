import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedReaction,
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
import { useUiBegun, watchAnimation } from '@/features/book/animationEnd';
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
import { CLOSE_REDUCED_MS, PART_MS, UI_HANG_MS, ritualFor } from '@/features/book/ritual';
import { Shelf, ShelfBackdrop, useShelfOffset } from '@/features/book/Shelf';
import { useBookClosing } from '@/features/book/useBookClosing';
import { useEasedKeys } from '@/features/book/useEasedKeys';
import { volumeById, volumeIndex, VOLUMES } from '@/features/book/volumes';
import { useRhythm } from '@/features/journal';
import { holdCommitNews } from '@/features/journal/api';
import { usePreferences } from '@/state/preferences';
import { useHomeDissolve, useWhileHere } from '@/features/home/dissolve';
import { useRevealTabBar } from '@/features/home/tabs/HomeTabBar';
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
import type { SpeakView } from './SpeakPanel';
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

/**
 * Leaving without Reflect, Home rises over the page's fade and this much more, so that the page is already
 * gone as Home is whole: the two cross, and there is no dim frame of neither (walk v12).
 */
const HOME_RISE_OVER_MS = 100;
/** The written name is held on the cover this long before the book goes. */
const NAME_HOLD_MS = 400;
/**
 * Not now: the blank line on the cover is taken back, and the book goes once the line is as good as gone.
 * The line takes 320 ms to leave (./CoverArt), decelerating, so it is all but gone by half of that; the
 * book does not wait for the last hair of it, and its sink and the next screen come that much sooner.
 */
export const NAME_UNDRAW_MS = 160;
/**
 * An answered book that is not back in its place by now goes anyway: a keyboard height that is never given
 * back (the walk found one left behind once, with no keys on screen) must not hold the book. The keys go in
 * a quarter to half a second, and the book eases after them in a third more.
 */
export const BACK_IN_PLACE_NET_MS = 1200;
/** The keys are down, and the book back in its place, within a point of where they rest. */
const KEYS_DOWN = 1;
/**
 * Speaking, where a touch on the sky starts nothing: the note on the page says why, and offers its own
 * way on (allow the microphone, open Settings, write instead).
 */
const TOUCH_ANSWERED: readonly SpeakView[] = ['explain', 'denied', 'unavailable', 'kept'];
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
    landed: coverLanded,
    sinkBegun: bookSinkBegun,
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
  // The shelf stays until it has finished leaving, which is after the book has been asked for: the book
  // comes as the shelf's last light goes, and there is never a frame of neither.
  const [shelfLeaving, setShelfLeaving] = useState(false);
  // The book has drawn its first frame. The shelf is kept, part of the way gone, until it has: the shelf's own
  // fade ran on the UI thread while JS mounted the book, and ended before the book drew (the walked emulator
  // showed an empty navy frame for 0.51 s, and for 0.12 s the next time).
  const [bookDrawn, setBookDrawn] = useState(false);
  const [opened, setOpened] = useState(!book);
  const volume = volumeById(picked ?? volumePin() ?? remembered ?? undefined);
  // How many echoes the book holds: a count and nothing else, so that a thicker book riffles a few
  // leaves as it opens. It arrives long before the cover starts, a second or more after the screen.
  // Once its entry is kept the book holds one more, and lets that leaf in as its cover lands (LeftStack),
  // though the journal is not told of the entry until the book has shut (see the closing below).
  const counted = useRhythm().data?.totalReflections ?? 0;
  const [keptOn, setKeptOn] = useState<number | null>(null);
  if (keeping && keptOn === null) setKeptOn(counted);
  if (!keeping && keptOn !== null) setKeptOn(null);
  const echoes = parting && keptOn !== null ? Math.max(counted, keptOn + 1) : counted;
  const clearOfKeyboard = useBookFrame(insets.top + (onboarding ? HEADER_HEIGHT - 5 : 0));
  // The daily book rests in the middle of the screen. First Echo keeps its place under the header.
  const bookDrop = onboarding
    ? 0
    : restingDrop(screenHeight, clearOfKeyboard.top, clearOfKeyboard.height);
  const bookFrame = { ...clearOfKeyboard, top: clearOfKeyboard.top + bookDrop };
  const bookBottom = bookFrame.top + bookFrame.height;
  const shelfOffset = useShelfOffset();
  // Where First Echo begins is decided once, when the draft has first loaded (or failed to, which the
  // page then says). A draft being continued is not a reason to choose a book again, and emptying its
  // page later is not either. Until then neither the shelf nor the book is drawn: a shelf drawn first
  // painted its opaque studio over the photograph for a continued draft, then faded it away (walk
  // v10, a flat slate for 0.6 s), and a book drawn first would open and give way to the shelf.
  const [begins, setBegins] = useState<'shelf' | 'book' | null>(null);
  if (onboarding && begins === null && draft.status !== 'loading') {
    setBegins(ready && draft.resumed && draft.hasContent ? 'book' : 'shelf');
  }
  const shelf = onboarding && book && picked === null && begins === 'shelf';
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
    setShelfLeaving(true);
    rememberVolume(chosen.id);
  };
  const bookInView = book && !shelf && (!onboarding || begins !== null);
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
  // The answered book goes once it is back in its place: the keys it stepped back from have gone, and the book
  // has eased after them (D-010). After Not now it went as the line was taken back, with the keys still going
  // and the book still easing, and the next screen was mounted into all of that at once (walk v11:
  // Completion's photograph jumped from nothing to most of the way in one frame; after Write it, which holds
  // the name until the keys have long gone, it dissolved). The UI thread says when it is back (see `keys`).
  const awaitingPlace = useSharedValue(0);
  const inPlace = useRef<(() => void) | null>(null);
  const answered = () => {
    const release = answer.current;
    answer.current = null;
    if (!release) return;
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      inPlace.current = null;
      awaitingPlace.set(0);
      release();
    };
    inPlace.current = go;
    after(BACK_IN_PLACE_NET_MS, go);
    awaitingPlace.set(1);
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
  };
  // The book goes as the line is as good as gone, counted from when the UI thread has begun to take it
  // back, and not from the press: a UI thread that is seconds late would otherwise let the book go with
  // the line not yet begun to leave. (The cover's own effect has set the line going by now: a parent's
  // effect runs after its child's.) Reduce Motion draws no line, and keeps its short time.
  const begun = useUiBegun();
  const declining = inscribing?.phase === 'decline';
  const answeredLater = useRef(answered);
  useEffect(() => {
    answeredLater.current = answered;
  });
  useEffect(() => {
    if (!declining) return;
    if (reduced || screenReader) {
      const id = setTimeout(() => answeredLater.current(), CLOSE_REDUCED_MS);
      return () => clearTimeout(id);
    }
    let live = true;
    let id: ReturnType<typeof setTimeout> | undefined;
    // And a very long way behind it, a UI thread that never begins: the question must always be answered.
    const backstop = setTimeout(() => answeredLater.current(), NAME_UNDRAW_MS + UI_HANG_MS);
    begun(() => {
      if (!live) return;
      clearTimeout(backstop);
      id = setTimeout(() => answeredLater.current(), NAME_UNDRAW_MS);
    });
    return () => {
      live = false;
      clearTimeout(backstop);
      clearTimeout(id);
    };
  }, [begun, declining, reduced, screenReader]);
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

  // Once the entry is kept, the book shuts before the next screen comes. The session asks for it as the cover
  // lands, or, when the closed book has asked whose it is (the first time), as it is let go once answered; the
  // screen fades itself in over the book as it rests and sinks (src/features/book/useBookClosing.ts). The keys
  // go first, so the book settles back to its place as it closes (D-010).
  //
  // The journal hears of the entry as the next screen is asked for, after the landing has been felt, and not
  // while the book shuts: told as it was kept, Home beneath and every list read and drew themselves again
  // through the leaf, the cover and its landing (holdCommitNews). The book itself counts the entry at once
  // (`echoes`).
  const { onLeave } = session;
  useEffect(() => {
    if (!bookInView || !pageOpen) return;
    const tell = holdCommitNews();
    const unregister = onLeave(() => {
      const { loaded, asked } = useBookOwner.getState();
      const question = ownable && loaded && !asked;
      // The closing first: letting the keys go blurs the page, and on web that draws at once.
      const closed = shut(question ? { atContact: ask, asking: true } : undefined);
      Keyboard.dismiss();
      return closed.finally(tell);
    });
    return () => {
      unregister();
      tell();
    };
  }, [ask, bookInView, onLeave, ownable, pageOpen, shut]);

  // Leaving without Reflect (Back, then Keep draft or Discard; or Back on an empty page): the page fades out by
  // its own animation, and the screen is popped when it has gone. The stack's fade was not seen on the walked
  // emulator, where the book and its controls vanished in one frame. The daily page only: First Echo's way out
  // is the onboarding stack's own. A touch on the page, or Back, while it goes is not heard.
  //
  // Home is asked back as the fade begins, and rises beneath the page as it goes. It is under this screen on
  // Android (presented over it), and its return runs on the UI thread from that moment: it does not wait for
  // the fade to report its end, the screen to be popped and unmounted, and the dissolve's grace after that, in
  // turn. Waited for, those cost a bare photograph of a third of a second every time, and in walk v11 of 6.4
  // and 9.7 s, twice, late in a long session.
  const { onDepart } = session;
  const { returnHome } = useHomeDissolve();
  const revealTabBar = useRevealTabBar();
  const departure = useSharedValue(0);
  const departureBegun = useUiBegun();
  const [departing, setDeparting] = useState(false);
  const goingAway = session.daily;
  useEffect(() => {
    if (!goingAway) return;
    return onDepart(
      () =>
        new Promise<void>((resolve) => {
          setDeparting(true);
          const duration = reduced || screenReader ? tokens.motion.fast : tokens.motion.standard;
          const watch = watchAnimation(duration, resolve);
          const { ended } = watch;
          const faded = () => {
            'worklet';
            runOnJS(ended)();
          };
          departure.set(
            withTiming(
              1,
              { duration, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never },
              faded,
            ),
          );
          departureBegun(watch.began);
          // Home rises as the page goes, in the page's own time, and its tab bar comes as the page has gone.
          returnHome({ delay: 0, duration: duration + HOME_RISE_OVER_MS });
          revealTabBar(duration);
        }),
    );
  }, [
    departure,
    departureBegun,
    goingAway,
    onDepart,
    reduced,
    returnHome,
    revealTabBar,
    screenReader,
  ]);
  const gone = useAnimatedStyle(() => ({ opacity: 1 - departure.get() }));

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

  // The keyboard rises over the lower scenery. The photograph and the words stay where they are: the
  // quiet controls ride above it, and the book rises only as far as it must. The book, the controls and
  // their shade all read the keys from one value, so that they move together, and only keys this screen
  // has seen come are believed (src/features/book/useEasedKeys.ts).
  const qaKeyboard = qaKeyboardHeight();
  const keys = useEasedKeys(qaKeyboard);
  const resting = insets.bottom + CONTROLS.aboveEdge;
  const lift = useAnimatedStyle(() => ({
    bottom: controlsBottom(keys.get(), resting, CONTROLS.aboveKeyboard),
  }));

  // The shade under the controls reaches from the bottom of the screen to above them.
  const span = useAnimatedStyle(() => ({
    height: controlsBottom(keys.get(), resting, CONTROLS.aboveKeyboard) + GROUND_FADE,
  }));

  // The book rises with the keyboard, just far enough for the words being typed to stay in view.
  // While the closed book asks whose it is, it also keeps clear of the question beneath it: it steps
  // back from its top as the keys come up, in the same frame as the question rides up on them, and
  // comes forward again as they go.
  const promptRoom = useSharedValue(0);
  const bookTop = bookFrame.top;
  const bookHeight = bookFrame.height;
  const bookRise = useAnimatedStyle(() => {
    const height = keys.get();
    const rise = keyboardRise(height, screenHeight, bookBottom, bookDrop);
    const room = promptRoom.get();
    if (room <= 0) return { transform: [{ translateY: -rise }] };
    const below = screenHeight - controlsBottom(height, resting, CONTROLS.aboveKeyboard) - room;
    const fits = (below - PROMPT_GAP - (bookTop - rise)) / bookHeight;
    const scale = Math.min(1, Math.max(LEAST_STEP_BACK, fits));
    return { transform: [{ translateY: -rise }, { scale }] };
  });
  // The answered book is back in its place once the keys it follows are down (see `answered`).
  const backInPlace = useCallback(() => inPlace.current?.(), []);
  useAnimatedReaction(
    () => {
      // Both are read every time, so that each is something the reaction follows.
      const awaiting = awaitingPlace.get() === 1;
      const down = keys.get() <= qaKeyboard + KEYS_DOWN;
      return awaiting && down;
    },
    (back, was) => {
      if (back && !was) runOnJS(backInPlace)();
    },
  );

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

  // To a screen reader the scenery is a button only where a touch on it does a thing of its own: on the
  // open page, speaking, it starts a take or stops one. Anywhere else it is not there for a screen reader
  // at all; the scenery is clickable, so leaving it unnamed made it a full-screen stop with nothing to say
  // (the walk, v11, while writing). Its other touches (the caret, a hurried ritual) have their own ways.
  const sceneryButton =
    !writing &&
    ready &&
    failure === null &&
    !parting &&
    (!book || (settled && pageOpen)) &&
    !TOUCH_ANSWERED.includes(speakView);
  const scenery = sceneryButton
    ? {
        accessible: true,
        accessibilityRole: 'button' as const,
        accessibilityLabel: recording ? sessionCopy.speak.stop : sessionCopy.speak.record,
      }
    : { accessible: false, importantForAccessibility: 'no' as const };

  return (
    <Animated.View
      testID="session-fade"
      style={[styles.root, gone]}
      pointerEvents={departing ? 'none' : 'auto'}
      // The page is a stack of layers (the book, its controls, the shade) and goes with an opacity: each
      // faded by itself on Android, they would show through each other. Free while its opacity is 1.
      needsOffscreenAlphaCompositing
    >
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
          testID="session-book"
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
            onLanded={coverLanded}
            onSinkBegun={bookSinkBegun}
            // Back while the book opens: the opening stops where it is as the page fades, and is not felt.
            going={departure}
            concealed={hidden}
            dimmed={noteDrawn}
            arrival={session.arrival}
            onOpened={() => {
              setOpened(true);
              countOpen();
              if (named) void countNamedOpen();
            }}
            onDrawn={() => setBookDrawn(true)}
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
          {(shelf || shelfLeaving) && (
            <View pointerEvents="box-none" style={styles.shelf}>
              <Shelf
                initial={volumeIndex(remembered ?? undefined)}
                offset={shelfOffset}
                onChoose={choose}
                onLeft={() => setShelfLeaving(false)}
                holding={!bookDrawn}
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

      <Animated.View testID="session-row" pointerEvents="box-none" style={[styles.bottom, lift]}>
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
    </Animated.View>
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
