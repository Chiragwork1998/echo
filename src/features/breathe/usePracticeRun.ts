import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { qa } from '@/testing/qa';

import {
  createPlayer,
  enterBreathAudio,
  rampVolume,
  releasePlayer,
  restoreJournalAudio,
  type BreathPlayer,
} from './audio';
import { wordFor, FULL_WORD_ROUNDS } from './breatheCopy';
import { playerClock, silentClock, type Clock } from './clock';
import { announce, tickFor, tickMoment } from './cues';
import { VOICE_LINES } from './library/voiceLines';
import { BELLS, loopFor, loopName } from './sounds';
import { momentAt, type Cue, type Moment, type Timeline } from './timeline';
import { useBreathAwake } from './useBreathAwake';

/** A loop fades in and out over this long, so it never ticks as it starts or stops. */
const LOOP_FADE_MS = 120;
const CLOSE_FADE_MS = 1200;
/** The breath sound dips this low while the voice speaks, and comes back after. */
const UNDER_VOICE = 0.35;
const DUCK_MS = 400;
/** How long a line stays on screen when it is shown rather than spoken. */
const CAPTION_MS = 9000;
/**
 * A loop that has not been heard to play by now is let go, and the practice carries on silently on
 * the wall clock. A practice must never hang on a sound that will not start.
 */
const START_GRACE_MS = 2000;

export type RunStatus = 'idle' | 'running' | 'done';

export type RunView = {
  status: RunStatus;
  moment: Moment | null;
  /** The one word for the breath, or null after the first rounds are said. */
  word: string | null;
  /** A line shown as text: the voice is off, or its recording is missing. */
  caption: string | null;
};

type Options = {
  timeline: Timeline;
  pace: number;
  /** The breath sound and the bells. Off: the loops play silent, for their clock, and haptics lead. */
  sound: boolean;
  /** The spoken lines. Off: each line shows as text and a bell marks its moment. */
  voice: boolean;
  screenReader: boolean;
  onDone?: () => void;
};

/** The harness can hold a practice at one moment: window.__echoBreathAt, in milliseconds. */
function pinnedElapsed(): number | null {
  if (!qa.enabled) return null;
  const value = Number((window as { __echoBreathAt?: number }).__echoBreathAt);
  return Number.isFinite(value) ? value : null;
}

function pause(player: BreathPlayer) {
  try {
    player.pause();
  } catch {
    // Released.
  }
}

type Sounding = {
  clock: Clock;
  /** When this clock began waiting for its sound. */
  since: number;
  /** The loop the clock follows, by name, so a following segment on the same loop carries on. */
  loop: string;
  /** The clock's reading when the current segment began. */
  offset: number;
  segment: number;
};

/**
 * Runs a practice: its loops, bells and voice, its haptics, what a screen reader hears, and the
 * screen kept awake. Everything follows the sound's own clock. `level` is the breath, from 0 (empty)
 * to 1 (full), for the visuals to read every frame.
 */
