import type { PatternCard } from '@/services/patterns';
import { getRuntime } from '@/storage/runtime';

const ROW = 'patterns';
const OBJECT_ID = 'v1';

/** The last reading, kept so that opening Patterns never needs the server. */
export type SavedReading = {
  /** When it was read, in milliseconds. */
  readAt: number;
  /** How many entries were sent. */
  entriesRead: number;
  cards: PatternCard[];
  /** The model that wrote the cards, when the server named it. A report of a card says it. */
  model?: string;
};

export type StoreResult<T> = { ok: true; value: T } | { ok: false };

/**
 * The cards quote the person's own entries, so they are sealed exactly as entries are: one
 * AES-256-GCM object in the database, bound to its kind and id, never plaintext. Delete-all removes
 * the sealed records with the key. Nothing here throws and nothing is logged.
 */
export async function loadReading(): Promise<StoreResult<SavedReading | null>> {
  try {
    const rt = await getRuntime();
    const row = await rt.db.first<{ sealed: Uint8Array }>(
      'SELECT sealed FROM sealed_kv WHERE key = ?',
      [ROW],
    );
    if (!row) return { ok: true, value: null };
    const saved = await rt.vault.openJson<SavedReading>('patterns', OBJECT_ID, row.sealed);
    const valid =
      typeof saved?.readAt === 'number' && Array.isArray(saved.cards) && saved.cards.length > 0;
    return { ok: true, value: valid ? saved : null };
  } catch {
    return { ok: false };
  }
}

export async function saveReading(reading: SavedReading): Promise<StoreResult<null>> {
  try {
    const rt = await getRuntime();
    const sealed = await rt.vault.sealJson('patterns', OBJECT_ID, reading);
    await rt.serial(() =>
      rt.db.run(
        `INSERT INTO sealed_kv (key, sealed, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET sealed = excluded.sealed, updated_at = excluded.updated_at`,
        [ROW, sealed, rt.now()],
      ),
    );
    return { ok: true, value: null };
  } catch {
    return { ok: false };
  }
}

export async function clearReading(): Promise<StoreResult<null>> {
  try {
    const rt = await getRuntime();
    await rt.serial(() => rt.db.run('DELETE FROM sealed_kv WHERE key = ?', [ROW]));
    return { ok: true, value: null };
  } catch {
    return { ok: false };
  }
}
