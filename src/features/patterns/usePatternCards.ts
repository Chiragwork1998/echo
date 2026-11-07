import { useCallback, useEffect, useRef, useState } from 'react';

import type { EntrySummary } from '@/features/journal';
import { readPatternCards, type ReadFailure } from '@/services/patterns';
import { usePlus, useRequirePlus } from '@/services/plus';
import { markReadingUsed, usePlusStore } from '@/services/plus/store';
import { usePreferences } from '@/state/preferences';

import { gatherEntries } from './gatherEntries';
import { clearReading, loadReading, saveReading, type SavedReading } from './readingStore';

/** The wording of the consent. Change the words, change this, and everyone is asked again. */
export const CONSENT_VERSION = 'patterns-1';

export type CardsNotice =
  | { kind: 'none' }
  | { kind: 'support' }
  | { kind: 'error'; code: ReadFailure | 'no_entries' }
  | { kind: 'not_kept' }
  | { kind: 'withdrawn' };

export type PatternCards = {
  /** The last reading kept on this phone. null until loaded, and when there is none. */
  saved: SavedReading | null;
  loaded: boolean;
  /** Asking for agreement, never skippable: reading waits on a yes. */
  asking: boolean;
  reading: boolean;
  notice: CardsNotice | null;
  agreed: boolean;
  /**
   * The first reading is free. Once one has been made, every reading is ECHO Plus, and without it
   * `read` opens the paywall instead.
   */
  needsPlus: boolean;
  /** The one quiet action. Asks first if the person has not yet agreed. */
  read: () => void;
  agree: () => void;
  decline: () => void;
  withdraw: () => void;
  deleteCards: () => void;
  dismissNotice: () => void;
};

/**
 * Pattern cards, start to finish. Opening Patterns only reads what is sealed on this phone and never
 * calls the server: a reading happens only when `read` is pressed, and never before an agreement.
 * Whatever goes wrong, the cards already on the phone stay.
 */
export function usePatternCards(entries: readonly EntrySummary[]): PatternCards {
  const agreed = usePreferences((state) => state.patternsConsent === CONSENT_VERSION);
  const [saved, setSaved] = useState<SavedReading | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [asking, setAsking] = useState(false);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<CardsNotice | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const requirePlus = useRequirePlus();
  const { isPlus } = usePlus();
  // A reading kept on the phone, or one made and since deleted: either way the free one is used.
  const readingUsed = usePlusStore((state) => state.readingUsed) || saved !== null;

  useEffect(() => {
    alive.current = true;
    void loadReading().then((result) => {
      if (!alive.current) return;
      if (result.ok) setSaved((current) => current ?? result.value);
      setLoaded(true);
    });
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setAsking(false);
    setNotice(null);
    setReading(true);
    try {
      const sending = await gatherEntries(entries);
      if (!alive.current) return;
      if (!sending || sending.length === 0) {
        setNotice({ kind: 'error', code: 'no_entries' });
        return;
      }
      const result = await readPatternCards(sending);
      if (!alive.current) return;

      if (result.status === 'cards') {
        const fresh: SavedReading = {
          readAt: Date.now(),
          entriesRead: result.entriesRead || sending.length,
          cards: result.cards,
        };
        setSaved(fresh);
        markReadingUsed();
        const kept = await saveReading(fresh);
        if (alive.current && !kept.ok) setNotice({ kind: 'not_kept' });
      } else if (result.status === 'error') {
        setNotice({ kind: 'error', code: result.code });
      } else {
        // 'none' or 'support'. Earlier cards stay as they were.
        setNotice({ kind: result.status });
      }
    } finally {
      busy.current = false;
      if (alive.current) setReading(false);
    }
  }, [entries]);

  const read = useCallback(() => {
    if (busy.current) return;
    if (readingUsed && !requirePlus('patterns')) return;
    if (agreed) void run();
    else {
      setNotice(null);
      setAsking(true);
    }
  }, [agreed, readingUsed, requirePlus, run]);

  const agree = useCallback(() => {
    usePreferences.getState().setPatternsConsent(CONSENT_VERSION);
    void run();
  }, [run]);

  const decline = useCallback(() => setAsking(false), []);

  const withdraw = useCallback(() => {
    usePreferences.getState().setPatternsConsent(null);
    setAsking(false);
    setNotice({ kind: 'withdrawn' });
  }, []);

  const deleteCards = useCallback(() => {
    setSaved(null);
    setNotice(null);
    void clearReading();
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    saved,
    loaded,
    asking,
    reading,
    notice,
    agreed,
    needsPlus: readingUsed && !isPlus,
    read,
    agree,
    decline,
    withdraw,
    deleteCards,
    dismissNotice,
  };
}
