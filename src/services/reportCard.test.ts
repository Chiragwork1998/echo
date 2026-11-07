import { installRuntime } from '@/storage/runtime';
import { createTestRuntime, everyStoredByte, type TestRuntime } from '@/storage/testing/nodePorts';

import type { InstallTokens } from './install';
import {
  cardReport,
  reportBody,
  reportCard,
  sealedShelf,
  sendReport,
  sendWaitingReports,
  type CardReport,
  type ReportShelf,
} from './reportCard';
import { INSTALL_TOKEN_HEADER, VOICE_TOKEN_HEADER } from './voiceApi';

const original = {
  url: process.env.EXPO_PUBLIC_VOICE_URL,
  token: process.env.EXPO_PUBLIC_VOICE_TOKEN,
};
beforeEach(() => {
  process.env.EXPO_PUBLIC_VOICE_URL = 'https://voice.echo.test';
  process.env.EXPO_PUBLIC_VOICE_TOKEN = 'shared-token';
});
afterEach(() => {
  process.env.EXPO_PUBLIC_VOICE_URL = original.url;
  process.env.EXPO_PUBLIC_VOICE_TOKEN = original.token;
});

const tokens: InstallTokens = {
  get: async () => 'install-token',
  renew: async () => null,
};

const report = cardReport({
  reason: 'wrong',
  lens: 'siegel_naming',
  model: 'gpt-6.1-sol',
  appVersion: '0.1.0',
});

const answer = (status: number, body: unknown = { received: true }) =>
  jest.fn(async () => new Response(JSON.stringify(body), { status }));
const offline = () =>
  jest.fn(async () => {
    throw new Error('offline');
  });

/** A shelf in memory, standing in for the sealed one. */
function memoryShelf(start: CardReport[] = []): ReportShelf & { held: CardReport[] } {
  const shelf = {
    held: [...start],
    load: async () => [...shelf.held],
    save: async (reports: CardReport[]) => {
      shelf.held = [...reports];
      return true;
    },
  };
  return shelf;
}

describe('a card report', () => {
  it('is four labels and nothing else', () => {
    expect(Object.keys(JSON.parse(reportBody(report)))).toEqual([
      'reason',
      'lens',
      'model',
      'appVersion',
    ]);
  });

  it('turns anything that is not a short label into null, so words cannot ride along', () => {
    expect(
      cardReport({
        reason: 'harmful',
        lens: 'I keep saying yes',
        model: 'a sentence from the card',
        appVersion: '',
      }),
    ).toEqual({ reason: 'harmful', lens: null, model: null, appVersion: null });
    expect(cardReport({ reason: 'other' })).toEqual({
      reason: 'other',
      lens: null,
      model: null,
      appVersion: null,
    });
  });

  it('goes to /api/report with the tokens and the four fields', async () => {
    const send = answer(200);
    expect(await sendReport(report, send as unknown as typeof fetch, tokens)).toBe('sent');
    const [url, init] = (send.mock.calls[0] ?? []) as unknown as [string, RequestInit];
    expect(url).toBe('https://voice.echo.test/api/report');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers[VOICE_TOKEN_HEADER]).toBe('shared-token');
    expect(headers[INSTALL_TOKEN_HEADER]).toBe('install-token');
    expect(JSON.parse(String(init.body))).toEqual({
      reason: 'wrong',
      lens: 'siegel_naming',
      model: 'gpt-6.1-sol',
      appVersion: '0.1.0',
    });
  });

  it('names what happened: offline, busy, refused, or no server in this build', async () => {
    expect(await sendReport(report, offline() as unknown as typeof fetch, tokens)).toBe('offline');
    expect(await sendReport(report, answer(503) as unknown as typeof fetch, tokens)).toBe('busy');
    expect(await sendReport(report, answer(429) as unknown as typeof fetch, tokens)).toBe('busy');
    expect(await sendReport(report, answer(400) as unknown as typeof fetch, tokens)).toBe(
      'refused',
    );
    process.env.EXPO_PUBLIC_VOICE_URL = '';
    expect(await sendReport(report, answer(200) as unknown as typeof fetch, tokens)).toBe(
      'unavailable',
    );
  });
});