export function usePracticeRun({
  timeline: initial,
  pace,
  sound,
  voice,
  screenReader,
  onDone,
}: Options) {
  const level = useSharedValue(0);
  const [view, setView] = useState<RunView>({
    status: 'idle',
    moment: null,
    word: null,
    caption: null,
  });
  const timeline = useRef(initial);
  const sounding = useRef<Sounding | null>(null);
  const loops = useRef(new Map<string, BreathPlayer | null>());
  const bells = useRef(new Map<string, BreathPlayer | null>());
  const voices = useRef(new Map<string, BreathPlayer | null>());
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const lastElapsed = useRef(-1);
  const lastKey = useRef('');
  const status = useRef<RunStatus>('idle');
  const captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRamps = useRef<(() => void)[]>([]);
  const settings = useRef({ sound, voice, screenReader, onDone, pace });
  useEffect(() => {
    settings.current = { sound, voice, screenReader, onDone, pace };
  });
  const [awake, setAwake] = useState(false);
  useBreathAwake(awake);

  const loopPlayer = useCallback((name: string, source: number) => {
    if (!loops.current.has(name)) loops.current.set(name, createPlayer(source, true));
    return loops.current.get(name) ?? null;
  }, []);

  const volumeFor = () => (settings.current.sound ? 1 : 0);

  /** Starts the sound and clock of a segment, carrying on the loop if it is the same one. */
  const begin = useCallback(
    (index: number) => {
      const segment = timeline.current.segments[index];
      if (!segment) return;
      const before = sounding.current;
      const name = loopName(segment.pattern, settings.current.pace);
      if (before && before.loop === name) {
        const previous = timeline.current.segments[before.segment];
        const span = previous ? previous.endMs - previous.startMs : 0;
        sounding.current = { ...before, offset: before.offset + span, segment: index };
        return;
      }
      if (before) {
        const player = before.clock.player;
        if (player)
          stopRamps.current.push(rampVolume(player, 0, LOOP_FADE_MS, () => pause(player)));
        before.clock.dispose();
      }
      const source = loopFor(segment.pattern, settings.current.pace);
      const player = source === null ? null : loopPlayer(name, source);
      if (player) {
        try {
          player.volume = 0;
          void player.seekTo(0).catch(() => undefined);
          player.play();
          stopRamps.current.push(rampVolume(player, volumeFor(), LOOP_FADE_MS));
        } catch {
          // Plays silent: the clock below still runs on the wall.
        }
      }
      const clock = player ? playerClock(player, segment.breath.roundMs) : silentClock();
      sounding.current = { clock, since: Date.now(), loop: name, offset: 0, segment: index };
    },
    [loopPlayer],
  );

  const ring = useCallback((bell: keyof typeof BELLS) => {
    if (!settings.current.sound) return tickMoment();
    if (!bells.current.has(bell)) bells.current.set(bell, createPlayer(BELLS[bell], false));
    const player = bells.current.get(bell);
    if (!player) return;
    try {
      void player.seekTo(0).catch(() => undefined);
      player.play();
    } catch {
      // A bell that cannot ring is not worth stopping for.
    }
  }, []);

  const showCaption = useCallback((text: string) => {
    if (captionTimer.current) clearTimeout(captionTimer.current);
    setView((current) => ({ ...current, caption: text }));
    captionTimer.current = setTimeout(() => {
      captionTimer.current = null;
      setView((current) => ({ ...current, caption: null }));
    }, CAPTION_MS);
  }, []);

  /** A line is spoken over the breath, which dips under it. Without its recording it is shown. */
  const speak = useCallback(
    (cue: Extract<Cue, { kind: 'voice' }>) => {
      const source = VOICE_LINES[cue.line];
      if (!settings.current.voice || source === undefined) {
        showCaption(cue.text);
        ring('moment');
        return;
      }
      if (!voices.current.has(cue.line)) voices.current.set(cue.line, createPlayer(source, false));
      const player = voices.current.get(cue.line);
      if (!player) {
        showCaption(cue.text);
        ring('moment');
        return;
      }
      const loop = sounding.current?.clock.player;
      if (loop && settings.current.sound)
        stopRamps.current.push(rampVolume(loop, UNDER_VOICE, DUCK_MS));
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (!status.didJustFinish) return;
        subscription.remove();
        const now = sounding.current?.clock.player;
        if (now && settings.current.sound && status.didJustFinish) {
          stopRamps.current.push(rampVolume(now, 1, DUCK_MS));
        }
      });
      try {
        player.play();
      } catch {
        subscription.remove();
        showCaption(cue.text);
      }
    },
    [ring, showCaption],
  );

  const fire = useCallback(
    (cue: Cue) => {
      if (cue.kind === 'bell') ring(cue.bell);
      else if (cue.kind === 'voice') speak(cue);
      // A fade is drawn by the screen, from the timeline.
    },
    [ring, speak],
  );

  const elapsedNow = useCallback(() => {
    const pinned = pinnedElapsed();
    if (pinned !== null) return pinned;
    const current = sounding.current;
    if (!current) return 0;
    const segment = timeline.current.segments[current.segment];
    return (segment?.startMs ?? 0) + current.clock.elapsedMs() - current.offset;
  }, []);

  const finish = useCallback(() => {
    status.current = 'done';
    setAwake(false);
    const player = sounding.current?.clock.player;
    // The last breath out ends quietly: the loop fades rather than stops, and its clock stops with it.
    if (player) stopRamps.current.push(rampVolume(player, 0, CLOSE_FADE_MS, () => pause(player)));
    else sounding.current?.clock.pause();
    setView((current) => ({ ...current, status: 'done', word: null }));
    settings.current.onDone?.();
  }, []);

  // The frame loop reads the latest tick through a ref, so it never holds on to an old one.
  const tickRef = useRef<() => void>(() => undefined);
  const schedule = useCallback(() => {
    frame.current = requestAnimationFrame(() => tickRef.current());
  }, []);

  const tick = useCallback(() => {
    frame.current = null;
    if (status.current !== 'running') return;
    const waiting = sounding.current;
    if (waiting && !waiting.clock.started() && Date.now() - waiting.since > START_GRACE_MS) {
      const player = waiting.clock.player;
      if (player) pause(player);
      waiting.clock.dispose();
      sounding.current = { ...waiting, clock: silentClock(), loop: '' };
    }
    let elapsed = elapsedNow();
    const segments = timeline.current.segments;
    // A segment that has run its rounds hands over to the next at the quiet end of a breath out.
    while (sounding.current) {
      const index = sounding.current.segment;
      const segment = segments[index];
      if (!segment || elapsed < segment.endMs || index >= segments.length - 1) break;
      begin(index + 1);
      elapsed = Math.max(elapsedNow(), segment.endMs);
    }
    const moment = momentAt(timeline.current, elapsed);
    if (moment) {
      level.set(moment.breath.level);
      if (moment.key !== lastKey.current && !moment.done) {
        lastKey.current = moment.key;
        tickFor(moment.breath.phase);
        const word = wordFor(moment.breath.phase, moment.round);
        if (settings.current.screenReader && moment.round < FULL_WORD_ROUNDS) announce(word);
        setView((current) => ({ ...current, moment, word }));
      }
    }
    for (const cue of timeline.current.cues) {
      if (cue.atMs > lastElapsed.current && cue.atMs <= elapsed) fire(cue);
    }
    lastElapsed.current = elapsed;
    if (moment?.done) return finish();
    schedule();
  }, [begin, elapsedNow, finish, fire, level, schedule]);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const start = useCallback(() => {
    if (status.current !== 'idle') return;
    status.current = 'running';
    setAwake(true);
    setView({ status: 'running', moment: null, word: null, caption: null });
    void enterBreathAudio().then(() => {
      if (status.current !== 'running') return;
      begin(0);
      schedule();
    });
  }, [begin, schedule]);

  const release = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (captionTimer.current) clearTimeout(captionTimer.current);
    stopRamps.current.forEach((stop) => stop());
    stopRamps.current = [];
    sounding.current?.clock.dispose();
    sounding.current = null;
    for (const group of [loops, bells, voices]) {
      group.current.forEach((player) => releasePlayer(player));
      group.current.clear();
    }
  }, []);

  /** Ends now, wherever the practice is. The sound stops and nothing more is said. */
  const stop = useCallback(() => {
    if (status.current === 'idle') return;
    status.current = 'done';
    setAwake(false);
    release();
    setView((current) => ({ ...current, status: 'done', word: null, caption: null }));
  }, [release]);

  // The practice holds still while the app is away, and carries on from the same breath.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (status.current !== 'running') return;
      if (next === 'active') {
        sounding.current?.clock.resume();
        if (frame.current === null) schedule();
      } else {
        sounding.current?.clock.pause();
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    });
    return () => subscription.remove();
  }, [schedule]);

  // Leaving puts the sound back the way the journal expects it.
  useEffect(
    () => () => {
      status.current = 'done';
      release();
      void restoreJournalAudio();
    },
    [release],
  );

  return { view, level, start, stop, elapsed: elapsedNow, timeline };
}

export type PracticeRun = ReturnType<typeof usePracticeRun>;
