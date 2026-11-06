import { useCallback, useEffect, useRef, useState } from 'react';

import type { PcmTap } from '@/features/journal/streamDriver';
import { createLiveTake, type LiveTake } from '@/services/liveTake';
import { openLiveSocket } from '@/services/liveTranscription';

import type { LiveHandle } from './useTranscription';

type Entry = { take: LiveTake };

/**
 * The takes that are being heard live, and the words they have so far. A take stays here from the
 * moment it begins until its words are in the draft (or it is let go of), so what the person sees
 * never has a gap between the live words and the saved ones. Hidden mode never calls `begin`, so it
 * never opens a connection.
 */
export function useLiveWords(open = openLiveSocket) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [, changed] = useState(0);
  const alive = useRef(true);
  const latest = useRef<Entry[]>([]);
  const bump = useCallback(() => {
    if (alive.current) changed((count) => count + 1);
  }, []);

  useEffect(() => {
    latest.current = entries;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const entry of latest.current) entry.take.abort();
    };
  }, []);

  /** Starts a take. `tap` is for the microphone, and `handle` for the queue that waits on its words. */
  const begin = useCallback((): { tap: PcmTap; handle: LiveHandle } => {
    const take = createLiveTake({ open }, bump);
    const entry: Entry = { take };
    setEntries((current) => [...current, entry]);
    const handle: LiveHandle = {
      outcome: take.outcome,
      abort: () => take.abort(),
      settle: () => {
        if (alive.current) setEntries((current) => current.filter((other) => other !== entry));
      },
    };
    return { tap: take.push, handle };
  }, [bump, open]);

  return {
    begin,
    /** Everything heard live that is not in the draft yet, in the order it was spoken. */
    text: entries
      .map((entry) => entry.take.text())
      .filter((words) => words.length > 0)
      .join(' '),
    /** A live take failed or dropped, and its words will follow from the recording instead. */
    failed: entries.some((entry) => entry.take.failed()),
  };
}
