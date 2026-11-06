import { AppState, Platform } from 'react-native';

import { sqlJournalFor } from '@/features/journal/runtime';
import type { SqlJournal } from '@/features/journal/sqlJournal';
import type { Entry } from '@/features/journal/types';
import { utf8Encode } from '@/storage/bytes';
import { childUri } from '@/storage/ports';
import { getRuntime, type Runtime } from '@/storage/runtime';

import { loadSharing } from './nativeModules';
import { createZipWriter } from './zip';

export type ExportResult =
  | { ok: true; exported: number; unreadable: number }
  /** No share sheet on this device. */
  | { ok: false; code: 'unavailable' }
  /** Retry later. The journal itself is untouched. */
  | { ok: false; code: 'failed' };

type ShareTarget = {
  isAvailable(): Promise<boolean>;
  share(uri: string): Promise<void>;
};

const nativeShare: ShareTarget = {
  isAvailable: () => loadSharing().isAvailableAsync(),
  share: (uri) =>
    loadSharing().shareAsync(uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' }),
};

// Android's promise settles when the chooser hands off, and the receiving app may read the file
// after that. Deleting at once could send an empty attachment. iOS has copied the file by the time
// it resolves.
const RELEASE_DELAY_MS = Platform.OS === 'android' ? 60_000 : 0;

/**
 * Runs release once the delay is up. Android pauses timers while the app is in the background and
 * nothing here runs there, so the timer alone can leave plaintext on disk for as long as the app
 * stays away. The soonest it can go is the next return to the foreground, and the launch sweep covers
 * the process dying first. A return inside the delay changes nothing: the receiving app may still be
 * reading.
 */
function releaseAfter(delayMs: number, release: () => void): void {
  const deadline = Date.now() + delayMs;
  const finish = () => {
    clearTimeout(timer);
    subscription.remove();
    release();
  };
  const timer = setTimeout(finish, delayMs);
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && Date.now() >= deadline) finish();
  });
}

type Exported = {
  id: string;
  status: Entry['status'];
  createdAt: string;
  committedAt: string | null;
  localDay: string | null;
  title: string | null;
  body: string;
  mode: Entry['mode'];
  moodBefore: string | null;
  promptId: string | null;
  prompt: string | null;
  durationSeconds: number;
  audioFile: string | null;
  reflection: string | null;
};

const iso = (at: number | undefined) => (at === undefined ? null : new Date(at).toISOString());

function toExported(entry: Entry, audioFile: string | null, reflection: string | null): Exported {
  return {
    id: entry.id,
    status: entry.status,
    createdAt: new Date(entry.createdAt).toISOString(),
    committedAt: iso(entry.committedAt),
    localDay: entry.localDay ?? null,
    title: entry.title ?? null,
    body: entry.body,
    mode: entry.mode,
    moodBefore: entry.moodBefore ?? null,
    promptId: entry.promptId ?? null,
    prompt: entry.promptText ?? null,
    durationSeconds: entry.durationSeconds,
    audioFile,
    reflection,
  };
}

function toMarkdown(items: Exported[], at: Date): string {
  const sections = items.map((item) => {
    const lines = [`## ${item.localDay ?? item.createdAt.slice(0, 10)}`];
    if (item.title) lines.push('', `**${item.title}**`);
    if (item.status === 'draft') lines.push('', '_Draft_');
    if (item.prompt) lines.push('', `> ${item.prompt}`);
    if (item.moodBefore) lines.push('', `Mood: ${item.moodBefore}`);
    if (item.body) lines.push('', item.body);
    if (item.audioFile) lines.push('', `Audio: [${item.audioFile}](${item.audioFile})`);
    if (item.reflection) lines.push('', `Reflection: ${item.reflection}`);
    return lines.join('\n');
  });
  return [`# ECHO journal`, '', `Exported ${at.toISOString()}`, '', ...sections].join('\n\n');
}

async function writeArchive(
  rt: Runtime,
  journal: SqlJournal,
  uri: string,
  at: Date,
): Promise<{ exported: number; unreadable: number }> {
  const { entries, unreadable: unreadableRows } = await journal.readAll();
  const writer = rt.files.openWriter(uri);
  try {
    const zip = createZipWriter(writer, at);
    const items: Exported[] = [];
    let unreadable = unreadableRows;
    for (const entry of entries) {
      let audioFile: string | null = null;
      // One recording at a time: decrypted, written, released.
      try {
        const bytes = await journal.readAudio(entry);
        if (bytes && entry.audio) {
          audioFile = `audio/${entry.id}${entry.audio.extension}`;
          await zip.add(audioFile, bytes);
        }
      } catch {
        unreadable += 1;
      }
      const reflection = await journal.getReflection(entry.id);
      items.push(
        toExported(entry, audioFile, reflection.ok ? (reflection.value?.text ?? null) : null),
      );
    }
    const json = { app: 'ECHO', formatVersion: 1, exportedAt: at.toISOString(), entries: items };
    await zip.add('entries.json', utf8Encode(JSON.stringify(json, null, 2)));
    await zip.add('entries.md', utf8Encode(toMarkdown(items, at)));
    await zip.finish();
    return { exported: items.length, unreadable };
  } finally {
    writer.close();
  }
}

/**
 * Builds echo-export.zip (entries.json, entries.md, audio/) and opens the share sheet. The archive is
 * plaintext by nature, because the user is taking their words out. It is the one deliberate exception
 * to encryption at rest: it lives in the cache, for as short a time as sharing and the platform allow.
 */
export async function exportJournal(
  share: ShareTarget = nativeShare,
  releaseDelayMs: number = RELEASE_DELAY_MS,
): Promise<ExportResult> {
  let release = () => undefined as void;
  try {
    if (!(await share.isAvailable())) return { ok: false, code: 'unavailable' };
    const rt = await getRuntime();
    const directory = childUri(rt.paths.tempDir, rt.newId());
    rt.files.ensureDirectory(directory);
    release = () => {
      try {
        rt.files.removeDirectory(directory);
      } catch {
        // The launch sweep clears the same directory.
      }
    };
    const uri = childUri(directory, 'echo-export.zip');
    const counts = await writeArchive(rt, sqlJournalFor(rt), uri, new Date(rt.now()));
    await share.share(uri);
    if (releaseDelayMs > 0) releaseAfter(releaseDelayMs, release);
    else release();
    return { ok: true, ...counts };
  } catch {
    release();
    return { ok: false, code: 'failed' };
  }
}
