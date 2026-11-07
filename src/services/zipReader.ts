// A defensive reader for the zips ECHO writes (zip.ts): entries stored as they are, with no
// compression, no encryption and no zip64. It reads a range at a time through FileReader, so an
// archive of any length is never held in memory, and it trusts nothing in the file: every offset,
// size and name is checked against the others before a byte is used. What it refuses is named by a
// ZipProblem, and none of its errors carries anything read from the file.
import { bytesEqual, utf8Decode } from '@/storage/bytes';
import type { FileReader, FileWriter } from '@/storage/ports';

import { crc32 } from './zip';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;
const CENTRAL_BYTES = 46;
const LOCAL_BYTES = 30;
/** Bit 0 is the old zip encryption and bit 6 the strong one. */
const ENCRYPTED = 0x0001 | 0x0040;
const STORED = 0;
/** What zip64 writes in a 32-bit field that has overflowed into its extra record. */
const ZIP64_COUNT = 0xffff;
const ZIP64_FIELD = 0xffffffff;
const MAX_NAME_BYTES = 1024;
/** How much of an entry is read at a time when it is copied out. */
export const COPY_CHUNK_BYTES = 1024 * 1024;

export type ZipProblem =
  /** Not a zip, or one cut short. */
  | 'not_zip'
  /** A zip of a kind ECHO never writes: split across disks, or zip64. */
  | 'unsupported'
  /** A name that reaches outside the archive: absolute, a drive, a backslash, or "..". */
  | 'unsafe_path'
  /** More entries, or a bigger directory, than the caller allows. */
  | 'too_many'
  /** Larger than the caller allows. */
  | 'too_large'
  /** Records that contradict each other: duplicate names, shared bytes, sizes that do not fit. */
  | 'inconsistent'
  /** The bytes are not the ones the archive recorded: the checksum does not match. */
  | 'damaged';

/** Carries nothing from the file: errors can reach logs and crash reports. */
export class ZipError extends Error {
  constructor(readonly problem: ZipProblem) {
    super(`zip: ${problem}`);
    this.name = 'ZipError';
  }
}

export type ZipItem = {
  name: string;
  /** False when compressed or encrypted, neither of which ECHO writes or reads. */
  stored: boolean;
  /** Its length in the archive, which for a stored entry is its length. */
  size: number;
  crc: number;
  /** Where its local header starts. */
  headerOffset: number;
  /** Its bytes end by here: at the next entry's header, or at the central directory. */
  limit: number;
  nameBytes: Uint8Array;
};

/** Files by name. Folders are left out: nothing is ever read from one. */
export type ZipIndex = Map<string, ZipItem>;

export type IndexLimits = { maxItems: number; maxDirectoryBytes: number };

const viewOf = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * A name that stays inside the archive wherever it might be unpacked: relative, forward slashes only,
 * no drive, no control characters, and no segment that is empty, "." or "..". A trailing slash, which
 * marks a folder, is the one empty segment allowed. ECHO never unpacks by name, so this is a refusal
 * of an archive that was made to try it, not the only thing standing between it and a write.
 */
export function isSafeName(name: string): boolean {
  if (name.length === 0) return false;
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (code < 0x20 || code === 0x7f || code === 0x5c) return false;
  }
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false;
  const parts = name.split('/');
  if (name.endsWith('/')) parts.pop();
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

/** The end of central directory record, found from the end of the file. */
async function findEnd(reader: FileReader): Promise<{ at: number; record: DataView }> {
  if (reader.size < EOCD_BYTES) throw new ZipError('not_zip');
  const tailLength = Math.min(reader.size, EOCD_BYTES + MAX_COMMENT_BYTES);
  const tailStart = reader.size - tailLength;
  const tail = await reader.read(tailStart, tailLength);
  if (tail.length !== tailLength) throw new ZipError('not_zip');
  const view = viewOf(tail);
  // The record whose comment reaches exactly to the end, so a signature inside a comment is not it.
  for (let at = tail.length - EOCD_BYTES; at >= 0; at -= 1) {
    if (view.getUint32(at, true) !== EOCD_SIGNATURE) continue;
    if (at + EOCD_BYTES + view.getUint16(at + 20, true) !== tail.length) continue;
    return {
      at: tailStart + at,
      record: new DataView(tail.buffer, tail.byteOffset + at, EOCD_BYTES),
    };
  }
  throw new ZipError('not_zip');
}

type Span = { headerOffset: number; nameBytes: number; size: number; item: ZipItem | null };

/**
 * Reads the central directory and checks it whole before anything is trusted: every name is safe,
 * none repeats, and every entry's bytes lie before the directory without touching another's. Problems
 * are reported in order of weight, so an archive with a name that escapes says so, whatever else is
 * wrong with it.
 */
