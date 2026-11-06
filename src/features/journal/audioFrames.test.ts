// Sealed audio through the journal: the real database, the real vault and AES, and a file system in
// memory that can be killed at any call. The format itself is in storage/sealedAudio.test.ts. These
// are the promises the journal makes to a person who has just finished saying something long.
import { AES_OVERHEAD_BYTES, childUri } from '@/storage/ports';
import { FRAME_BYTES, HEADER_BYTES } from '@/storage/sealedAudio';
import { expectBytes } from '@/storage/testing/expectBytes';
import { createMemoryFiles, Killed, type MemoryFiles } from '@/storage/testing/memoryFiles';
import { createTestRuntime, type TestRuntime } from '@/storage/testing/nodePorts';

import { emptyContent } from './content';
import { createSqlJournal, type SqlJournal } from './sqlJournal';
import type { JournalResult } from './types';

function unwrap<T>(result: JournalResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

/** Bytes that differ everywhere. Two frames and a part of a third is a take of about 8 MB. */
function take(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let index = 0; index < length; index += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[index] = state >>> 16;
  }
  return out;
}

const SPOKEN = take(2 * FRAME_BYTES + 5000);

type Context = { files: MemoryFiles; rt: TestRuntime; journal: SqlJournal };

async function setup(): Promise<Context> {
  const files = createMemoryFiles();
  const rt = await createTestRuntime({ files });
  return { files, rt, journal: createSqlJournal(rt) };
}

/** The recorder's output, left where the recorder leaves it. */
async function record({ files, rt, journal }: Context, draftId: string, bytes = SPOKEN) {
  const { recordingId } = unwrap(await journal.beginRecording(draftId));
  const uri = childUri(rt.paths.recordingDirs[0] ?? '', `${recordingId}.wav`);
  files.put(uri, bytes);
  const input = {
    recordingId,
    uri,
    draftId,
    durationSeconds: 3600,
    content: emptyContent({ mode: 'voice' }),
  };
  return { recordingId, uri, input };
}

