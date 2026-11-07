import assert from 'node:assert/strict';
import { test } from 'node:test';

import { activeIn, CACHE_SECONDS, createEntitlements, ownersFrom } from './entitlement.js';
import { createMemoryStore } from './store.js';

const ID = '7c6b5a49-3827-4165-a4b3-c2d1e0f9a8b7';
const OWNER = '11111111-2222-4333-8444-555555555555';
const T0 = Date.UTC(2026, 10, 8, 9, 0, 0);

const subscriber = (plus?: { expires_date?: string | null; grace_period_expires_date?: string | null }) => ({
  request_date: '2026-11-08T09:00:00Z',
  subscriber: { entitlements: plus ? { plus } : {}, subscriptions: {} },
});

function setup(options: { key?: string; reply?: () => Response | Promise<Response> } = {}) {
  let now = T0;
  const asked: string[] = [];
  const headers: Record<string, string>[] = [];
  let reply = options.reply ?? (() => Response.json(subscriber({ expires_date: '2026-12-08T09:00:00Z' })));
  const store = createMemoryStore(() => now);
  const entitlementOf = createEntitlements({
    secretKey: 'key' in options ? options.key : 'sk_rc_secret',
    owners: ownersFrom(` ${OWNER} , ,`),
    store,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      asked.push(String(url));
      headers.push(init?.headers as Record<string, string>);
      return reply();
    }) as typeof fetch,
    now: () => now,
  });
  return {
    entitlementOf,
    asked,
    headers,
    advance: (ms: number) => void (now += ms),
    answer: (next: () => Response | Promise<Response>) => void (reply = next),
  };
}

test('the plus entitlement is active with no end, an end to come, or a grace period to come', () => {
  assert.equal(activeIn(subscriber({ expires_date: null }), T0), true);
  assert.equal(activeIn(subscriber({ expires_date: '2026-11-09T00:00:00Z' }), T0), true);
  assert.equal(activeIn(subscriber({ expires_date: '2026-11-01T00:00:00Z' }), T0), false);
  assert.equal(
    activeIn(subscriber({ expires_date: '2026-11-01T00:00:00Z', grace_period_expires_date: '2026-11-10T00:00:00Z' }), T0),
    true,
  );
  assert.equal(activeIn(subscriber(), T0), false);
  assert.equal(activeIn({ subscriber: { entitlements: { pro: { expires_date: null } } } }, T0), false);
  assert.equal(activeIn(null, T0), false);
  assert.equal(activeIn({ subscriber: { entitlements: { plus: { expires_date: 'not a date' } } } }, T0), false);
});

test('RevenueCat is asked with the secret key, about this install only', async () => {
  const { entitlementOf, asked, headers } = setup();
  assert.deepEqual(await entitlementOf(ID), { plan: 'plus', source: 'revenuecat', checkedAt: T0 });
  assert.deepEqual(asked, [`https://api.revenuecat.com/v1/subscribers/${ID}`]);
  assert.equal(headers[0]?.Authorization, 'Bearer sk_rc_secret');
});

test('an answer is kept about ten minutes, then asked again', async () => {
  const { entitlementOf, asked, advance, answer } = setup();
  await entitlementOf(ID);
  advance(9 * 60_000);
  assert.deepEqual(await entitlementOf(ID), { plan: 'plus', source: 'cache', checkedAt: T0 });
  assert.equal(asked.length, 1);
  // The subscription lapsed. Until the cache ends the answer stands, and then the new one is heard.
  answer(() => Response.json(subscriber({ expires_date: '2026-11-01T00:00:00Z' })));
  advance(CACHE_SECONDS * 1000 - 9 * 60_000 + 1);
  assert.equal((await entitlementOf(ID)).plan, 'free');
  assert.equal(asked.length, 2);
});

test('asking fresh skips the cache, so a new subscriber is heard at once', async () => {
  const { entitlementOf, asked, answer } = setup({ reply: () => Response.json(subscriber()) });
  assert.equal((await entitlementOf(ID)).plan, 'free');
  answer(() => Response.json(subscriber({ expires_date: null })));
  assert.equal((await entitlementOf(ID)).plan, 'free');
  assert.equal((await entitlementOf(ID, true)).plan, 'plus');
  // And the fresh answer is what is kept.
  assert.equal((await entitlementOf(ID)).plan, 'plus');
  assert.equal(asked.length, 2);
});

test('RevenueCat down means free, never unlimited, and is not asked again on every request', async () => {
  for (const outage of [
    () => new Response('', { status: 503 }),
    () => new Response('', { status: 401 }),
    () => new Response('not json', { status: 200 }),
    () => Promise.reject(new TypeError('fetch failed')),
  ]) {
    const { entitlementOf, asked, advance, answer } = setup({ reply: outage });
    assert.deepEqual(await entitlementOf(ID), { plan: 'free', source: 'unavailable', checkedAt: T0 });
    assert.equal((await entitlementOf(ID)).plan, 'free');
    assert.equal(asked.length, 1);
    // An outage is not kept as an answer: once it is over, a subscriber is Plus again.
    answer(() => Response.json(subscriber({ expires_date: null })));
    advance(31_000);
    assert.equal((await entitlementOf(ID)).plan, 'plus');
  }
});

test('the owner is Plus without asking anyone, and with no key everyone is', async () => {
  const configured = setup();
  assert.deepEqual(await configured.entitlementOf(OWNER), { plan: 'plus', source: 'owner', checkedAt: T0 });
  assert.equal(configured.asked.length, 0);
  const open = setup({ key: undefined });
  assert.deepEqual(await open.entitlementOf(ID), { plan: 'plus', source: 'unconfigured', checkedAt: T0 });
  assert.equal(open.asked.length, 0);
  assert.deepEqual([...ownersFrom(undefined)], []);
});
