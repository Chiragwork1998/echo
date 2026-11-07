import { crc32 as nodeCrc32 } from 'node:zlib';

import { utf8Encode } from '@/storage/bytes';
import type { FileReader, FileWriter } from '@/storage/ports';
import { expectBytes } from '@/storage/testing/expectBytes';

import { crc32, createZipWriter } from './zip';
import {
  copyZipItem,
  isSafeName,
  readZipIndex,
  readZipItem,
  ZipError,
  type ZipIndex,
  type ZipProblem,
} from './zipReader';

const LIMITS = { maxItems: 100, maxDirectoryBytes: 1024 * 1024 };

type Source = { name: string; bytes: Uint8Array | string };

/** What zip.ts writes, in memory. */
async function zipOf(sources: Source[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const sink: FileWriter = { write: async (bytes) => void chunks.push(bytes.slice()), close() {} };
  const writer = createZipWriter(sink, new Date(2026, 10, 8, 9, 41));
  for (const { name, bytes } of sources) {
    await writer.add(name, typeof bytes === 'string' ? utf8Encode(bytes) : bytes);
  }
  await writer.finish();
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function readerOf(bytes: Uint8Array): FileReader & { reads: number[] } {
  const reads: number[] = [];
  return {
    reads,
    size: bytes.length,
    read: async (offset, length) => {
      reads.push(length);
      return bytes.slice(offset, offset + length);
    },
    close() {},
  };
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Changes every bit of one byte. */
const flip = (bytes: Uint8Array, at: number) => {
  bytes[at] = (bytes[at] ?? 0) ^ 0xff;
};

/** Where each record of a zip from zipOf sits: the central ones, and the local header each names. */
function layout(zip: Uint8Array) {
  const data = view(zip);
  const end = zip.length - 22;
  const count = data.getUint16(end + 10, true);
  const central: number[] = [];
  let cursor = data.getUint32(end + 16, true);
  for (let index = 0; index < count; index += 1) {
    central.push(cursor);
    cursor += 46 + data.getUint16(cursor + 28, true);
  }
  const local = central.map((at) => data.getUint32(at + 42, true));
  return { end, central, local };
}

async function problemOf(task: Promise<unknown>): Promise<ZipProblem | 'none'> {
  try {
    await task;
    return 'none';
  } catch (error) {
    if (error instanceof ZipError) return error.problem;
    throw error;
  }
}

const SOURCES: Source[] = [
  { name: 'entries.json', bytes: '{"app":"ECHO"}' },
  { name: 'audio/one.m4a', bytes: Uint8Array.from({ length: 5000 }, (_, i) => (i * 13) % 256) },
  { name: 'entries.md', bytes: '# ECHO journal' },
];

async function index(zip: Uint8Array, limits = LIMITS): Promise<ZipIndex> {
  return readZipIndex(readerOf(zip), limits);
}

describe('readZipIndex', () => {
  it('reads back what zip.ts writes', async () => {
    const zip = await zipOf(SOURCES);
    const found = await index(zip);
    expect([...found.keys()]).toEqual(['entries.json', 'audio/one.m4a', 'entries.md']);
    const reader = readerOf(zip);
    for (const { name, bytes } of SOURCES) {
      const item = found.get(name);
      if (!item) throw new Error(`missing ${name}`);
      expect(item.stored).toBe(true);
      const expected = typeof bytes === 'string' ? utf8Encode(bytes) : bytes;
      expect(item.crc).toBe(nodeCrc32(expected));
      expectBytes(await readZipItem(reader, item, 1 << 20), expected);
    }
  });

  it('reads the table of contents and no more until asked', async () => {
    const zip = await zipOf(SOURCES);
    const reader = readerOf(zip);
    await readZipIndex(reader, LIMITS);
    // The end record's search window, then the directory. No entry's bytes.
    expect(reader.reads).toHaveLength(2);
  });

  it('finds the end record behind a comment, and not a lookalike inside the comment', async () => {
    const zip = await zipOf(SOURCES);
    const comment = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(30).fill(0x20)]);
    const commented = new Uint8Array(zip.length + comment.length);
    commented.set(zip);
    commented.set(comment, zip.length);
    view(commented).setUint16(zip.length - 2, comment.length, true);
    expect([...(await index(commented)).keys()]).toHaveLength(3);
  });

  it.each([
    ['nothing at all', new Uint8Array(0)],
    ['a few bytes', new Uint8Array([0x50, 0x4b, 0x03, 0x04])],
    ['bytes that are not a zip', Uint8Array.from({ length: 4000 }, (_, i) => i % 251)],
  ])('refuses %s', async (_label, bytes) => {
    expect(await problemOf(index(bytes))).toBe('not_zip');
  });

  it('refuses an archive cut short', async () => {
    const zip = await zipOf(SOURCES);
    expect(await problemOf(index(zip.slice(0, zip.length - 1)))).toBe('not_zip');
    expect(await problemOf(index(zip.slice(0, zip.length - 30)))).toBe('not_zip');
  });

  it('refuses a directory that runs into its own end record', async () => {
    const zip = await zipOf(SOURCES);
    const { end } = layout(zip);
    view(zip).setUint32(end + 12, view(zip).getUint32(end + 12, true) + 10, true);
    expect(await problemOf(index(zip))).toBe('not_zip');
  });

  describe('names that would reach outside the archive', () => {
    it.each([
      '../escape.txt',
      'audio/../../escape.txt',
      '..',
      '/etc/passwd',
      '/audio/one.m4a',
      'C:/Windows/escape.txt',
      'C:escape.txt',
      'audio\\..\\escape.txt',
      '\\\\server\\share',
      'audio//one.m4a',
      './entries.json',
      'audio/./one.m4a',
      'nul\u0000.txt',
      'line\nbreak',
      '',
    ])('refuses %j', async (name) => {
      expect(isSafeName(name)).toBe(false);
      const zip = await zipOf([...SOURCES, { name, bytes: 'x' }]);
      expect(await problemOf(index(zip))).toBe('unsafe_path');
    });

    it.each(['entries.json', 'audio/one.m4a', 'audio/', 'a..b', '...', 'audio/a b.m4a', 'é.json'])(
      'allows %j',
      (name) => {
        expect(isSafeName(name)).toBe(true);
      },
    );

    it('says so before anything else that is wrong with the archive', async () => {
      const zip = await zipOf([
        { name: 'a.txt', bytes: 'a' },
        { name: '../b.txt', bytes: 'b' },
      ]);
      const { central } = layout(zip);
      view(zip).setUint16((central[0] ?? 0) + 10, 8, true); // and the first is compressed
      expect(await problemOf(index(zip))).toBe('unsafe_path');
    });
  });

  it('marks compressed and encrypted entries, which it will not read', async () => {
    const zip = await zipOf(SOURCES);
    const { central, local } = layout(zip);
    view(zip).setUint16((central[0] ?? 0) + 10, 8, true); // deflate
    view(zip).setUint16((local[0] ?? 0) + 8, 8, true);
    view(zip).setUint16((central[1] ?? 0) + 8, 0x0801, true); // encrypted
    const found = await index(zip);
    expect(found.get('entries.json')?.stored).toBe(false);
    expect(found.get('audio/one.m4a')?.stored).toBe(false);
    expect(found.get('entries.md')?.stored).toBe(true);
    const item = found.get('entries.json');
    if (!item) throw new Error('missing');
    expect(await problemOf(readZipItem(readerOf(zip), item, 1 << 20))).toBe('unsupported');
  });

  it.each([
    ['split across disks', (zip: Uint8Array, end: number) => view(zip).setUint16(end + 4, 1, true)],
    [
      'counted differently per disk',
      (zip: Uint8Array, end: number) => view(zip).setUint16(end + 8, 2, true),
    ],
    ['zip64', (zip: Uint8Array, end: number) => view(zip).setUint32(end + 16, 0xffffffff, true)],
  ])('refuses an archive %s', async (_label, patch) => {
    const zip = await zipOf(SOURCES);
    patch(zip, layout(zip).end);
    expect(await problemOf(index(zip))).toBe('unsupported');
  });

  it('refuses an entry whose size has overflowed into zip64', async () => {
    const zip = await zipOf(SOURCES);
    const { central } = layout(zip);
    view(zip).setUint32((central[2] ?? 0) + 20, 0xffffffff, true);
    view(zip).setUint32((central[2] ?? 0) + 24, 0xffffffff, true);
    expect(await problemOf(index(zip))).toBe('unsupported');
  });

  it('refuses more entries, or a bigger table of contents, than allowed', async () => {
    const zip = await zipOf(SOURCES);
    expect(await problemOf(index(zip, { ...LIMITS, maxItems: 2 }))).toBe('too_many');
    expect(await problemOf(index(zip, { ...LIMITS, maxDirectoryBytes: 64 }))).toBe('too_many');
    expect(await problemOf(index(zip, { ...LIMITS, maxItems: 3 }))).toBe('none');
  });

  it('refuses two entries with one name', async () => {
    const zip = await zipOf([...SOURCES, { name: 'entries.json', bytes: '{"app":"other"}' }]);
    expect(await problemOf(index(zip))).toBe('inconsistent');
  });

  it('refuses entries that share bytes', async () => {
    const zip = await zipOf(SOURCES);
    const { central, local } = layout(zip);
    view(zip).setUint32((central[2] ?? 0) + 42, local[1] ?? 0, true);
    expect(await problemOf(index(zip))).toBe('inconsistent');
  });

  it('refuses an entry that claims more bytes than lie before the next', async () => {
    const zip = await zipOf(SOURCES);
    const { central } = layout(zip);
    view(zip).setUint32((central[0] ?? 0) + 20, 400, true);
    view(zip).setUint32((central[0] ?? 0) + 24, 400, true);
    expect(await problemOf(index(zip))).toBe('inconsistent');
  });

  it('refuses a stored entry whose two sizes disagree', async () => {
    const zip = await zipOf(SOURCES);
    const { central } = layout(zip);
    view(zip).setUint32((central[0] ?? 0) + 24, 3, true);
    expect(await problemOf(index(zip))).toBe('inconsistent');
  });

  it('refuses a directory record that is not one', async () => {
    const zip = await zipOf(SOURCES);
    const { central } = layout(zip);
    view(zip).setUint32(central[1] ?? 0, 0x12345678, true);
    expect(await problemOf(index(zip))).toBe('inconsistent');
  });

  it('leaves folders out of the index', async () => {
    const zip = await zipOf([{ name: 'audio/', bytes: '' }, ...SOURCES]);
    expect([...(await index(zip)).keys()]).not.toContain('audio/');
  });
});

describe('reading an entry', () => {
  async function opened(sources = SOURCES) {
    const zip = await zipOf(sources);
    const found = await index(zip);
    const item = (name: string) => {
      const value = found.get(name);
      if (!value) throw new Error(`missing ${name}`);
      return value;
    };
    return { zip, item, layout: layout(zip) };
  }

  it('copies one of any length a chunk at a time, and checks it on the way', async () => {
    const { zip, item } = await opened();
    const reader = readerOf(zip);
    const written: Uint8Array[] = [];
    const writer: FileWriter = {
      write: async (bytes) => void written.push(bytes.slice()),
      close() {},
    };
    await copyZipItem(reader, item('audio/one.m4a'), writer, 700);
    expect(Math.max(...written.map((chunk) => chunk.length))).toBe(700);
    const joined = new Uint8Array(written.reduce((total, chunk) => total + chunk.length, 0));
    written.reduce((at, chunk) => (joined.set(chunk, at), at + chunk.length), 0);
    expectBytes(joined, SOURCES[1]?.bytes as Uint8Array);
    expect(Math.max(...reader.reads)).toBeLessThanOrEqual(700);
  });

  it('says a changed byte is damage, read whole or copied', async () => {
    const { zip, item, layout: at } = await opened();
    flip(zip, (at.local[1] ?? 0) + 30 + 'audio/one.m4a'.length + 100);
    flip(zip, (at.local[0] ?? 0) + 30 + 'entries.json'.length + 2);
    const writer: FileWriter = { write: async () => undefined, close() {} };
    expect(await problemOf(copyZipItem(readerOf(zip), item('audio/one.m4a'), writer))).toBe(
      'damaged',
    );
    expect(await problemOf(readZipItem(readerOf(zip), item('entries.json'), 1 << 20))).toBe(
      'damaged',
    );
  });

  it('refuses a local header that disagrees with the directory', async () => {
    const { zip, item, layout: at } = await opened();
    zip[(at.local[0] ?? 0) + 30] = 'E'.charCodeAt(0); // "Entries.json"
    expect(await problemOf(readZipItem(readerOf(zip), item('entries.json'), 1 << 20))).toBe(
      'inconsistent',
    );
  });

  it('refuses a local header whose extra field pushes the bytes past their span', async () => {
    const { zip, item, layout: at } = await opened();
    view(zip).setUint16((at.local[0] ?? 0) + 28, 40, true);
    expect(await problemOf(readZipItem(readerOf(zip), item('entries.json'), 1 << 20))).toBe(
      'inconsistent',
    );
  });

  it('refuses to read whole anything larger than asked', async () => {
    const { zip, item } = await opened();
    expect(await problemOf(readZipItem(readerOf(zip), item('audio/one.m4a'), 4999))).toBe(
      'too_large',
    );
  });

  it('carries nothing from the file in what it throws', async () => {
    const secret = 'MARKERSECRET';
    const zip = await zipOf([{ name: 'entries.json', bytes: secret }]);
    const item = (await index(zip)).get('entries.json');
    if (!item) throw new Error('missing');
    flip(zip, (layout(zip).local[0] ?? 0) + 30 + 'entries.json'.length);
    const thrown = await readZipItem(readerOf(zip), item, 1 << 20).catch((error: unknown) => error);
    expect(String(thrown)).toBe('ZipError: zip: damaged');
    expect(JSON.stringify(thrown)).not.toContain('SECRET');
  });
});

describe('crc32', () => {
  it('carries on from an earlier piece, as zlib does', () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, index) => (index * 31) % 251);
    const whole = nodeCrc32(bytes);
    expect(crc32(bytes.subarray(40_000), crc32(bytes.subarray(0, 40_000)))).toBe(whole);
    expect(crc32(bytes)).toBe(whole);
  });
});
