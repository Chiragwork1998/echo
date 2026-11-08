import { useCallback, useEffect, useRef, useState } from 'react';

import { cue } from '@/design/haptics';

import { ANIMATION_NET_MS, CLOSE_REDUCED_MS, HURRY_MS, closeTimeline, type Ritual } from './ritual';

/** Where the closing of the book has got to. Null while the book is open and being written in. */
export type ClosingState = {
  /** What it plays: the ritual chosen when the session began (D-008). */
  ritual: Ritual;
  /** A tap said enough: everything left finishes together, quickly. */
  hurry: boolean;
  /** The cover is down and the book rests. */
  contact: boolean;
  /** The book is sinking from sight. */
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
 * second behind the wall clock on a slow phone, and a timer would then call the cover down while it
 * was still in the air, and the next screen would be asked for over a book that had not sunk. So the
 * book says when its cover has `landed`, which is the moment it is felt, and when it is `gone` (half
 * way sunk), which is the moment the next screen is asked for. Each wait has an end (ANIMATION_NET_MS),
 * and `begin` resolves at that time, and always does: a closing can be hurried, and one that is torn
 * down resolves at once, so a session can never hang. Reduce Motion has no cover and no sink to
 * wait for, and keeps its own short times.
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
  const moments = useRef({ landed: fresh(), gone: fresh() });

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
    moments.current.gone.wake = null;
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
  /** The book has sunk far enough for the next screen to come (all the way, when hurried). */
  const gone = useCallback(() => reach(moments.current.gone), [reach]);

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
            await wait(CLOSE_REDUCED_MS);
            if (!live()) return;
            cue('commit');
            return resolve();
          }
          // Reduce Motion with a question: the controls fade, and the closed cover shows at once.
          // Otherwise the cover comes down, and the closing waits for it to be down.
          await (still
            ? wait(CLOSE_REDUCED_MS)
            : until(moments.current.landed, times.contactAt + ANIMATION_NET_MS));
          if (!live()) return;
          state({ contact: true });
          cue(still ? 'commit' : 'settle');
          if (options.atContact) {
            holding.current = true;
            await options.atContact();
            holding.current = false;
            if (!live()) return;
          }
          await wait(still ? 0 : plan.close.gap);
          if (!live()) return;
          state({ sinking: true });
          await (still
            ? wait(CLOSE_REDUCED_MS)
            : until(moments.current.gone, plan.close.sink + ANIMATION_NET_MS));
          if (!live()) return;
          resolve();
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
    // The hurried book sinks in 300 ms, all of it: the next screen comes when it has.
    void until(moments.current.gone, HURRY_MS + ANIMATION_NET_MS).then(() => done.current?.());
  }, [stop, until]);

  return { closing, begin, hurry, landed, gone, isHolding: () => holding.current };
}
