import { useCallback, useEffect, useRef, useState } from 'react';

import { cue } from '@/design/haptics';

import { CLOSE_REDUCED_MS, HURRY_MS, UI_HANG_MS, closeTimeline, type Ritual } from './ritual';

/** Where the closing of the book has got to. Null while the book is open and being written in. */
export type ClosingState = {
  /** What it plays: the ritual chosen when the session began (D-008). */
  ritual: Ritual;
  /** A tap said enough: everything left finishes together, quickly. */
  hurry: boolean;
  /** The cover is down and the book rests. */
  contact: boolean;
  /**
   * The book is sinking from sight, as JS says it. The book's own landing begins the sink on the UI thread, after
   * its rest, without waiting for this (./BookStage): this is for a closed book that was asked something, which
   * sinks when it is answered, and for a UI thread that did not say its cover was down.
   */
  sinking: boolean;
  /** Reduce Motion: no leaf, no cover and no sink. The book fades where it is. */
  reduced: boolean;
  /** The closed book will be asked something (whose it is), so Reduce Motion shows its cover. */
  asking: boolean;
};

export type BeginOptions = {
  /**
   * Something that holds the closed book still until it is answered: the question on its cover.
   * Called once, when the cover is down, never when a tap has hurried the closing.
   */
  atContact?: () => Promise<void>;
  /** The book is going to be asked something, so Reduce Motion shows the closed cover first. */
  asking?: boolean;
};

/** Something the book's own animation reports, which the closing waits for. */
type Moment = { reached: boolean; wake: (() => void) | null };
const fresh = (): Moment => ({ reached: false, wake: null });

/**
 * The book closing once the entry is safe: the last leaf, the cover, a moment's rest, and the sink.
 * The animations are the book's own (it is told `closing`); this keeps the order of things and the
 * time at which the next screen may be asked for.
 *
 * The closing follows those animations, not the clock. They run on the UI thread, which can be a
 * second or two behind the wall clock on a slow phone, and a timer would then call the cover down while
 * it was still in the air. So the book says when its cover has `landed`, which is the moment it is felt.
 * The book's own animation reports it, with a net of its own that is measured from the animation's first
 * frame (./animationEnd); what is here is only the last word, UI_HANG_MS beyond the time the cover was
 * due, for a UI thread that is not there at all. `begin` resolves at that time, and always does: a
 * closing can be hurried, and one that is torn down resolves at once, so a session can never hang.
 *
 * The next screen is asked for as the cover lands, and not when the book has sunk, or when it is half
 * sunk: a screen takes a quarter of a second to most of a second to mount, and asked for after the book
 * had gone, the sky was bare for as long as that took. Asked for as the cover lands (after a question on
 * it is answered, if there is one) it is arriving as the book rests and sinks, and sinks over its
 * entrance. The order of the book is kept: the cover lands, that is felt, and then the book sinks. The sink is
 * begun by the cover's own landing, on the UI thread, after the rest (./BookStage): JS is busy mounting the next
 * screen by then, and a sink that waited for a JS timer sat at rest for 0.4 to 1 s where the ritual means 40 to
 * 80 ms. The state below, after `gap`, is what a closed book that was asked something sinks on, and the fallback.
 * Reduce Motion has no cover to wait for: the book fades where it is, and the next screen is asked for as that
 * fade begins (the UI thread's word, as for the hurried book), so that it arrives over the fading book and not
 * after it has gone.
 */
