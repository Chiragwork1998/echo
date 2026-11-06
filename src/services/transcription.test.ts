import type { JournalResult, PlayableAudio } from '@/features/journal/types';

import {
  MAX_UPLOAD_BYTES,
  TOKEN_HEADER,
  TRANSCRIBE_TIMEOUT_MS,
  transcribeEntryAudio,
  voiceEndpoint,
  type TranscribeDeps,
  type TranscriptionErrorCode,
} from './transcription';

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

// Jest's FormData is not React Native's, which takes { uri, name, type } parts. This keeps them.
class RecordedForm {
  parts: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
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
const run = (overrides: Partial<TranscribeDeps> = {}, options = {}) =>
  transcribeEntryAudio(
    'draft-1',
    { open, ...options },
    { fetch: send, url: URL_LOCAL, token: TOKEN, status, ...overrides },
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
    expect(sentParts(init)).toEqual([
      ['file', { uri: 'file:///cache/echo/take.aac', name: 'speech.aac', type: 'audio/aac' }],
    ]);
  });

  it.each([
    ['file:///cache/take.m4a', 'speech.m4a', 'audio/mp4'],
    ['file:///cache/take.AAC', 'speech.aac', 'audio/aac'],
    ['file:///cache/take.wav', 'speech.wav', 'audio/wav'],
  ])('names %s as %s, an extension the server accepts', async (uri, name, type) => {
    open.mockResolvedValue(audioAt(uri));
    await run();
    const [, init] = send.mock.calls[0] as [string, RequestInit];
    expect(sentParts(init)[0]?.[1]).toMatchObject({ name, type });
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
  it('is refused before anything is sent, and the recording stays', async () => {
    expect(await failedWith(run({ sizeOf: () => MAX_UPLOAD_BYTES + 1 }))).toEqual({
      code: 'too_long',
      retryable: false,
    });
    expect(send).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('is sent when it fits, or when its size cannot be read (the server then decides)', async () => {
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

  it('says offline when the phone cannot reach the server', async () => {
    send.mockRejectedValue(new TypeError('Network request failed'));
    expect(await failedWith(run())).toEqual({ code: 'offline', retryable: true });
    expect(release).toHaveBeenCalledTimes(1);
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
    expect((await failedWith(run())).code).toBe('offline');
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
