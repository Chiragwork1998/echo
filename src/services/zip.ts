import { utf8Encode } from '@/storage/bytes';
import type { FileWriter } from '@/storage/ports';

// A minimal ZIP writer. The share sheet takes one file, and export is JSON plus Markdown plus audio,
// and no zip library is installed. Entries are stored uncompressed: audio does not compress and it
// keeps this small enough to verify. It streams to the file so that a large journal is never held in
// memory all at once.

const VERSION = 20;
const UTF8_FLAG = 0x0800;
const MAX_ZIP32 = 0xffffffff;

export class ZipTooLargeError extends Error {
  constructor() {
    super('archive exceeds the zip32 limit');
    this.name = 'ZipTooLargeError';
  }
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crcTable[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class ZipRecord {
  private readonly view: DataView;
  private offset = 0;
  readonly bytes: Uint8Array;

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }
  u16(value: number) {
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
    return this;
  }
  u32(value: number) {
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
    return this;
  }
  name(bytes: Uint8Array) {
    this.bytes.set(bytes, this.offset);
    this.offset += bytes.length;
    return this;
  }
}

function dosDateTime(at: Date) {
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

type Written = { name: Uint8Array; crc: number; size: number; offset: number };

export type ZipWriter = {
  add(name: string, bytes: Uint8Array): Promise<void>;
  finish(): Promise<void>;
};

export function createZipWriter(sink: FileWriter, at: Date): ZipWriter {
  const { time, date } = dosDateTime(at);
  const written: Written[] = [];
  let offset = 0;

  const emit = async (bytes: Uint8Array) => {
    await sink.write(bytes);
    offset += bytes.length;
    if (offset > MAX_ZIP32) throw new ZipTooLargeError();
  };

  return {
    async add(name, bytes) {
      const nameBytes = utf8Encode(name);
      const crc = crc32(bytes);
      written.push({ name: nameBytes, crc, size: bytes.length, offset });
      const header = new ZipRecord(30 + nameBytes.length)
        .u32(0x04034b50)
        .u16(VERSION)
        .u16(UTF8_FLAG)
        .u16(0)
        .u16(time)
        .u16(date)
        .u32(crc)
        .u32(bytes.length)
        .u32(bytes.length)
        .u16(nameBytes.length)
        .u16(0)
        .name(nameBytes);
      await emit(header.bytes);
      await emit(bytes);
    },
    async finish() {
      const start = offset;
      for (const file of written) {
        const entry = new ZipRecord(46 + file.name.length)
          .u32(0x02014b50)
          .u16(VERSION)
          .u16(VERSION)
          .u16(UTF8_FLAG)
          .u16(0)
          .u16(time)
          .u16(date)
          .u32(file.crc)
          .u32(file.size)
          .u32(file.size)
          .u16(file.name.length)
          .u16(0)
          .u16(0)
          .u16(0)
          .u16(0)
          .u32(0)
          .u32(file.offset)
          .name(file.name);
        await emit(entry.bytes);
      }
      const end = new ZipRecord(22)
        .u32(0x06054b50)
        .u16(0)
        .u16(0)
        .u16(written.length)
        .u16(written.length)
        .u32(offset - start)
        .u32(start)
        .u16(0);
      await emit(end.bytes);
    },
  };
}
