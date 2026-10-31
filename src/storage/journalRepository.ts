import type { MoodSelection } from '@/state/onboardingSelections';
import type { JournalEntry, JournalMode, ReflectionSummary, SyncState } from '@/state/journal';

import { getDatabase, isDatabaseSupported } from './database';
import { getWorkspaceScope, type WorkspaceScope } from './workspace';
import { createBrowserJournalRepository, isBrowserClient } from './browserJournalRepository';
import {
  CONTENT_ALGORITHM,
  contentCipher,
  DecryptionFailedError,
  type EncryptedPayload,
} from './encryption';

/**
 * Journal persistence (`JournalEntry` in
 * `product-handoff/specs/DATA_MODEL.md`).
 *
 * Bodies, moods and reflections are encrypted with AES-256-GCM before they
 * reach SQLite; only non-sensitive metadata (prompt copy, timestamps, duration,
 * sync state) is stored in the clear. A row whose ciphertext cannot be
 * authenticated is preserved but marked `contentState: 'unavailable'` so the
 * user sees a recoverable state instead of silent data loss.
 */

export type JournalStorageKind = 'sqlite' | 'browser' | 'memory';

export interface JournalRepository {
  readonly kind: JournalStorageKind;
  /** Whether entries and drafts survive an app restart on this platform. */
  readonly persistent: boolean;
  loadEntries(): Promise<JournalEntry[]>;
  loadDraft(): Promise<JournalEntry | null>;
  saveDraft(draft: JournalEntry | null): Promise<void>;
  saveEntry(entry: JournalEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;
}

type ContentState = 'available' | 'unavailable';

type SecretContent = {
  body: string | null;
  moodBefore: MoodSelection | null;
  moodAfter?: MoodSelection | null;
  takeaway?: string | null;
  favorite?: boolean;
};

type EntryRow = {
  id: string;
  entry_id?: string;
  created_at: string;
  updated_at: string;
  prompt_id: string;
  prompt_text: string;
  mode: string;
  duration_seconds: number;
  sync_state: string;
  revision: number;
  deleted_at: string | null;
  content_state: string;
  cipher: string;
  nonce: string;
  algorithm: string;
  content_hash: string;
  audio_path: string | null;
  reflection_status: string | null;
  reflection_cipher: string | null;
  reflection_nonce: string | null;
  reflection_algorithm: string | null;
  reflection_hash: string | null;
};

const DRAFT_ROW_ID = 1;

function payloadFrom(cipher: string, nonce: string, hash: string): EncryptedPayload {
  return {
    algorithm: CONTENT_ALGORITHM,
    ciphertextBase64: cipher,
    nonceBase64: nonce,
    contentHash: hash,
  };
}

function asMode(value: string): JournalMode {
  return value === 'voice' ? 'voice' : 'text';
}

function asSyncState(value: string): SyncState {
  return value === 'pending' || value === 'synced' || value === 'error' ? value : 'local';
}

async function encryptContent(entry: SecretContent): Promise<EncryptedPayload> {
  const secret: SecretContent = { body: entry.body, moodBefore: entry.moodBefore, moodAfter: entry.moodAfter, takeaway: entry.takeaway, favorite: entry.favorite };
  return contentCipher.encrypt(JSON.stringify(secret));
}

async function decryptContent(payload: EncryptedPayload): Promise<{
  content: SecretContent;
  contentState: ContentState;
}> {
  try {
    const parsed = JSON.parse(await contentCipher.decrypt(payload)) as Partial<SecretContent>;
    return {
      content: { body: parsed.body ?? null, moodBefore: parsed.moodBefore ?? null, moodAfter: parsed.moodAfter ?? null, takeaway: parsed.takeaway ?? null, favorite: parsed.favorite === true },
      contentState: 'available',
    };
  } catch (error) {
    if (error instanceof DecryptionFailedError) {
      return { content: { body: null, moodBefore: null }, contentState: 'unavailable' };
    }
    // Key material unavailable: the row stays intact and can be read once the
    // device key is reachable again.
    return { content: { body: null, moodBefore: null }, contentState: 'unavailable' };
  }
}

async function reflectionFrom(row: EntryRow): Promise<ReflectionSummary | null> {
  if (!row.reflection_status) {
    return null;
  }
  if (row.reflection_status !== 'complete') {
    return {
      status: row.reflection_status as 'pending' | 'unavailable' | 'offline' | 'error',
      text: null,
    };
  }
  if (!row.reflection_cipher || !row.reflection_nonce || !row.reflection_hash) {
    return { status: 'unavailable', text: null };
  }
  try {
    const text = await contentCipher.decrypt(
      payloadFrom(row.reflection_cipher, row.reflection_nonce, row.reflection_hash),
    );
    return { status: 'complete', text };
  } catch {
    return { status: 'error', text: null };
  }
}

async function toEntry(row: EntryRow): Promise<JournalEntry> {
  const { content, contentState } = await decryptContent(
    payloadFrom(row.cipher, row.nonce, row.content_hash),
  );
  return {
    id: row.entry_id ?? row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    promptId: row.prompt_id,
    promptTextSnapshot: row.prompt_text,
    mode: asMode(row.mode),
    body: content.body,
    audioPath: row.audio_path,
    durationSeconds: row.duration_seconds,
    moodBefore: content.moodBefore,
    moodAfter: content.moodAfter,
    takeaway: content.takeaway,
    favorite: content.favorite,
    reflection: await reflectionFrom(row),
    syncState: asSyncState(row.sync_state),
    deletedAt: row.deleted_at,
    contentState,
  };
}

function createSqliteJournalRepository(scope: WorkspaceScope = getWorkspaceScope()): JournalRepository {
  let draftQueue: Promise<void> = Promise.resolve();

  return {
    kind: 'sqlite',
    persistent: true,
    async loadEntries() {
      const db = await getDatabase(scope);
      const rows = await db.getAllAsync<EntryRow>(
        'SELECT * FROM journal_entries ORDER BY created_at DESC',
      );
      return Promise.all(rows.map((row) => toEntry(row)));
    },
    async loadDraft() {
      const db = await getDatabase(scope);
      const row = await db.getFirstAsync<EntryRow>(
        'SELECT * FROM journal_drafts WHERE id = ?',
        DRAFT_ROW_ID,
      );
      return row ? toEntry(row) : null;
    },
    saveDraft(draft) {
      const run = async () => {
        const db = await getDatabase(scope);
        if (!draft) {
          await db.runAsync('DELETE FROM journal_drafts WHERE id = ?', DRAFT_ROW_ID);
          return;
        }
        if (draft.contentState !== 'available') throw new DecryptionFailedError();
        const payload = await encryptContent(draft);
        await db.runAsync(
          `INSERT INTO journal_drafts
             (id, entry_id, created_at, updated_at, prompt_id, prompt_text, mode,
              duration_seconds, content_state, cipher, nonce, algorithm, content_hash, audio_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             entry_id = excluded.entry_id,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             prompt_id = excluded.prompt_id,
             prompt_text = excluded.prompt_text,
             mode = excluded.mode,
             duration_seconds = excluded.duration_seconds,
             content_state = excluded.content_state,
             cipher = excluded.cipher,
             nonce = excluded.nonce,
             algorithm = excluded.algorithm,
             content_hash = excluded.content_hash,
             audio_path = excluded.audio_path`,
          DRAFT_ROW_ID,
          draft.id,
          draft.createdAt,
          draft.updatedAt,
          draft.promptId,
          draft.promptTextSnapshot,
          draft.mode,
          draft.durationSeconds,
          'available',
          payload.ciphertextBase64,
          payload.nonceBase64,
          payload.algorithm,
          payload.contentHash,
          draft.audioPath,
        );
      };
      // Serialise draft writes: the editor autosaves far more often than it stops.
      const write = draftQueue.then(run, run);
      // Keep the chain healthy so one failed write cannot reject every later one.
      draftQueue = write.catch(() => undefined);
      return write;
    },
    async saveEntry(entry) {
      if (entry.contentState !== 'available') throw new DecryptionFailedError();
      const db = await getDatabase(scope);
      const payload = await encryptContent(entry);
      const reflection = entry.reflection;
      const reflectionPayload =
        reflection?.status === 'complete'
          ? await contentCipher.encrypt(reflection.text)
          : null;
      await db.runAsync(
        `INSERT INTO journal_entries
           (id, created_at, updated_at, prompt_id, prompt_text, mode, duration_seconds,
            sync_state, revision, deleted_at, content_state, cipher, nonce, algorithm,
            content_hash, audio_path, reflection_status, reflection_cipher, reflection_nonce,
            reflection_algorithm, reflection_hash, reflection_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           updated_at = excluded.updated_at,
           prompt_id = excluded.prompt_id,
           prompt_text = excluded.prompt_text,
           mode = excluded.mode,
           duration_seconds = excluded.duration_seconds,
           sync_state = excluded.sync_state,
           revision = journal_entries.revision + 1,
           deleted_at = excluded.deleted_at,
           content_state = excluded.content_state,
           cipher = excluded.cipher,
           nonce = excluded.nonce,
           algorithm = excluded.algorithm,
           content_hash = excluded.content_hash,
           audio_path = excluded.audio_path,
           reflection_status = excluded.reflection_status,
           reflection_cipher = excluded.reflection_cipher,
           reflection_nonce = excluded.reflection_nonce,
           reflection_algorithm = excluded.reflection_algorithm,
           reflection_hash = excluded.reflection_hash,
           reflection_updated_at = excluded.reflection_updated_at`,
        entry.id,
        entry.createdAt,
        entry.updatedAt,
        entry.promptId,
        entry.promptTextSnapshot,
        entry.mode,
        entry.durationSeconds,
        entry.syncState,
        1,
        entry.deletedAt,
        'available',
        payload.ciphertextBase64,
        payload.nonceBase64,
        payload.algorithm,
        payload.contentHash,
        entry.audioPath,
        reflection?.status ?? null,
        reflectionPayload?.ciphertextBase64 ?? null,
        reflectionPayload?.nonceBase64 ?? null,
        reflectionPayload?.algorithm ?? null,
        reflectionPayload?.contentHash ?? null,
        reflectionPayload ? new Date().toISOString() : null,
      );
    },
    async deleteEntry(id) {
      const db = await getDatabase(scope);
      await db.runAsync('DELETE FROM journal_entries WHERE id = ?', id);
    },
  };
}

/**
 * Session-memory repository for server rendering and tests. Real browser
 * clients use the encrypted IndexedDB repository. No plaintext is persisted.
 */
function createMemoryJournalRepository(): JournalRepository {
  let entries: JournalEntry[] = [];
  let draft: JournalEntry | null = null;
  return {
    kind: 'memory',
    persistent: false,
    async loadEntries() {
      return [...entries];
    },
    async loadDraft() {
      return draft;
    },
    async saveDraft(next) {
      draft = next;
    },
    async saveEntry(entry) {
      entries = [entry, ...entries.filter((item) => item.id !== entry.id)];
      if (draft?.id === entry.id) {
        draft = null;
      }
    },
    async deleteEntry(id) {
      entries = entries.filter((item) => item.id !== id);
    },
  };
}

export function createDefaultJournalRepository(scope: WorkspaceScope = getWorkspaceScope()): JournalRepository {
  if (isDatabaseSupported()) return createSqliteJournalRepository(scope);
  // Select by runtime, not capability: blocked storage must produce a visible
  // save error instead of silently falling back to a disposable journal.
  return isBrowserClient() ? createBrowserJournalRepository(scope) : createMemoryJournalRepository();
}

export { createMemoryJournalRepository, createSqliteJournalRepository };
