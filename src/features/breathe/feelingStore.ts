import { getRuntime } from '@/storage/runtime';

const ROW = 'breathe';
const OBJECT_ID = 'v1';

export type Feeling = 'calmer' | 'same' | 'unsettled';

/** One practice's counts on one day. */
export type Tally = { practices: number; calmer: number; same: number; unsettled: number };

/**
 * How each practice went, as counts only: on a local day, for a practice, how many were finished and
 * how many times the person said they felt calmer, about the same, or still unsettled after. Nothing
 * a person said or wrote, and no times of day.
 */
export type FeelingCounts = { v: 1; days: Record<string, Record<string, Tally>> };

const empty = (): FeelingCounts => ({ v: 1, days: {} });
const zero = (): Tally => ({ practices: 0, calmer: 0, same: 0, unsettled: 0 });

export type StoreResult<T> = { ok: true; value: T } | { ok: false };

/**
 * Sealed as the journal is: one AES-256-GCM object in the database, bound to its kind and id, never
 * plaintext, and gone with the key when everything is deleted. Nothing here throws or logs.
 */
export async function loadFeelings(): Promise<StoreResult<FeelingCounts>> {
  try {
    const rt = await getRuntime();
    const row = await rt.db.first<{ sealed: Uint8Array }>(
      'SELECT sealed FROM sealed_kv WHERE key = ?',
      [ROW],
    );
    if (!row) return { ok: true, value: empty() };
    const saved = await rt.vault.openJson<FeelingCounts>('breathe', OBJECT_ID, row.sealed);
    const valid = saved?.v === 1 && typeof saved.days === 'object' && saved.days !== null;
    return { ok: true, value: valid ? saved : empty() };
  } catch {
    return { ok: false };
  }
}

async function save(counts: FeelingCounts): Promise<StoreResult<null>> {
  try {
    const rt = await getRuntime();
    const sealed = await rt.vault.sealJson('breathe', OBJECT_ID, counts);
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

/** Adds to one practice's counts for a day. Counts can only grow. */
export function tallied(
  counts: FeelingCounts,
  day: string,
  practiceId: string,
  change: { practice?: boolean; feeling?: Feeling },
): FeelingCounts {
  const today = { ...counts.days[day] };
  const tally = { ...zero(), ...today[practiceId] };
  if (change.practice) tally.practices += 1;
  if (change.feeling) tally[change.feeling] += 1;
  today[practiceId] = tally;
  return { v: 1, days: { ...counts.days, [day]: today } };
}

/** Records a finished practice, and how the person felt after it if they said. */
export async function recordPractice(
  day: string,
  practiceId: string,
  change: { practice?: boolean; feeling?: Feeling },
): Promise<StoreResult<null>> {
  const loaded = await loadFeelings();
  if (!loaded.ok) return loaded;
  return save(tallied(loaded.value, day, practiceId, change));
}
