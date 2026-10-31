import type { JournalEntry } from '@/state/journal';
import type { JournalRepository } from './journalRepository';
import { getWorkspaceScope, type WorkspaceScope } from './workspace';

/**
 * Browser-local storage. Complete journal and preference payloads are encrypted
 * before IndexedDB sees them. The AES key is nonextractable and is structured-
 * cloned into IndexedDB, so returning to the same origin restores the journal.
 * This is local browser storage, not a cloud backup or a device-keychain lock.
 */
const DATABASE_VERSION = 1;
const KEY_ID = 'content-key-v1';
const ENTRY_PREFIX = 'entry:';

type EncryptedRecord = {
  key: string;
  version: 1;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  // Date only, to keep a damaged entry visible without exposing its contents.
  createdAt?: string;
};

export class BrowserStorageUnavailableError extends Error {
  constructor() {
    super('Private browser storage is unavailable. Use a secure browser connection and allow site storage.');
    this.name = 'BrowserStorageUnavailableError';
  }
}

class BrowserContentUnavailableError extends Error {
  constructor() {
    super('Stored content could not be authenticated.');
    this.name = 'BrowserContentUnavailableError';
  }
}

export function isBrowserClient(): boolean {
  return typeof window !== 'undefined';
}

function createWorkspaceStore(databaseName: string) {
let database: Promise<IDBDatabase> | null = null;
let contentKey: Promise<CryptoKey> | null = null;

function requireBrowserStorage(): void {
  if (!isBrowserClient() || !globalThis.indexedDB || !globalThis.crypto?.subtle) {
    throw new BrowserStorageUnavailableError();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  requireBrowserStorage();
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    let rejected = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('keys');
      db.createObjectStore('records', { keyPath: 'key' });
    };
    request.onblocked = request.onerror = () => {
      rejected = true;
      reject(new BrowserStorageUnavailableError());
    };
    request.onsuccess = () => {
      const db = request.result;
      if (rejected) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        database = null;
        contentKey = null;
      };
      resolve(db);
    };
  }).catch((error: unknown) => {
    database = null;
    throw error;
  });
  return database;
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(new BrowserStorageUnavailableError());
  });
}

function requested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new BrowserStorageUnavailableError());
  });
}

async function acquireKey(): Promise<CryptoKey> {
  const db = await openDatabase();
  const candidate = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  // The read/check/insert share one transaction, so two first-launch tabs never
  // overwrite one another's key. No crypto awaits occur inside the transaction.
  const transaction = db.transaction(['keys', 'records'], 'readwrite', { durability: 'strict' });
  const done = finished(transaction);
  const keys = transaction.objectStore('keys');
  const request = keys.get(KEY_ID);
  let key: CryptoKey | null = null;
  let missingKey = false;
  request.onsuccess = () => {
    if (request.result) {
      key = request.result as CryptoKey;
      return;
    }
    const count = transaction.objectStore('records').count();
    count.onsuccess = () => {
      if (count.result > 0) {
        // Never replace a missing key while encrypted records still exist.
        missingKey = true;
        transaction.abort();
        return;
      }
      key = candidate;
      keys.put(candidate, KEY_ID);
    };
  };
  try {
    await done;
  } catch {
    throw new BrowserStorageUnavailableError();
  }
  if (missingKey || !key) throw new BrowserStorageUnavailableError();
  return key;
}

function getContentKey(): Promise<CryptoKey> {
  contentKey ??= acquireKey().catch((error: unknown) => {
    contentKey = null;
    throw error;
  });
  return contentKey;
}

function associatedData(key: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`ECHO|1|${key}`);
}

async function encryptRecord(key: string, value: unknown, createdAt?: string): Promise<EncryptedRecord> {
  const encryptionKey = await getContentKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: associatedData(key), tagLength: 128 },
    encryptionKey,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { key, version: 1, iv: iv.buffer, ciphertext, createdAt };
}

async function decryptRecord<T>(record: EncryptedRecord): Promise<T> {
  const encryptionKey = await getContentKey();
  try {
    if (record.version !== 1) throw new BrowserContentUnavailableError();
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.iv, additionalData: associatedData(record.key), tagLength: 128 },
      encryptionKey,
      record.ciphertext,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    throw new BrowserContentUnavailableError();
  }
}

async function readRecord(key: string): Promise<EncryptedRecord | undefined> {
  const db = await openDatabase();
  return requested<EncryptedRecord | undefined>(db.transaction('records', 'readonly').objectStore('records').get(key));
}

async function loadBrowserValue<T>(key: 'onboarding'): Promise<T | null> {
  const record = await readRecord(key);
  return record ? decryptRecord<T>(record) : null;
}

async function saveBrowserValue(key: 'onboarding', value: unknown): Promise<void> {
  const existing = await readRecord(key);
  if (existing) await decryptRecord(existing);
  await putRecord(await encryptRecord(key, value));
}

async function deleteBrowserValue(key: 'onboarding'): Promise<void> {
  await removeRecord(key);
}