export async function readZipIndex(reader: FileReader, limits: IndexLimits): Promise<ZipIndex> {
  const end = await findEnd(reader);
  const { record } = end;
  const disk = record.getUint16(4, true);
  const directoryDisk = record.getUint16(6, true);
  const onThisDisk = record.getUint16(8, true);
  const count = record.getUint16(10, true);
  const directoryBytes = record.getUint32(12, true);
  const directoryOffset = record.getUint32(16, true);
  if (disk !== 0 || directoryDisk !== 0 || onThisDisk !== count) throw new ZipError('unsupported');
  if (count === ZIP64_COUNT || directoryBytes === ZIP64_FIELD || directoryOffset === ZIP64_FIELD) {
    throw new ZipError('unsupported');
  }
  if (count > limits.maxItems || directoryBytes > limits.maxDirectoryBytes) {
    throw new ZipError('too_many');
  }
  if (directoryOffset + directoryBytes > end.at) throw new ZipError('not_zip');
  const directory = await reader.read(directoryOffset, directoryBytes);
  if (directory.length !== directoryBytes) throw new ZipError('not_zip');

  const view = viewOf(directory);
  const index: ZipIndex = new Map();
  const spans: Span[] = [];
  let unsafe = false;
  let zip64 = false;
  let inconsistent = false;
  let cursor = 0;
  for (let entry = 0; entry < count; entry += 1) {
    if (cursor + CENTRAL_BYTES > directory.length) throw new ZipError('inconsistent');
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) throw new ZipError('inconsistent');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const packed = view.getUint32(cursor + 20, true);
    const length = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const startDisk = view.getUint16(cursor + 34, true);
    const headerOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + CENTRAL_BYTES;
    cursor = nameStart + nameLength + extraLength + commentLength;
    if (cursor > directory.length) throw new ZipError('inconsistent');

    const nameBytes = directory.slice(nameStart, nameStart + nameLength);
    const name = utf8Decode(nameBytes);
    if (nameLength > MAX_NAME_BYTES || !isSafeName(name)) {
      unsafe = true;
      continue;
    }
    if (
      startDisk !== 0 ||
      packed === ZIP64_FIELD ||
      length === ZIP64_FIELD ||
      headerOffset === ZIP64_FIELD
    ) {
      zip64 = true;
      continue;
    }
    const stored = method === STORED && (flags & ENCRYPTED) === 0;
    if (stored && packed !== length) inconsistent = true;
    const span: Span = { headerOffset, nameBytes: nameLength, size: packed, item: null };
    spans.push(span);
    if (name.endsWith('/')) continue;
    if (index.has(name)) inconsistent = true;
    span.item = { name, stored, size: packed, crc, headerOffset, limit: 0, nameBytes };
    index.set(name, span.item);
  }
  if (unsafe) throw new ZipError('unsafe_path');
  if (zip64) throw new ZipError('unsupported');
  if (inconsistent) throw new ZipError('inconsistent');

  // In the order they sit in the file, each entry's header, name and bytes must end before the next
  // entry starts, and the last before the directory. Overlapping entries are how archives are made to
  // say two things at once.
  spans.sort((a, b) => a.headerOffset - b.headerOffset);
  spans.forEach((span, position) => {
    const limit = spans[position + 1]?.headerOffset ?? directoryOffset;
    if (span.headerOffset + LOCAL_BYTES + span.nameBytes + span.size > limit) {
      throw new ZipError('inconsistent');
    }
    if (span.item) span.item.limit = limit;
  });
  return index;
}

/**
 * Where an entry's bytes start, from its local header, which must agree with the directory: the same
 * name, stored, not encrypted, and short enough to end within the entry's own span.
 */
async function dataStart(reader: FileReader, item: ZipItem): Promise<number> {
  const headerLength = LOCAL_BYTES + item.nameBytes.length;
  const header = await reader.read(item.headerOffset, headerLength);
  if (header.length !== headerLength) throw new ZipError('inconsistent');
  const view = viewOf(header);
  if (
    view.getUint32(0, true) !== LOCAL_SIGNATURE ||
    (view.getUint16(6, true) & ENCRYPTED) !== 0 ||
    view.getUint16(8, true) !== STORED ||
    view.getUint16(26, true) !== item.nameBytes.length ||
    !bytesEqual(header.subarray(LOCAL_BYTES), item.nameBytes)
  ) {
    throw new ZipError('inconsistent');
  }
  const start = item.headerOffset + headerLength + view.getUint16(28, true);
  if (start + item.size > item.limit) throw new ZipError('inconsistent');
  return start;
}

/** A small entry, whole, once its checksum has matched. */
export async function readZipItem(
  reader: FileReader,
  item: ZipItem,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!item.stored) throw new ZipError('unsupported');
  if (item.size > maxBytes) throw new ZipError('too_large');
  const start = await dataStart(reader, item);
  const bytes = await reader.read(start, item.size);
  if (bytes.length !== item.size || crc32(bytes) !== item.crc) throw new ZipError('damaged');
  return bytes;
}

/**
 * An entry of any length, copied to `writer` a chunk at a time. Rejects with `damaged` once the end
 * is reached if the checksum does not match, so the caller must treat what was written as unproven
 * until this resolves.
 */
export async function copyZipItem(
  reader: FileReader,
  item: ZipItem,
  writer: FileWriter,
  chunkBytes: number = COPY_CHUNK_BYTES,
): Promise<void> {
  if (!item.stored) throw new ZipError('unsupported');
  const start = await dataStart(reader, item);
  let crc = 0;
  for (let done = 0; done < item.size;) {
    const length = Math.min(chunkBytes, item.size - done);
    const bytes = await reader.read(start + done, length);
    if (bytes.length !== length) throw new ZipError('damaged');
    crc = crc32(bytes, crc);
    await writer.write(bytes);
    done += length;
  }
  if (crc !== item.crc) throw new ZipError('damaged');
}
