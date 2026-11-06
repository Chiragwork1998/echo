import type { Runtime } from '@/storage/runtime';

import { initialOnboarding, type OnboardingPersistence, type OnboardingState } from './onboarding';

const ROW = 'onboarding';
const OBJECT_ID = 'v1';

/**
 * The whole record is one sealed value: intent, horizon, mode, mood, reminder, privacy, step, and
 * completion. Nothing about the user's choices is readable in the database.
 */
export function createOnboardingPersistence(rt: Runtime): OnboardingPersistence {
  return {
    async load() {
      const row = await rt.db.first<{ sealed: Uint8Array }>(
        'SELECT sealed FROM sealed_kv WHERE key = ?',
        [ROW],
      );
      if (!row) return null;
      const stored = await rt.vault.openJson<Partial<OnboardingState>>(
        'onboarding',
        OBJECT_ID,
        row.sealed,
      );
      // Defaults under the stored value, so a record from an older version gains new fields.
      return { ...initialOnboarding, ...stored };
    },
    async save(state) {
      const sealed = await rt.vault.sealJson('onboarding', OBJECT_ID, state);
      await rt.db.run(
        `INSERT INTO sealed_kv (key, sealed, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET sealed = excluded.sealed, updated_at = excluded.updated_at`,
        [ROW, sealed, rt.now()],
      );
    },
  };
}
