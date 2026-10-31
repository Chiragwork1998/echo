import type { JournalEntry } from '@/state/journal';
import { createDefaultJournalRepository } from './journalRepository';
import { createDefaultOnboardingPersistence } from './onboardingPersistence';

/**
 * A one-time, restart-safe copy after verified sign-in. The guest originals
 * remain untouched. Stable imported IDs mean retries never overwrite an
 * account entry, including edits made after the first successful transfer.
 */
export async function transferGuestOnboarding(accountId: string): Promise<void> {
  const guestSettings = createDefaultOnboardingPersistence('guest');
  const sourceSettings = await guestSettings.load();
  if (!sourceSettings?.completedAt) return;
  const receipt = sourceSettings.guestTransfer;
  if (receipt?.accountId && receipt.accountId !== accountId) {
    throw new Error('GuestTransferAccountMismatch');
  }
  if (receipt?.completed) return;

  // Record the recipient before copying anything; a partially completed copy
  // can only resume for the same verified identity.
  guestSettings.save({ ...sourceSettings, guestTransfer: { accountId, completed: false } });
  await guestSettings.flush?.();

  const guest = createDefaultJournalRepository('guest');
  const account = createDefaultJournalRepository('account');
  const accountSettings = createDefaultOnboardingPersistence('account');
  const [sourceEntries, sourceDraft, savedEntries, savedDraft, existingSettings] = await Promise.all([
    guest.loadEntries(), guest.loadDraft(), account.loadEntries(), account.loadDraft(), accountSettings.load(),
  ]);
  const savedIds = new Set(savedEntries.map(entry => entry.id));
  const copyEntry = async (entry: JournalEntry): Promise<JournalEntry> => {
    if (entry.contentState !== 'available') throw new Error('GuestContentUnavailable');
    const id = `guest-${entry.id}`;
    let audioPath = entry.audioPath;
    if (audioPath) {
      const { duplicateEncryptedAudio } = await import('./audioStore');
      audioPath = await duplicateEncryptedAudio(audioPath, id);
    }
    return { ...entry, id, audioPath, syncState: 'local' };
  };
  for (const entry of sourceEntries) {
    if (entry.deletedAt || savedIds.has(`guest-${entry.id}`)) continue;
    await account.saveEntry(await copyEntry(entry));
    savedIds.add(`guest-${entry.id}`);
  }
  if (sourceDraft && !savedDraft && !savedIds.has(`guest-${sourceDraft.id}`)) {
    await account.saveDraft(await copyEntry(sourceDraft));
  }

  accountSettings.save({
    ...sourceSettings,
    guestTransfer: undefined,
    privacy: {
      ...sourceSettings.privacy,
      // A new onboarding choice cannot silently remove an existing lock.
      biometricLockEnabled: Boolean(existingSettings?.privacy.biometricLockEnabled || sourceSettings.privacy.biometricLockEnabled),
    },
  });
  await accountSettings.flush?.();
  guestSettings.save({ ...sourceSettings, guestTransfer: { accountId, completed: true } });
  await guestSettings.flush?.();
}
