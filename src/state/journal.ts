import { useSyncExternalStore } from 'react';

import {
  createDefaultJournalRepository,
  type JournalRepository,
} from '@/storage/journalRepository';

import type { MoodSelection } from './onboardingSelections';

/**
 * Local journal domain (`JournalEntry` in
 * `product-handoff/specs/DATA_MODEL.md`).
 *
 * Entry bodies cross the encryption boundary in
 * `src/storage/journalRepository.ts` before they are written to SQLite, and the
 * store hydrates from that repository once per app launch. When the encrypted
 * store is unavailable (web preview) work stays in session memory and the
 * storage error state is surfaced instead of silently pretending to save.
 *
 * No journal content is ever logged.
 */

export type JournalMode = 'text' | 'voice';
export type SyncState = 'local' | 'pending' | 'synced' | 'error';
/** `unavailable` marks a stored entry whose content failed authentication. */
export type ContentState = 'available' | 'unavailable';

export type ReflectionSummary =
  | { status: 'complete'; text: string }
  | { status: 'pending' | 'unavailable' | 'offline' | 'error'; text: null };

export type JournalEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  promptId: string;
  promptTextSnapshot: string;
  mode: JournalMode;
  body: string | null;
  audioPath: string | null;
  durationSeconds: number;
  moodBefore: MoodSelection | null;
  reflection: ReflectionSummary | null;
  syncState: SyncState;
  deletedAt: string | null;
  contentState: ContentState;
};

export type RhythmDay = {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  weekdayLabel: string;
  completed: boolean;
  isToday: boolean;
};

export type JournalStatus = 'idle' | 'loading' | 'ready' | 'error';

type Listener = () => void;

let entries: readonly JournalEntry[] = [];
let draft: JournalEntry | null = null;
let status: JournalStatus = 'idle';
let storageError: string | null = null;
let hydrated: Promise<void> | null = null;
let repository: JournalRepository = createDefaultJournalRepository();

const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function createId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Records a storage failure without ever echoing journal content. */
function recordStorageError(error: unknown, operation: string): void {
  const name = error instanceof Error ? error.name : 'Error';
  storageError = `${operation}:${name}`;
  status = 'error';
  emit();
}

function persist(operation: string, work: () => Promise<void>): void {
  void work().catch((error: unknown) => recordStorageError(error, operation));
}

/** Swaps the persistence port; used by tests and by web preview builds. */
export function configureJournalRepository(port: JournalRepository): void {
  repository = port;
  hydrated = null;
}

export function getJournalStorageKind(): JournalRepository['kind'] {
  return repository.kind;
}

export function getJournalStorageError(): string | null {
  return storageError;
}

/**
 * Loads persisted entries and the draft exactly once per app launch. Safe to
 * call from any screen; later calls reuse the same promise.
 */
export function hydrateJournal(): Promise<void> {
  hydrated ??= (async () => {
    status = 'loading';
    emit();
    try {
      const [storedEntries, storedDraft] = await Promise.all([
        repository.loadEntries(),
        repository.loadDraft(),
      ]);
      entries = storedEntries;
      draft = storedDraft;
      storageError = null;
      status = 'ready';
    } catch (error) {
      storageError = error instanceof Error ? error.name : 'Error';
      status = 'error';
    }
    emit();
  })();
  return hydrated;
}

function makeEntry(input: {
  promptId: string;
  promptTextSnapshot: string;
  mode: JournalMode;
  body: string | null;
  audioPath?: string | null;
  durationSeconds: number;
  moodBefore: MoodSelection | null;
  reflection?: ReflectionSummary | null;
}): JournalEntry {
  const now = new Date().toISOString();
  return {
    id: createId(),
    createdAt: now,
    updatedAt: now,
    promptId: input.promptId,
    promptTextSnapshot: input.promptTextSnapshot,
    mode: input.mode,
    body: input.body,
    audioPath: input.audioPath ?? null,
    durationSeconds: input.durationSeconds,
    moodBefore: input.moodBefore,
    reflection: input.reflection ?? null,
    // Backup stays local until the user authenticates and consent is recorded.
    syncState: 'local',
    deletedAt: null,
    contentState: 'available',
  };
}

