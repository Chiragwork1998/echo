import type { JournalResult, PlayableAudio } from '@/features/journal/types';

import {
  bytesPart,
  MAX_UPLOAD_BYTES,
  PIECE_BYTES,
  PIECE_CONCURRENCY,
  PIECE_SECONDS,
  pieceTimeoutMs,
  refineWords,
  TOKEN_HEADER,
  TRANSCRIBE_TIMEOUT_MS,
  transcribeEntryAudio,
  voiceEndpoint,
  type RefineDeps,
  type TranscribeDeps,
  type TranscriptionErrorCode,
} from './transcription';
import { wavHeader } from './wav';

jest.mock('@/features/journal/api', () => ({ openEntryAudio: jest.fn() }));

const URL_LOCAL = 'http://127.0.0.1:8787';
const TOKEN = 'test-token';
const SPOKEN = 'Honestly, I have been carrying this for weeks.';

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('not json');
      return body;
    },
  }) as Response;
const good = { text: SPOKEN, raw: 'um honestly', polished: true, languages: ['en'], seconds: 4.2 };

// Jest's FormData is not Expo's. This keeps every part, and the filename it was appended with.
class RecordedForm {
  parts: [string, unknown, string?][] = [];
  append(name: string, value: unknown, filename?: string) {
    this.parts.push(filename === undefined ? [name, value] : [name, value, filename]);
  }
}
const sentParts = (init: RequestInit) => (init.body as unknown as RecordedForm).parts;
const RealFormData = global.FormData;
beforeAll(() => {
  global.FormData = RecordedForm as unknown as typeof FormData;
});
afterAll(() => {
  global.FormData = RealFormData;
});

let release: jest.Mock;
let open: jest.Mock;
let send: jest.Mock;
let status: TranscribeDeps['status'];

function audioAt(uri: string): JournalResult<PlayableAudio> {
  return { ok: true, value: { uri, release } };
}
// A part Expo's fetch can read has bytes(): an expo-file-system File. The tests stand one in.
const filePart = (uri: string) =>
  ({ uri, bytes: async () => new Uint8Array([1]) }) as unknown as Blob;
const run = (overrides: Partial<TranscribeDeps> = {}, options = {}) =>
  transcribeEntryAudio(
    'draft-1',
    { open, ...options },
    {
      fetch: send,
      url: URL_LOCAL,
      token: TOKEN,
      status,
      filePart,
      style: () => 'exact',
      online: async () => true,
      ...overrides,
    },
  );
const failedWith = async (promise: ReturnType<typeof run>) => {
  const result = await promise;
  if (result.ok) throw new Error('expected a failure');
  return result.error;
};

beforeEach(() => {
  release = jest.fn();
  open = jest.fn(async () => audioAt('file:///cache/echo/take.aac'));
  send = jest.fn(async () => reply(200, good));
  status = () => 'allowed';
});

describe('voiceEndpoint', () => {
  it.each([
    ['https://voice.example.com', 'https://voice.example.com/api/transcribe'],
    ['https://voice.example.com/', 'https://voice.example.com/api/transcribe'],
    ['HTTPS://Voice.Example.com:8443', 'https://voice.example.com:8443/api/transcribe'],
    ['http://127.0.0.1:8787', 'http://127.0.0.1:8787/api/transcribe'],
    ['http://localhost:8787', 'http://localhost:8787/api/transcribe'],
    ['http://localhost', 'http://localhost/api/transcribe'],
  ])('accepts %s', (raw, expected) => {
    expect(voiceEndpoint(raw)).toBe(expected);
  });

  it.each([
    'http://voice.example.com',
    'http://10.0.2.2:8787',
    'http://192.168.1.20:8787',
    'http://127.0.0.1.example.com',
    'http://localhost@example.com',
    'http://127.0.0.1@example.com',
    'https://user:pass@example.com',
    'http://[::1]:8787',
    'ftp://example.com',
    'https://example.com/api/transcribe',
    'https://example.com?x=1',
    'example.com',
    '',
    '   ',
    undefined,
  ])('refuses %p', (raw) => {
    expect(voiceEndpoint(raw)).toBeNull();
  });
});

