import { resetPreferences, usePreferences } from '@/state/preferences';

import { liveAddress, openLiveSocket, type LiveDeps, type LiveEvent } from './liveTranscription';

const API = { url: 'http://127.0.0.1:8787', token: 'app-token' };
const SECRET = 'ek_short_lived';
const UPDATE = { type: 'session.update', session: { type: 'transcription' } };

const granted = (
  body: unknown = {
    url: 'wss://api.openai.com/v1/realtime?intent=transcription',
    secret: SECRET,
    update: UPDATE,
  },
) => ({ ok: true, status: 200, json: async () => body }) as Response;

class FakeSocket {
  static last: FakeSocket;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
}

const deps = (overrides: Partial<LiveDeps> = {}): Partial<LiveDeps> => ({
  fetch: jest.fn(async () => granted()),
  api: API,
  WebSocket: FakeSocket,
  timeoutMs: 500,
  allowed: () => true,
  ...overrides,
});

describe('liveAddress', () => {
  it('takes only OpenAI realtime over wss', () => {
    for (const accepted of [
      'wss://api.openai.com/v1/realtime?intent=transcription',
      'wss://api.openai.com/v1/realtime',
      'wss://api.openai.com/v1/realtime/',
    ]) {
      expect(liveAddress(accepted, false)).toBe(accepted);
    }
  });

  it('refuses every other host, however much it looks like OpenAI, and anything in the clear', () => {
    for (const refused of [
      'wss://realtime.example.org/v1?intent=transcription',
      'wss://realtime.example.org/v1/realtime',
      'wss://api.openai.com.example.org/v1/realtime',
      'wss://example.org/api.openai.com/v1/realtime',
      'wss://api.openai.com@example.org/v1/realtime',
      'wss://example.org@api.openai.com/v1/realtime',
      'wss://api.openai.com\\@example.org/v1/realtime',
      'wss://api.openai.com.:443/v1/realtime',
      'wss://api.openai.com:8443/v1/realtime',
      'wss://API.OPENAI.COM/v1/realtime',
      // The right host, but not the realtime API.
      'wss://api.openai.com',
      'wss://api.openai.com/',
      'wss://api.openai.com/v1/audio/transcriptions',
      'wss://api.openai.com/v1/realtimeX',
      'wss://api.openai.com/v1/realtime/../models',
      // In the clear, or not a socket.
      'ws://api.openai.com/v1/realtime',
      'ws://realtime.example.org/v1',
      'ws://127.0.0.1:8798',
      'https://api.openai.com/v1/realtime',
      'wss://',
      'wss://host with space',
      '',
      undefined,
      42,
    ]) {
      expect(liveAddress(refused, false)).toBeNull();
    }
  });

  it('allows this Mac loopback in a development build only', () => {
    expect(liveAddress('ws://127.0.0.1:8798/x', true)).toBe('ws://127.0.0.1:8798/x');
    expect(liveAddress('ws://localhost:8798', true)).toBe('ws://localhost:8798');
    expect(liveAddress('ws://127.0.0.1:8798/x', false)).toBeNull();
    expect(liveAddress('ws://remote.example.org/x', true)).toBeNull();
    expect(liveAddress('ws://127.0.0.1.example.org/x', true)).toBeNull();
    // A development build still pins a secure address: only the loopback is relaxed.
    expect(liveAddress('wss://realtime.example.org/v1/realtime', true)).toBeNull();
  });
});

