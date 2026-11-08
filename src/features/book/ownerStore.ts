import { getRuntime } from '@/storage/runtime';

import { sanitiseName } from './name';

const ROW = 'book';
const OBJECT_ID = 'v1';

/**
 * Whose book this is. `asked` is true once ECHO has asked, so it asks once and never again;
 * `namedOpens` counts the openings since the name was written, so the page head's first few
 * arrivals can be made more of than the rest.
 */
export type OwnerRecord = { v: 1; name: string | null; asked: boolean; namedOpens: number };

export type StoreResult<T> = { ok: true; value: T } | { ok: false };

const nobody = (): OwnerRecord => ({ v: 1, name: null, asked: false, namedOpens: 0 });

/** What a record holds, made safe: whatever was read, only these fields, in their shapes. */
function cleaned(saved: unknown): OwnerRecord {
  if (typeof saved !== 'object' || saved === null) return nobody();
  const { name, asked, namedOpens } = saved as Partial<Record<keyof OwnerRecord, unknown>>;
  const opens = typeof namedOpens === 'number' && Number.isFinite(namedOpens) ? namedOpens : 0;
  return {
    v: 1,
    name: sanitiseName(typeof name === 'string' ? name : null),
    // Anything but a plain false has been asked: a record that cannot say is never a reason to ask.
    asked: asked !== false,
    namedOpens: Math.max(0, Math.floor(opens)),
  };
}

/**
 * The name is sealed as entries are: one AES-256-GCM object in the database, bound to its kind and
 * id, never plaintext, never in preferences, and gone with the key when everything is deleted. It
 * is never sent anywhere. Nothing here throws, and nothing is logged.
 */
export async function loadOwner(): Promise<StoreResult<OwnerRecord>> {
  try {
    const rt = await getRuntime();
    const row = await rt.db.first<{ sealed: Uint8Array }>(
      'SELECT sealed FROM sealed_kv WHERE key = ?',
      [ROW],
    );
    if (!row) return { ok: true, value: nobody() };
    return { ok: true, value: cleaned(await rt.vault.openJson('book', OBJECT_ID, row.sealed)) };
  } catch {
    return { ok: false };
  }
}

export async function saveOwner(record: OwnerRecord): Promise<StoreResult<null>> {
  try {
    const rt = await getRuntime();
    const sealed = await rt.vault.sealJson('book', OBJECT_ID, cleaned(record));
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
