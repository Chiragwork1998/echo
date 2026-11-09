import { useMemo, useState } from 'react';
import { create } from 'zustand';

/**
 * Echoes deleted in this sitting, each with its place in the order of deletions. Remembered from the
 * moment the deletion is known: the archive is read again after a deletion, and the answer takes a
 * moment; until it comes the list would show the echo that is gone, then jump when it did (the walk,
 * v10). Only ids: nothing the person wrote.
 */
export const useRemovedEchoes = create<{ deleted: ReadonlyMap<string, number>; count: number }>(
  () => ({ deleted: new Map(), count: 0 }),
);

export function hideEcho(id: string): void {
  useRemovedEchoes.setState((state) =>
    state.deleted.has(id)
      ? state
      : { deleted: new Map(state.deleted).set(id, state.count + 1), count: state.count + 1 },
  );
}

/** Forgets everything. Tests use it to start clean. */
export function resetRemovedEchoes(): void {
  useRemovedEchoes.setState({ deleted: new Map(), count: 0 });
}

const NONE: ReadonlySet<string> = new Set();

/** The ids deleted after `since` (a place in the order of deletions) and not in `answered`. */
function deletedSince(
  deleted: ReadonlyMap<string, number>,
  since: number,
  answered: ReadonlySet<string> = NONE,
): ReadonlySet<string> {
  const ids = [...deleted].filter(([id, at]) => at > since && !answered.has(id)).map(([id]) => id);
  return ids.length === 0 ? NONE : new Set(ids);
}

export type LeftOut = {
  /** Deleted echoes that the list's own reading of the archive may still hold. */
  listed: ReadonlySet<string>;
  /** Deleted echoes that the answer to the search now on screen may still hold. */
  searched: ReadonlySet<string>;
  /** Both: what the list takes as deleted when a row of it goes. */
  either: ReadonlySet<string>;
};

/**
 * The deleted echoes that one list of the archive must leave out of what it has read. Every list
 * reads the archive for itself, and the answers land at different moments. A list that forgot a
 * deletion because another list had read the archive without the echo listed it again from its own
 * older reading, at full size, for two frames (the walk, v11: three Echoes pages were open, one above
 * the other). So each list lets go of a deletion only when its own reading no longer holds the echo:
 * a list keeps only its newest reading, so anything it reads after that was read after the deletion,
 * and an echo with that id that is in it again is really there (a backup restored after Delete all
 * data brings it). A list opened after the deletion has only ever read the archive without it.
 *
 * A search is answered once for its words and is not asked again when the archive changes, so its
 * answer leaves out every echo deleted since those words were typed.
 */
export function useLeftOut(read: readonly { id: string }[] | null, query: string): LeftOut {
  const deleted = useRemovedEchoes((state) => state.deleted);
  // Where this list began, in the order of deletions: what was deleted before, it never read.
  const [since] = useState(() => useRemovedEchoes.getState().count);

  const [reading, setReading] = useState<{ read: typeof read; answered: ReadonlySet<string> }>({
    read: null,
    answered: NONE,
  });
  if (reading.read !== read) {
    // A new reading of the archive: an echo deleted since the list began and not in it is gone, and
    // this list is done with it.
    const present = new Set(read?.map(({ id }) => id));
    const answered = new Set(reading.answered);
    if (read) for (const id of deletedSince(deleted, since)) if (!present.has(id)) answered.add(id);
    setReading({
      read,
      answered: answered.size === reading.answered.size ? reading.answered : answered,
    });
  }

  const [typed, setTyped] = useState({ query, at: since });
  if (typed.query !== query) setTyped({ query, at: useRemovedEchoes.getState().count });

  const { answered } = reading;
  return useMemo(() => {
    const listed = deletedSince(deleted, since, answered);
    const searched = deletedSince(deleted, typed.at);
    const either =
      searched === NONE ? listed : listed === NONE ? searched : new Set([...listed, ...searched]);
    return { listed, searched, either };
  }, [answered, deleted, since, typed.at]);
}