export function useBookClosing(ritual: Ritual, reduced: boolean) {
  const [closing, setClosing] = useState<ClosingState | null>(null);
  const latest = useRef({ ritual, reduced });
  useEffect(() => {
    latest.current = { ritual, reduced };
  });
  // Which sequence is the live one: a hurried closing replaces the one it interrupts.
  const run = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const done = useRef<(() => void) | null>(null);
  const started = useRef<Promise<void> | null>(null);
  const hurried = useRef(false);
  // The book is waiting on an answer: the question on its cover.
  const holding = useRef(false);
  // What the book has told us, which may be before we ask.
  const moments = useRef({ landed: fresh(), sinkBegun: fresh() });

  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(() => {
          timers.current.delete(id);
          resolve();
        }, ms);
        timers.current.add(id);
      }),
    [],
  );

  /** Resolves when the book says so, or `net` ms from now if it never does. */
  const until = useCallback(
    (moment: Moment, net: number) =>
      new Promise<void>((resolve) => {
        if (moment.reached) return resolve();
        const id = setTimeout(() => {
          timers.current.delete(id);
          moment.wake = null;
          resolve();
        }, net);
        timers.current.add(id);
        moment.wake = () => {
          clearTimeout(id);
          timers.current.delete(id);
          moment.wake = null;
          resolve();
        };
      }),
    [],
  );
  const reach = useCallback((moment: Moment) => {
    moment.reached = true;
    moment.wake?.();
  }, []);

  const stop = useCallback(() => {
    run.current += 1;
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    moments.current.landed.wake = null;
    moments.current.sinkBegun.wake = null;
  }, []);

  useEffect(
    () => () => {
      stop();
      done.current?.();
    },
    [stop],
  );

  /** The cover is down: the book tells us, from the animation that put it there. */
  const landed = useCallback(() => reach(moments.current.landed), [reach]);
  /** The UI thread has begun the book's sink: a hurried closing asks for the next screen then. */
  const sinkBegun = useCallback(() => reach(moments.current.sinkBegun), [reach]);

  const begin = useCallback(
    (options: BeginOptions = {}): Promise<void> => {
      if (started.current) return started.current;
      const { ritual: plan, reduced: still } = latest.current;
      const times = closeTimeline(plan);
      const mine = ++run.current;
      const live = () => run.current === mine;
      const state = (patch: Partial<ClosingState>) =>
        setClosing((now) => (now ? { ...now, ...patch } : now));
      const promise = new Promise<void>((resolve) => {
        done.current = resolve;
        // Without a question to ask, Reduce Motion fades the book out with everything else.
        const fadesNow = still && !options.asking;
        setClosing({
          ritual: plan,
          hurry: false,
          contact: false,
          sinking: fadesNow,
          reduced: still,
          asking: Boolean(options.asking),
        });
        void (async () => {
          if (fadesNow) {
            // The fade is what the book is doing from the first moment. The next screen is asked for as the UI
            // thread begins it, so that it arrives over the fading book: asked for when the fade had ended, it
            // came after the book had gone, and the sky was bare for as long as it took to mount (0.73 s on the
            // walked emulator).
            await until(moments.current.sinkBegun, CLOSE_REDUCED_MS + UI_HANG_MS);
            if (!live()) return;
            cue('commit');
            return resolve();
          }
          // Reduce Motion with a question: the controls fade, and the closed cover shows at once.
          // Otherwise the cover comes down, and the closing waits for it to be down.
          await (still
            ? wait(CLOSE_REDUCED_MS)
            : until(moments.current.landed, times.contactAt + UI_HANG_MS));
          if (!live()) return;
          state({ contact: true });
          cue(still ? 'commit' : 'settle');
          if (options.atContact) {
            holding.current = true;
            await options.atContact();
            holding.current = false;
            if (!live()) return;
          }
          // The cover is down and the book is not being asked anything: the next screen is asked for now,
          // and arrives over the book as it rests and sinks. (Reduce Motion fades the book first.)
          if (!still) resolve();
          await wait(still ? 0 : plan.close.gap);
          if (!live()) return;
          state({ sinking: true });
          if (still) {
            // The answer is given and the book fades: the next screen is asked for as the fade begins.
            await until(moments.current.sinkBegun, CLOSE_REDUCED_MS + UI_HANG_MS);
            if (!live()) return;
            resolve();
          }
        })();
      });
      started.current = promise;
      return promise;
    },
    [until, wait],
  );

  /** A tap said enough. Not while the book is being asked something: that is the person's to answer. */
  const hurry = useCallback(() => {
    if (!started.current || holding.current || hurried.current) return;
    hurried.current = true;
    stop();
    setClosing((now) => (now ? { ...now, hurry: true, contact: true, sinking: true } : now));
    // The hurried book sinks in 300 ms, the cover with it. The next screen is asked for as the UI
    // thread begins that, so that it arrives as the book goes, and not after it has gone.
    void until(moments.current.sinkBegun, HURRY_MS + UI_HANG_MS).then(() => done.current?.());
  }, [stop, until]);

  return { closing, begin, hurry, landed, sinkBegun, isHolding: () => holding.current };
}