export function commitEntry(input: {
  promptId: string;
  promptTextSnapshot: string;
  mode: JournalMode;
  body: string | null;
  audioPath?: string | null;
  durationSeconds: number;
  moodBefore: MoodSelection | null;
  reflection?: ReflectionSummary | null;
}): JournalEntry {
  const entry = makeEntry(input);
  entries = [entry, ...entries.filter((item) => item.id !== entry.id)];
  draft = null;
  emit();
  if (repository.persistent) {
    persist('saveEntry', async () => {
      await repository.saveEntry(entry);
      await repository.saveDraft(null);
    });
  } else {
    storageError = 'storage-unavailable';
  }
  return entry;
}

export function attachReflection(entryId: string, reflection: ReflectionSummary): void {
  let updated: JournalEntry | null = null;
  entries = entries.map((entry) => {
    if (entry.id !== entryId) {
      return entry;
    }
    updated = { ...entry, reflection, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (draft?.id === entryId) {
    draft = { ...draft, reflection, updatedAt: new Date().toISOString() };
  }
  emit();
  const snapshot = updated ?? entries.find((entry) => entry.id === entryId) ?? null;
  if (snapshot && repository.persistent) {
    persist('saveReflection', () => repository.saveEntry(snapshot));
  }
}

export function saveDraft(input: {
  promptId: string;
  promptTextSnapshot: string;
  mode: JournalMode;
  body: string | null;
  audioPath?: string | null;
  durationSeconds: number;
  moodBefore: MoodSelection | null;
}): void {
  const existing = draft;
  const now = new Date().toISOString();
  draft = existing
    ? {
        ...existing,
        ...input,
        // Never drop a recording path when a text autosave omits it.
        audioPath: input.audioPath ?? existing.audioPath,
        updatedAt: now,
      }
    : { ...makeEntry(input), updatedAt: now };
  emit();
  if (repository.persistent) {
    const snapshot = draft;
    persist('saveDraft', () => repository.saveDraft(snapshot));
  }
}

/**
 * Re-attaches a recording recovered after an interruption as the current
 * draft, so a saved-but-unfinished voice session is never lost.
 */
export function restoreRecordingDraft(input: {
  audioPath: string;
  durationSeconds: number;
  promptId: string;
  promptTextSnapshot: string;
}): void {
  const existing = draft;
  const now = new Date().toISOString();
  if (existing) {
    draft = {
      ...existing,
      mode: 'voice',
      audioPath: input.audioPath,
      durationSeconds: Math.max(existing.durationSeconds, input.durationSeconds),
      updatedAt: now,
    };
  } else {
    draft = makeEntry({
      promptId: input.promptId,
      promptTextSnapshot: input.promptTextSnapshot,
      mode: 'voice',
      body: null,
      audioPath: input.audioPath,
      durationSeconds: input.durationSeconds,
      moodBefore: null,
    });
  }
  emit();
  if (repository.persistent) {
    const snapshot = draft;
    persist('saveDraft', () => repository.saveDraft(snapshot));
  }
}

export function discardDraft(): void {
  if (!draft) {
    return;
  }
  draft = null;
  emit();
  if (repository.persistent) {
    persist('discardDraft', () => repository.saveDraft(null));
  }
}

export function getEntries(): readonly JournalEntry[] {
  return entries;
}

export function getDraft(): JournalEntry | null {
  return draft;
}

export function getMostRecentEntry(): JournalEntry | null {
  return entries[0] ?? draft;
}

export function getJournalStatus(): JournalStatus {
  return status;
}

export function useJournal(): readonly JournalEntry[] {
  return useSyncExternalStore(subscribe, getEntries, getEntries);
}

export function useJournalDraft(): JournalEntry | null {
  return useSyncExternalStore(subscribe, getDraft, getDraft);
}

export function useJournalStatus(): JournalStatus {
  return useSyncExternalStore(subscribe, getJournalStatus, getJournalStatus);
}

const COMPLETED_DAYS = 7;
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function localDateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Rhythm is derived from completed entries by local calendar day. */
export function deriveRhythmWeek(all: readonly JournalEntry[], now = new Date()): RhythmDay[] {
  const completedDays = new Set(
    all
      .filter((entry) => entry.deletedAt === null)
      .map((entry) => localDateKey(new Date(entry.createdAt))),
  );
  const todayKey = localDateKey(now);

  return Array.from({ length: COMPLETED_DAYS }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (COMPLETED_DAYS - 1 - index));
    const key = localDateKey(date);
    return {
      date: key,
      weekdayLabel: WEEKDAY_LABELS[date.getDay()] ?? '',
      completed: completedDays.has(key),
      isToday: key === todayKey,
    };
  });
}
