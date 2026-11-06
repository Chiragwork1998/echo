// UTF-8 by hand: neither React Native nor Expo's runtime installs TextDecoder, and whether Hermes
// provides it varies by version. A journal must not depend on that, so this is plain code with tests
// against Node's implementation.

const REPLACEMENT = 0xfffd;

export function utf8Encode(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 3);
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code >= 0xd800 && code <= 0xdfff) code = REPLACEMENT;
    if (code < 0x80) {
      out[n++] = code;
    } else if (code < 0x800) {
      out[n++] = 0xc0 | (code >> 6);
      out[n++] = 0x80 | (code & 0x3f);
    } else if (code < 0x10000) {
      out[n++] = 0xe0 | (code >> 12);
      out[n++] = 0x80 | ((code >> 6) & 0x3f);
      out[n++] = 0x80 | (code & 0x3f);
    } else {
      out[n++] = 0xf0 | (code >> 18);
      out[n++] = 0x80 | ((code >> 12) & 0x3f);
      out[n++] = 0x80 | ((code >> 6) & 0x3f);
      out[n++] = 0x80 | (code & 0x3f);
    }
  }
  // slice, not subarray: native modules must receive a tightly sized buffer.
  return out.slice(0, n);
}

const CHUNK = 4096;

export function utf8Decode(bytes: Uint8Array): string {
  let result = '';
  let units: number[] = [];
  const at = (index: number) => bytes[index] ?? 0;
  for (let i = 0; i < bytes.length;) {
    const lead = at(i);
    let code = REPLACEMENT;
    let size = 1;
    if (lead < 0x80) {
      code = lead;
    } else if (lead >= 0xc2 && lead < 0xe0) {
      code = ((lead & 0x1f) << 6) | (at(i + 1) & 0x3f);
      size = 2;
    } else if (lead >= 0xe0 && lead < 0xf0) {
      code = ((lead & 0x0f) << 12) | ((at(i + 1) & 0x3f) << 6) | (at(i + 2) & 0x3f);
      size = 3;
    } else if (lead >= 0xf0 && lead < 0xf5) {
      code =
        ((lead & 0x07) << 18) |
        ((at(i + 1) & 0x3f) << 12) |
        ((at(i + 2) & 0x3f) << 6) |
        (at(i + 3) & 0x3f);
      size = 4;
    }
    i += size;
    if (code >= 0x10000) {
      code -= 0x10000;
      units.push(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      units.push(code);
    }
    if (units.length >= CHUNK) {
      result += String.fromCharCode(...units);
      units = [];
    }
  }
  return result + String.fromCharCode(...units);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * The same bytes in a buffer of exactly their length. Native modules take a buffer whole, so a view
 * into a larger one would hand them everything around it. A copy only when that is the case.
 */
export function tight(bytes: Uint8Array): Uint8Array {
  return bytes.byteOffset === 0 && bytes.buffer.byteLength === bytes.length ? bytes : bytes.slice();
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let start = 0;
  // Four bytes at a time where both start on a four-byte boundary, as buffers from native modules
  // do. Verifying a 4 MB audio frame is otherwise four million trips round a loop on Hermes, which
  // has no JIT, with the screen waiting on it.
  if (a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0) {
    const words = a.length >>> 2;
    const x = new Uint32Array(a.buffer, a.byteOffset, words);
    const y = new Uint32Array(b.buffer, b.byteOffset, words);
    for (let i = 0; i < words; i += 1) if (x[i] !== y[i]) return false;
    start = words * 4;
  }
  for (let i = start; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
