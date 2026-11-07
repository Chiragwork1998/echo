import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createEntitlements, ownersFrom } from './entitlement.js';
import {
  ALLOWANCES,
  ceilingsFrom,
  DEFAULT_CEILINGS,
  meter,
  monthOf,
  nextMonth,
  voiceUsage,
  type Caller,
  type MeterContext,
} from './meter.js';
import { createMemoryStore } from './store.js';
import { installKey } from './token.js';

const ID = '5e4d3c2b-1a09-4f8e-9d7c-6b5a49382716';
const caller: Caller = { kind: 'install', installId: ID, key: installKey(ID) };
const MINUTE = 60_000;

/** A meter whose plan is decided by `plan()`, at a time that can be moved. */
function setup(options: { plan?: () => 'free' | 'plus'; start?: number; ceilings?: Partial<typeof DEFAULT_CEILINGS> } = {}) {
  let now = options.start ?? Date.UTC(2026, 10, 30, 23, 0, 0);
  let asked = 0;
  const store = createMemoryStore(() => now);
  const context: MeterContext = {
    store,
    ceilings: { ...DEFAULT_CEILINGS, ...options.ceilings },
    now: () => now,
    entitlementOf: options.plan
      ? async () => ({ plan: options.plan!(), source: 'revenuecat', checkedAt: now })
      : createEntitlements({
          secretKey: 'sk_rc',
          owners: ownersFrom(''),
          store,
          fetch: (async () => {
            asked += 1;
            return Response.json({ subscriber: { entitlements: {} } });
          }) as typeof fetch,
          now: () => now,
        }),
  };
  return { context, store, advance: (ms: number) => void (now += ms), at: (ms: number) => void (now = ms), asked: () => asked };
}

test('a free month is 60 minutes, and the next month starts again from nothing', async () => {
  const { context, at } = setup({ plan: () => 'free' });
  at(Date.UTC(2026, 10, 30, 23, 0, 0));
  assert.ok((await meter(context, caller, 'voice', 59 * MINUTE, { audioMs: 59 * MINUTE })).ok);
  assert.ok((await meter(context, caller, 'voice', MINUTE, { audioMs: MINUTE })).ok);
  const refused = await meter(context, caller, 'voice', 1, { audioMs: 1 });
  assert.equal(refused.ok, false);
  assert.deepEqual(!refused.ok && refused.refusal, {
    status: 402,
    body: { error: 'allowance_used', feature: 'voice', plan: 'free', resetsAt: '2026-12-01T00:00:00.000Z' },
  });
  // A minute before midnight UTC on the last day it is still November's allowance...
  at(Date.UTC(2026, 10, 30, 23, 59, 59));
  assert.equal((await meter(context, caller, 'voice', 1, { audioMs: 1 })).ok, false);
  // ...and at midnight it is December's.
  at(Date.UTC(2026, 11, 1, 0, 0, 0));
  assert.ok((await meter(context, caller, 'voice', 60 * MINUTE, { audioMs: 60 * MINUTE })).ok);
  assert.equal((await meter(context, caller, 'voice', 1, { audioMs: 1 })).ok, false);
});

test('months are UTC months, and the year turns over', () => {
  assert.equal(monthOf(Date.UTC(2026, 11, 31, 23, 59, 59)), '2026-12');
  assert.equal(monthOf(Date.UTC(2027, 0, 1, 0, 0, 0)), '2027-01');
  assert.equal(nextMonth(Date.UTC(2026, 11, 15)), Date.UTC(2027, 0, 1));
});

test('Plus is 20 hours a month', async () => {
  const { context } = setup({ plan: () => 'plus' });
  assert.ok((await meter(context, caller, 'voice', ALLOWANCES.plus.voiceMs, {})).ok);
  const refused = await meter(context, caller, 'voice', 1, {});
  assert.equal(!refused.ok && refused.refusal.status, 402);
  assert.equal(!refused.ok && refused.refusal.status === 402 && refused.refusal.body.plan, 'plus');
});

test('the first reading is free, for ever, and a lapsed subscriber does not get it back', async () => {
  let plan: 'free' | 'plus' = 'free';
  const { context, advance } = setup({ plan: () => plan });
  assert.ok((await meter(context, caller, 'patterns', 1, {})).ok);
  const second = await meter(context, caller, 'patterns', 1, {});
  assert.deepEqual(!second.ok && second.refusal.body, {
    error: 'allowance_used',
    feature: 'patterns',
    plan: 'free',
    resetsAt: null,
  });
  // Months later, still used.
  advance(90 * 24 * 60 * MINUTE);
  assert.equal((await meter(context, caller, 'patterns', 1, {})).ok, false);
  // Plus reads; and when Plus ends, the free reading is not new again.
  plan = 'plus';
  assert.ok((await meter(context, caller, 'patterns', 1, {})).ok);
  plan = 'free';
  assert.equal((await meter(context, caller, 'patterns', 1, {})).ok, false);
});

test('a reading that made no cards is given back, and the attempt still counts', async () => {
  const { context } = setup({ plan: () => 'free' });
  for (let attempt = 0; attempt < ALLOWANCES.free.readingTries; attempt += 1) {
    const reading = await meter(context, caller, 'patterns', 1, {});
    assert.ok(reading.ok);
    await reading.held.refund(['use']);
  }
  // Five tries that found nothing: the free reading is still there, but not this month.
  const sixth = await meter(context, caller, 'patterns', 1, {});
  assert.equal(!sixth.ok && sixth.refusal.status === 402 && sixth.refusal.body.resetsAt, '2026-12-01T00:00:00.000Z');
});