const count = async ({ rt }: Context, table: string) =>
  (await rt.db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`))?.total;

const sealedNames = ({ files, rt }: Context) =>
  files.list(rt.paths.audioDir).map((file) => file.name);

/** What the next launch does: the process is gone, the database and the files are as it left them. */
async function relaunch(context: Context): Promise<Context> {
  context.files.revive();
  const rt = await context.rt.reopen();
  return { files: context.files, rt, journal: createSqlJournal(rt) };
}

describe('a long take, sealed through the journal', () => {
  it('seals in frames, deletes the plaintext last, and plays back exactly what was said', async () => {
    const context = await setup();
    const { files, rt, journal } = context;
    const { uri, input } = await record(context, 'a');
    files.revive(); // counts from here

    // The order is the promise: renamed whole, row committed, and only then is the plaintext removed.
    const order: string[] = [];
    const realMove = files.move.bind(files);
    files.move = async (from, to) => {
      await realMove(from, to);
      order.push('renamed');
    };
    const realTransaction = rt.db.transaction.bind(rt.db);
    rt.db.transaction = async (task) => {
      await realTransaction(task);
      order.push('committed');
    };
    const realRemove = files.remove.bind(files);
    files.remove = (path) => {
      if (path === uri) order.push('plaintext removed');
      realRemove(path);
    };

    const audio = unwrap(await journal.attachRecording(input));

    expect(order).toEqual(['renamed', 'committed', 'plaintext removed']);
    expect(files.has(uri)).toBe(false);
    const names = sealedNames(context);
    expect(names).toEqual([`${audio.id}.enc`]);
    const sealed = files.get(childUri(rt.paths.audioDir, names[0] ?? '')) ?? new Uint8Array(0);
    expect([...sealed.slice(0, HEADER_BYTES)]).toEqual([2, 0x00, 0x40, 0x00, 0x00]);
    expect(sealed.length).toBe(HEADER_BYTES + SPOKEN.length + 3 * AES_OVERHEAD_BYTES);

    files.revive();
    const playable = unwrap(await journal.openAudio('a'));
    expect(playable.uri.startsWith(rt.paths.tempDir)).toBe(true);
    expect(playable.uri.endsWith('.wav')).toBe(true); // the recorder's extension, as sealed
    expectBytes(files.get(playable.uri), SPOKEN);
    playable.release();
    expect(files.has(playable.uri)).toBe(false);

    // Neither the sealing nor the opening ever asked for more than a frame, or for a whole file.
    expect(files.stats.largestRead).toBeLessThanOrEqual(FRAME_BYTES + AES_OVERHEAD_BYTES);
    expect(files.stats.wholeReads).toBe(0);
    expect(files.stats.openReaders + files.stats.openWriters).toBe(0);
  });

  it('reads the whole recording back for export, and holds nothing else', async () => {
    const context = await setup();
    const { input } = await record(context, 'a');
    unwrap(await context.journal.attachRecording(input));
    const entry = unwrap(await context.journal.getEntry('a'));
    if (!entry) throw new Error('entry');
    expectBytes(await context.journal.readAudio(entry), SPOKEN);
    expect(context.files.stats.wholeReads).toBe(0);
  });

  it('gives each sealing its own recording id, so no frame of an old take can be spliced in', async () => {
    const context = await setup();
    const first = unwrap(await context.journal.attachRecording((await record(context, 'a')).input));
    const second = unwrap(
      await context.journal.attachRecording((await record(context, 'a', take(9000, 5))).input),
    );
    expect(second.id).not.toBe(first.id);
    expect(sealedNames(context)).toEqual([`${second.id}.enc`]);
  });

  it('keeps the plaintext and says so when the disk fills part way', async () => {
    const context = await setup();
    const { files, journal } = context;
    const { uri, input } = await record(context, 'a');
    const realOpen = files.openWriter.bind(files);
    let writes = 0;
    files.openWriter = (path) => {
      const writer = realOpen(path);
      return {
        close: writer.close,
        write: async (bytes) => {
          writes += 1;
          if (writes === 3) throw new Error('disk full');
          await writer.write(bytes);
        },
      };
    };

    expect(await journal.attachRecording(input)).toEqual({
      ok: false,
      error: { code: 'audio_failed', retryable: true },
    });

    files.openWriter = realOpen;
    expectBytes(files.get(uri), SPOKEN);
    expect(sealedNames(context)).toEqual([]);
    expect(await count(context, 'audio')).toBe(0);
    expect(await count(context, 'recordings')).toBe(1);
    expect(files.stats.openReaders + files.stats.openWriters).toBe(0);
    // And the next launch takes it from there.
    expect((await journal.recoverLeftovers()).recovered).toBe(1);
    expect(files.has(uri)).toBe(false);
  });
});

describe('a kill at any point while sealing', () => {
  const BYTES = take(FRAME_BYTES + 5000, 2);

  /** The port calls attachRecording makes when nothing stops it. */
  async function callsInCleanAttach() {
    const context = await setup();
    const { input } = await record(context, 'a', BYTES);
    context.files.revive();
    unwrap(await context.journal.attachRecording(input));
    return context.files.stats.trace.length;
  }

  async function killedAt(call: number, tearWrite: boolean) {
    const context = await setup();
    const { uri, input } = await record(context, 'a', BYTES);
    context.files.revive();
    context.files.killAt(call, { tearWrite });
    const result = await context.journal.attachRecording(input);
    return { context, uri, result };
  }

  /** The take is somewhere a person's next launch can find it, whole. */
  async function expectNotLost(context: Context, uri: string) {
    const next = await relaunch(context);
    const plaintext = next.files.get(uri);
    if (plaintext) {
      expectBytes(plaintext, BYTES);
    } else {
      // Not on the recorder's side any more, so it must be sealed, committed, and whole.
      const entry = unwrap(await next.journal.getEntry('a'));
      expect(entry?.audio).toBeDefined();
      expectBytes(await next.journal.readAudio(entry as never), BYTES);
    }
    // Whatever is named like a finished recording is one.
    for (const name of sealedNames(next)) {
      if (name.endsWith('.tmp')) continue;
      const bytes = await next.rt.vault.openAudioBytes(
        name.replace(/\.enc$/, ''),
        childUri(next.rt.paths.audioDir, name),
      );
      expectBytes(bytes, BYTES);
    }
    return next;
  }

  it.each([false, true])(
    'never loses the take, whichever call it stops at (torn writes: %s)',
    async (tearWrite) => {
      const calls = await callsInCleanAttach();
      expect(calls).toBeGreaterThan(15);
      for (let call = 1; call <= calls + 1; call += 1) {
        const { context, uri, result } = await killedAt(call, tearWrite);
        // The last call is the plaintext's removal, after the row is committed: the person is
        // told it saved, and only the clean-up is outstanding.
        if (call < calls) expect(result.ok).toBe(false);
        if (call > calls) expect(result.ok).toBe(true);

        const next = await expectNotLost(context, uri);
        const summary = await next.journal.recoverLeftovers();

        // After the sweep: one draft, one sealed file, the whole take, and no plaintext anywhere.
        expect(summary.failed).toBe(0);
        expect(unwrap(await next.journal.listDrafts())).toHaveLength(1);
        const audio = unwrap(await next.journal.getEntry('a'))?.audio;
        expect(audio).toBeDefined();
        expect(sealedNames(next)).toEqual([`${audio?.id}.enc`]);
        expect(next.files.has(uri)).toBe(false);
        expect(next.files.list(next.rt.paths.recordingDirs[0] ?? '')).toEqual([]);
        expect(await count(next, 'recordings')).toBe(0);
        expect(await count(next, 'audio')).toBe(1);
        const playable = unwrap(await next.journal.openAudio('a'));
        expectBytes(next.files.get(playable.uri), BYTES);
        playable.release();
        expect(next.files.list(next.rt.paths.tempDir)).toEqual([]);
      }
    },
    120_000,
  );

  it('never loses the take if it stops as the row is committed', async () => {
    const context = await setup();
    const { uri, input } = await record(context, 'a', BYTES);
    context.rt.db.transaction = async () => {
      context.files.killNow();
      throw new Killed();
    };

    expect((await context.journal.attachRecording(input)).ok).toBe(false);
    context.files.revive();

    // Renamed, not recorded: the plaintext is still there, and the sealed file is only an orphan.
    expectBytes(context.files.get(uri), BYTES);
    expect(sealedNames(context)).toHaveLength(1);
    const next = await relaunch(context);
    expect(await count(next, 'audio')).toBe(0);
    const summary = await next.journal.recoverLeftovers();
    expect(summary).toMatchObject({ recovered: 1, failed: 0, orphansRemoved: 1 });
    const audio = unwrap(await next.journal.getEntry('a'))?.audio;
    expect(sealedNames(next)).toEqual([`${audio?.id}.enc`]);
    expect(next.files.has(uri)).toBe(false);
  });

  it('removes the half of a killed sealing before it seals the take again', async () => {
    // Up to a whole take's length of ciphertext is left under the pending name. Sealing again while
    // it is still there would need room for both.
    const calls = await callsInCleanAttach();
    let context: Context | null = null;
    for (let call = 1; call <= calls && !context; call += 1) {
      const attempt = await killedAt(call, false);
      attempt.context.files.revive();
      if (sealedNames(attempt.context).some((name) => name.endsWith('.tmp'))) {
        context = attempt.context;
      }
    }
    if (!context) throw new Error('no kill point left a pending file');

    const next = await relaunch(context);
    expect(sealedNames(next).some((name) => name.endsWith('.tmp'))).toBe(true);
    const seen: string[][] = [];
    const real = next.files.openWriter.bind(next.files);
    next.files.openWriter = (path) => {
      seen.push(sealedNames(next));
      return real(path);
    };

    const summary = await next.journal.recoverLeftovers();

    expect(seen[0]).toEqual([]);
    expect(summary).toMatchObject({ recovered: 1, failed: 0, orphansRemoved: 1 });
    expect(sealedNames(next)).toHaveLength(1);
  });

  it('does not seal a take twice when it stops after the row and before the plaintext is deleted', async () => {
    const context = await setup();
    const { uri, input } = await record(context, 'a', BYTES);
    // Everything up to and including the commit, then the plaintext's removal is the first thing refused.
    const realRemove = context.files.remove.bind(context.files);
    context.files.remove = (path) => {
      if (path !== uri) return realRemove(path);
      context.files.killNow();
      throw new Killed();
    };

    expect((await context.journal.attachRecording(input)).ok).toBe(true);
    context.files.remove = realRemove;
    context.files.revive();
    expectBytes(context.files.get(uri), BYTES);

    const next = await relaunch(context);
    expect(await next.journal.recoverLeftovers()).toMatchObject({ recovered: 0, failed: 0 });
    expect(next.files.has(uri)).toBe(false);
    expect(unwrap(await next.journal.listDrafts())).toHaveLength(1);
    expect(sealedNames(next)).toHaveLength(1);
  });
});

describe('opening a take', () => {
  async function sealed() {
    const context = await setup();
    const { input } = await record(context, 'a');
    const audio = unwrap(await context.journal.attachRecording(input));
    const uri = childUri(context.rt.paths.audioDir, `${audio.id}.enc`);
    context.files.revive();
    return {
      ...context,
      audio,
      sealedUri: uri,
      bytes: context.files.get(uri) ?? new Uint8Array(0),
    };
  }

  const opened = (files: MemoryFiles) => files.stats.trace.filter((name) => name === 'openWriter');

  it('refuses a file cut at a frame boundary, and leaves no plaintext behind', async () => {
    const context = await sealed();
    const cut = context.bytes.slice(0, HEADER_BYTES + 2 * (FRAME_BYTES + AES_OVERHEAD_BYTES));
    context.files.put(context.sealedUri, cut);

    expect(await context.journal.openAudio('a')).toEqual({
      ok: false,
      error: { code: 'unreadable', retryable: false },
    });

    // Both whole frames had been decrypted into the copy before the missing end was found.
    expect(opened(context.files)).toHaveLength(1);
    expect(context.files.list(context.rt.paths.tempDir)).toEqual([]);
    expect(context.files.stats.openReaders + context.files.stats.openWriters).toBe(0);
  });

  it('refuses a damaged frame in the middle, and leaves no plaintext behind', async () => {
    const context = await sealed();
    const damaged = context.bytes.slice();
    const middle = HEADER_BYTES + (FRAME_BYTES + AES_OVERHEAD_BYTES) + 100;
    damaged[middle] = (damaged[middle] ?? 0) ^ 1;
    context.files.put(context.sealedUri, damaged);

    const result = await context.journal.openAudio('a');

    expect(result).toEqual({ ok: false, error: { code: 'unreadable', retryable: false } });
    expect(opened(context.files)).toHaveLength(1);
    expect(context.files.list(context.rt.paths.tempDir)).toEqual([]);
    expect(context.files.stats.openReaders + context.files.stats.openWriters).toBe(0);
  });

  it('does not hand out a file that is still being written', async () => {
    const context = await sealed();
    const real = context.files.openWriter.bind(context.files);
    let handedOut: string | null = null;
    context.files.openWriter = (path) => {
      handedOut = path;
      return real(path);
    };
    const playable = unwrap(await context.journal.openAudio('a'));
    // The copy is complete by the time it is returned, and closed.
    expect(playable.uri).toBe(handedOut);
    expectBytes(context.files.get(playable.uri), SPOKEN);
    expect(context.files.stats.openWriters).toBe(0);
    playable.release();
  });

  it('leaves nothing for the next launch to find if it is killed part way', async () => {
    const context = await sealed();
    const { files } = context;
    const clean = unwrap(await context.journal.openAudio('a'));
    const calls = files.stats.trace.length;
    clean.release();
    expect(calls).toBeGreaterThan(10);

    for (let call = 1; call <= calls; call += 1) {
      files.revive();
      files.killAt(call);
      const result = await context.journal.openAudio('a');
      expect(result.ok).toBe(false);

      const next = await relaunch(context);
      await next.journal.recoverLeftovers();
      expect(next.files.list(next.rt.paths.tempDir)).toEqual([]);
      // The sealed recording was never touched.
      expectBytes(next.files.get(context.sealedUri), context.bytes);
      context.journal = next.journal;
      context.rt = next.rt;
    }
  }, 120_000);
});

describe('a recording sealed before audio was framed', () => {
  it('still opens for playback and for export, and is never rewritten', async () => {
    const context = await setup();
    const { files, rt, journal } = context;
    const { input } = await record(context, 'a', take(300_000, 3));
    const audio = unwrap(await journal.attachRecording(input));
    const uri = childUri(rt.paths.audioDir, `${audio.id}.enc`);
    const plain = take(300_000, 3);
    // What the earlier code stored for this recording: one envelope for the whole file.
    const legacy = await rt.vault.sealBytes('audio', audio.id, plain);
    files.put(uri, legacy);
    expect(legacy[0]).toBe(1);
    files.revive();

    const playable = unwrap(await journal.openAudio('a'));
    expectBytes(files.get(playable.uri), plain);
    playable.release();
    const entry = unwrap(await journal.getEntry('a'));
    expectBytes(await journal.readAudio(entry as never), plain);

    expectBytes(files.get(uri), legacy);
    expect(sealedNames(context)).toEqual([`${audio.id}.enc`]);
    expect(files.stats.bytesWritten).toBe(plain.length); // only the playback copy, never the sealed file

    // Not removed by the launch sweep, because a row refers to it.
    expect((await journal.recoverLeftovers()).orphansRemoved).toBe(0);
    expectBytes(files.get(uri), legacy);
  });

  it('is refused, and leaves no plaintext, when altered', async () => {
    const context = await setup();
    const { files, rt, journal } = context;
    const { input } = await record(context, 'a', take(5000, 3));
    const audio = unwrap(await journal.attachRecording(input));
    const uri = childUri(rt.paths.audioDir, `${audio.id}.enc`);
    const legacy = await rt.vault.sealBytes('audio', audio.id, take(5000, 3));
    legacy[200] = (legacy[200] ?? 0) ^ 1;
    files.put(uri, legacy);

    expect((await journal.openAudio('a')).ok).toBe(false);
    expect(files.list(rt.paths.tempDir)).toEqual([]);
  });
});