describe('openLiveSocket and consent', () => {
  const handlers = () => ({ onEvent: jest.fn<void, [LiveEvent]>(), onClose: jest.fn() });
  beforeEach(() => resetPreferences());

  it('asks the server for nothing and opens nothing when live words are not allowed', async () => {
    const given = deps({ allowed: () => false });
    FakeSocket.last = undefined as unknown as FakeSocket;
    expect(await openLiveSocket(handlers(), given)).toBeNull();
    expect(given.fetch).not.toHaveBeenCalled();
    expect(FakeSocket.last).toBeUndefined();
  });

  it("reads the person's own choice unless told otherwise, so no caller can stream without it", async () => {
    const { allowed: _skipped, ...asked } = deps();
    FakeSocket.last = undefined as unknown as FakeSocket;

    // Never asked, then allowed to send a voice but not to stream it, then keeping the voice on the phone.
    for (const choose of [
      () => undefined,
      () => usePreferences.getState().setVoiceConsent('allowed'),
      () => usePreferences.getState().setVoiceConsent('voice_only'),
    ]) {
      choose();
      expect(await openLiveSocket(handlers(), asked)).toBeNull();
    }
    expect(asked.fetch).not.toHaveBeenCalled();
    expect(FakeSocket.last).toBeUndefined();

    // Agreed to live words: now it asks, and connects.
    usePreferences.getState().allowLiveWords();
    const opening = openLiveSocket(handlers(), asked);
    await new Promise((resolve) => setImmediate(resolve));
    FakeSocket.last.onopen?.();
    expect(await opening).not.toBeNull();
    expect(asked.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('openLiveSocket', () => {
  const handlers = () => ({ onEvent: jest.fn<void, [LiveEvent]>(), onClose: jest.fn() });

  it('asks ECHO for a secret with the app token, then connects to the address it was given', async () => {
    const given = deps();
    const opening = openLiveSocket(handlers(), given);
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    FakeSocket.last.onopen?.();
    const socket = await opening;
    expect(socket).not.toBeNull();

    const [url, init] = (given.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8787/api/live-session');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-echo-voice-token']).toBe('app-token');

    expect(FakeSocket.last.url).toBe('wss://api.openai.com/v1/realtime?intent=transcription');
    expect(FakeSocket.last.protocols).toEqual(['realtime', `openai-insecure-api-key.${SECRET}`]);
    // The secret travels in the subprotocol, never in the address.
    expect(FakeSocket.last.url).not.toContain(SECRET);
    // The first message is the session setup the server gave, exactly.
    expect(JSON.parse(FakeSocket.last.sent[0]!)).toEqual(UPDATE);
  });

  it('sends audio and commits as the transcription session expects, and reports what comes back', async () => {
    const h = handlers();
    const opening = openLiveSocket(h, deps());
    await new Promise((resolve) => setImmediate(resolve));
    FakeSocket.last.onopen?.();
    const socket = (await opening)!;

    socket.appendAudio('AAAA');
    socket.commit();
    expect(JSON.parse(FakeSocket.last.sent[1]!)).toEqual({
      type: 'input_audio_buffer.append',
      audio: 'AAAA',
    });
    expect(JSON.parse(FakeSocket.last.sent[2]!)).toEqual({ type: 'input_audio_buffer.commit' });

    FakeSocket.last.onmessage?.({
      data: JSON.stringify({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'i',
        delta: ' hi',
      }),
    });
    FakeSocket.last.onmessage?.({ data: JSON.stringify({ type: 'session.updated' }) });
    expect(h.onEvent).toHaveBeenCalledTimes(1);
    expect(h.onEvent).toHaveBeenCalledWith({ kind: 'delta', itemId: 'i', text: ' hi' });
  });

  it('reports a connection that ends once, and says nothing after it hangs up itself', async () => {
    const h = handlers();
    const opening = openLiveSocket(h, deps());
    await new Promise((resolve) => setImmediate(resolve));
    FakeSocket.last.onopen?.();
    const socket = (await opening)!;
    FakeSocket.last.onclose?.();
    FakeSocket.last.onerror?.();
    expect(h.onClose).toHaveBeenCalledTimes(1);

    const again = handlers();
    const second = openLiveSocket(again, deps());
    await new Promise((resolve) => setImmediate(resolve));
    FakeSocket.last.onopen?.();
    const live = (await second)!;
    live.close();
    expect(FakeSocket.last.closed).toBe(true);
    FakeSocket.last.onclose?.();
    expect(again.onClose).not.toHaveBeenCalled();
    expect(socket).toBeDefined();
  });

  it.each<[string, Partial<LiveDeps>]>([
    ['no server address or token', { api: null }],
    [
      'a refusal',
      {
        fetch: jest.fn(
          async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response,
        ),
      },
    ],
    ['the network failing', { fetch: jest.fn(async () => Promise.reject(new Error('down'))) }],
    [
      'a reply with no secret',
      {
        fetch: jest.fn(async () =>
          granted({ url: 'wss://api.openai.com/v1/realtime', update: UPDATE }),
        ),
      },
    ],
    [
      'an address that is not OpenAI',
      {
        fetch: jest.fn(async () =>
          granted({ url: 'wss://realtime.example.org/v1/realtime', secret: SECRET }),
        ),
      },
    ],
    [
      'an address in the clear',
      { fetch: jest.fn(async () => granted({ url: 'ws://x.example.org/', secret: SECRET })) },
    ],
  ])('is null, and opens nothing, for %s', async (_name, overrides) => {
    FakeSocket.last = undefined as unknown as FakeSocket;
    expect(await openLiveSocket(handlers(), deps(overrides))).toBeNull();
    expect(FakeSocket.last).toBeUndefined();
  });

  it('is null if the socket errors before it opens, or never opens', async () => {
    const failing = openLiveSocket(handlers(), deps());
    await new Promise((resolve) => setImmediate(resolve));
    FakeSocket.last.onerror?.();
    expect(await failing).toBeNull();

    jest.useFakeTimers();
    const slow = openLiveSocket(handlers(), deps());
    await jest.advanceTimersByTimeAsync(10);
    jest.advanceTimersByTime(600);
    expect(await slow).toBeNull();
    expect(FakeSocket.last.closed).toBe(true);
    jest.useRealTimers();
  });
});
