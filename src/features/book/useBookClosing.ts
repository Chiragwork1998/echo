import { useCallback, useEffect, useRef, useState } from 'react';

import { cue } from '@/design/haptics';

import { CLOSE_REDUCED_MS, HURRY_MS, closeTimeline, type Ritual } from './ritual';

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

/**
 * The book closing once the entry is safe: the last leaf, the cover, a moment's rest, and the sink.
 * The animations are the book's own (it is told `closing`); this keeps the order of things and the
 * time at which the next screen may be asked for. `begin` resolves at that time, and always does:
 * a closing can be hurried, and one that is torn down resolves at once, so a session can never hang.
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

  const stop = useCallback(() => {
    run.current += 1;
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  useEffect(
    () => () => {
      stop();
      done.current?.();
    },
    [stop],
  );

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
          await wait(still ? CLOSE_REDUCED_MS : times.contactAt);
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
          await wait(still ? CLOSE_REDUCED_MS : plan.close.sink / 2);
          if (!live()) return;
          resolve();
        })();
      });
      started.current = promise;
      return promise;
    },
    [wait],
  );

  /** A tap said enough. Not while the book is being asked something: that is the person's to answer. */
  const hurry = useCallback(() => {
    if (!started.current || holding.current || hurried.current) return;
    hurried.current = true;
    stop();
    setClosing((now) => (now ? { ...now, hurry: true, contact: true, sinking: true } : now));
    void wait(HURRY_MS).then(() => done.current?.());
  }, [stop, wait]);

  return { closing, begin, hurry, isHolding: () => holding.current };
}
