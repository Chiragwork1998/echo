import { copy } from '@/content/copy';

/**
 * WORKING COPY. Everything the Echoes archive and the entry reader say that is not in the copy deck.
 * The three empty and search lines come from INTERACTIONS_AND_STATES.md but are not in copy.ts yet.
 * None of this is locked: the owner approves or replaces it when the designs arrive.
 */
export const echoesCopy = {
  title: copy.home.tabs[1],
  searchLabel: 'Search your echoes',
  searchPlaceholder: 'Search by word, title or date',
  clearSearch: 'Clear search',
  empty: 'Your first echo will appear here.',
  noMatches: 'Nothing returned for that search.',
  loading: 'Loading your echoes',
  searching: 'Searching',
  loadError: 'Your echoes couldn’t be loaded.',
  searchError: 'The search didn’t finish.',
  unreadable: 'This echo can’t be opened',
  voiceEcho: 'Voice echo',
  minutes: (minutes: number) => `${minutes} min`,
  mood: (mood: string) => `Mood: ${mood}`,
  skippedInSearch: (count: number) =>
    count === 1
      ? '1 echo can’t be opened, so it can’t be searched.'
      : `${count} echoes can’t be opened, so they can’t be searched.`,
  openHint: 'Opens this echo',
  unreadableHint: 'Opens options for this echo',

  // Reader.
  readerTitle: 'Echo',
  readerLoading: 'Opening this echo',
  readerError: 'This echo couldn’t be loaded.',
  unreadableBody: 'This echo is stored on this phone, but it can’t be opened. You can delete it.',
  noWords: 'No words were written in this echo.',
  play: 'Play recording',
  pause: 'Pause recording',
  loadingAudio: 'Preparing recording',
  recording: (minutes: number) => `Recording · ${minutes} min`,
  recovered: 'This recording was recovered after an interruption and may be cut short.',
  audioError: 'The recording couldn’t be played.',
  delete: 'Delete this echo',
  deleteTitle: 'Delete this echo?',
  deleteBody: 'The words and any recording are removed from this phone. This can’t be undone.',
  deleteConfirm: 'Delete',
  deleteCancel: 'Cancel',
  deleting: 'Deleting',
  deleteError: 'The echo couldn’t be deleted. Nothing was changed.',
} as const;
