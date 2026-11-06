import { bytesEqual, utf8Decode, utf8Encode } from './bytes';
import { DecryptionError, encodeJson, open, seal } from './envelope';
import { nodeAes } from './testing/nodePorts';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const SECRET = 'the thing nobody knows';

async function freshKey() {
  return nodeAes.importKey(await nodeAes.generateKey());
}

describe('utf8', () => {
  const samples = [
    '',
    'plain ascii',
    'naïve café',
    'मैं ठीक हूँ',
    'مرحبا',
    '🌊 tide 🪨',
    'a\nb\tc',
  ];

  it.each(samples)('matches the platform encoder for %j', (text) => {
    expect(Buffer.from(utf8Encode(text))).toEqual(Buffer.from(new TextEncoder().encode(text)));
    expect(utf8Decode(utf8Encode(text))).toBe(text);
  });

  it('survives text long enough to cross chunk boundaries', () => {
    const text = '🌊é'.repeat(5000);
    expect(utf8Decode(utf8Encode(text))).toBe(text);
  });

  it('replaces a lone surrogate instead of corrupting the text around it', () => {
    expect(utf8Decode(utf8Encode('a\ud83db'))).toBe('a�b');
  });

  it('returns a tightly sized buffer for native modules', () => {
    const bytes = utf8Encode('abc');
    expect(bytes.buffer.byteLength).toBe(3);
  });
});

describe('sealed objects', () => {
  it('round trips text and binary', async () => {
    const key = await freshKey();
    const text = utf8Encode('A sentence with मैं and 🌊');
    const binary = Uint8Array.from({ length: 4096 }, (_, index) => index % 256);
    for (const plaintext of [text, binary, new Uint8Array(0)]) {
      const envelope = await seal(nodeAes, key, 'audio', ID, plaintext);
      expect(bytesEqual(await open(nodeAes, key, 'audio', ID, envelope), plaintext)).toBe(true);
    }
  });

  it('does not contain the plaintext', async () => {
    const envelope = await seal(nodeAes, await freshKey(), 'entry', ID, utf8Encode(SECRET));
    expect(Buffer.from(envelope).includes(SECRET)).toBe(false);
  });

  it('rejects a flipped bit anywhere in the object', async () => {
    const key = await freshKey();
    const envelope = await seal(nodeAes, key, 'entry', ID, utf8Encode(SECRET));
    // Every byte: version, nonce, ciphertext, and tag.
    for (let index = 0; index < envelope.length; index += 1) {
      const tampered = envelope.slice();
      tampered[index] = (tampered[index] ?? 0) ^ 0x01;
      await expect(open(nodeAes, key, 'entry', ID, tampered)).rejects.toBeInstanceOf(
        DecryptionError,
      );
    }
  });

  it('rejects a truncated object', async () => {
    const key = await freshKey();
    const envelope = await seal(nodeAes, key, 'entry', ID, utf8Encode(SECRET));
    await expect(
      open(nodeAes, key, 'entry', ID, envelope.slice(0, envelope.length - 1)),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('cannot be moved onto another record', async () => {
    const key = await freshKey();
    const envelope = await seal(nodeAes, key, 'entry', ID, utf8Encode(SECRET));
    await expect(open(nodeAes, key, 'entry', OTHER_ID, envelope)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it('cannot be reinterpreted as another kind of object', async () => {
    const key = await freshKey();
    const envelope = await seal(nodeAes, key, 'entry', ID, utf8Encode(SECRET));
    await expect(open(nodeAes, key, 'reflection', ID, envelope)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it('cannot be opened with another key', async () => {
    const envelope = await seal(nodeAes, await freshKey(), 'entry', ID, utf8Encode(SECRET));
    await expect(open(nodeAes, await freshKey(), 'entry', ID, envelope)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it('uses a unique nonce for every seal, even of identical content', async () => {
    const key = await freshKey();
    const plaintext = encodeJson({ body: 'autosaved again and again' });
    const nonces = new Set<string>();
    const count = 5000;
    for (let index = 0; index < count; index += 1) {
      const envelope = await seal(nodeAes, key, 'entry', ID, plaintext);
      nonces.add(Buffer.from(envelope.slice(1, 13)).toString('hex'));
    }
    expect(nonces.size).toBe(count);
  });

  it('never quotes content in an error', async () => {
    const key = await freshKey();
    const envelope = await seal(nodeAes, key, 'entry', ID, utf8Encode(SECRET));
    const error = await open(nodeAes, key, 'entry', OTHER_ID, envelope).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(DecryptionError);
    expect((error as Error).message).toBe('decryption failed');
    expect(String((error as Error).stack)).not.toContain(SECRET);
  });
});
