import { createTurnDetector, LIVE_RATE, pcmToBase64 } from './liveAudio';
import { createLiveTranscript } from './liveTranscript';
import type { LiveHandlers, LiveSocket } from './liveTranscription';

// One take, spoken live: audio goes in, words come out, and the take can fail at any moment without
// touching the recording, which is made by something else. Everything here is about the words.
// Nothing is logged, and nothing about the words leaves this object except through `text()`.

export type LiveOutcome = { ok: true; text: string } | { ok: false };

export type LiveTakeDeps = {
  /** Opens the connection. Resolves null if it could not be opened. */
  open: (handlers: LiveHandlers) => Promise<LiveSocket | null>;
};

/** Audio waiting for a connection that is slow to open is kept for this long, and no longer. */
const WAIT_SAMPLES = LIVE_RATE * 20;
/**
 * How much audio a connection is fed without a word back from the server before it is let go. The
 * platform's socket queues what it is given, and on a dead network nothing says so for a long time, so
 * without this a long take would pile up an hour of audio behind a connection that is not there. A
 * healthy one answers all the time while there is speech, and a few minutes of silence is only a
 * pause. This is about 15 MB of what has been handed to the socket, which is also where Android's own
 * queue gives up (16 MiB).
 */
export const UNHEARD_SAMPLES = LIVE_RATE * 240;
/** After the person stops, how long the last words are waited for. */
export const FINISH_MS = 10_000;

export type LiveTake = {
  /** 24 kHz mono samples as they are captured, then null once capture has ended. */
  push(samples: Int16Array | null): void;
  /** All the words so far, finished and still arriving. */
  text(): string;
  /** The connection failed, or dropped, or a turn did not become words. */
  failed(): boolean;
  /** Settles after capture has ended and the last words are in, or the take has failed. */
  outcome: Promise<LiveOutcome>;
  /** Hang up without waiting. The outcome settles as failed if it has not already. */
  abort(): void;
};

type Op = { kind: 'audio'; samples: Int16Array } | { kind: 'commit' };

export function createLiveTake(deps: LiveTakeDeps, onChange: () => void): LiveTake {
  const detector = createTurnDetector();
  const transcript = createLiveTranscript();
  const outbox: Op[] = [];
  let waiting = 0;
  /** Audio handed to the connection since it last said anything. */
  let unheard = 0;
  /** Commits that went out on the connection. Each one is owed an acknowledgement, and a turn. */
  let commitsSent = 0;
  let socket: LiveSocket | null = null;
  let started = false;
  let ended = false;
  let gone = false;
  let broken = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolve: (outcome: LiveOutcome) => void = () => undefined;
  let done = false;
  const outcome = new Promise<LiveOutcome>((settle) => (resolve = settle));

  const conclude = (result: LiveOutcome) => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    resolve(result);
    hangUp();
    onChange();
  };
  function hangUp() {
    gone = true;
    outbox.length = 0;
    const open = socket;
    socket = null;
    try {
      open?.close();
    } catch {
      // Already gone.
    }
  }
  const fail = () => {
    broken = true;
    conclude({ ok: false });
  };

  const emit = (op: Op) => {
    if (!socket) return;
    try {
      if (op.kind === 'audio') {
        socket.appendAudio(pcmToBase64(op.samples));
        unheard += op.samples.length;
        // Only the words are given up on. The recording is made by something else and goes on.
        if (unheard > UNHEARD_SAMPLES) fail();
      } else {
        // Counted before it goes: a connection may answer before commit() returns.
        commitsSent += 1;
        socket.commit();
      }
    } catch {
      fail();
    }
  };
  const send = (op: Op) => {
    if (socket) return emit(op);
    outbox.push(op);
    if (op.kind === 'audio') {
      waiting += op.samples.length;
      // A connection this slow is not coming: the recording goes on, and the words follow later.
      if (waiting > WAIT_SAMPLES) fail();
    }
  };

  const check = () => {
    if (done || !ended) return;
    if (transcript.failed()) return fail();
    // Whole means: everything asked for was sent, every commit came back as a turn, and every turn
    // has its final words. A commit that has not been answered yet is words that have not arrived,
    // however finished everything else looks.
    if (
      socket &&
      outbox.length === 0 &&
      transcript.committed() >= commitsSent &&
      transcript.settled()
    ) {
      conclude({ ok: true, text: transcript.text() });
    }
  };

  const handlers: LiveHandlers = {
    onEvent: (event) => {
      if (done) return;
      unheard = 0;
      transcript.apply(event);
      // An error is not waited out. Whatever the server refused, the take is no longer known to be
      // whole, so it stops here and the sealed recording is sent. It does not reconnect.
      if (event.kind === 'error') return fail();
      onChange();
      check();
    },
    // A connection that ends once the words are in is a clean finish. Any other time it is a drop.
    onClose: () => {
      if (done) return;
      socket = null;
      fail();
    },
  };

  const connect = () => {
    started = true;
    void deps
      .open(handlers)
      .then((opened) => {
        if (!opened) return fail();
        if (gone || done) {
          opened.close();
          return;
        }
        socket = opened;
        const queued = outbox.splice(0);
        waiting = 0;
        queued.forEach(emit);
        check();
      })
      .catch(fail);
  };

  const finishCapture = () => {
    ended = true;
    // Nothing was ever captured, so there is nothing to wait for.
    if (!started) return conclude({ ok: false });
    if (done) return;
    if (detector.pending() || transcript.hasOpenWords()) send({ kind: 'commit' });
    if (done) return;
    // The last words are waited for, but not for ever. When the time is up and they are not all in,
    // the take is not whole, and the sealed recording is what gets sent: partial words would be
    // taken for the whole of what was said.
    timer = setTimeout(fail, FINISH_MS);
    check();
  };

  return {
    push(samples) {
      if (done || ended) return;
      if (samples === null) return finishCapture();
      if (samples.length === 0) return;
      if (!started) connect();
      send({ kind: 'audio', samples });
      if (detector.push(samples) > 0) send({ kind: 'commit' });
    },
    text: () => transcript.text(),
    failed: () => broken || transcript.failed(),
    outcome,
    abort() {
      if (!done) fail();
    },
  };
}
