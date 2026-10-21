/**
 * Minimal binary/text conversions used by the encryption boundary.
 *
 * Hermes does not guarantee `TextEncoder`, `Buffer` or `btoa`, so the storage
 * layer carries its own UTF-8 and base64 codecs instead of depending on
 * globals. Nothing here touches the network or the filesystem.
 */

export function utf8ToBytes(value: string): Uint8Array {
  const out: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  let result = '';
  let index = 0;
  while (index < bytes.length) {
    const first = bytes[index] as number;
    let code = first;
    let width = 1;
    if (first >= 0xf0) {
      code = first & 0x07;
      width = 4;
    } else if (first >= 0xe0) {
      code = first & 0x0f;
      width = 3;
    } else if (first >= 0xc0) {
      code = first & 0x1f;
      width = 2;
    } else if (first >= 0x80) {
      // Stray continuation byte: substitute rather than corrupt the string.
      result += '\uFFFD';
      index += 1;
      continue;
    }
    if (index + width > bytes.length) {
      result += '\uFFFD';
      break;
    }
    let valid = true;
    for (let offset = 1; offset < width; offset += 1) {
      const continuation = bytes[index + offset] as number;
      if ((continuation & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      code = (code << 6) | (continuation & 0x3f);
    }
    if (!valid) {
      result += '\uFFFD';
      index += 1;
      continue;
    }
    result += String.fromCodePoint(code);
    index += width;
  }
  return result;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const byteA = bytes[index] as number;
    const byteB = bytes[index + 1];
    const byteC = bytes[index + 2];
    const chunk = (byteA << 16) | ((byteB ?? 0) << 8) | (byteC ?? 0);
    output += BASE64_ALPHABET[(chunk >> 18) & 0x3f];
    output += BASE64_ALPHABET[(chunk >> 12) & 0x3f];
    output += byteB === undefined ? '=' : BASE64_ALPHABET[(chunk >> 6) & 0x3f];
    output += byteC === undefined ? '=' : BASE64_ALPHABET[chunk & 0x3f];
  }
  return output;
}

export function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index] as string;
    if (char === '=') {
      break;
    }
    const decoded = BASE64_ALPHABET.indexOf(char);
    if (decoded < 0) {
      continue;
    }
    buffer = (buffer << 6) | decoded;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, '0');
  }
  return output;
}

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
