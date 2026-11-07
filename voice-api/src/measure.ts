// How much sound a recording holds, worked out from the file itself and never from anything the
// phone says about it. This is what an allowance is counted in, so every rule here errs towards
// counting more: a file is measured the way a decoder would read it, and a file that cannot be
// measured with confidence is refused rather than guessed at. Nothing here looks at the sound itself.
//
// Every read goes through a DataView on the array's own range (byteOffset and byteLength), never on
// `.buffer` alone: a small Node Buffer is a view into a pool shared with the rest of the process.

export type Measured = { ms: number; format: 'wav' | 'adts' | 'mp4' };

/** Milliseconds of sound in `samples` at `rate`, rounded up: a part of a millisecond counts. */
const toMs = (samples: number, rate: number) => Math.ceil((samples * 1000) / rate);

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const fourcc = (bytes: Uint8Array, at: number) =>
  at + 4 <= bytes.length ? String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!) : '';

// ---------------------------------------------------------------------------------------------
// WAV

const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

/**
 * A WAV of plain samples (PCM or float). The samples are taken to run from the start of the data to
 * the end of the file, whatever size the header gives them: the app's own WAV can carry a size of
 * zero, or one that lags the file, after a crash (src/services/wav.ts), and a decoder reading on to
 * the end hears all of it. So nothing after the header can be hidden from the count. Compressed WAVs,
 * a second format chunk, and formats no phone records are refused.
 */
export function wavMs(bytes: Uint8Array): number | null {
  if (bytes.length < 44 || fourcc(bytes, 0) !== 'RIFF' || fourcc(bytes, 8) !== 'WAVE') return null;
  const view = viewOf(bytes);
  let format: { rate: number; block: number } | null = null;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = fourcc(bytes, at);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ') {
      // A second format could be the one a decoder believes. Only one is accepted.
      if (format || size < 16 || at + 8 + size > bytes.length) return null;
      let tag = view.getUint16(at + 8, true);
      const channels = view.getUint16(at + 10, true);
      const rate = view.getUint32(at + 12, true);
      const block = view.getUint16(at + 20, true);
      const bits = view.getUint16(at + 22, true);
      if (tag === EXTENSIBLE) {
        // The real format is the first two bytes of the sub-format GUID.
        if (size < 40) return null;
        tag = view.getUint16(at + 32, true);
      }
      const width = Math.ceil(bits / 8);
      const plain =
        (tag === PCM && [8, 16, 24, 32].includes(bits)) || (tag === FLOAT && [32, 64].includes(bits));
      if (!plain || channels < 1 || channels > 8 || rate < 8_000 || rate > 192_000) return null;
      if (block !== channels * width) return null;
      format = { rate, block };
    } else if (id === 'data') {
      if (!format) return null;
      const dataBytes = bytes.length - (at + 8);
      return toMs(Math.floor(dataBytes / format.block), format.rate);
    }
    // Chunks are padded to an even length.
    at += 8 + size + (size % 2);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// ADTS (.aac), which Android records

const ADTS_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** An ID3v2 tag at the start, which a decoder skips: its length, or 0. */
function id3Length(bytes: Uint8Array): number {
  if (bytes.length < 10 || fourcc(bytes, 0).slice(0, 3) !== 'ID3') return 0;
  // Four bytes of seven bits each, then the ten bytes of the header, and ten more if a footer is flagged.
  const size =
    ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f);
  return 10 + size + (bytes[5]! & 0x10 ? 10 : 0);
}

/**
 * Every frame, found the way ffmpeg's ADTS reader finds them (the server turns .aac into FLAC with
 * it, src/audio.ts): from each sync word it takes the frame its header describes and goes on from
 * the end of it, and anywhere else it moves on a byte at a time until the next sync word. So a frame
 * that ffmpeg would decode is a frame counted here, junk before, between or after frames included.
 * Each frame holds 1,024 samples for each raw data block, at the rate its own header gives. A last
 * frame cut short by the end of the file is counted whole.
 */
export function adtsMs(bytes: Uint8Array): number | null {
  const samplesAt = new Map<number, number>();
  let frames = 0;
  let at = id3Length(bytes);
  while (at + 7 <= bytes.length) {
    if (bytes[at] !== 0xff || (bytes[at + 1]! & 0xf6) !== 0xf0) {
      at += 1;
      continue;
    }
    const b2 = bytes[at + 2]!;
    const length = ((bytes[at + 3]! & 3) << 11) | (bytes[at + 4]! << 3) | (bytes[at + 5]! >> 5);
    if (length < 7) {
      at += 1;
      continue;
    }
    const rate = ADTS_RATES[(b2 >> 2) & 0xf];
    // A rate no decoder knows makes no sound. Its frame is passed over as a decoder passes over it.
    if (rate !== undefined) {
      const blocks = (bytes[at + 6]! & 3) + 1;
      samplesAt.set(rate, (samplesAt.get(rate) ?? 0) + 1024 * blocks);
      frames += 1;
    }
    at += length;
  }
  if (frames === 0) return null;
  let ms = 0;
  for (const [rate, samples] of samplesAt) ms += toMs(samples, rate);
  return ms;
}

