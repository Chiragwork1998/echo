import { getDatabase, isDatabaseSupported } from './database';
import { getWorkspaceScope, type WorkspaceScope } from './workspace';
import type { OnboardingSnapshot } from '@/state/onboardingSelections';
import { deleteBrowserValue, isBrowserClient, loadBrowserValue, saveBrowserValue } from './browserJournalRepository';

/**
 * Resumable onboarding progress (`OnboardingState` in
 * `product-handoff/specs/DATA_MODEL.md`).
 *
 * This port carries selections, reminder/privacy settings and the current step
 * only. Journal text, audio and reflections never travel through it; they
 * require `src/storage/encryption.ts` first.
 *
 * On native platforms progress is written to SQLite on every change, so a
 * terminated session resumes at the last completed step. Browser progress and
 * settings are encrypted in the same IndexedDB store as the local journal.
 */

export type PersistedOnboardingState = OnboardingSnapshot & { version: 1 };

export interface OnboardingPersistence {
  /** Whether progress survives an app restart on this platform. */
  readonly persistent: boolean;
  load(): Promise<OnboardingSnapshot | null>;
  save(state: OnboardingSnapshot): void;
  clear(): Promise<void>;
  /** Resolves once queued writes are durable; absent for the memory store. */
  flush?(): Promise<void>;
}

const ROW_ID = 1;

class OnboardingStateUnavailableError extends Error {
  constructor() {
    super('Saved settings could not be read.');
    this.name = 'OnboardingStateUnavailableError';
  }
}

function toSnapshot(payload: string): OnboardingSnapshot | null {
  try {
    const parsed = JSON.parse(payload) as OnboardingSnapshot;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new OnboardingStateUnavailableError();
    }
    return parsed;
  } catch {
    throw new OnboardingStateUnavailableError();
  }
}

/**
 * SQLite-backed onboarding progress. `save()` stays synchronous for callers
 * and queues the write; `flush()` awaits the queued writes when a caller wants
 * to guarantee durability (for example before navigating to Home).
 */
export function createSqliteOnboardingPersistence(scope: WorkspaceScope = getWorkspaceScope()): OnboardingPersistence {
  let queue: Promise<void> = Promise.resolve();
  let lastError: unknown = null;

  const write = (state: OnboardingSnapshot | null): Promise<void> => {
    const run = async () => {
      const db = await getDatabase(scope);
      lastError = null;
      if (state === null) {
        await db.runAsync('DELETE FROM onboarding_state WHERE id = ?', ROW_ID);
        return;
      }
      const payload = JSON.stringify({ ...state, version: 1 } satisfies PersistedOnboardingState);
      await db.runAsync(
        `INSERT INTO onboarding_state (id, payload, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
        ROW_ID,
        payload,
        new Date().toISOString(),
      );
    };
    queue = queue.then(run, run).catch((error: unknown) => {
      lastError = error;
    });
    return queue;
  };

  return {
    persistent: true,
    async load() {
      // Wait for any queued write so a fast restart cannot read a stale row.
      await queue;
      if (lastError) {
        throw lastError;
      }
      const db = await getDatabase(scope);
      const row = await db.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM onboarding_state WHERE id = ?',
        ROW_ID,
      );
      return row ? toSnapshot(row.payload) : null;
    },
    save(state) {
      void write(state);
    },
    async clear() {
      await write(null);
    },
    async flush() {
      await queue;
      if (lastError) throw lastError;
    },
  };
}

/**
 * Session-scoped store used on platforms without an encrypted database and by
 * tests. It keeps progress for the running app session and writes no files.
 */
export function createInMemoryOnboardingPersistence(): OnboardingPersistence {
  let stored: PersistedOnboardingState | null = null;

  return {
    persistent: false,
    async load() {
      return stored;
    },
    save(state) {
      stored = { ...state, version: 1 };
    },
    async clear() {
      stored = null;
    },
  };
}

export function createBrowserOnboardingPersistence(scope: WorkspaceScope = getWorkspaceScope()): OnboardingPersistence {
  let queue: Promise<void> = Promise.resolve();
  let lastError: unknown = null;
  const enqueue = (work: () => Promise<void>) => {
    const next = queue.then(work);
    queue = next.then(() => { lastError = null; }, (error: unknown) => { lastError = error; });
    return next;
  };
  return {
    persistent: true,
    async load() {
      await queue;
      if (lastError) throw lastError;
      const stored = await loadBrowserValue<PersistedOnboardingState>('onboarding', scope);
      if (stored === null) return null;
      if (stored.version !== 1) throw new OnboardingStateUnavailableError();
      return stored;
    },
    save(state) {
      const snapshot = { ...state, version: 1 } satisfies PersistedOnboardingState;
      void enqueue(() => saveBrowserValue('onboarding', snapshot, scope)).catch(() => undefined);
    },
    async clear() {
      await enqueue(() => deleteBrowserValue('onboarding', scope));
    },
    async flush() {
      await queue;
      if (lastError) throw lastError;
    },
  };
}

/** SQLite on native; encrypted IndexedDB on web; memory for SSR/tests. */
export function createDefaultOnboardingPersistence(scope: WorkspaceScope = getWorkspaceScope()): OnboardingPersistence {
  if (isDatabaseSupported()) return createSqliteOnboardingPersistence(scope);
  return isBrowserClient() ? createBrowserOnboardingPersistence(scope) : createInMemoryOnboardingPersistence();
}

export const defaultOnboardingPersistence = createDefaultOnboardingPersistence();
