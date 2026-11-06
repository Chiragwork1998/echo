import { getEntry, type EntrySummary } from '@/features/journal';
import { PATTERNS_ENTRY_CHARS, PATTERNS_SEND_LIMIT, type SentEntry } from '@/services/patterns';

/** How many entries the consent will say it sends, given the committed entries that can be opened. */
export const entriesToSend = (entries: readonly EntrySummary[]) =>
  Math.min(entries.filter((entry) => entry.readable && entry.localDay).length, PATTERNS_SEND_LIMIT);

/**
 * Decrypts the newest entries on this phone, ready to send. Entries that cannot be opened, or that
 * hold no words, are left out. Returns null if a read failed, so that nothing partial is ever sent
 * as though it were the whole.
 */
export async function gatherEntries(entries: readonly EntrySummary[]): Promise<SentEntry[] | null> {
  const newest = entries
    .filter((entry) => entry.readable && entry.localDay)
    .sort((a, b) => (b.localDay ?? '').localeCompare(a.localDay ?? '') || b.createdAt - a.createdAt)
    .slice(0, PATTERNS_SEND_LIMIT);

  const sent: SentEntry[] = [];
  for (const summary of newest) {
    const result = await getEntry(summary.id);
    if (!result.ok) return null;
    const entry = result.value;
    if (!entry?.localDay) continue;
    const text = [entry.title, entry.body]
      .map((part) => part?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n')
      .slice(0, PATTERNS_ENTRY_CHARS);
    if (text) sent.push({ date: entry.localDay, text });
  }
  return sent;
}