// ---------------------------------------------------------------------------------------------
// MP4 (.m4a), which iOS records

type Box = { type: string; start: number; end: number };

/** The boxes inside [from, to). null if one claims to run past its parent, which a real file never does. */
function boxes(bytes: Uint8Array, view: DataView, from: number, to: number): Box[] | null {
  const found: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at, false);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) return null;
      const large = view.getBigUint64(at + 8, false);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) return null;
    found.push({ type: fourcc(bytes, at + 4), start: at + header, end: at + size });
    at += size;
  }
  return found;
}

const child = (list: Box[] | null, type: string) => list?.find((box) => box.type === type) ?? null;

/**
 * Every sound track, measured by its time-to-sample table, which is what a decoder plays, and by the
 * duration its header states, whichever is longer. Tracks are added together, so a second track
 * cannot be hidden. A fragmented file keeps its timing elsewhere, and is refused.
 */
export function mp4Ms(bytes: Uint8Array): number | null {
  const view = viewOf(bytes);
  const top = boxes(bytes, view, 0, bytes.length);
  if (!top || top.some(({ type }) => type === 'moof' || type === 'mvex')) return null;
  const moov = child(top, 'moov');
  if (!moov) return null;
  const inMoov = boxes(bytes, view, moov.start, moov.end);
  if (!inMoov || inMoov.some(({ type }) => type === 'mvex')) return null;

  let ms = 0;
  let tracks = 0;
  for (const trak of inMoov.filter(({ type }) => type === 'trak')) {
    const mdia = child(boxes(bytes, view, trak.start, trak.end), 'mdia');
    if (!mdia) return null;
    const inMdia = boxes(bytes, view, mdia.start, mdia.end);
    const hdlr = child(inMdia, 'hdlr');
    const mdhd = child(inMdia, 'mdhd');
    if (!hdlr || !mdhd || hdlr.end - hdlr.start < 12) return null;
    if (fourcc(bytes, hdlr.start + 8) !== 'soun') continue;

    const version = bytes[mdhd.start];
    const long = version === 1;
    if (mdhd.end - mdhd.start < (long ? 32 : 20)) return null;
    const timescale = view.getUint32(mdhd.start + (long ? 20 : 12), false);
    const stated = long
      ? Number(view.getBigUint64(mdhd.start + 24, false))
      : view.getUint32(mdhd.start + 16, false);
    if (timescale === 0) return null;

    const minf = child(inMdia, 'minf');
    const stbl = minf && child(boxes(bytes, view, minf.start, minf.end), 'stbl');
    const stts = stbl && child(boxes(bytes, view, stbl.start, stbl.end), 'stts');
    if (!stts || stts.end - stts.start < 8) return null;
    const entries = view.getUint32(stts.start + 4, false);
    if (stts.start + 8 + entries * 8 > stts.end) return null;
    let played = 0;
    for (let index = 0; index < entries; index += 1) {
      const at = stts.start + 8 + index * 8;
      played += view.getUint32(at, false) * view.getUint32(at + 4, false);
    }
    // A duration of all ones means "unknown" in the header, and the table is what is played.
    const header = stated === 0xffffffff ? 0 : stated;
    ms += toMs(Math.max(played, header), timescale);
    tracks += 1;
  }
  return tracks > 0 ? ms : null;
}

// ---------------------------------------------------------------------------------------------

/**
 * The sound in a recording, by the name it was sent under, which is also how the server treats it
 * (src/audio.ts sends .aac through ffmpeg as ADTS). Null for a file that is not what its name says,
 * or a format that cannot be measured without decoding it: such a file is refused, not guessed.
 */
export function measure(bytes: Uint8Array, filename: string): Measured | null {
  const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
  const read = (format: Measured['format'], ms: number | null): Measured | null =>
    ms === null ? null : { ms, format };
  switch (extension) {
    case 'wav':
      return read('wav', wavMs(bytes));
    case 'aac':
      return read('adts', adtsMs(bytes));
    case 'm4a':
    case 'mp4':
      return read('mp4', mp4Ms(bytes));
    default:
      return null;
  }
}
