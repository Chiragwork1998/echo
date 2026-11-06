import type { LiveEvent } from './liveTranscription';

// What the live model has said so far, assembled in the order it was spoken. Pure: it only reads the
// events it is given. Completions can arrive out of order across turns, so every piece of text is
// kept against the item it belongs to, and the turns are put back in the order they were committed.

type Item = {
  /** Which commit this turn was: the nth `committed` event. Absent while the turn is still open. */
  commit: number | null;
  /** When the turn was first heard of, which orders turns that are not committed yet. */
  seen: number;
  partial: string;
  final: string | null;
  failed: boolean;
};

export type LiveTranscript = {
  apply(event: LiveEvent): void;
  /** Everything so far, for showing: finished turns, then the words still arriving. */
  text(): string;
  /** A turn failed to become words, or the server reported an error: this cannot be trusted to be whole. */
  failed(): boolean;
  /** Every committed turn is finished, and nothing is left open. */
  settled(): boolean;
  /** Any words at all, finished or not. */
  hasWords(): boolean;
  /** Words have arrived that no commit has ended yet. */
  hasOpenWords(): boolean;
  /** How many commits the model has acknowledged. A commit sent and not yet acknowledged is not here. */
  committed(): number;
};

export function createLiveTranscript(): LiveTranscript {
  const items = new Map<string, Item>();
  let seen = 0;
  let commits = 0;
  let errored = false;

  const itemFor = (itemId: string): Item => {
    let item = items.get(itemId);
    if (!item) {
      item = { commit: null, seen: seen++, partial: '', final: null, failed: false };
      items.set(itemId, item);
    }
    return item;
  };
  const ordered = () =>
    [...items.values()].sort(
      (a, b) => (a.commit ?? Infinity) - (b.commit ?? Infinity) || a.seen - b.seen,
    );
  const wordsOf = (item: Item) => (item.final ?? item.partial).trim();

  return {
    apply(event) {
      if (event.kind === 'error') {
        // A refused append or commit, or anything else the server objects to. It names no turn, so
        // it cannot be said which words are missing, only that some may be.
        errored = true;
        return;
      }
      const item = itemFor(event.itemId);
      switch (event.kind) {
        case 'delta':
          // A turn that has its final words is not changed by a late delta.
          if (item.final === null) item.partial += event.text;
          break;
        case 'committed':
          if (item.commit === null) item.commit = commits++;
          break;
        case 'completed':
          item.final = event.text;
          break;
        case 'item_failed':
          item.failed = true;
          break;
      }
    },
    text: () =>
      ordered()
        .map(wordsOf)
        .filter((words) => words.length > 0)
        .join(' '),
    failed: () => errored || [...items.values()].some((item) => item.failed),
    settled: () =>
      [...items.values()].every((item) =>
        item.commit === null ? wordsOf(item).length === 0 : item.final !== null || item.failed,
      ),
    hasWords: () => [...items.values()].some((item) => wordsOf(item).length > 0),
    hasOpenWords: () =>
      [...items.values()].some((item) => item.commit === null && wordsOf(item).length > 0),
    committed: () => commits,
  };
}
