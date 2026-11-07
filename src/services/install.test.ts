import { installRuntime, type Runtime } from '@/storage/runtime';

import {
  forgetInstallIdInMemory,
  getInstallId,
  getInstallToken,
  INSTALL_ID_NAME,
  INSTALL_TOKEN_NAME,
  renewInstallToken,
  withInstallToken,
} from './install';

function fakeRuntime(store: Map<string, string>, ids: string[], failFirstRead = false): Runtime {
  let next = 0;
  let reads = 0;
  return {
    secrets: {
      get: async (name: string) => {
        reads += 1;
        if (failFirstRead && reads === 1) throw new Error('store unavailable');
        return store.get(name) ?? null;
      },
      set: async (name: string, value: string) => void store.set(name, value),
      remove: async (name: string) => void store.delete(name),
    },
    newId: () => ids[next++] ?? 'unexpected',
  } as unknown as Runtime;
}

describe('getInstallId', () => {
  afterEach(() => {
    forgetInstallIdInMemory();
    installRuntime(null);
  });

  it('makes one id the first time and keeps it in the secure store', async () => {
    const store = new Map<string, string>();
    installRuntime(fakeRuntime(store, ['made-once', 'made-twice']));
    await expect(getInstallId()).resolves.toBe('made-once');
    await expect(getInstallId()).resolves.toBe('made-once');
    expect(store.get(INSTALL_ID_NAME)).toBe('made-once');
  });

  it('reads the id a previous launch kept, and makes no new one', async () => {
    const store = new Map([[INSTALL_ID_NAME, 'kept-before']]);
    installRuntime(fakeRuntime(store, ['should-not-be-used']));
    await expect(getInstallId()).resolves.toBe('kept-before');
  });

  it('does not keep a failure, so the next call can succeed', async () => {
    const store = new Map([[INSTALL_ID_NAME, 'kept-before']]);
    installRuntime(fakeRuntime(store, [], true));
    await expect(getInstallId()).rejects.toThrow('store unavailable');
    await expect(getInstallId()).resolves.toBe('kept-before');
  });
});

