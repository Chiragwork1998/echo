import { create } from 'zustand';

import { sanitiseName } from './name';
import { loadOwner, saveOwner, type OwnerRecord } from './ownerStore';

// Whose book this is, as the app holds it while it runs. It is read from its sealed record the first
// time the daily book or You needs it, and every change is sealed again at once. The name is never
// passed anywhere else: not to a request, a notification, an export, a log or a route.

export type BookOwner = {
  /** True once the sealed record has been read, or could not be. */
  loaded: boolean;
  name: string | null;
  /** ECHO has asked whose book this is. It asks once. */
  asked: boolean;
  /** Openings of the named book so far, counted only up to the few that are made more of. */
  namedOpens: number;
};

const initial: BookOwner = { loaded: false, name: null, asked: false, namedOpens: 0 };

export const useBookOwner = create<BookOwner>(() => initial);

/** The openings that are made more of: after these, the page head arrives plainly (D-008). */
export const NAMED_OPENS_NOTICED = 3;

let loading: Promise<void> | null = null;

/** Reads the sealed record once. A record that cannot be read never makes the book ask. */
export function loadBookOwner(): Promise<void> {
  loading ??= loadOwner().then((read) => {
    useBookOwner.setState(
      read.ok
        ? {
            loaded: true,
            name: read.value.name,
            asked: read.value.asked,
            namedOpens: read.value.namedOpens,
          }
        : { loaded: true, name: null, asked: true, namedOpens: 0 },
    );
  });
  return loading;
}

const record = (): OwnerRecord => {
  const { name, asked, namedOpens } = useBookOwner.getState();
  return { v: 1, name, asked, namedOpens };
};

/** Changes what is held at once and seals it. Saving is never waited on by anything drawn. */
async function change(patch: Partial<Omit<BookOwner, 'loaded'>>): Promise<boolean> {
  await loadBookOwner();
  useBookOwner.setState(patch);
  const saved = await saveOwner(record());
  return saved.ok;
}

/** The question has appeared: it is never asked again, even if the app is closed now. */
export const markAsked = () => change({ asked: true });

/** Writes a name on the book, cleaned. Resolves false if there is no name in what was written. */
export function writeName(raw: string): Promise<boolean> {
  const name = sanitiseName(raw);
  if (!name) return Promise.resolve(false);
  return change({ name, asked: true, namedOpens: 0 });
}

/** Takes the name off the book. The book does not ask again. */
export const removeName = () => change({ name: null, asked: true, namedOpens: 0 });

/** Counts an opening of the named book, up to the few that are made more of. */
export async function countNamedOpen(): Promise<void> {
  await loadBookOwner();
  const { name, namedOpens } = useBookOwner.getState();
  if (!name || namedOpens >= NAMED_OPENS_NOTICED) return;
  await change({ namedOpens: namedOpens + 1 });
}

/** Forgets everything held, as Delete all data does. The sealed record goes with the key. */
export function resetBookOwner(): void {
  loading = null;
  useBookOwner.setState(initial);
}
