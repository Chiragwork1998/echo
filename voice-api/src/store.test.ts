import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemoryStore, createUpstashStore, StoreError, type Counter, type QuotaStore } from './store.js';

/**
 * Upstash's REST API in miniature: /multi-exec and / over a map, with Redis's own meaning for each
 * command the store uses. Each transaction runs whole, as Redis runs MULTI/EXEC, and transactions
 * from different requests interleave at random when `jitter` is on, as they would across instances.
 */
function fakeUpstash(options: { jitter?: boolean; clock?: () => number } = {}) {
  const data = new Map<string, { value: string; expireAt: number | null }>();
  const clock = options.clock ?? Date.now;
  const commands: string[][] = [];
  const get = (key: string) => {
    const held = data.get(key);
    if (held && held.expireAt !== null && held.expireAt * 1000 <= clock()) {
      data.delete(key);
      return undefined;
    }
    return held;
  };
  const run = (command: string[]): { result?: unknown; error?: string } => {
    commands.push(command);
    const [name, key = '', ...args] = command;
    switch (name) {
      case 'INCRBY':
      case 'DECRBY': {
        const held = get(key);
        const next = Number(held?.value ?? 0) + (name === 'INCRBY' ? 1 : -1) * Number(args[0]);
        data.set(key, { value: String(next), expireAt: held?.expireAt ?? null });
        return { result: next };
      }
      case 'EXPIREAT': {
        const held = get(key);
        if (!held) return { result: 0 };
        held.expireAt = Number(args[0]);
        return { result: 1 };
      }
      case 'GET':
        return { result: get(key)?.value ?? null };
      case 'SET':
        data.set(key, { value: args[0]!, expireAt: args[1] === 'EX' ? Math.floor(clock() / 1000) + Number(args[2]) : null });
        return { result: 'OK' };
      default:
        return { error: `ERR unknown command '${name}'` };
    }
  };
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer upstash-token');
    if (options.jitter) await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
    const body = JSON.parse(String(init?.body)) as string[] | string[][];
    if (String(url).endsWith('/multi-exec')) return Response.json((body as string[][]).map(run));
    return Response.json(run(body as string[]));
  }) as typeof globalThis.fetch;
  return { data, commands, fetch };
}

const upstash = (fake: ReturnType<typeof fakeUpstash>) =>
  createUpstashStore({ url: 'https://example.upstash.io/', token: 'upstash-token', fetch: fake.fetch });

const counter = (key: string, amount: number, limit: number | null, expireAt: number | null = null): Counter => ({
  key,
  amount,
  limit,
  expireAt,
});

for (const [name, make] of [
  ['memory', () => createMemoryStore()],
  ['upstash', () => upstash(fakeUpstash())],
] as const) {
  test(`${name}: counts up to a limit, to the unit, and a refusal keeps nothing`, async () => {
    const store: QuotaStore = make();
    assert.deepEqual(await store.spend([counter('a', 59, 60)]), { ok: true });
    assert.deepEqual(await store.spend([counter('a', 1, 60)]), { ok: true });
    assert.deepEqual(await store.spend([counter('a', 1, 60)]), { ok: false, index: 0, used: 60 });
    assert.deepEqual(await store.read(['a', 'never']), [60, 0]);
  });

  test(`${name}: several counters are taken together, or not at all`, async () => {
    const store: QuotaStore = make();
    await store.spend([counter('guard', 9, null)]);
    const refused = await store.spend([counter('mine', 5, 100), counter('guard', 2, 10)]);
    assert.deepEqual(refused, { ok: false, index: 1, used: 9 });
    assert.deepEqual(await store.read(['mine', 'guard']), [0, 9]);
    // No limit means counted, never refused.
    assert.deepEqual(await store.spend([counter('guard', 50, null)]), { ok: true });
    assert.deepEqual(await store.read(['guard']), [59]);
  });

  test(`${name}: a refund gives back what was taken`, async () => {
    const store: QuotaStore = make();
    await store.spend([counter('a', 30, 60), counter('b', 1, 5)]);
    await store.refund([counter('a', 30, 60)]);
    assert.deepEqual(await store.read(['a', 'b']), [0, 1]);
  });

  test(`${name}: short notes are kept for as long as asked`, async () => {
    const store: QuotaStore = make();
    assert.equal(await store.getText('plan'), null);
    await store.setText('plan', 'plus:1', 600);
    assert.equal(await store.getText('plan'), 'plus:1');
  });
}

test('memory: a counter is forgotten when its period is over', async () => {
  let now = Date.UTC(2026, 10, 30, 23, 59);
  const store = createMemoryStore(() => now);
  const endOfMonth = Date.UTC(2026, 11, 1) / 1000;
  await store.spend([counter('voice:2026-11', 60, 60, endOfMonth)]);
  assert.deepEqual(await store.read(['voice:2026-11']), [60]);
  now = Date.UTC(2026, 11, 1, 0, 1);
  assert.deepEqual(await store.read(['voice:2026-11']), [0]);
  await store.setText('note', 'x', 60);
  now += 61_000;
  assert.equal(await store.getText('note'), null);
});

test('upstash: one transaction per spend, each counter given its expiry, and the token sent', async () => {
  const fake = fakeUpstash();
  const store = upstash(fake);
  await store.spend([counter('a', 5, 10, 1_900_000_000), counter('ever', 1, 1)]);
  assert.deepEqual(fake.commands, [
    ['INCRBY', 'a', '5'],
    ['EXPIREAT', 'a', '1900000000'],
    ['INCRBY', 'ever', '1'],
  ]);
  assert.equal(fake.data.get('a')?.expireAt, 1_900_000_000);
  assert.equal(fake.data.get('ever')?.expireAt, null);
});

test('upstash: racing requests are never let past a limit together', async () => {
  const fake = fakeUpstash({ jitter: true });
  const store = upstash(fake);
  // Sixty minutes, and forty requests of two minutes each arriving at once from many instances.
  const results = await Promise.all(
    Array.from({ length: 40 }, () => store.spend([counter('voice', 120_000, 3_600_000), counter('guard', 1, null)])),
  );
  const admitted = results.filter((result) => result.ok).length;
  assert.ok(admitted <= 30, `admitted ${admitted}`);
  // What is held is exactly what was let in: every refusal took back what it added.
  assert.deepEqual(await store.read(['voice', 'guard']), [admitted * 120_000, admitted]);
});

test('upstash: an outage or a bad answer is a StoreError, never a count of zero', async () => {
  const down = createUpstashStore({
    url: 'https://example.upstash.io',
    token: 't',
    fetch: (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch,
  });
  await assert.rejects(down.spend([counter('a', 1, 1)]), StoreError);
  await assert.rejects(down.read(['a']), StoreError);
  for (const reply of [new Response('', { status: 500 }), Response.json({ error: 'WRONGPASS' }), Response.json([{ error: 'ERR' }])]) {
    const broken = createUpstashStore({
      url: 'https://example.upstash.io',
      token: 't',
      fetch: (async () => reply.clone()) as typeof fetch,
    });
    await assert.rejects(broken.spend([counter('a', 1, 1)]), StoreError);
  }
});