test('live words and tidy are not in the free plan, and refusing them takes nothing', async () => {
  const { context, store } = setup({ plan: () => 'free' });
  for (const feature of ['live-words', 'tidy'] as const) {
    const refused = await meter(context, caller, feature, 1, { calls: 1 });
    assert.deepEqual(!refused.ok && refused.refusal.body, { error: 'allowance_used', feature, plan: 'free', resetsAt: null });
  }
  assert.equal(store.size(), 0);
});

test('Plus caps live words, tidy and readings by the month', async () => {
  const { context } = setup({ plan: () => 'plus' });
  for (const [feature, cap] of [
    ['live-words', ALLOWANCES.plus.live],
    ['tidy', ALLOWANCES.plus.tidy],
    ['patterns', ALLOWANCES.plus.readings],
  ] as const) {
    for (let used = 0; used < cap; used += 1) assert.ok((await meter(context, caller, feature, 1, {})).ok);
    const refused = await meter(context, caller, feature, 1, {});
    assert.equal(!refused.ok && refused.refusal.status, 402, feature);
  }
});

test('the day ceilings refuse everyone with busy, until the next UTC day', async () => {
  const start = Date.UTC(2026, 10, 8, 22, 0, 0);
  const { context, at } = setup({ plan: () => 'plus', start, ceilings: { audioMs: 10 * MINUTE, calls: 5 } });
  assert.ok((await meter(context, caller, 'voice', 10 * MINUTE, { audioMs: 10 * MINUTE, calls: 1 })).ok);
  const busy = await meter(context, caller, 'voice', 1, { audioMs: 1, calls: 1 });
  assert.deepEqual(!busy.ok && busy.refusal, { status: 503, body: { error: 'busy', retryAfter: 7_200 } });
  // The install's own allowance was not touched by the refusal.
  assert.deepEqual((await voiceUsage(context, caller)).voice?.usedSeconds, 600);
  // The shared token from older builds is held to the same ceiling, and only to it.
  const legacy = await meter(context, { kind: 'legacy' }, null, 0, { audioMs: 1 });
  assert.equal(!legacy.ok && legacy.refusal.status, 503);
  at(Date.UTC(2026, 10, 9, 0, 0, 0));
  assert.ok((await meter(context, { kind: 'legacy' }, null, 0, { audioMs: 10 * MINUTE })).ok);
});

test('model calls are reserved at the most and settled at what was made', async () => {
  const { context, store } = setup({ plan: () => 'plus', ceilings: { calls: 4 } });
  const first = await meter(context, caller, null, 0, { calls: 2 });
  assert.ok(first.ok);
  await first.held.settleCalls(1);
  const second = await meter(context, caller, null, 0, { calls: 2 });
  assert.ok(second.ok);
  await second.held.settleCalls(3);
  // 1 + 3 made: the ceiling is reached, and a request that would need even one more is refused.
  const today = new Date(context.now()).toISOString().slice(0, 10);
  assert.deepEqual(await store.read([`g:calls:${today}`]), [4]);
  assert.equal((await meter(context, caller, null, 0, { calls: 1 })).ok, false);
});

test('a refund gives back each part once, however often it is asked', async () => {
  const { context } = setup({ plan: () => 'free' });
  const held = await meter(context, caller, 'voice', 30 * MINUTE, { audioMs: 30 * MINUTE, calls: 1 });
  assert.ok(held.ok);
  await held.held.refund();
  await held.held.refund();
  assert.equal((await voiceUsage(context, caller)).voice?.usedSeconds, 0);
  // The other 30 minutes taken since are not given back by a refund that already happened.
  assert.ok((await meter(context, caller, 'voice', 30 * MINUTE, {})).ok);
  await held.held.refund();
  assert.equal((await voiceUsage(context, caller)).voice?.usedSeconds, 1_800);
});

test('before a free install is refused, a cached answer is checked again with RevenueCat', async () => {
  const { context, advance, asked } = setup();
  assert.ok((await meter(context, caller, 'patterns', 1, {})).ok);
  assert.equal(asked(), 1);
  // Moments later: the cached answer is fresh enough to refuse on.
  assert.equal((await meter(context, caller, 'patterns', 1, {})).ok, false);
  assert.equal(asked(), 1);
  // A minute later the refusal is checked once more, in case the person has just subscribed.
  advance(MINUTE);
  assert.equal((await meter(context, caller, 'patterns', 1, {})).ok, false);
  assert.equal(asked(), 2);
});

test('the ceilings come from the environment, and nonsense there means the defaults', () => {
  assert.deepEqual(ceilingsFrom({ ECHO_DAILY_AUDIO_SECONDS: '7200', ECHO_DAILY_MODEL_CALLS: '900' }), {
    audioMs: 7_200_000,
    calls: 900,
  });
  assert.deepEqual(ceilingsFrom({ ECHO_DAILY_AUDIO_SECONDS: 'lots', ECHO_DAILY_MODEL_CALLS: '-1' }), DEFAULT_CEILINGS);
  assert.deepEqual(ceilingsFrom({}), DEFAULT_CEILINGS);
});
