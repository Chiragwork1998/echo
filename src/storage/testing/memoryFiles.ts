// A whole file system in memory behind FilePort, for tests that need to stop the world. It does what
// nodeFiles does (filePort.contract.test.ts holds both to the same rules) and adds three things a
// real disk cannot give a test:
//
//   - every call is counted, and the size of every buffer that crosses it is recorded, so a test can
//     say how much a piece of code ever asked for at once;
//   - the process can be killed at any call: that call and every later one throws, and nothing any
//     of them would have done happens, which is what a process that has died leaves behind. A
//     write can be torn, landing half its bytes first;
//   - handles are tracked, so a test can see one left open.
//
// Never imported by app code.
import { childUri, type FileInfo, type FilePort, type FileReader, type FileWriter } from '../ports';

export class Killed extends Error {
  constructor() {
    super('the process was killed');
    this.name = 'Killed';
  }
}

class Stored {
  bytes = new Uint8Array(0);
  length = 0;

  append(chunk: Uint8Array) {
    if (this.length + chunk.length > this.bytes.length) {
      const grown = new Uint8Array(Math.max(this.bytes.length * 2, this.length + chunk.length));
      grown.set(this.bytes.subarray(0, this.length));
      this.bytes = grown;
    }
    this.bytes.set(chunk, this.length);
    this.length += chunk.length;
  }

  slice(offset: number, length: number): Uint8Array {
    return this.bytes.slice(Math.min(offset, this.length), Math.min(offset + length, this.length));
  }
}

export type MemoryStats = {
  /** Every counted call, in order. A kill point is a position in this list. */
  trace: string[];
  /** Calls to the whole-file read. Framed code must never make one. */
  wholeReads: number;
  /** The most bytes any one read or write moved. */
  largestRead: number;
  largestWrite: number;
  bytesRead: number;
  bytesWritten: number;
  /** Handles opened and not yet closed. */
  openReaders: number;
  openWriters: number;
};

export type MemoryFiles = FilePort & {
  readonly stats: MemoryStats;
  /** Puts a file in place, as the recorder would have left it. */
  put(uri: string, bytes: Uint8Array): void;
  get(uri: string): Uint8Array | undefined;
  has(uri: string): boolean;
  /** Stops the process at the call with this number, counted from 1 from now. */
  killAt(call: number, options?: { tearWrite?: boolean }): void;
  /** The process dies now, between two calls. */
  killNow(): void;
  /** The process has been restarted: files are as they were left, handles are gone, counts reset. */
  revive(): void;
  readonly dead: boolean;
};

export function createMemoryFiles(): MemoryFiles {
  const contents = new Map<string, Stored>();
  const fresh = (): MemoryStats => ({
    trace: [],
    wholeReads: 0,
    largestRead: 0,
    largestWrite: 0,
    bytesRead: 0,
    bytesWritten: 0,
    openReaders: 0,
    openWriters: 0,
  });
  let stats = fresh();
  let dead = false;
  let kill: { call: number; tearWrite: boolean } | null = null;

  /** Counts a call, and kills the process first if this is the one. */
  function call(name: string, tearing?: () => void): void {
    if (dead) throw new Killed();
    stats.trace.push(name);
    if (kill && stats.trace.length === kill.call) {
      dead = true;
      if (kill.tearWrite) tearing?.();
      throw new Killed();
    }
  }

  const parentOf = (uri: string) => uri.slice(0, uri.lastIndexOf('/'));
  const stored = (uri: string): Stored => {
    const file = contents.get(uri);
    if (!file) throw new Error('no such file');
    return file;
  };

  const port: MemoryFiles = {
    get stats() {
      return stats;
    },
    get dead() {
      return dead;
    },
    put(uri, bytes) {
      const file = new Stored();
      file.append(bytes);
      contents.set(uri, file);
    },
    get(uri) {
      const file = contents.get(uri);
      return file ? file.bytes.slice(0, file.length) : undefined;
    },
    has: (uri) => contents.has(uri),
    killAt(at, options = {}) {
      kill = { call: stats.trace.length + at, tearWrite: options.tearWrite ?? false };
    },
    killNow() {
      dead = true;
    },
    revive() {
      dead = false;
      kill = null;
      stats = fresh();
    },

    async read(uri) {
      call('read');
      stats.wholeReads += 1;
      const file = stored(uri);
      stats.bytesRead += file.length;
      stats.largestRead = Math.max(stats.largestRead, file.length);
      return file.slice(0, file.length);
    },
    size(uri) {
      call('size');
      return stored(uri).length;
    },
    openReader(uri): FileReader {
      call('openReader');
      const file = stored(uri);
      const size = file.length;
      let open = true;
      stats.openReaders += 1;
      return {
        size,
        read: async (offset, length) => {
          call('reader.read');
          const bytes = file.slice(offset, length);
          stats.bytesRead += bytes.length;
          stats.largestRead = Math.max(stats.largestRead, bytes.length);
          return bytes;
        },
        close() {
          if (dead) throw new Killed();
          if (open) stats.openReaders -= 1;
          open = false;
        },
      };
    },
    async writeAtomic(uri, bytes) {
      call('writeAtomic');
      stats.largestWrite = Math.max(stats.largestWrite, bytes.length);
      stats.bytesWritten += bytes.length;
      const pending = new Stored();
      pending.append(bytes);
      contents.set(uri, pending);
    },
    remove(uri) {
      call('remove');
      contents.delete(uri);
    },
    list(directory): FileInfo[] {
      call('list');
      const dir = directory.endsWith('/') ? directory.slice(0, -1) : directory;
      return [...contents.entries()]
        .filter(([uri]) => parentOf(uri) === dir)
        .map(([uri, file]) => ({ uri, name: uri.slice(dir.length + 1), size: file.length }));
    },
    removeDirectory(directory) {
      call('removeDirectory');
      const prefix = childUri(directory, '');
      for (const uri of [...contents.keys()]) if (uri.startsWith(prefix)) contents.delete(uri);
    },
    ensureDirectory() {
      call('ensureDirectory');
    },
    openWriter(uri): FileWriter {
      call('openWriter');
      const file = new Stored();
      contents.set(uri, file);
      let open = true;
      stats.openWriters += 1;
      return {
        write: async (bytes) => {
          call('writer.write', () => file.append(bytes.slice(0, Math.floor(bytes.length / 2))));
          stats.largestWrite = Math.max(stats.largestWrite, bytes.length);
          stats.bytesWritten += bytes.length;
          file.append(bytes);
        },
        close() {
          if (dead) throw new Killed();
          if (open) stats.openWriters -= 1;
          open = false;
        },
      };
    },
    async move(from, to) {
      call('move');
      contents.set(to, stored(from));
      contents.delete(from);
    },
  };
  return port;
}
