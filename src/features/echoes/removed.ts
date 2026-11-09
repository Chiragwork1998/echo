import { create } from 'zustand';

/**
 * Echoes that have been deleted, remembered from the moment the deletion is known. The archive is
 * read again after a deletion, and the answer takes a moment; until it comes the list would show the
 * echo that is gone, then jump when it did (the walk, v10). Only ids: nothing the person wrote.
 */
export const useRemovedEchoes = create<{ ids: ReadonlySet<string> }>(() => ({ ids: new Set() }));

export function hideEcho(id: string): void {
  useRemovedEchoes.setState((state) =>
    state.ids.has(id) ? state : { ids: new Set(state.ids).add(id) },
  );
}

/**
 * The archive has been read again, and these are the echoes in it. One that was deleted and is not
 * among them is gone for good, and is forgotten: an echo with the same id that comes back (a restored
 * backup) must not be hidden by it.
 */
export function confirmGone(present: ReadonlySet<string>): void {
  useRemovedEchoes.setState((state) => {
    const kept = [...state.ids].filter((id) => present.has(id));
    return kept.length === state.ids.size ? state : { ids: new Set(kept) };
  });
}

/** Forgets everything. Tests use it to start clean. */
export function resetRemovedEchoes(): void {
  useRemovedEchoes.setState({ ids: new Set() });
}
