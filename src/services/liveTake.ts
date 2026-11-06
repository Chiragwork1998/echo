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
    try {
      if (op.kind === 'audio') socket?.appendAudio(pcmToBase64(op.samples));
      else socket?.commit();
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
    if (socket && outbox.length === 0 && transcript.settled()) {
      conclude({ ok: true, text: transcript.text() });
    }
  };

  const handlers: LiveHandlers = {
    onEvent: (event) => {
      if (done) return;
      transcript.apply(event);
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
    // The last words are waited for, but not for ever: what has arrived is then what there is.
    timer = setTimeout(() => {
      if (done) return;
      if (socket && transcript.hasWords() && !transcript.failed()) {
        conclude({ ok: true, text: transcript.text() });
      } else {
        fail();
      }
    }, FINISH_MS);
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
