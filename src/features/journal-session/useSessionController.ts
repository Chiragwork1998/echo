import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Keyboard } from 'react-native';

import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { holdTheme } from '@/design/themeHold';
import { BECOME_PROMPT_ID, becomeCopy } from '@/features/become/becomeCopy';
import { routeAfterReflect } from '@/features/become/rehearsal';
import { useDraft, useVoiceRecorder, type JournalErrorCode } from '@/features/journal';
import { backPath, nextPath, onboardingSteps } from '@/features/onboarding/flow';
import { showDialog, type WithdrawDialog } from '@/features/tab-pages/Dialog';
import {
  getMicrophonePermission,
  openAppSettings,
  requestMicrophonePermission,
} from '@/services/permissions';
import { useRequirePlus } from '@/services/plus';
import { UNAVAILABLE_CODES } from '@/services/transcription';
import { useOnboarding } from '@/state/onboarding';
import { liveAllowed, usePreferences, useVoiceStatus } from '@/state/preferences';

import type { SessionMode } from './SegmentedMode';
import type { ConsentKind } from './VoiceConsentSheet';
import { sessionCopy } from './sessionCopy';
import type { SpeakView } from './SpeakPanel';
import { useKeepAwakeWhile } from './useKeepAwake';
import { useLiveWords } from './useLiveWords';
import { useSessionTimer } from './useSessionTimer';
import {
  STUCK_CODES,
  useTranscription,
  type ConsentChoice,
  type LiveHandle,
  type TranscriptionFailure,
} from './useTranscription';

const FIRST_ECHO_STEP = onboardingSteps.indexOf('first-echo') + 1;

export type SessionVariant = 'onboarding' | 'daily';

// Where each variant goes. Onboarding follows the flow. The daily session returns to Home, and
// reflects through Completion, which another screen owns.
const TARGETS = {
  onboarding: { back: backPath('first-echo'), next: nextPath('first-echo'), step: FIRST_ECHO_STEP },
  daily: { back: '/home', next: '/home/complete', step: undefined },
} as const;
const go = (path: string | undefined) => path && router.navigate(path as never);
/**
 * The most the closing of the book may hold the next screen back. It plays for a second or two, and a
 * question on the cover waits for an answer for 45 seconds at the most; anything past this is a
 * closing that has been lost, and the entry is already safe.
 */
const CLOSING_CAP_MS = 60_000;
/** Resolves when the closing is over or the cap is reached, whichever is first. */
async function closed(closing: (() => Promise<void>) | null) {
  if (!closing) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, CLOSING_CAP_MS);
  });
  try {
    await Promise.race([closing().catch(() => undefined), cap]);
  } finally {
    clearTimeout(timer);
  }
}
/**
 * Leaves for the screen this one opened from. Both sessions are pushed over it in the same stack,
 * and `navigate` would push a second copy over the session instead of closing it: the daily session
 * would stay mounted behind a Home that is still dissolved, and First Echo behind a second Arrival.
 * `dismissTo` pops to the screen that is already there, which closes the session.
 */
const goBack = (variant: SessionVariant) => {
  const path = TARGETS[variant].back;
  if (path) router.dismissTo(path as never);
};

/** Where a touch on the open sky starts another take: not mid-question, and not before the microphone is allowed. */
const CAN_START: readonly SpeakView[] = [
  'ready',
  'recorded',
  'listening',
  'untranscribed',
  'transcribe_failed',
  'transcribe_unavailable',
  'transcribe_allowance',
  'failed',
];

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
    case 'unexpected':
      return lines.unexpected;
    case 'lost':
      return lines.lost;
    case 'fair_use':
      return lines.fairUse;
    // The note's first line. Its second, about the free month, is `speakDetail`.
    case 'allowance_used':
      return sessionCopy.transcribe.untranscribed;
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
  /**
   * A morning session (Become): a new entry is asked "Who will you be today?" and saved under
   * `promptId: 'become'`, and its Reflect rehearses before Completion. Daily only.
   */
  become?: boolean;
};