describe('request building', () => {
  it('posts the recording as multipart with the token header and nothing else', async () => {
    const result = await run();
    expect(result).toEqual({
      ok: true,
      value: { text: SPOKEN, polished: true, languages: ['en'], seconds: 4.2 },
    });
    expect(open).toHaveBeenCalledWith('draft-1');
    expect(send).toHaveBeenCalledTimes(1);
    const [endpoint, init] = send.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('http://127.0.0.1:8787/api/transcribe');
    expect(init.method).toBe('POST');
    // No Content-Type: React Native adds the multipart boundary itself.
    expect(init.headers).toEqual({ [TOKEN_HEADER]: TOKEN, Accept: 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // A file Expo's fetch can read (it has bytes()), named for an extension the server accepts, and
    // the words the person asked for. Never React Native's { uri, name, type } part.
    expect(sentParts(init)).toEqual([
      ['file', expect.objectContaining({ uri: 'file:///cache/echo/take.aac' }), 'speech.aac'],
      ['style', 'exact'],
    ]);
    expect(typeof (sentParts(init)[0]?.[1] as { bytes: unknown }).bytes).toBe('function');
  });

  it('asks for tidy words only when Tidy my words is on', async () => {
    await run({ style: () => 'tidy' });
    expect(sentParts(send.mock.calls[0]![1] as RequestInit)[1]).toEqual(['style', 'tidy']);
  });

  it.each([
    ['file:///cache/take.m4a', 'speech.m4a', 'audio/mp4'],
    ['file:///cache/take.AAC', 'speech.aac', 'audio/aac'],
    ['file:///cache/take.wav', 'speech.wav', 'audio/wav'],
  ])('names %s as %s, an extension the server accepts', async (uri, name, type) => {
    open.mockResolvedValue(audioAt(uri));
    await run();
    const [, init] = send.mock.calls[0] as [string, RequestInit];
    expect(sentParts(init)[0]?.[2]).toBe(name);
    expect(type).toMatch(/^audio\//);
    // The server's own rule: voice-api/api/transcribe.ts.
    expect(name).toMatch(/\.(m4a|mp4|aac|mp3|wav|webm)$/i);
  });

  it('keeps a trailing space and a missing polish flag out of the way', async () => {
    send.mockResolvedValue(reply(200, { text: `  ${SPOKEN}  \n` }));
    expect(await run()).toEqual({
      ok: true,
      value: { text: SPOKEN, polished: false, languages: [], seconds: null },
    });
  });
});

describe('a recording too long for the server', () => {
  // iOS records .m4a, which cannot be cut without decoding it.
  it('is refused before anything is sent, and the recording stays', async () => {
    open.mockResolvedValue(audioAt('file:///cache/echo/take.m4a'));
    expect(await failedWith(run({ sizeOf: () => MAX_UPLOAD_BYTES + 1 }))).toEqual({
      code: 'too_long',
      retryable: false,
    });
    expect(send).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('is sent when it fits, or when its size cannot be read (the server then decides)', async () => {
    open.mockResolvedValue(audioAt('file:///cache/echo/take.m4a'));
    expect((await run({ sizeOf: () => MAX_UPLOAD_BYTES })).ok).toBe(true);
    expect((await run({ sizeOf: () => null })).ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('every way the server can answer', () => {
  it.each<[number, unknown, TranscriptionErrorCode, boolean]>([
    [401, { code: 'unauthorized', retryable: false }, 'unauthorized', false],
    [403, undefined, 'unauthorized', false],
    [413, { code: 'too_long', retryable: false }, 'too_long', false],
    [415, { code: 'unsupported_audio', retryable: false }, 'unsupported', false],
    [422, { code: 'empty', retryable: false }, 'no_speech', false],
    [422, { code: 'unsupported_audio', retryable: false }, 'unsupported', false],
    [400, { code: 'no_audio', retryable: false }, 'unsupported', false],
    [429, { code: 'rate_limited', retryable: true }, 'rate_limited', true],
    [502, { code: 'upstream', retryable: true }, 'server', true],
    [500, { code: 'internal', retryable: true }, 'server', true],
    [503, { code: 'not_configured', retryable: false }, 'not_configured', false],
    [504, undefined, 'server', true],
  ])('maps %i %j to %s (retryable %s)', async (code, body, expected, retryable) => {
    send.mockResolvedValue(reply(code, body));
    expect(await failedWith(run())).toEqual({ code: expected, retryable });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('says invalid_response for a success that is not the contract', async () => {
    send.mockResolvedValue(reply(200, { words: 'hello' }));
    expect(await failedWith(run())).toEqual({ code: 'invalid_response', retryable: false });
    send.mockResolvedValue(reply(200, undefined));
    expect(await failedWith(run())).toEqual({ code: 'invalid_response', retryable: false });
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('treats an empty transcript as silence', async () => {
    send.mockResolvedValue(reply(200, { ...good, text: '   ' }));
    expect(await failedWith(run())).toEqual({ code: 'no_speech', retryable: false });
  });

  it('says offline only when the phone itself reports that it has no connection', async () => {
    send.mockRejectedValue(new TypeError('Network request failed'));
    expect(await failedWith(run({ online: async () => false }))).toEqual({
      code: 'offline',
      retryable: true,
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not blame the connection for something unexpected', async () => {
    send.mockRejectedValue(new Error('Unsupported FormDataPart implementation'));
    for (const online of [
      async () => true,
      async () => null,
      async () => Promise.reject(new Error('x')),
    ]) {
      expect(await failedWith(run({ online }))).toEqual({ code: 'unexpected', retryable: true });
    }
  });

  it('does not blame the connection when the part cannot even be built', async () => {
    const result = await failedWith(
      run({
        filePart: () => {
          throw new Error('no such file');
        },
        online: async () => false,
      }),
    );
    // Nothing was sent, so the network cannot be to blame, whatever the phone reports.
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ code: 'unexpected', retryable: true });
  });
});

describe('the time it waits', () => {
  const hangs = () =>
    jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

  it('waits about 100 seconds by default', () => {
    expect(TRANSCRIBE_TIMEOUT_MS).toBe(100_000);
  });

  it('gives up when the time is up, and says so', async () => {
    send = hangs();
    expect(await failedWith(run({ timeoutMs: 20 }))).toEqual({ code: 'timeout', retryable: true });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('counts a stalled reply body as the same timeout', async () => {
    send.mockImplementation(
      async (_url: string, init: RequestInit) =>
        ({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        }) as unknown as Response,
    );
    expect(await failedWith(run({ timeoutMs: 20 }))).toEqual({ code: 'timeout', retryable: true });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('stops when the caller says so, and is not a timeout', async () => {
    send = hangs();
    const outside = new AbortController();
    const pending = failedWith(run({}, { signal: outside.signal }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    outside.abort();
    expect(await pending).toEqual({ code: 'cancelled', retryable: false });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not open the recording at all if it was already told to stop', async () => {
    const outside = new AbortController();
    outside.abort();
    expect(await failedWith(run({}, { signal: outside.signal }))).toEqual({
      code: 'cancelled',
      retryable: false,
    });
    expect(open).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('consent gating', () => {
  it.each<[string, TranscribeDeps['status']]>([
    ['not yet asked', () => 'unset'],
    ['Keep my voice only', () => 'voice_only'],
  ])('sends nothing, and decrypts nothing, when the person has %s', async (_name, current) => {
    expect(await failedWith(run({ status: current }))).toEqual({
      code: 'consent_required',
      retryable: false,
    });
    expect(open).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('follows the stored choice, so a policy change asks again', () => {
    const { usePreferences, VOICE_POLICY_VERSION } =
      jest.requireActual<typeof import('@/state/preferences')>('@/state/preferences');
    usePreferences.setState({ voiceConsent: { choice: 'allowed', version: VOICE_POLICY_VERSION } });
    return transcribeEntryAudio('d', { open }, { fetch: send, url: URL_LOCAL, token: TOKEN })
      .then((allowed) => {
        expect(allowed.ok).toBe(true);
        usePreferences.setState({ voiceConsent: { choice: 'allowed', version: 0 } });
        return transcribeEntryAudio('d', { open }, { fetch: send, url: URL_LOCAL, token: TOKEN });
      })
      .then((stale) => {
        expect(stale).toEqual({ ok: false, error: { code: 'consent_required', retryable: false } });
        usePreferences.setState({ voiceConsent: null });
      });
  });
});

describe('configuration', () => {
  it.each([
    ['no address', { url: undefined }],
    ['no token', { token: undefined }],
    ['an empty token', { token: '' }],
    ['plain http to a remote host', { url: 'http://voice.example.com' }],
    ['a phone on the local network', { url: 'http://192.168.1.20:8787' }],
  ])('is not configured with %s, and opens nothing', async (_name, overrides) => {
    expect(await failedWith(run(overrides))).toEqual({ code: 'not_configured', retryable: false });
    expect(open).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('uses https for a remote host', async () => {
    await run({ url: 'https://voice.example.com' });
    expect(send.mock.calls[0]?.[0]).toBe('https://voice.example.com/api/transcribe');
  });
});

describe('the decrypted copy', () => {
  it('is released when the extension is not one the server reads', async () => {
    open.mockResolvedValue(audioAt('file:///cache/take.caf'));
    expect(await failedWith(run())).toEqual({ code: 'unsupported', retryable: false });
    expect(send).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('is released on success', async () => {
    await run();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('is released if the request throws something unexpected', async () => {
    send.mockImplementation(() => {
      throw new Error('boom');
    });
    expect((await failedWith(run())).code).toBe('unexpected');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not let a failing release change the result', async () => {
    release.mockImplementation(() => {
      throw new Error('disk');
    });
    expect((await run()).ok).toBe(true);
  });

  it('says the recording could not be opened, and sends nothing', async () => {
    open.mockResolvedValue({ ok: false, error: { code: 'audio_failed', retryable: true } });
    expect(await failedWith(run())).toEqual({ code: 'audio_unavailable', retryable: true });
    open.mockRejectedValue(new Error('vault'));
    expect(await failedWith(run())).toEqual({ code: 'audio_unavailable', retryable: true });
    open.mockResolvedValue({ ok: false, error: { code: 'unavailable', retryable: false } });
    expect(await failedWith(run())).toEqual({ code: 'unavailable', retryable: false });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('privacy', () => {
  it('never writes to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    await run();
    send.mockRejectedValue(new Error(SPOKEN));
    await run();
    send.mockResolvedValue(reply(500, { code: 'internal', retryable: true }));
    await run();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

// A live take is a 24 kHz WAV, far past what the server takes in one request.
describe('a long WAV is sent in pieces', () => {
  const RATE = 24_000;
  /** About 4.8 MB of tone, with a quiet moment near where the first piece has to end. */
  const wav = (() => {
    const seconds = 100;
    const samples = new Int16Array(RATE * seconds);
    for (let i = 0; i < samples.length; i += 1) {
      const at = i / RATE;
      samples[i] = at >= 82.3 && at < 82.4 ? 0 : Math.round(8000 * Math.sin(i / 7));
    }
    const pcm = new Uint8Array(samples.buffer);
    const file = new Uint8Array(44 + pcm.length);
    file.set(wavHeader({ sampleRate: RATE, channels: 1 }, pcm.length));
    file.set(pcm, 44);
    return file;
  })();
  const readRange = async (_uri: string, offset: number, length: number) =>
    wav.slice(offset, offset + length);
  const long = (overrides: Partial<TranscribeDeps> = {}, options = {}) =>
    run({ sizeOf: () => wav.length, readRange, ...overrides }, options);
  const partBytes = async (init: RequestInit) =>
    (await (sentParts(init)[0]![1] as { bytes: () => Promise<Uint8Array> }).bytes()) as Uint8Array;

  beforeEach(() => open.mockResolvedValue(audioAt('file:///cache/echo/take.wav')));

  it('sends each piece as a WAV of its own, in order, and joins the words', async () => {
    send
      .mockResolvedValueOnce(reply(200, { ...good, text: 'First part,' }))
      .mockResolvedValueOnce(reply(200, { ...good, text: 'second part.', seconds: 3 }));
    const result = await long();
    expect(result).toEqual({
      ok: true,
      value: { text: 'First part, second part.', polished: true, languages: ['en'], seconds: 7.2 },
    });
    expect(send).toHaveBeenCalledTimes(2);

    const sent: Uint8Array[] = [];
    for (const call of send.mock.calls) {
      const init = call[1] as RequestInit;
      const bytes = await partBytes(init);
      sent.push(bytes);
      expect(bytes.length).toBeLessThanOrEqual(PIECE_BYTES);
      expect(sentParts(init)[0]![2]).toBe('speech.wav');
      expect(sentParts(init)[1]).toEqual(['style', 'exact']);
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
    }
    // Nothing is lost or repeated: the pieces' samples are the file's samples, in order.
    const joined = new Uint8Array(sent.reduce((total, piece) => total + piece.length - 44, 0));
    let at = 0;
    for (const piece of sent) {
      joined.set(piece.subarray(44), at);
      at += piece.length - 44;
    }
    expect(joined.length).toBe(wav.length - 44);
    expect(joined.every((byte, index) => byte === wav[44 + index])).toBe(true);
    // The first cut is in the quiet moment, not in the middle of a word.
    const firstSeconds = (sent[0]!.length - 44) / 2 / RATE;
    expect(firstSeconds).toBeGreaterThan(82.3);
    expect(firstSeconds).toBeLessThan(82.4);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not treat a piece with nothing said in it as a failure', async () => {
    send
      .mockResolvedValueOnce(reply(422, { code: 'empty', retryable: false }))
      .mockResolvedValueOnce(reply(200, { ...good, text: 'Only this.' }));
    expect(await long()).toMatchObject({ ok: true, value: { text: 'Only this.' } });
    send.mockReset();
    send.mockResolvedValue(reply(422, { code: 'empty', retryable: false }));
    expect(await failedWith(long())).toEqual({ code: 'no_speech', retryable: false });
  });

  it('fails the whole take when a piece fails, and the recording stays', async () => {
    send
      .mockResolvedValueOnce(reply(200, good))
      .mockResolvedValueOnce(reply(503, { code: 'internal', retryable: true }));
    expect(await failedWith(long())).toEqual({ code: 'server', retryable: true });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('stops at once when the person goes on', async () => {
    const outside = new AbortController();
    const signals: AbortSignal[] = [];
    send.mockImplementation(async (_url: string, init: RequestInit) => {
      signals.push(init.signal!);
      outside.abort();
      return reply(200, good);
    });
    expect(await failedWith(long({}, { signal: outside.signal }))).toEqual({
      code: 'cancelled',
      retryable: false,
    });
    // Nothing more was started, and what was on its way was hung up on.
    expect(send.mock.calls.length).toBeLessThanOrEqual(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('still refuses a long recording that is not a WAV', async () => {
    open.mockResolvedValue(audioAt('file:///cache/echo/take.aac'));
    expect(await failedWith(long())).toEqual({ code: 'too_long', retryable: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('says the recording could not be read when it will not open as a WAV', async () => {
    expect(await failedWith(long({ readRange: async () => new Uint8Array(100) }))).toEqual({
      code: 'unsupported',
      retryable: false,
    });
    expect(
      await failedWith(
        long({
          readRange: async () => {
            throw new Error('io');
          },
        }),
      ),
    ).toEqual({ code: 'audio_unavailable', retryable: true });
  });

  it('wraps in-memory bytes as something Expo can send as a file', async () => {
    const part = bytesPart(new Uint8Array([9, 8]), 'speech.wav', 'audio/wav') as unknown as {
      bytes: () => Promise<Uint8Array>;
      name: string;
      type: string;
    };
    expect([...(await part.bytes())]).toEqual([9, 8]);
    expect(part).toMatchObject({ name: 'speech.wav', type: 'audio/wav' });
  });
});

// A hidden take on Android is an ADTS .aac at 40 kbps: about 14 minutes to 4.4 MB.
describe('a long ADTS .aac is sent in overlapping pieces', () => {
  const FRAME = 232;
  const OVERLAP = (65 * 1024) / 22050;

  /** A stream of frames of one size, each with a header, and its own number in the first bytes of its audio. */
  function adts(bytes: number) {
    const count = Math.floor(bytes / FRAME);
    const file = new Uint8Array(count * FRAME);
    for (let i = 0; i < count; i += 1) {
      const at = i * FRAME;
      file.fill(0x55, at + 10, at + FRAME);
      file.set([i & 0xff, (i >> 8) & 0xff, (i >> 16) & 0xff], at + 7);
      file.set(
        [
          0xff,
          0xf1,
          0x5c,
          0x40 | ((FRAME >> 11) & 3),
          (FRAME >> 3) & 0xff,
          ((FRAME & 7) << 5) | 0x1f,
          0xfc,
        ],
        at,
      );
    }
    return file;
  }
  const frameOf = (piece: Uint8Array) => piece[7]! | (piece[8]! << 8) | (piece[9]! << 16);
  const nine = adts(9_000_000);
  const eight = adts(5_000_000);
  const seventeen = adts(17_000_000);

  const reading = (file: Uint8Array) => async (_uri: string, offset: number, length: number) =>
    file.slice(offset, offset + length);
  // Pieces of a little under twelve minutes, so that these small files are cut into a few of them.
  const take = (file: Uint8Array, overrides: Partial<TranscribeDeps> = {}, options = {}) =>
    run(
      { sizeOf: () => file.length, readRange: reading(file), pieceSeconds: 700, ...overrides },
      options,
    );
  const sentBytes = async (init: RequestInit) =>
    (await (sentParts(init)[0]![1] as { bytes: () => Promise<Uint8Array> }).bytes()) as Uint8Array;
  const piece = (text: string, more: object = {}) =>
    reply(200, { ...good, polished: false, raw: text, text, seconds: 100, ...more });

  beforeEach(() => open.mockResolvedValue(audioAt('file:///cache/echo/take.aac')));

  it('cuts on frames, sends each piece as .aac in order, and joins the words once', async () => {
    send
      .mockResolvedValueOnce(
        piece('Sentence one is here. Then we walked down to the river and sat by the water', {
          languages: ['en'],
          seconds: 800,
        }),
      )
      .mockResolvedValueOnce(
        piece(
          'sat by the water and watched the boats. Sentence two follows and then we went home',
          {
            languages: ['en', 'hi'],
            seconds: 800,
          },
        ),
      )
      .mockResolvedValueOnce(
        piece('we went home and slept. The end.', { languages: ['hi'], seconds: 300 }),
      );
    const result = await take(nine);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe(
      'Sentence one is here. Then we walked down to the river and sat by the water and watched the boats. Sentence two follows and then we went home and slept. The end.',
    );
    expect(result.value.languages).toEqual(['en', 'hi']);
    // The sound that two pieces both hold is counted once.
    expect(result.value.seconds).toBeCloseTo(1900 - 2 * OVERLAP, 3);
    expect(result.value.polished).toBe(false);

    expect(send).toHaveBeenCalledTimes(3);
    const sent: Uint8Array[] = [];
    for (const call of send.mock.calls) {
      const init = call[1] as RequestInit;
      const bytes = await sentBytes(init);
      sent.push(bytes);
      expect(bytes.length).toBeLessThanOrEqual(PIECE_BYTES);
      expect(sentParts(init)[0]![2]).toBe('speech.aac');
      expect(sentParts(init)[0]![1]).toMatchObject({ name: 'speech.aac', type: 'audio/aac' });
      expect(sentParts(init)[1]).toEqual(['style', 'exact']);
      // A piece begins on a frame header.
      expect([bytes[0], bytes[1]]).toEqual([0xff, 0xf1]);
      expect(bytes.length % FRAME).toBe(0);
    }
    // Every byte of the file is in a piece, in order, and each piece begins exactly the overlap before
    // the last one ended: 65 frames, which is three seconds at 22050 Hz.
    let end = 0;
    sent.forEach((bytes, index) => {
      const start = frameOf(bytes) * FRAME;
      expect(Buffer.compare(bytes, nine.subarray(start, start + bytes.length))).toBe(0);
      if (index === 0) expect(start).toBe(0);
      else expect(end - start).toBe(65 * FRAME);
      end = start + bytes.length;
    });
    expect(end).toBe(nine.length);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('joins in the order spoken even when a later piece answers first', async () => {
    const texts = [
      'one two three four five six',
      'four five six seven eight nine',
      'seven eight nine ten eleven twelve',
    ];
    let call = 0;
    send.mockImplementation(async () => {
      const mine = call;
      call += 1;
      await new Promise((resolve) => setTimeout(resolve, [60, 30, 0][mine]));
      return piece(texts[mine]!);
    });
    expect(await take(nine)).toMatchObject({
      ok: true,
      value: { text: 'one two three four five six seven eight nine ten eleven twelve' },
    });
  });

  it('has at most three pieces on their way at once, and sends them all', async () => {
    let flying = 0;
    let most = 0;
    let call = 0;
    send.mockImplementation(async () => {
      flying += 1;
      most = Math.max(most, flying);
      const mine = call;
      call += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      flying -= 1;
      return piece(`piece${mine} unique${mine} words${mine}`);
    });
    const result = await take(seventeen);
    expect(most).toBe(PIECE_CONCURRENCY);
    expect(PIECE_CONCURRENCY).toBe(3);
    expect(send).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({
      ok: true,
      value: {
        text: 'piece0 unique0 words0 piece1 unique1 words1 piece2 unique2 words2 piece3 unique3 words3 piece4 unique4 words4',
      },
    });
  });

  it('fails the whole take when a middle piece fails, hangs up on the rest, and returns no words', async () => {
    const signals: AbortSignal[] = [];
    let call = 0;
    send.mockImplementation(async (_url: string, init: RequestInit) => {
      const mine = call;
      call += 1;
      signals[mine] = init.signal!;
      if (mine === 1) return reply(503, { code: 'internal', retryable: true });
      // The others take their time, and give up when they are hung up on.
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    expect(await take(seventeen)).toEqual({
      ok: false,
      error: { code: 'server', retryable: true },
    });
    // Pieces three and four were never started, and the two in flight were hung up on.
    expect(send).toHaveBeenCalledTimes(3);
    expect(signals[0]!.aborted && signals[2]!.aborted).toBe(true);
    // The sealed recording is released, and nothing was kept.
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('names a failure as it was', async () => {
    send
      .mockResolvedValueOnce(piece('one two three'))
      .mockResolvedValueOnce(reply(429, { code: 'rate_limited', retryable: true }))
      .mockResolvedValueOnce(piece('seven eight nine'));
    expect(await failedWith(take(nine))).toEqual({ code: 'rate_limited', retryable: true });
  });

  it('gives each piece the time to be sent as well as the time the server takes', () => {
    // Three pieces of 4 MB sharing an uplink that manages 100 kB/s need two minutes to be sent.
    expect(pieceTimeoutMs(TRANSCRIBE_TIMEOUT_MS, 4_000_000, 3)).toBe(220_000);
    expect(pieceTimeoutMs(TRANSCRIBE_TIMEOUT_MS, 1_000_000, 2)).toBe(120_000);
    expect(pieceTimeoutMs(TRANSCRIBE_TIMEOUT_MS, 0, 3)).toBe(TRANSCRIBE_TIMEOUT_MS);
  });

  it('decides the style once for the whole take', async () => {
    const styles = jest
      .fn<'exact' | 'tidy', []>()
      .mockReturnValueOnce('exact')
      .mockReturnValue('tidy');
    send.mockImplementation(async () => piece('same words here'));
    await take(nine, { style: styles });
    expect(styles).toHaveBeenCalledTimes(1);
    for (const call of send.mock.calls) {
      expect(sentParts(call[1] as RequestInit)[1]).toEqual(['style', 'exact']);
    }
  });

  it('says the take was tidied only if every piece was', async () => {
    send
      .mockResolvedValueOnce(piece('the first part', { polished: true, raw: 'um the first part' }))
      .mockResolvedValueOnce(piece('the second part', { polished: false }))
      .mockResolvedValueOnce(piece('the third part', { polished: true, raw: 'uh the third part' }));
    expect(await take(nine, { style: () => 'tidy' })).toMatchObject({
      ok: true,
      value: { polished: false },
    });
    send.mockReset();
    send.mockResolvedValue(piece('a tidy piece', { polished: true }));
    expect(await take(nine, { style: () => 'tidy' })).toMatchObject({ value: { polished: true } });
  });

  it('does not treat a piece with nothing said in it as a failure', async () => {
    send
      .mockResolvedValueOnce(piece('before the quiet'))
      .mockResolvedValueOnce(reply(422, { code: 'empty', retryable: false }))
      .mockResolvedValueOnce(piece('after the quiet'));
    expect(await take(nine)).toMatchObject({
      ok: true,
      value: { text: 'before the quiet after the quiet' },
    });
    send.mockReset();
    send.mockResolvedValue(reply(422, { code: 'empty', retryable: false }));
    expect(await failedWith(take(nine))).toEqual({ code: 'no_speech', retryable: false });
  });

  it('finds the overlap in the words before their script was changed', async () => {
    send
      .mockResolvedValueOnce(
        piece('yaar mujhey nahin pataa kyaa karnaa hai', { raw: 'यार मुझे नहीं पता क्या करना है' }),
      )
      .mockResolvedValueOnce(
        piece('mujhe nahi pata kya karna hai bas thak gaya', {
          raw: 'मुझे नहीं पता क्या करना है बस थक गया',
        }),
      );
    expect(await take(eight)).toMatchObject({
      ok: true,
      value: { text: 'yaar mujhey nahi pata kya karna hai bas thak gaya' },
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('never uses the server words that were tidied to find an overlap', async () => {
    // Tidied, the second piece lost a filler: the words no longer line up with the raw ones.
    send
      .mockResolvedValueOnce(
        piece('we walked down to the river', {
          polished: true,
          raw: 'um we walked down to the river',
        }),
      )
      .mockResolvedValueOnce(
        piece('walked down to the river and sat', {
          polished: true,
          raw: 'walked down to the river and sat',
        }),
      );
    expect(await take(eight, { style: () => 'tidy' })).toMatchObject({
      ok: true,
      value: { text: 'we walked down to the river and sat' },
    });
  });

  it('stops at once when the person goes on', async () => {
    const outside = new AbortController();
    send.mockImplementation(async () => {
      outside.abort();
      return piece('some words');
    });
    expect(await failedWith(take(seventeen, {}, { signal: outside.signal }))).toEqual({
      code: 'cancelled',
      retryable: false,
    });
    expect(send.mock.calls.length).toBeLessThanOrEqual(PIECE_CONCURRENCY);
  });

  it('says the recording could not be read when a piece will not read', async () => {
    let reads = 0;
    const flaky = async (_uri: string, offset: number, length: number) => {
      reads += 1;
      // The planning reads succeed. Reading a whole piece to send does not.
      if (length > 1_000_000) throw new Error('io');
      return nine.slice(offset, offset + length);
    };
    expect(await failedWith(take(nine, { readRange: flaky }))).toEqual({
      code: 'audio_unavailable',
      retryable: true,
    });
    expect(reads).toBeGreaterThan(2);
    expect(send).not.toHaveBeenCalled();
  });

  describe('a piece the server left in Devanagari', () => {
    const DEVANAGARI = 'मुझे नहीं पता क्या करना है बस थक गया';
    const ROMAN = 'mujhe nahi pata kya karna hai bas thak gaya';
    it('gets the same step once more on its words alone, and the take is whole', async () => {
      const refined: string[] = [];
      let call = 0;
      send.mockImplementation(async (url: string, init: RequestInit) => {
        if (url.endsWith('/api/refine')) {
          refined.push(JSON.parse(init.body as string).text);
          return reply(200, { text: ROMAN });
        }
        call += 1;
        return call === 1
          ? piece('yaar kuch bhi nahi hota', { raw: 'यार कुछ भी नहीं होता', romanised: true })
          : piece(DEVANAGARI, { raw: DEVANAGARI, romanised: false });
      });
      expect(await take(eight)).toMatchObject({
        ok: true,
        value: { text: `yaar kuch bhi nahi hota ${ROMAN}` },
      });
      // Only that piece, only its words, and as exact.
      expect(refined).toEqual([DEVANAGARI]);
      const refine = send.mock.calls.find(([url]) => String(url).endsWith('/api/refine'))!;
      expect(JSON.parse((refine[1] as RequestInit).body as string)).toEqual({
        text: DEVANAGARI,
        style: 'exact',
      });
    });

    it('keeps the piece as it was if the second try does not work, and the take still succeeds', async () => {
      let call = 0;
      send.mockImplementation(async (url: string) => {
        if (url.endsWith('/api/refine')) return reply(503, { code: 'internal', retryable: true });
        call += 1;
        return call === 1 ? piece('yaar sab theek hai') : piece(DEVANAGARI);
      });
      expect(await take(eight)).toMatchObject({
        ok: true,
        value: { text: `yaar sab theek hai ${DEVANAGARI}` },
      });
      // Or if it comes back in Devanagari still.
      call = 0;
      send.mockImplementation(async (url: string) => {
        if (url.endsWith('/api/refine')) return reply(200, { text: DEVANAGARI });
        call += 1;
        return call === 1 ? piece('yaar sab theek hai') : piece(DEVANAGARI);
      });
      expect(await take(eight)).toMatchObject({
        value: { text: `yaar sab theek hai ${DEVANAGARI}` },
      });
    });

    it('is not tried for words that are already in Roman script, or for tidy words', async () => {
      send.mockImplementation(async () => piece('nothing to change here'));
      await take(eight);
      expect(send.mock.calls.every(([url]) => !String(url).endsWith('/api/refine'))).toBe(true);
      send.mockReset();
      send.mockImplementation(async () => piece(DEVANAGARI));
      await take(eight, { style: () => 'tidy' });
      expect(send.mock.calls.every(([url]) => !String(url).endsWith('/api/refine'))).toBe(true);
    });

    it('is not tried again when the person has gone on', async () => {
      const outside = new AbortController();
      send.mockImplementation(async (url: string) => {
        if (url.endsWith('/api/refine')) return reply(200, { text: ROMAN });
        outside.abort();
        return piece(DEVANAGARI);
      });
      expect(await failedWith(take(eight, {}, { signal: outside.signal }))).toEqual({
        code: 'cancelled',
        retryable: false,
      });
    });
  });

  it('is still too long when the file is not one that can be cut', async () => {
    const noise = Uint8Array.from({ length: 5_000_000 }, (_, i) => (i * 7919) % 251);
    expect(await failedWith(take(noise))).toEqual({ code: 'too_long', retryable: false });
    expect(send).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('is still too long as an .m4a, which cannot be cut', async () => {
    open.mockResolvedValue(audioAt('file:///cache/echo/take.m4a'));
    expect(await failedWith(take(nine))).toEqual({ code: 'too_long', retryable: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('cuts a take into pieces of five minutes by default, which is what the server takes', async () => {
    expect(PIECE_SECONDS).toBe(300);
    let call = 0;
    send.mockImplementation(async () => {
      call += 1;
      return piece(`piece${call} unique${call} words${call}`);
    });
    // 9 MB is thirty minutes at the recorder's 40 kbps. Six pieces of five minutes leave 20 seconds,
    // which is too little to be sent alone, so the last piece takes it.
    const result = await take(nine, { pieceSeconds: PIECE_SECONDS });
    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(6);
    for (const call of send.mock.calls) {
      const bytes = (await sentBytes(call[1] as RequestInit)).length;
      expect(bytes).toBeLessThanOrEqual(1_700_000);
    }
  });

  it('cuts a take the old size limit would have let through, because it is longer than the server takes', async () => {
    // 3.6 MB is twelve minutes: under the 4.4 MB a request may carry, and over the six minutes OpenAI takes.
    const ten = adts(3_600_000);
    await take(ten, { pieceSeconds: PIECE_SECONDS });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('sends a take that fits as one request, whole', async () => {
    const short = adts(1_200_000);
    expect((await take(short, { pieceSeconds: PIECE_SECONDS })).ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    // The recording itself is the request, not a copy cut out of it.
    expect(sentParts(send.mock.calls[0]![1] as RequestInit)[0]![2]).toBe('speech.aac');
  });

  it('does not even look through a short take', async () => {
    const reads = jest.fn(reading(adts(900_000)));
    expect((await take(adts(900_000), { readRange: reads })).ok).toBe(true);
    expect(reads).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends a take it cannot follow whole when the server could take it, and says too long when not', async () => {
    const noise = Uint8Array.from({ length: 2_000_000 }, (_, i) => (i * 7919) % 251);
    expect((await take(noise)).ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('refineWords: the same rules for words heard live', () => {
  const refineRun = (text: string, overrides: Partial<RefineDeps> = {}) =>
    refineWords(
      text,
      {},
      {
        fetch: send,
        url: URL_LOCAL,
        token: TOKEN,
        status,
        style: () => 'exact',
        online: async () => true,
        ...overrides,
      },
    );

  it('keeps exact words as they are without any request at all', async () => {
    const said = 'Um, I miss him. Actually no, I needed him.';
    expect(await refineRun(`  ${said} `)).toEqual({ ok: true, value: { text: said } });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends Hindi to be written in Roman script, as exact', async () => {
    send.mockResolvedValue(reply(200, { text: 'yaar mujhe nahi pata', style: 'exact' }));
    expect(await refineRun('यार मुझे नहीं पता')).toEqual({
      ok: true,
      value: { text: 'yaar mujhe nahi pata' },
    });
    const [endpoint, init] = send.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('http://127.0.0.1:8787/api/refine');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'यार मुझे नहीं पता', style: 'exact' });
    expect((init.headers as Record<string, string>)[TOKEN_HEADER]).toBe(TOKEN);
  });

  it('tidies when Tidy my words is on', async () => {
    send.mockResolvedValue(reply(200, { text: 'I miss him.' }));
    expect(await refineRun('um I miss him', { style: () => 'tidy' })).toEqual({
      ok: true,
      value: { text: 'I miss him.' },
    });
    expect(JSON.parse(String((send.mock.calls[0]![1] as RequestInit).body)).style).toBe('tidy');
  });

  it('sends nothing without consent', async () => {
    expect(await refineRun('यार', { status: () => 'voice_only' })).toEqual({
      ok: false,
      error: { code: 'consent_required', retryable: false },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('names a failure as it was: offline only when it is', async () => {
    send.mockRejectedValue(new Error('x'));
    expect(await refineRun('यार', { online: async () => false })).toEqual({
      ok: false,
      error: { code: 'offline', retryable: true },
    });
    expect(await refineRun('यार')).toEqual({
      ok: false,
      error: { code: 'unexpected', retryable: true },
    });
    send.mockResolvedValue(reply(500, undefined));
    expect(await refineRun('यार')).toEqual({
      ok: false,
      error: { code: 'server', retryable: true },
    });
    send.mockResolvedValue(reply(200, { nothing: 1 }));
    expect(await refineRun('यार')).toEqual({
      ok: false,
      error: { code: 'invalid_response', retryable: false },
    });
  });
});
