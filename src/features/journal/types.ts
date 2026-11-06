import type { Mood } from '@/state/onboarding';

import type { Rhythm } from './rhythm';

export type EntryMode = 'text' | 'voice';
export type EntryStatus = 'draft' | 'committed';

/** What the user made. Sealed as one object, so none of it is readable in the database. */
export type EntryContent = {
  title?: string;
  body: string;
  mode: EntryMode;
  moodBefore?: Mood;
  promptId?: string;
  promptText?: string;
  durationSeconds: number;
  /**
   * The recording whose words are already in `body`. A recording that is not this one has not been
   * turned into words yet, so a reopened draft can offer to do it. Set together with the text.
   */
  transcribedAudioId?: string;
};

export type EntryPatch = Partial<EntryContent>;

export type EntryAudio = {
  id: string;
  extension: string;
  /** null when a recording was recovered after a crash and its length is unknown. */
  durationSeconds: number | null;
  /** Rescued by the launch sweep. May be cut short, and on iOS may not play. */
  recovered: boolean;
};

export type Entry = EntryContent & {
  id: string;
  status: EntryStatus;
  createdAt: number;
  updatedAt: number;
  /** Set once committed. */
  committedAt?: number;
  /** 'YYYY-MM-DD' on the wall clock at commit. Never recomputed. */
  localDay?: string;
  audio?: EntryAudio;
};

export type EntrySummary = {
  id: string;
  status: EntryStatus;
  /** false if this row failed to decrypt. It stays listed rather than silently vanishing. */
  readable: boolean;
  title: string;
  preview: string;
  moodBefore?: Mood;
  mode: EntryMode;
  durationSeconds: number;
  hasAudio: boolean;
  recovered: boolean;
  createdAt: number;
  updatedAt: number;
  committedAt?: number;
  localDay?: string;
};

export type ReflectionStatus = 'pending' | 'complete' | 'error' | 'offline';
export type StoredReflection = { status: ReflectionStatus; text?: string };

export type JournalErrorCode =
  /** Storage is not open yet, or there is no key. */
  | 'not_ready'
  | 'read_failed'
  /** Nothing was saved. The draft is still held in memory. */
  | 'write_failed'
  | 'not_found'
  /** A committed entry cannot be changed by autosave. */
  | 'not_draft'
  | 'empty'
  /** The stored object failed authentication: corrupted or tampered. */
  | 'unreadable'
  /** Recording or playback is not available on this platform. */
  | 'unavailable'
  | 'audio_failed';

/** Never holds a message, only a code: errors can reach logs and must not carry journal content. */
export type JournalError = { code: JournalErrorCode; retryable: boolean };

export type JournalResult<T> = { ok: true; value: T } | { ok: false; error: JournalError };

const RETRYABLE: JournalErrorCode[] = ['not_ready', 'read_failed', 'write_failed', 'audio_failed'];

export const success = <T>(value: T): JournalResult<T> => ({ ok: true, value });

export const failure = <T = never>(code: JournalErrorCode): JournalResult<T> => ({
  ok: false,
  error: { code, retryable: RETRYABLE.includes(code) },
});

export class JournalFailure extends Error {
  constructor(readonly code: JournalErrorCode) {
    super(code);
    this.name = 'JournalFailure';
  }
}

export type AttachRecordingInput = {
  recordingId: string;
  uri: string;
  draftId: string;
  durationSeconds: number | null;
  /** Latest draft content, used if the row does not exist yet. */
  content: EntryContent;
};

export type PlayableAudio = {
  uri: string;
  /** Deletes the decrypted copy. Call as soon as playback ends. */
  release(): void;
};

export type SearchOptions = { isCancelled?: () => boolean };

export type SearchResults = { results: EntrySummary[]; unreadable: number };

export interface Journal {
  newDraftId(): Promise<string>;
  /** Creates the draft on first save. */
  saveDraft(id: string, content: EntryContent): Promise<JournalResult<{ updatedAt: number }>>;
  /** Resolves ok only once the entry is durable on disk. Safe to call twice. */
  commitEntry(id: string, content: EntryContent): Promise<JournalResult<Entry>>;
  /** Removes a draft and its audio completely. Drafts leave no tombstone. */
  discardDraft(id: string): Promise<JournalResult<void>>;
  getEntry(id: string): Promise<JournalResult<Entry | null>>;
  /** The newest draft that opens. Unreadable ones are skipped, and stay in listDrafts. */
  latestDraft(): Promise<JournalResult<Entry | null>>;
  /**
   * The newest entry that opens. Unreadable ones are skipped, and stay in listEntries. Decrypts one
   * entry, so that Home stays quick however long the journal grows.
   */
  latestEntry(): Promise<JournalResult<EntrySummary | null>>;
  listDrafts(): Promise<JournalResult<EntrySummary[]>>;
  /** Committed entries, newest first. */
  listEntries(): Promise<JournalResult<EntrySummary[]>>;
  hasCommittedEntries(): Promise<JournalResult<boolean>>;
  /** Wipes content immediately and keeps a tombstone for future sync. */
  deleteEntry(id: string): Promise<JournalResult<void>>;
  searchEntries(query: string, options?: SearchOptions): Promise<JournalResult<SearchResults>>;
  getRhythm(): Promise<JournalResult<Rhythm>>;
  saveReflection(id: string, reflection: StoredReflection): Promise<JournalResult<void>>;
  getReflection(id: string): Promise<JournalResult<StoredReflection | null>>;
  beginRecording(draftId: string): Promise<JournalResult<{ recordingId: string }>>;
  attachRecording(input: AttachRecordingInput): Promise<JournalResult<EntryAudio>>;
  abandonRecording(recordingId: string): Promise<JournalResult<void>>;
  /** Encrypts a recording whose recorder went away without being stopped. */
  salvageRecording(recordingId: string): Promise<JournalResult<void>>;
  openAudio(entryId: string): Promise<JournalResult<PlayableAudio>>;
}