describe('reportCard', () => {
  it('sends, and keeps nothing', async () => {
    const shelf = memoryShelf();
    const send = answer(200);
    expect(await reportCard(report, { send: send as unknown as typeof fetch, tokens, shelf })).toBe(
      'sent',
    );
    expect(shelf.held).toEqual([]);
  });

  it('keeps a report sealed on the phone when the server cannot be reached', async () => {
    const shelf = memoryShelf();
    const send = offline();
    expect(await reportCard(report, { send: send as unknown as typeof fetch, tokens, shelf })).toBe(
      'kept',
    );
    expect(shelf.held).toEqual([report]);
  });

  it('says it failed when it can neither be sent nor kept', async () => {
    const unreadable: ReportShelf = { load: async () => null, save: async () => false };
    const send = offline();
    expect(
      await reportCard(report, {
        send: send as unknown as typeof fetch,
        tokens,
        shelf: unreadable,
      }),
    ).toBe('failed');
    const refused = answer(400);
    expect(
      await reportCard(report, {
        send: refused as unknown as typeof fetch,
        tokens,
        shelf: memoryShelf(),
      }),
    ).toBe('failed');
  });
});

describe('the sealed shelf', () => {
  let rt: TestRuntime;
  beforeEach(async () => {
    rt = await createTestRuntime();
    installRuntime(rt);
  });
  afterEach(() => installRuntime(null));

  it('keeps waiting reports sealed, never as readable text, and lets them go', async () => {
    expect(await sealedShelf.load()).toEqual([]);
    expect(await sealedShelf.save([report])).toBe(true);
    expect(await sealedShelf.load()).toEqual([report]);
    expect(everyStoredByte(rt.root).includes('siegel_naming')).toBe(false);
    expect(await sealedShelf.save([])).toBe(true);
    expect(await sealedShelf.load()).toEqual([]);
  });

  it('says it cannot, rather than throwing, when storage is not open', async () => {
    installRuntime(null);
    expect(await sealedShelf.load()).toBeNull();
    expect(await sealedShelf.save([report])).toBe(false);
  });
});

describe('sendWaitingReports', () => {
  it('sends what waited, oldest first, and lets go of what went', async () => {
    const older = cardReport({ reason: 'harmful', lens: 'porges_states' });
    const shelf = memoryShelf([older, report]);
    const send = answer(200);
    await sendWaitingReports({ send: send as unknown as typeof fetch, tokens, shelf });
    expect(send).toHaveBeenCalledTimes(2);
    const first = (send.mock.calls[0] ?? []) as unknown as [string, RequestInit];
    expect(JSON.parse(String(first[1].body))).toMatchObject({ reason: 'harmful' });
    expect(shelf.held).toEqual([]);
  });

  it('stops at the first that still cannot go, and keeps the rest', async () => {
    const older = cardReport({ reason: 'harmful' });
    const shelf = memoryShelf([older, report]);
    const send = offline();
    await sendWaitingReports({ send: send as unknown as typeof fetch, tokens, shelf });
    expect(send).toHaveBeenCalledTimes(1);
    expect(shelf.held).toEqual([older, report]);
  });

  it('does nothing when nothing waits, or the shelf cannot be read', async () => {
    const send = answer(200);
    await sendWaitingReports({
      send: send as unknown as typeof fetch,
      tokens,
      shelf: memoryShelf(),
    });
    await sendWaitingReports({
      send: send as unknown as typeof fetch,
      tokens,
      shelf: { load: async () => null, save: async () => false },
    });
    expect(send).not.toHaveBeenCalled();
  });
});
