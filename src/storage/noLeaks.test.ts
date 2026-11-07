import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { sqlJournalFor } from '@/features/journal/runtime';
import type { EntryContent } from '@/features/journal/types';
import {
  flushOnboarding,
  hydrateOnboarding,
  resetOnboarding,
  useOnboarding,
  type Mood,
} from '@/state/onboarding';
import { createOnboardingPersistence } from '@/state/onboardingStore';
import { hydratePreferences, resetPreferences, usePreferences } from '@/state/preferences';

import { createTestRuntime, everyStoredByte, type TestRuntime } from './testing/nodePorts';

// Static guards. Each of these rules is one a future edit could break without any test failing. They
// read source, so they say nothing about what happens at runtime. The tests below this describe do.
const OWNED = [
  'src/storage',
  'src/services',
  'src/features/journal',
  'src/state',
  'app/_layout.tsx',
];

function sources(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => sources(join(path, name)));
}

const production = OWNED.flatMap(sources).filter(
  (path) => /\.tsx?$/.test(path) && !path.includes('.test.') && !path.includes('/testing/'),
);

const read = (path: string) => readFileSync(path, 'utf8');

describe('privacy rules', () => {
  it('finds the files it is meant to check', () => {
    expect(production.length).toBeGreaterThan(30);
  });

  it.each(production)('%s never logs', (path) => {
    expect(read(path)).not.toMatch(/\bconsole\s*\./);
  });

  // D-005: spoken entries are transcribed by ECHO's voice server, after the person agrees, and
  // Pattern Cards are read there too, under their own consent. Live words (D-007) are the one thing
  // that also opens a socket, straight to OpenAI with a secret ECHO's server hands out. Those are the
  // only places a request or a socket is made. Every other file here stays offline, and adding one
  // should be a decision, not an accident. install.ts was added on 2026-11-08 (docs/PRODUCT_V1.md,
  // Server and identity): it asks ECHO's server for this install's token with the install id, which
  // holds no content, and nothing else.
  const SOCKET = ['src/services/liveTranscription.ts'];
  const NETWORK = [
    'src/services/transcription.ts',
    'src/services/patterns.ts',
    'src/services/install.ts',
    ...SOCKET,
  ];
  it.each(production.filter((path) => !NETWORK.includes(path)))(
    '%s makes no network call',
    (path) => {
      expect(read(path)).not.toMatch(/\bfetch\b|XMLHttpRequest|axios|WebSocket/);
    },
  );

  it('keeps requests to the named files, which send only to the configured address', () => {
    for (const path of NETWORK) {
      expect(production).toContain(path);
      const source = read(path);
      expect(source).not.toMatch(/XMLHttpRequest|axios/);
      if (!SOCKET.includes(path)) expect(source).not.toMatch(/WebSocket/);
      // The address and token come from the environment, never from the source.
      expect(source).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)[a-z0-9.-]+\.[a-z]{2,}/i);
      expect(source).not.toMatch(/wss?:\/\/(?!127\.0\.0\.1|localhost)[a-z0-9.-]+\.[a-z]{2,}/i);
      expect(source).toMatch(/env\.EXPO_PUBLIC_VOICE_URL|from '\.\/voiceApi'/);
      expect(source).toMatch(/env\.EXPO_PUBLIC_VOICE_TOKEN|from '\.\/voiceApi'/);
    }
  });

  it('streams a voice only over wss, to an address the server gave', () => {
    for (const path of SOCKET) {
      const source = read(path);
      // A socket in the clear is refused outside this Mac's own loopback in a development build.
      expect(source).toMatch(/wss:/);
      expect(source).toMatch(/liveAddress/);
      expect(source).not.toMatch(/new WebSocket\(\s*['"`]/);
    }
  });

  it.each(production)('%s never reports an error message', (path) => {
    // Native and JSON errors can quote what they failed on, which here is journal content.
    expect(read(path)).not.toMatch(/\b(error|err|e)\.message\b/);
  });

  it.each(production)('%s keeps web storage out', (path) => {
    expect(read(path)).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('stores no streak counter', () => {
    const schema = read('src/storage/migrations.ts');
    expect(schema).not.toMatch(/streak/i);
  });

  it('never ties the content key to biometrics', () => {
    const source = read('src/storage/nativePorts.ts');
    expect(source).not.toMatch(/requireAuthentication\s*:/);
  });
});

describe('what the app actually does with private content', () => {
  const TITLE = 'MARKERTITLE';
  const BODY = 'MARKERBODY';
  const PROMPT_ID = 'MARKERPROMPTID';
  const PROMPT_TEXT = 'MARKERPROMPTTEXT';
  const REFLECTION = 'MARKERREFLECTION';
  const AUDIO = 'MARKERAUDIO';
  const VOICE_BODY = 'MARKERVOICE';
  const DURATION = 4242;
  const REMINDER = '07:41';
  const MOOD = 'MARKERMOOD' as Mood;
  const ONBOARDING_MOOD = 'unsettled';
  const INTENT = 'understand_self';

  const content: EntryContent = {
    title: TITLE,
    body: BODY,
    mode: 'text',
    moodBefore: MOOD,
    promptId: PROMPT_ID,
    promptText: PROMPT_TEXT,
    durationSeconds: DURATION,
  };

  const PRIVATE = [
    TITLE,
    BODY,
    PROMPT_ID,
    PROMPT_TEXT,
    REFLECTION,
    AUDIO,
    VOICE_BODY,
    REMINDER,
    ONBOARDING_MOOD,
    INTENT,
    MOOD,
    // Field names too: finding one would mean a whole record went down unsealed.
    'moodBefore',
    'durationSeconds',
    '"privacy"',
  ];

  let rt: TestRuntime;

  beforeEach(async () => {
    resetOnboarding();
    resetPreferences();
    rt = await createTestRuntime();
    await hydrateOnboarding(createOnboardingPersistence(rt));
    await hydratePreferences(rt.db, rt.serial);
  });

  afterEach(() => jest.restoreAllMocks());

  function leaveRecording(recordingId: string) {
    const directory = rt.paths.recordingDirs[0] ?? '';
    mkdirSync(directory, { recursive: true });
    const uri = join(directory, `${recordingId}.m4a`);
    writeFileSync(uri, AUDIO.repeat(200));
    return uri;
  }

  /** Every kind of private write the app makes. */
  async function writeEverything() {
    useOnboarding.getState().update({
      intent: INTENT,
      mood: ONBOARDING_MOOD,
      reminder: { time: REMINDER, enabled: true },
    });
    await flushOnboarding();

    const journal = sqlJournalFor(rt);
    await journal.saveDraft('draft', content);
    await journal.commitEntry('entry', content);
    await journal.saveReflection('entry', { status: 'complete', text: REFLECTION });

    const begun = await journal.beginRecording('voice');
    if (!begun.ok) throw new Error('begin failed');
    const attached = await journal.attachRecording({
      recordingId: begun.value.recordingId,
      uri: leaveRecording(begun.value.recordingId),
      draftId: 'voice',
      durationSeconds: 3,
      content: { ...content, body: VOICE_BODY, mode: 'voice' },
    });
    if (!attached.ok) throw new Error('attach failed');
  }

  it('finds no private content anywhere on disk, write-ahead log included', async () => {
    await writeEverything();
    const stored = everyStoredByte(rt.root);
    expect(PRIVATE.filter((secret) => stored.includes(secret))).toEqual([]);
  });

  it('finds none of it after those pages move into the database file either', async () => {
    await writeEverything();
    await rt.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const stored = everyStoredByte(rt.root);
    expect(PRIVATE.filter((secret) => stored.includes(secret))).toEqual([]);
  });

  // Without these, a scan that found nothing could just be a scan that does not work.
  describe('the scan can see what it is looking for', () => {
    it('finds a value stored as plain text in the database', async () => {
      usePreferences.getState().setTheme('automatic');
      await new Promise((resolve) => setImmediate(resolve));
      expect(everyStoredByte(rt.root).includes('automatic')).toBe(true);
    });

    it('finds plaintext in a file, as an unfinished recording really is', () => {
      leaveRecording('unfinished');
      expect(everyStoredByte(rt.root).includes(AUDIO)).toBe(true);
    });

    it('finds a row in the write-ahead log before any checkpoint', async () => {
      await rt.db.run('INSERT INTO preferences (key, value) VALUES (?, ?)', ['probe', BODY]);
      expect(readFileSync(`${rt.db.file}-wal`).includes(BODY)).toBe(true);
      expect(everyStoredByte(rt.root).includes(BODY)).toBe(true);
    });
  });

  describe('nothing reaches the console or an error result', () => {
    const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;

    function watchConsole() {
      const spies = CONSOLE.map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      return () => spies.flatMap((spy) => spy.mock.calls);
    }

    it('stays silent through normal use', async () => {
      const logged = watchConsole();
      await writeEverything();
      const journal = sqlJournalFor(rt);
      await journal.getEntry('entry');
      await journal.listEntries();
      await journal.searchEntries(BODY);
      await journal.deleteEntry('entry');
      await journal.recoverLeftovers();
      expect(logged()).toEqual([]);
    });

    it('stays silent reading a corrupt row', async () => {
      const logged = watchConsole();
      await writeEverything();
      await rt.db.exec(`UPDATE entries SET sealed = x'01' WHERE id = 'entry'`);
      const journal = sqlJournalFor(rt);
      await journal.getEntry('entry');
      await journal.listEntries();
      await journal.latestEntry();
      expect(logged()).toEqual([]);
    });

    it('keeps a native error that quotes the content out of what callers see', async () => {
      const logged = watchConsole();
      const quoting = new Error(`constraint failed near ${BODY}`);
      const journal = sqlJournalFor(rt);
      jest.spyOn(rt.db, 'run').mockRejectedValue(quoting);

      const saved = await journal.saveDraft('a', content);
      const committed = await journal.commitEntry('a', content);

      expect(saved).toEqual({ ok: false, error: { code: 'write_failed', retryable: true } });
      expect(JSON.stringify(committed)).not.toContain(BODY);
      expect(logged()).toEqual([]);
    });

    it('keeps content out of what a failed decryption throws', async () => {
      await writeEverything();
      const row = await rt.db.first<{ sealed: Uint8Array }>(
        "SELECT sealed FROM entries WHERE id = 'entry'",
      );
      const failure = await rt.vault
        .openJson('entry', 'another-id', row?.sealed ?? new Uint8Array())
        .catch((error: unknown) => String(error));
      expect(failure).toBe('DecryptionError: decryption failed');
    });
  });
});