/**
 * Everything the writing session does, with none of how it looks: the draft, the recording, the
 * timer, and the ways out. First Echo's page and the daily echo's open sky both draw from this, so
 * what is safe in one is safe in the other.
 */
export function useSessionController({ variant, initialMode, draftId, become }: SessionOptions) {
  // The theme never changes in the middle of a writing session, whoever asks for it. It waits here
  // while the session is on screen, and is made when the person leaves.
  useFocusEffect(useCallback(() => holdTheme(), []));

  const daily = variant === 'daily';
  const morning = daily && become === true;
  const target = TARGETS[variant];
  const prompt = morning ? becomeCopy.question : daily ? copy.home.prompt : copy.firstEcho.title;
  const [permission, setPermission] = useState<'none' | 'explain' | 'denied'>('none');
  const [problem, setProblem] = useState<string | null>(null);
  const reflecting = useRef(false);
  // What plays between the entry being kept and the next screen: the book shutting. The page that
  // draws the book registers it, and a page without a book registers nothing, so it goes at once.
  const leaving = useRef<(() => Promise<void>) | null>(null);
  const onLeave = useCallback((play: () => Promise<void>) => {
    leaving.current = play;
    return () => {
      if (leaving.current === play) leaving.current = null;
    };
  }, []);

  // A person told the microphone is off goes to Settings, allows it, and comes back. The note must
  // not still say it is off over a page that does nothing when touched, so coming back to the
  // foreground asks again, and the note goes if it was allowed. It only reads the state: nothing is
  // asked of the person, and nothing starts the microphone.
  useEffect(() => {
    if (permission === 'none') return;
    let live = true;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void getMicrophonePermission().then((now) => {
        if (live && now.status === 'granted') setPermission('none');
      });
    });
    return () => {
      live = false;
      subscription.remove();
    };
  }, [permission]);

  const draft = useDraft({
    draftId,
    seed: {
      mode: 'text',
      promptId: morning ? BECOME_PROMPT_ID : daily ? 'daily' : 'first-echo',
      promptText: prompt,
      // The mood from Arrival belongs to the first echo, not to every day after it.
      moodBefore: daily ? undefined : useOnboarding.getState().mood,
    },
  });
  const voice = useVoiceRecorder(draft);
  const transcription = useTranscription(draft);
  const requirePlus = useRequirePlus();
  const voiceChoice = useVoiceStatus();
  const wordsShown = usePreferences((state) => state.wordsShown);
  const liveWords = useLiveWords();
  // The take being recorded that is also being heard live, and the question that Show words asks.
  const liveTake = useRef<LiveHandle | null>(null);
  const stopping = useRef(false);
  const beginning = useRef(false);
  const [liveAsk, setLiveAsk] = useState<'toggle' | 'record' | null>(null);
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
  // The screen stays on for the whole of a take: recording, sealing, and sending the words. A person
  // who speaks does not touch it, and a phone that slept would end the take (useKeepAwake.ts).
  useKeepAwakeWhile(recordingBusy || transcription.active);
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
    if (failedCode === 'not_found') goBack(variant);
    if (failedCode === 'not_draft') go(target.next);
  }, [failedCode, target, variant]);

  const change = (body: string) => {
    if (body.length > 0) startTimer();
    setProblem(null);
    transcription.noteBody(body);
    draft.update({ body, durationSeconds: elapsed });
  };

  const choose = (next: SessionMode) => {
    cue('tick');
    if (next === 'speak') Keyboard.dismiss();
    // The next session opens the way this one was last used.
    usePreferences.getState().setLastMode(next);
    setMode(next);
  };
  const writeInstead = () => {
    setPermission('none');
    choose('write');
  };

  /** Hang up on a live take, and stop showing what it heard. The recording is not touched. */
  const dropLive = () => {
    const take = liveTake.current;
    liveTake.current = null;
    take?.abort();
    take?.settle();
  };
  const beginRecording = async () => {
    // A second touch while the first is still starting would open a second connection for one take.
    if (beginning.current || liveTake.current) return;
    beginning.current = true;
    try {
      await begin();
    } finally {
      beginning.current = false;
    }
  };
  const begin = async () => {
    setPermission('none');
    const { wordsShown: shown, voiceConsent } = usePreferences.getState();
    // Hidden words never open a connection. Live needs the stream, the person's agreement to it, and
    // the daily echo's open sky, which is the only page that can show words as they come.
    if (daily && shown && voice.liveAvailable && !liveAllowed(voiceConsent)) {
      setLiveAsk('record');
      return;
    }
    const live = daily && shown && voice.liveAvailable ? liveWords.begin() : null;
    liveTake.current = live?.handle ?? null;
    // A take still waiting for its words keeps a copy of its recording, which this one will replace.
    await transcription.holdCurrent();
    const code = await voice.start(live ? { tap: live.tap } : undefined);
    if (code !== null) dropLive();
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
    showDialog(
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
    const live = liveTake.current;
    liveTake.current = null;
    stopping.current = true;
    // Capture ends first, so the last words are already being finished while the recording is sealed.
    const result = await voice.stop();
    stopping.current = false;
    if (!result.ok) {
      live?.abort();
      live?.settle();
      return;
    }
    draft.update({ durationSeconds: elapsed });
    // The recording is sealed on the phone. Only now do its words follow, in the order spoken. A live
    // take brings the words it heard, and the recording is used only if they did not come.
    transcription.enqueue(result.value, live ?? undefined);
  };

  // The recorder stopped itself (the app went to the background), so no one will wait on this take.
  const recorderState = voice.state;
  useEffect(() => {
    if (recorderState === 'recording' || recorderState === 'starting') return;
    if (liveTake.current && !stopping.current) dropLive();
  }, [recorderState]);

  /** Show words or Hide words. Showing for the first time asks, because live words stream the voice. */
  const toggleWords = () => {
    const prefs = usePreferences.getState();
    if (prefs.wordsShown) {
      prefs.setWordsShown(false);
      // Hiding is the way to avoid the live stream: it stops now, and the words follow after.
      dropLive();
      return;
    }
    // Live words are ECHO Plus (docs/PRODUCT_V1.md). Without it the paywall opens instead.
    if (!requirePlus('live-words')) return;
    if (daily && voice.liveAvailable && !liveAllowed(prefs.voiceConsent)) setLiveAsk('toggle');
    else prefs.setWordsShown(true);
  };
  const chooseConsent = (choice: ConsentChoice) => {
    if (liveAsk === null) return transcription.choose(choice);
    const asked = liveAsk;
    setLiveAsk(null);
    const prefs = usePreferences.getState();
    if (choice === 'allowed') {
      prefs.allowLiveWords();
      prefs.setWordsShown(true);
      if (asked === 'record') void beginRecording();
    } else if (choice === 'voice_only') {
      // Keep words hidden: the take goes on the quiet way if it was waiting to begin.
      prefs.setWordsShown(false);
      if (asked === 'record') void beginRecording();
    }
  };

  /** A touch on the open sky while speaking. Returns whether it did anything. */
  const touchSky = (): boolean => {
    if (voice.state === 'recording') {
      void stop();
      return true;
    }
    if (!CAN_START.includes(speakView)) return false;
    record();
    return true;
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
      // A morning entry rehearses on the way to Completion. The book shuts first, if there is one.
      if (result.ok) {
        await closed(leaving.current);
        go(daily ? routeAfterReflect(result.value) : target.next);
      } else if (result.error.code === 'not_draft') go(target.next);
      else if (result.error.code === 'not_found') goBack(variant);
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
  /** Reflect's question while the words were on their way, until they arrive or fail. */
  const askedToWait = useRef<WithdrawDialog | null>(null);
  const transcribing = transcription.active;
  const transcriptionKind = transcription.phase.kind;

  const wordsMissing =
    (transcription.phase.kind === 'failed' &&
      !UNAVAILABLE_CODES.includes(transcription.phase.code)) ||
    (unsent && transcription.phase.kind === 'idle' && voiceChoice !== 'voice_only');

  const reflect = async () => {
    if (reflecting.current || !canReflect) return;
    if (transcription.active) {
      const { title, message, wait, goOn } = sessionCopy.transcribe.waiting;
      askedToWait.current = showDialog(title, message, [
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
      showDialog(title, message, [
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
  const latestReflect = useRef(reflect);
  useEffect(() => {
    latestReflect.current = reflect;
  });

  useEffect(() => {
    if (transcribing) return;
    // The words arrived, or failed, before the person answered: the question no longer stands. It
    // is taken back, and Reflect asks again now that the outcome is known. Words go on to Reflect,
    // as either answer would have; none ask whether to try again.
    const asked = askedToWait.current;
    askedToWait.current = null;
    if (asked?.(() => void latestReflect.current())) return;
    if (!waitingToReflect.current) return;
    waitingToReflect.current = false;
    if (transcriptionKind === 'idle') void latestFinish.current();
  }, [transcribing, transcriptionKind]);

  const keepDraft = async () => {
    if (voice.state === 'recording') await voice.stop();
    draft.update({ durationSeconds: elapsed });
    const saved = await draft.flush();
    if (saved.ok) goBack(variant);
    else setProblem(sessionCopy.errors.save);
  };
  const discardDraft = async () => {
    dropLive();
    if (voice.state === 'recording') await voice.cancel();
    transcription.abandon();
    const removed = await draft.discard();
    if (removed.ok) goBack(variant);
    else setProblem(sessionCopy.errors.save);
  };
  const back = () => {
    // Once the entry is being kept and the book is shutting, there is nothing to leave: it is saved.
    if (reflecting.current) return;
    if (!hasWork) {
      void draft.discard();
      goBack(variant);
      return;
    }
    const { title, message, keep, discard, stay } = sessionCopy.leave;
    showDialog(title, message, [
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
      // The free month is used: the recording waits, sealed, as an offline take does.
      if (words.code === 'allowance_used') return 'transcribe_allowance';
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

  /** A second line under the note, for the one state that needs it: why the words have not come. */
  const speakDetail =
    speakView === 'transcribe_allowance' ? sessionCopy.transcribe.allowance.line : null;

  /**
   * ECHO Plus, from the note that says the free month is used. The paywall is the Plus check's to
   * show. If the person has Plus once it returns, the recording that is waiting is sent at once.
   */
  const getPlus = () => {
    if (requirePlus('voice-unlimited')) transcription.retry();
  };

  // A live take that broke is said calmly and stays on screen until its words arrive some other way.
  const liveNote = wordsShown && liveWords.failed ? sessionCopy.liveStopped : null;

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
    quietLine:
      liveNote ??
      (wordsShown && transcription.phase.kind === 'listening'
        ? sessionCopy.transcribe.listening
        : null),
    /** The sentence for the transcription states that have actions. */
    speakLine,
    /** One more line under it, or null. */
    speakDetail,
    /** "Get ECHO Plus", from the note that says the free month is used. */
    getPlus,
    /** Counts the times words have landed, so they can be let in softly. */
    arrival: transcription.arrival,
    consentOpen: transcription.phase.kind === 'consent' || liveAsk !== null,
    /** Which question is open: before any voice is sent, or the first time Show words is turned on. */
    consentKind: (liveAsk !== null ? 'live' : 'voice') as ConsentKind,
    chooseConsent,
    /** Show words is on: the words are on the screen. Off, a spoken session shows only the light. */
    wordsShown,
    /** Words heard live and not yet in the draft. Always empty unless words are shown. */
    liveText: wordsShown ? liveWords.text : '',
    /**
     * The draft's words are on the screen: always when writing, and when spoken words are shown.
     * First Echo keeps its page: its words come to the page as they land.
     */
    bodyVisible: !daily || mode === 'write' || wordsShown,
    /** The quiet word for the words: what a tap will do. */
    wordsLabel: wordsShown ? sessionCopy.words.hide : sessionCopy.words.show,
    toggleWords,
    touchSky,
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
    onLeave,
  };
}

export type SessionController = ReturnType<typeof useSessionController>;
