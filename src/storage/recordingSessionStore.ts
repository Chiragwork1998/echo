import { getDatabase, isDatabaseSupported } from './database';

/**
 * Recording-session ledger.
 *
 * A row is written as soon as recording starts so an interruption — a phone
 * call, a media-services reset, or the process being killed — leaves enough
 * information behind to find and re-encrypt the partial recording on the next
 * launch. Rows hold file paths and timing metadata only, never audio content.
 */

export type RecordingSessionStatus =
  | 'recording'
  | 'pending-encryption'
  | 'encrypted'
  | 'discarded'
  | 'interrupted-missing';

export type RecordingSession = {
  id: string;
  entryId: string | null;
  startedAt: string;
  updatedAt: string;
  path: string | null;
  encryptedPath: string | null;
  durationSeconds: number;
  promptId: string | null;
  promptText: string | null;
  status: RecordingSessionStatus;
};

export type RecordingSessionPatch = Partial<
  Pick<RecordingSession, 'path' | 'encryptedPath' | 'durationSeconds' | 'status' | 'entryId'>
>;

type Row = {
  id: string;
  entry_id: string | null;
  started_at: string;
  updated_at: string;
  path: string | null;
  encrypted_path: string | null;
  duration_seconds: number;
  prompt_id: string | null;
  prompt_text: string | null;
  status: string;
};

const RECOVERABLE: readonly RecordingSessionStatus[] = ['recording', 'pending-encryption'];

function toSession(row: Row): RecordingSession {
  return {
    id: row.id,
    entryId: row.entry_id,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    path: row.path,
    encryptedPath: row.encrypted_path,
    durationSeconds: row.duration_seconds,
    promptId: row.prompt_id,
    promptText: row.prompt_text,
    status: row.status as RecordingSessionStatus,
  };
}

const memorySessions = new Map<string, RecordingSession>();

export async function beginRecordingSession(
  id: string,
  path: string | null,
  prompt?: { promptId: string; promptText: string },
): Promise<void> {
  const now = new Date().toISOString();
  if (!isDatabaseSupported()) {
    memorySessions.set(id, {
      id,
      entryId: null,
      startedAt: now,
      updatedAt: now,
      path,
      encryptedPath: null,
      durationSeconds: 0,
      promptId: prompt?.promptId ?? null,
      promptText: prompt?.promptText ?? null,
      status: 'recording',
    });
    return;
  }
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO recording_sessions (id, started_at, updated_at, path, status, prompt_id, prompt_text)
     VALUES (?, ?, ?, ?, 'recording', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       updated_at = excluded.updated_at,
       path = excluded.path,
       prompt_id = COALESCE(excluded.prompt_id, recording_sessions.prompt_id),
       prompt_text = COALESCE(excluded.prompt_text, recording_sessions.prompt_text),
       status = 'recording'`,
    id,
    now,
    now,
    path,
    prompt?.promptId ?? null,
    prompt?.promptText ?? null,
  );
}

export async function updateRecordingSession(
  id: string,
  patch: RecordingSessionPatch,
): Promise<void> {
  const now = new Date().toISOString();
  if (!isDatabaseSupported()) {
    const existing = memorySessions.get(id);
    if (existing) {
      memorySessions.set(id, { ...existing, ...patch, updatedAt: now });
    }
    return;
  }
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE recording_sessions SET
       updated_at = ?,
       path = COALESCE(?, path),
       encrypted_path = COALESCE(?, encrypted_path),
       duration_seconds = COALESCE(?, duration_seconds),
       status = COALESCE(?, status),
       entry_id = COALESCE(?, entry_id)
     WHERE id = ?`,
    now,
    patch.path ?? null,
    patch.encryptedPath ?? null,
    patch.durationSeconds ?? null,
    patch.status ?? null,
    patch.entryId ?? null,
    id,
  );
}

/** Sessions that may still hold a recoverable recording on disk. */
export async function listRecoverableRecordingSessions(): Promise<RecordingSession[]> {
  if (!isDatabaseSupported()) {
    return [...memorySessions.values()].filter((session) => RECOVERABLE.includes(session.status));
  }
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM recording_sessions
      WHERE status IN ('recording', 'pending-encryption')
      ORDER BY started_at DESC`,
  );
  return rows.map(toSession);
}

/** Test/reset hook for the memory-backed fallback. */
export function clearMemoryRecordingSessions(): void {
  memorySessions.clear();
}