describe('the install token', () => {
  const NOW = Date.UTC(2026, 10, 8, 9, 0, 0);
  const DAY = 86_400_000;
  const api = { url: 'https://voice.example.com', token: 'shared-app-token' };
  const issued = (token: string, days = 30) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ token, expiresAt: new Date(NOW + days * DAY).toISOString() }),
    }) as Response;
  const answer = (status: number) =>
    ({ ok: false, status, json: async () => ({ error: 'nope' }) }) as unknown as Response;

  let store: Map<string, string>;
  let send: jest.Mock;
  let now: number;
  const deps = () => ({ fetch: send as unknown as typeof fetch, now: () => now });

  beforeEach(() => {
    now = NOW;
    store = new Map([[INSTALL_ID_NAME, 'install-1234-5678-abcd']]);
    installRuntime(fakeRuntime(store, []));
    send = jest.fn(async () => issued('ei1.first'));
  });
  afterEach(() => {
    forgetInstallIdInMemory();
    installRuntime(null);
  });

  it('is asked for once, with the install id and the shared token, and kept in the secure store', async () => {
    await expect(getInstallToken(api, deps())).resolves.toBe('ei1.first');
    await expect(getInstallToken(api, deps())).resolves.toBe('ei1.first');
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://voice.example.com/api/install');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-echo-voice-token': 'shared-app-token' });
    expect(JSON.parse(String(init.body))).toEqual({ installId: 'install-1234-5678-abcd' });
    expect(JSON.parse(store.get(INSTALL_TOKEN_NAME)!)).toMatchObject({
      token: 'ei1.first',
      origin: 'https://voice.example.com',
    });
  });

  it('is read from the secure store on the next launch, without asking', async () => {
    await getInstallToken(api, deps());
    forgetInstallIdInMemory();
    await expect(getInstallToken(api, deps())).resolves.toBe('ei1.first');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('is replaced a day before it ends, and still used if the replacement cannot be had', async () => {
    await getInstallToken(api, deps());
    now = NOW + 29.5 * DAY;
    send.mockResolvedValueOnce(answer(503));
    await expect(getInstallToken(api, deps())).resolves.toBe('ei1.first');
    now = NOW + 31 * DAY;
    send.mockResolvedValueOnce(issued('ei1.second', 61));
    await expect(getInstallToken(api, deps())).resolves.toBe('ei1.second');
  });

  it('is never used with another server, which could not read it', async () => {
    await getInstallToken(api, deps());
    send.mockResolvedValueOnce(issued('ei1.local'));
    const local = { url: 'http://127.0.0.1:8787', token: 'shared-app-token' };
    await expect(getInstallToken(local, deps())).resolves.toBe('ei1.local');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('is asked for once when several requests need it at the same moment', async () => {
    const all = await Promise.all([1, 2, 3, 4].map(() => getInstallToken(api, deps())));
    expect(all).toEqual(['ei1.first', 'ei1.first', 'ei1.first', 'ei1.first']);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('is null, and nothing throws, without a connection or from a server that issues none', async () => {
    send.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(getInstallToken(api, deps())).resolves.toBeNull();
    // Not asked again for a minute: requests go on with the shared token meanwhile.
    await expect(getInstallToken(api, deps())).resolves.toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    now += 61_000;
    send.mockResolvedValueOnce(answer(404));
    await expect(getInstallToken(api, deps())).resolves.toBeNull();
    send.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
    now += 61_000;
    await expect(getInstallToken(api, deps())).resolves.toBeNull();
    await expect(getInstallToken(null, deps())).resolves.toBeNull();
  });

  it('is renewed after the server refuses it, and forgotten from the store first', async () => {
    await getInstallToken(api, deps());
    send.mockResolvedValueOnce(issued('ei1.renewed'));
    await expect(renewInstallToken(api, 'ei1.first', deps())).resolves.toBe('ei1.renewed');
    expect(JSON.parse(store.get(INSTALL_TOKEN_NAME)!).token).toBe('ei1.renewed');
    // A refusal is acted on at once, even straight after a failure to ask.
    send.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(renewInstallToken(api, 'ei1.renewed', deps())).resolves.toBeNull();
    expect(store.has(INSTALL_TOKEN_NAME)).toBe(false);
    send.mockResolvedValueOnce(issued('ei1.third'));
    await expect(renewInstallToken(api, null, deps())).resolves.toBe('ei1.third');
  });

  it('is renewed once for many requests that were refused together', async () => {
    await getInstallToken(api, deps());
    send.mockResolvedValue(issued('ei1.renewed'));
    const renewed = await Promise.all(
      [1, 2, 3].map(() => renewInstallToken(api, 'ei1.first', deps())),
    );
    expect(renewed).toEqual(['ei1.renewed', 'ei1.renewed', 'ei1.renewed']);
    // Once to issue the first, once to renew it: never once for each refused request.
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('is sent once, and once more only after the server refuses it (withInstallToken)', async () => {
    const tokens = {
      get: jest.fn(async () => 'ei1.a'),
      renew: jest.fn(async (): Promise<string | null> => 'ei1.b'),
    };
    const attempt = jest.fn(async (token: string | null) =>
      token === 'ei1.a' ? 'refused' : 'done',
    );
    const refused = (result: string) => result === 'refused';
    await expect(withInstallToken(api, attempt, refused, tokens)).resolves.toBe('done');
    expect(attempt.mock.calls).toEqual([['ei1.a'], ['ei1.b']]);
    // No new token to be had: once more with the shared token alone, which an older server serves.
    tokens.renew.mockResolvedValueOnce(null);
    attempt.mockClear();
    await expect(withInstallToken(api, attempt, refused, tokens)).resolves.toBe('done');
    expect(attempt.mock.calls).toEqual([['ei1.a'], [null]]);
    // Nothing was sent with a token, and none can be had: nothing more to try.
    const none = { get: jest.fn(async () => null), renew: jest.fn(async () => null) };
    const always = jest.fn(async () => 'refused');
    await expect(withInstallToken(api, always, refused, none)).resolves.toBe('refused');
    expect(always).toHaveBeenCalledTimes(1);
  });
});
