import { parseReading, readPatternCards } from './patterns';

const card = {
  name: 'Guilty about resting',
  noticed: 'It seems rest brings guilt.',
  evidence: [
    { quote: 'It is strange to feel guilty about resting', date: '2026-10-24' },
    { quote: 'the guilt arrive on schedule', date: '2026-11-04' },
  ],
  lens: {
    text: 'One way to see this is as a loop.',
    source: 'Joe Dispenza · thoughts and feelings in a loop',
  },
  practice: 'Write two short lines.',
  question: 'What does enough mean?',
};

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const entries = [{ date: '2026-11-04', text: 'a made-up entry' }];
const failing = () =>
  jest.fn(async () => {
    throw new Error('offline');
  });

const original = {
  url: process.env.EXPO_PUBLIC_VOICE_URL,
  token: process.env.EXPO_PUBLIC_VOICE_TOKEN,
};
afterEach(() => {
  process.env.EXPO_PUBLIC_VOICE_URL = original.url;
  process.env.EXPO_PUBLIC_VOICE_TOKEN = original.token;
});

describe('parseReading', () => {
  it('keeps well-formed cards and drops any that are not', () => {
    const result = parseReading({
      status: 'cards',
      entriesRead: 7,
      cards: [card, { ...card, name: '' }, { ...card, evidence: [] }, 'nonsense'],
    });
    expect(result).toEqual({ status: 'cards', entriesRead: 7, cards: [card] });
  });

  it('reads the other two answers, and refuses what it does not know', () => {
    expect(parseReading({ status: 'support' })).toEqual({ status: 'support' });
    expect(parseReading({ status: 'none', entriesRead: 6 })).toEqual({
      status: 'none',
      entriesRead: 6,
    });
    expect(parseReading({ status: 'cards', cards: [] })).toEqual({
      status: 'none',
      entriesRead: 0,
    });
    expect(parseReading({ status: 'something else' })).toBeNull();
    expect(parseReading(null)).toBeNull();
  });
});

describe('readPatternCards', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_VOICE_URL = 'https://voice.example.com';
    process.env.EXPO_PUBLIC_VOICE_TOKEN = 'app-token';
  });

  it('sends nothing when the server address is not set, or is not https', async () => {
    const send = jest.fn();
    process.env.EXPO_PUBLIC_VOICE_URL = 'http://voice.example.com';
    expect(await readPatternCards(entries, send)).toEqual({
      status: 'error',
      code: 'not_configured',
      retryable: false,
    });
    delete process.env.EXPO_PUBLIC_VOICE_URL;
    await readPatternCards(entries, send);
    expect(send).not.toHaveBeenCalled();
  });

  it('posts the entries with the app token and returns the cards', async () => {
    const send = jest.fn(async (..._args: [string, RequestInit]) =>
      reply(200, { status: 'cards', entriesRead: 1, cards: [card] }),
    );
    const result = await readPatternCards(entries, send as unknown as typeof fetch);
    expect(result).toEqual({ status: 'cards', entriesRead: 1, cards: [card] });
    const [url, init] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://voice.example.com/api/patterns');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-echo-voice-token']).toBe('app-token');
    expect(JSON.parse(String(init.body))).toEqual({ entries });
  });

  it('turns every failure into a calm code, and never throws', async () => {
    const answer = (status: number) =>
      jest.fn(async () => reply(status, {})) as unknown as typeof fetch;
    expect(await readPatternCards(entries, failing() as unknown as typeof fetch)).toEqual({
      status: 'error',
      code: 'offline',
      retryable: true,
    });
    expect(await readPatternCards(entries, answer(429))).toMatchObject({ code: 'busy' });
    expect(await readPatternCards(entries, answer(502))).toEqual({
      status: 'error',
      code: 'failed',
      retryable: true,
    });
    expect(await readPatternCards(entries, answer(401))).toEqual({
      status: 'error',
      code: 'failed',
      retryable: false,
    });
    const notJson = jest.fn(async () => new Response('not json')) as unknown as typeof fetch;
    expect(await readPatternCards(entries, notJson)).toMatchObject({ code: 'failed' });
  });
});
