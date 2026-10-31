import type { JournalEntry } from '@/state/journal';

export type LibraryFilter = 'All' | 'Favorites' | 'Voice';

export function libraryTitle(entry: JournalEntry): string {
  if (entry.contentState === 'unavailable') return 'A protected echo';
  if (entry.takeaway?.trim()) return entry.takeaway.trim();
  if (entry.promptId !== 'free_space') return entry.promptTextSnapshot;
  const line = entry.body?.trim().split(/[\n.!?]/u)[0]?.trim();
  return line || (entry.audioPath ? 'A moment in your voice' : 'A little of today');
}

export function filterLibrary(entries: readonly JournalEntry[], filter: LibraryFilter, query: string): JournalEntry[] {
  const term = query.trim().toLocaleLowerCase();
  return entries.filter(entry => {
    if (filter === 'Favorites' && !entry.favorite) return false;
    if (filter === 'Voice' && !entry.audioPath) return false;
    if (!term) return true;
    return `${entry.promptTextSnapshot} ${entry.body ?? ''} ${entry.takeaway ?? ''}`.toLocaleLowerCase().includes(term);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function groupLibrary(entries: readonly JournalEntry[]) {
  const groups: { key: string; label: string; entries: JournalEntry[] }[] = [];
  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    let group = groups.find(item => item.key === key);
    if (!group) {
      group = { key, label: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}
