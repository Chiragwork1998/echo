// For tests only: synthetic audio built byte by byte, the say-made fixtures, and install tokens.
// No recording of a real person is used anywhere in these tests.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { useStore, createMemoryStore, type QuotaStore } from './store.js';
import { issueToken } from './token.js';

export const SECRET = 'test-install-secret-0123456789abcdef';
export const VOICE_TOKEN = 'test-token';

/** A fixture made with macOS `say` from a sentence written for the purpose. */
export const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', name)));

const ADTS_RATE_INDEX: Record<number, number> = { 48000: 3, 44100: 4, 24000: 6, 16000: 8, 8000: 11 };

/**
 * `count` ADTS frames at `rate`, each `payload` bytes after its 7-byte header, holding `blocks` raw
 * data blocks (1,024 samples each). The payload is noise that never contains a sync word.
 */
export function adtsFrames(count: number, rate = 16000, payload = 40, blocks = 1): Uint8Array<ArrayBuffer> {
  const length = 7 + payload;
  const out = new Uint8Array(count * length);
  for (let frame = 0; frame < count; frame += 1) {
    const at = frame * length;
    out[at] = 0xff;
    out[at + 1] = 0xf1; // MPEG-4, layer 0, no CRC
    out[at + 2] = (1 << 6) | (ADTS_RATE_INDEX[rate]! << 2); // AAC LC, the rate, channel bits 0
    out[at + 3] = (1 << 6) | ((length >> 11) & 3); // one channel
    out[at + 4] = (length >> 3) & 0xff;
    out[at + 5] = ((length & 7) << 5) | 0x1f;
    out[at + 6] = 0xfc | ((blocks - 1) & 3);
    for (let byte = 7; byte < length; byte += 1) out[at + byte] = (frame * 31 + byte * 7) % 0xf0;
  }
  return out;
}

/** A WAV of `samples` frames of 16-bit PCM. `declared` is the data size its header states (the real one by default). */
export function wavBytes({
  rate = 24000,
  channels = 1,
  samples,
  declared,
  bits = 16,
  tag = 1,
}: {
  rate?: number;
  channels?: number;
  samples: number;
  declared?: number;
  bits?: number;
  tag?: number;
}): Uint8Array<ArrayBuffer> {
  const block = channels * Math.ceil(bits / 8);
  const dataBytes = samples * block;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const write = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, tag, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * block, true);
  view.setUint16(32, block, true);
  view.setUint16(34, bits, true);
  write(36, 'data');
  view.setUint32(40, declared ?? dataBytes, true);
  for (let i = 44; i < out.length; i += 1) out[i] = (i * 13) & 0xff;
  return out;
}

export const tokenFor = (installId: string, now = Date.now(), secret = SECRET) =>
  issueToken({ installId }, secret, now).token;

/** A fresh in-memory store for the routes to use, and the environment they need. */
export function freshServer(extra: Record<string, string | undefined> = {}): QuotaStore {
  const store = createMemoryStore();
  useStore({ store, durable: false });
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.ECHO_VOICE_TOKEN = VOICE_TOKEN;
  process.env.ECHO_INSTALL_SECRET = SECRET;
  for (const name of [
    'ECHO_INSTALL_SECRET_PREVIOUS',
    'ECHO_LEGACY_TOKEN',
    'REVENUECAT_SECRET_KEY',
    'ECHO_PLUS_INSTALLS',
    'ECHO_DAILY_AUDIO_SECONDS',
    'ECHO_DAILY_MODEL_CALLS',
    'ECHO_REQUIRE_ATTESTATION',
  ]) {
    delete process.env[name];
  }
  for (const [name, value] of Object.entries(extra)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  return store;
}

/** A multipart upload of `bytes` named `name`, from `token` (an install token) or the shared token. */
export function upload(
  bytes: Uint8Array,
  name: string,
  auth: { install?: string; shared?: string },
  ip = '198.51.100.1',
  style?: string,
) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name));
  if (style) form.set('style', style);
  return new Request('http://x/api/transcribe', {
    method: 'POST',
    headers: {
      'x-forwarded-for': ip,
      ...(auth.install ? { 'x-echo-install-token': auth.install } : {}),
      ...(auth.shared ? { 'x-echo-voice-token': auth.shared } : {}),
    },
    body: form,
  });
}