/** First signed-in account owns this local workspace. Never reassign it. */
async function bindBrowserWorkspace(userId: string): Promise<boolean> {
  const db = await openDatabase();
  const transaction = db.transaction('keys', 'readwrite', { durability: 'strict' });
  const done = finished(transaction);
  const keys = transaction.objectStore('keys');
  const request = keys.get('workspace-owner-v1');
  let matches = false;
  request.onsuccess = () => {
    if (request.result === undefined) {
      keys.put(userId, 'workspace-owner-v1');
      matches = true;
    } else matches = request.result === userId;
  };
  await done;
  return matches;
}

async function putRecord(record: EncryptedRecord): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('records', 'readwrite', { durability: 'strict' });
  const done = finished(transaction);
  transaction.objectStore('records').put(record);
  await done;
}

async function removeRecord(key: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('records', 'readwrite', { durability: 'strict' });
  const done = finished(transaction);
  transaction.objectStore('records').delete(key);
  await done;
}

function unavailableEntry(record: EncryptedRecord): JournalEntry {
  const date = record.createdAt ?? new Date(0).toISOString();
  return {
    id: record.key.slice(ENTRY_PREFIX.length),
    createdAt: date,
    updatedAt: date,
    promptId: 'unavailable',
    promptTextSnapshot: 'This echo is temporarily unavailable.',
    mode: 'text',
    body: null,
    audioPath: null,
    durationSeconds: 0,
    moodBefore: null,
    reflection: null,
    syncState: 'local',
    deletedAt: null,
    contentState: 'unavailable',
  };
}

async function readEntry(record: EncryptedRecord): Promise<JournalEntry> {
  const entry = await decryptRecord<JournalEntry>(record);
  if (!entry || typeof entry.id !== 'string') throw new BrowserContentUnavailableError();
  const expectedId = record.key === 'draft' ? entry.id : record.key.slice(ENTRY_PREFIX.length);
  if (entry.id !== expectedId ||
    typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt)) ||
    typeof entry.updatedAt !== 'string' || typeof entry.promptTextSnapshot !== 'string' ||
    typeof entry.durationSeconds !== 'number' || entry.contentState !== 'available' ||
    (entry.mode !== 'text' && entry.mode !== 'voice') ||
    (entry.body !== null && typeof entry.body !== 'string')) {
    throw new BrowserContentUnavailableError();
  }
  return entry;
}

function createBrowserJournalRepository(): JournalRepository {
  let draftQueue = Promise.resolve();
  return {
    kind: 'browser',
    persistent: true,
    async loadEntries() {
      const db = await openDatabase();
      const records = await requested<EncryptedRecord[]>(db.transaction('records', 'readonly')
        .objectStore('records').getAll(IDBKeyRange.bound(ENTRY_PREFIX, `${ENTRY_PREFIX}\uffff`)));
      const entries = await Promise.all(records.map(async (record) => {
        try {
          return await readEntry(record);
        } catch (error) {
          if (error instanceof BrowserContentUnavailableError) return unavailableEntry(record);
          throw error;
        }
      }));
      return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async loadDraft() {
      await draftQueue;
      const record = await readRecord('draft');
      return record ? readEntry(record) : null;
    },
    saveDraft(draft) {
      const run = async () => {
        if (draft) {
          if (draft.contentState !== 'available') throw new BrowserContentUnavailableError();
          const existing = await readRecord('draft');
          if (existing) await readEntry(existing);
          await putRecord(await encryptRecord('draft', draft, draft.createdAt));
        } else await removeRecord('draft');
      };
      const write = draftQueue.then(run, run);
      draftQueue = write.catch(() => undefined);
      return write;
    },
    async saveEntry(entry) {
      if (entry.contentState !== 'available') throw new BrowserContentUnavailableError();
      const existing = await readRecord(`${ENTRY_PREFIX}${entry.id}`);
      // A stale in-memory copy cannot silently replace a row that has since
      // failed authentication. Preserve it for recovery or explicit deletion.
      if (existing) await readEntry(existing);
      await putRecord(await encryptRecord(`${ENTRY_PREFIX}${entry.id}`, entry, entry.createdAt));
    },
    async deleteEntry(id) {
      await removeRecord(`${ENTRY_PREFIX}${id}`);
    },
  };
}

return { createBrowserJournalRepository, loadBrowserValue, saveBrowserValue, deleteBrowserValue, bindBrowserWorkspace };
}
const workspaces = { account: createWorkspaceStore('echo-private-journal'), guest: createWorkspaceStore('echo-private-journal-guest') };
export function createBrowserJournalRepository(scope: WorkspaceScope = getWorkspaceScope()): JournalRepository { return workspaces[scope].createBrowserJournalRepository(); }
export function loadBrowserValue<T>(key: 'onboarding', scope: WorkspaceScope = getWorkspaceScope()): Promise<T | null> { return workspaces[scope].loadBrowserValue<T>(key); }
export function saveBrowserValue(key: 'onboarding', value: unknown, scope: WorkspaceScope = getWorkspaceScope()): Promise<void> { return workspaces[scope].saveBrowserValue(key, value); }
export function deleteBrowserValue(key: 'onboarding', scope: WorkspaceScope = getWorkspaceScope()): Promise<void> { return workspaces[scope].deleteBrowserValue(key); }
export function bindBrowserWorkspace(userId: string): Promise<boolean> { return workspaces.account.bindBrowserWorkspace(userId); }
