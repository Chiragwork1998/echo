import { notifyJournalChanged } from '@/features/journal/api';
import { sqlJournalFor } from '@/features/journal/runtime';
import { bootApp } from '@/state/gate';
import { resetOnboarding } from '@/state/onboarding';
import { resetPreferences } from '@/state/preferences';
import { getRuntime } from '@/storage/runtime';

import { cancelReminder } from './reminders';

export type DeleteAllResult = { ok: true } | { ok: false; code: 'delete_incomplete' };

/**
 * Removes everything ECHO keeps on this device: entries, tombstones, audio, drafts, plaintext
 * leftovers, onboarding, preferences, reminder, and the encryption key. Irreversible, so ask first.
 *
 * Data goes first, then the key, then the sealed records, which hold the canary and the lock setting.
 * If this stops before the key, the key still opens whatever remains, the app starts normally with
 * the lock as it was, and the user can run it again. Any other order would strand the remainder behind
 * the key-loss screen, or turn the lock off. If it stops after the key, nothing is left to lose, and
 * the key-loss screen's Start over finishes the job.
 *
 * Resolves after the app has returned to a first-launch state, which re-routes to Landing.
 */
export async function deleteAllLocal(): Promise<DeleteAllResult> {
  await cancelReminder();
  try {
    const runtime = await getRuntime();
    await sqlJournalFor(runtime).wipe();
    await runtime.vault.destroyKey();
  } catch {
    return { ok: false, code: 'delete_incomplete' };
  }
  resetOnboarding();
  resetPreferences();
  notifyJournalChanged();
  await bootApp();
  return { ok: true };
}
