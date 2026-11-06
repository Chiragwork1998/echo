// One set of rules for every FilePort, so that the in-memory one the other tests lean on behaves like
// the disk, and the disk like the device's handles (see nativeFiles.test.ts for those).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { childUri, type FilePort } from './ports';
import { createMemoryFiles, Killed } from './testing/memoryFiles';
import { nodeFiles } from './testing/nodePorts';

const bytes = (...values: number[]) => Uint8Array.from(values);
const sequence = (length: number) => Uint8Array.from({ length }, (_, index) => index % 251);

describe.each([
  ['disk', () => ({ files: nodeFiles as FilePort, root: mkdtempSync(join(tmpdir(), 'echo-fp-')) })],
  ['memory', () => ({ files: createMemoryFiles() as FilePort, root: '/memory' })],
])('FilePort: %s', (_name, make) => {
  let files: FilePort;
  let root: string;

  beforeEach(() => {
    ({ files, root } = make());
  });
  afterEach(() => {
    if (root.startsWith(tmpdir())) rmSync(root, { recursive: true, force: true });
  });

  const write = async (uri: string, content: Uint8Array) => {
    const writer = files.openWriter(uri);
    await writer.write(content);
    writer.close();
  };

  it('writes through a writer, creating the folders, and reports the size', async () => {
    const uri = childUri(join(root, 'a', 'b'), 'file.bin');
    const writer = files.openWriter(uri);
    await writer.write(bytes(1, 2, 3));
    await writer.write(bytes(4, 5));
    writer.close();
    expect(files.size(uri)).toBe(5);
    expect([...(await files.read(uri))]).toEqual([1, 2, 3, 4, 5]);
  });

  it('empties a file that is opened for writing again', async () => {
    const uri = childUri(root, 'file.bin');
    await write(uri, sequence(100));
    await write(uri, bytes(9));
    expect(files.size(uri)).toBe(1);
  });

  it('reads a range, in a buffer of exactly that size', async () => {
    const uri = childUri(root, 'file.bin');
    await write(uri, sequence(1000));
    const reader = files.openReader(uri);
    expect(reader.size).toBe(1000);
    const slice = await reader.read(250, 100);
    expect(slice).toEqual(sequence(1000).slice(250, 350));
    expect(slice.buffer.byteLength).toBe(100);
    reader.close();
  });

  it('reads in any order from one handle', async () => {
    const uri = childUri(root, 'file.bin');
    await write(uri, sequence(300));
    const reader = files.openReader(uri);
    expect(await reader.read(200, 10)).toEqual(sequence(300).slice(200, 210));
    expect(await reader.read(0, 10)).toEqual(sequence(300).slice(0, 10));
    expect(await reader.read(100, 10)).toEqual(sequence(300).slice(100, 110));
    reader.close();
  });

  it('returns fewer bytes only where the file ends, and none past it', async () => {
    const uri = childUri(root, 'file.bin');
    await write(uri, sequence(100));
    const reader = files.openReader(uri);
    expect((await reader.read(90, 50)).length).toBe(10);
    expect((await reader.read(100, 50)).length).toBe(0);
    expect((await reader.read(500, 50)).length).toBe(0);
    reader.close();
  });

  it('closes a handle twice without complaint', async () => {
    const uri = childUri(root, 'file.bin');
    await write(uri, sequence(10));
    const reader = files.openReader(uri);
    reader.close();
    expect(() => reader.close()).not.toThrow();
    const writer = files.openWriter(uri);
    writer.close();
    expect(() => writer.close()).not.toThrow();
  });

  it('refuses the size of, and a reader on, a file that is not there', () => {
    const uri = childUri(root, 'missing.bin');
    expect(() => files.size(uri)).toThrow();
    expect(() => files.openReader(uri)).toThrow();
  });

  it('moves a file over another in one step', async () => {
    const from = childUri(root, 'from.bin');
    const to = childUri(root, 'sub/to.bin');
    await write(from, bytes(1, 2, 3));
    await write(to, bytes(9, 9, 9, 9, 9));
    await files.move(from, to);
    expect([...(await files.read(to))]).toEqual([1, 2, 3]);
    expect(files.list(root).map((file) => file.name)).toEqual([]);
  });

  it('keeps a reader on the file it opened when the name is moved over', async () => {
    const from = childUri(root, 'from.bin');
    const to = childUri(root, 'to.bin');
    await write(to, bytes(7, 7, 7));
    await write(from, bytes(1, 2, 3));
    const reader = files.openReader(to);
    await files.move(from, to);
    expect([...(await reader.read(0, 3))]).toEqual([7, 7, 7]);
    reader.close();
  });

  it('lists files with their sizes, and removes one without complaint twice', async () => {
    const uri = childUri(root, 'one.bin');
    await write(uri, bytes(1, 2));
    expect(files.list(root)).toEqual([{ uri, name: 'one.bin', size: 2 }]);
    files.remove(uri);
    expect(() => files.remove(uri)).not.toThrow();
    expect(files.list(root)).toEqual([]);
  });
});

describe('the in-memory port, as a test instrument', () => {
  it('kills the process at the call asked for, and every call after it', async () => {
    const files = createMemoryFiles();
    files.put('/a', bytes(1));
    files.killAt(2);
    expect(files.size('/a')).toBe(1);
    expect(() => files.size('/a')).toThrow(Killed);
    expect(files.dead).toBe(true);
    expect(() => files.size('/a')).toThrow(Killed);
    expect(() => files.remove('/a')).toThrow(Killed);
    expect(files.has('/a')).toBe(true);
  });

  it('can tear a write, landing half of it before the kill', async () => {
    const files = createMemoryFiles();
    const writer = files.openWriter('/a');
    files.killAt(1, { tearWrite: true });
    await expect(writer.write(sequence(10))).rejects.toThrow(Killed);
    expect(files.get('/a')).toEqual(sequence(10).slice(0, 5));
  });

  it('counts the handles left open and the largest buffer moved', async () => {
    const files = createMemoryFiles();
    files.put('/a', sequence(100));
    const reader = files.openReader('/a');
    await reader.read(0, 40);
    expect(files.stats.openReaders).toBe(1);
    expect(files.stats.largestRead).toBe(40);
    reader.close();
    expect(files.stats.openReaders).toBe(0);
  });
});
