import { getDatabase, isDatabaseSupported } from './database';
import type { OnboardingSnapshot } from '@/state/onboardingSelections';

/**
 * Resumable onboarding progress (`OnboardingState` in
 * `product-handoff/specs/DATA_MODEL.md`).
 *
 * This port carries selections, reminder/privacy settings and the current step
 * only. Journal text, audio and reflections never travel through it; they
 * require `src/storage/encryption.ts` first.
 *
 * On native platforms progress is written to SQLite on every change, so a
 * terminated session resumes at the last completed step. Web preview builds
 * have no encrypted store and keep progress for the running session only.
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

function toSnapshot(payload: string): OnboardingSnapshot | null {
  try {
    const parsed = JSON.parse(payload) as OnboardingSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * SQLite-backed onboarding progress. `save()` stays synchronous for callers
 * and queues the write; `flush()` awaits the queued writes when a caller wants
 * to guarantee durability (for example before navigating to Home).
 */
export function createSqliteOnboardingPersistence(): OnboardingPersistence {
  let queue: Promise<void> = Promise.resolve();
  let lastError: unknown = null;

  const write = (state: OnboardingSnapshot | null): Promise<void> => {
    const run = async () => {
      const db = await getDatabase();
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
      const db = await getDatabase();
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

/** SQLite on native targets; session memory only on web preview builds. */
export function createDefaultOnboardingPersistence(): OnboardingPersistence {
  return isDatabaseSupported()
    ? createSqliteOnboardingPersistence()
    : createInMemoryOnboardingPersistence();
}

export const defaultOnboardingPersistence = createDefaultOnboardingPersistence();
