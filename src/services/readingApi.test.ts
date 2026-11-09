import {
  FORMAT_MAX_CHARS,
  formatText,
  parseEcho,
  parseSetOut,
  REFLECT_MAX_CHARS,
  reflectText,
  type ReadingDeps,
} from './readingApi';

// Every text here is invented.
const ENTRY = 'i keep saying yes to things i dont want to do and then i resent it';
const ECHO = 'You’re saying yes faster than you can feel what you want.';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const api = () => ({ url: 'https://voice.example.com', token: 'app-token' });
const noTokens = { get: async () => null, renew: async () => null };

function deps(send: jest.Mock, overrides: Partial<ReadingDeps> = {}): Partial<ReadingDeps> {
  return {
    send: send as unknown as typeof fetch,
    tokens: noTokens,
    online: async () => true,
    api,
    ...overrides,
  };
}

const sent = (send: jest.Mock, call = 0) => {
  const [url, init] = send.mock.calls[call] as [string, RequestInit];
  return {
    url,
    init,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(String(init.body)),
  };
};

describe('today’s echo', () => {
  it('posts the words, with the app’s token, and returns the echo', async () => {
    const send = jest.fn(async () => reply(200, { kind: 'reflection', text: ECHO }));
    expect(await reflectText(ENTRY, deps(send))).toEqual({ kind: 'reflection', text: ECHO });
    const request = sent(send);
    expect(request.url).toBe('https://voice.example.com/api/reflect');
    expect(request.init.method).toBe('POST');
    expect(request.headers['x-echo-voice-token']).toBe('app-token');
    expect(request.body).toEqual({ text: ENTRY });
  });

  it('sends no more than the first 20,000 characters', async () => {
    const send = jest.fn(async () => reply(200, { kind: 'reflection', text: ECHO }));
    await reflectText('a'.repeat(REFLECT_MAX_CHARS + 500), deps(send));
    expect(sent(send).body.text).toHaveLength(REFLECT_MAX_CHARS);
  });

  it('returns support, and no reflection, when the server answers with care', async () => {
    const send = jest.fn(async () => reply(200, { kind: 'support' }));
    expect(await reflectText(ENTRY, deps(send))).toEqual({ kind: 'support' });
  });

  it('sends nothing where this build has no server', async () => {
    const send = jest.fn();
    expect(await reflectText(ENTRY, deps(send, { api: () => null }))).toEqual({
      kind: 'failed',
      code: 'not_configured',
      retryable: false,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('names every failure, takes whether to try again from the server, and never throws', async () => {
    const answer = (status: number, body: unknown = {}) =>
      reflectText(ENTRY, deps(jest.fn(async () => reply(status, body))));
    const refusal = (status: number, code: string, retryable: boolean) =>
      answer(status, { error: code, code, retryable });
    expect(await refusal(402, 'allowance_used', false)).toMatchObject({
      code: 'allowance_used',
      retryable: false,
    });
    expect(await refusal(422, 'unusable', false)).toMatchObject({
      code: 'unusable',
      retryable: false,
    });
    // OpenAI's failures are 502s, and only the server knows whether they may pass.
    expect(await refusal(502, 'upstream', true)).toMatchObject({ code: 'busy', retryable: true });
    expect(await refusal(502, 'upstream', false)).toMatchObject({
      code: 'refused',
      retryable: false,
    });
    expect(
      await answer(503, { error: 'busy', code: 'busy', retryable: true, retryAfter: 30 }),
    ).toMatchObject({ code: 'busy', retryable: true });
    expect(await refusal(429, 'rate_limited', true)).toMatchObject({
      code: 'busy',
      retryable: true,
    });
    expect(await answer(429)).toMatchObject({ code: 'busy', retryable: true });
    expect(await answer(500)).toMatchObject({ code: 'refused', retryable: false });
    expect(await answer(404)).toMatchObject({ code: 'refused', retryable: false });
    expect(await refusal(400, 'bad_request', false)).toMatchObject({ code: 'refused' });
    expect(await refusal(503, 'not_configured', false)).toMatchObject({
      code: 'not_configured',
    });
    expect(await answer(200, { kind: 'something else' })).toMatchObject({ code: 'invalid' });
    for (const text of ['x'.repeat(221), 'Too short', 'One line,\nthen another.']) {
      expect(await answer(200, { kind: 'reflection', text })).toMatchObject({ code: 'invalid' });
    }

    const thrown = jest.fn(async () => {
      throw new Error('no route to host');
    });
    expect(await reflectText(ENTRY, deps(thrown))).toMatchObject({
      code: 'unreachable',
      retryable: true,
    });
    expect(await reflectText(ENTRY, deps(thrown, { online: async () => false }))).toMatchObject({
      code: 'offline',
      retryable: true,
    });
  });

  it('asks once for a new install token when the server refuses this one', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce(reply(401, { error: 'install_invalid', code: 'install_invalid' }))
      .mockResolvedValueOnce(reply(200, { kind: 'reflection', text: ECHO }));
    const tokens = { get: jest.fn(async () => 'ei1.old'), renew: jest.fn(async () => 'ei1.new') };
    expect(await reflectText(ENTRY, deps(send, { tokens }))).toEqual({
      kind: 'reflection',
      text: ECHO,
    });
    expect(sent(send, 0).headers['x-echo-install-token']).toBe('ei1.old');
    expect(sent(send, 1).headers['x-echo-install-token']).toBe('ei1.new');
  });
});

describe('setting out', () => {
  it('posts the words and returns them set out', async () => {
    const send = jest.fn(async () =>
      reply(200, { text: 'I keep saying yes.\r\n\r\nThen I resent it.', formatted: true }),
    );
    expect(await formatText(ENTRY, deps(send))).toEqual({
      kind: 'formatted',
      text: 'I keep saying yes.\n\nThen I resent it.',
    });
    const request = sent(send);
    expect(request.url).toBe('https://voice.example.com/api/format');
    expect(request.body).toEqual({ text: ENTRY });
  });

  it('reads `formatted: false` as nothing to keep', async () => {
    const send = jest.fn(async () => reply(200, { text: ENTRY, formatted: false }));
    expect(await formatText(ENTRY, deps(send))).toEqual({ kind: 'unchanged' });
  });

  it('reads a failed model call as the 502 it is, retryable as the server says', async () => {
    const upstream = (retryable: boolean) =>
      jest.fn(async () => reply(502, { error: 'upstream', code: 'upstream', retryable }));
    expect(await formatText(ENTRY, deps(upstream(true)))).toEqual({
      kind: 'failed',
      code: 'busy',
      retryable: true,
    });
    expect(await formatText(ENTRY, deps(upstream(false)))).toEqual({
      kind: 'failed',
      code: 'refused',
      retryable: false,
    });
  });

  it('never sends more than the server takes', async () => {
    const send = jest.fn();
    expect(await formatText('a'.repeat(FORMAT_MAX_CHARS + 1), deps(send))).toMatchObject({
      code: 'refused',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('reading a reply', () => {
  it('trusts nothing about the shape of today’s echo', () => {
    expect(parseEcho({ kind: 'reflection', text: `  ${ECHO}  ` })).toEqual({
      kind: 'reflection',
      text: ECHO,
    });
    expect(parseEcho({ kind: 'reflection', text: '   ' })).toBeNull();
    expect(parseEcho({ kind: 'reflection' })).toBeNull();
    expect(parseEcho('reflection')).toBeNull();
    expect(parseEcho(null)).toBeNull();
  });

  it('trusts nothing about the shape of words set out', () => {
    expect(parseSetOut({ text: 'One.', formatted: true })).toEqual({
      kind: 'formatted',
      text: 'One.',
    });
    expect(parseSetOut({ text: '', formatted: true })).toBeNull();
    expect(parseSetOut({ text: 'One.' })).toBeNull();
    expect(parseSetOut({ formatted: true })).toBeNull();
    expect(parseSetOut(undefined)).toBeNull();
  });
});
