import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGate, createLimiter } from './guard.js';

const WINDOW = 10 * 60 * 1000;
const TOKEN = 'the-real-token';
const request = (ip: string, token: string | null) =>
  new Request('http://x/api', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, ...(token ? { 'x-echo-voice-token': token } : {}) },
  });

test('the limiter says no after the limit, and forgets an address once its window has passed', () => {
  const limited = createLimiter(WINDOW, 3);
  assert.deepEqual([0, 1, 2, 3].map((at) => limited('a', at)), [false, false, false, true]);
  assert.equal(limited('b', 4), false);
  assert.equal(limited('a', WINDOW - 1), true);
  assert.equal(limited('a', 2 * WINDOW), false);
});

test('the limiter does not keep every address it has ever seen', () => {
  const limited = createLimiter(WINDOW, 5);
  for (let i = 0; i < 1_000; i += 1) limited(`10.0.${i >> 8}.${i & 255}`, i);
  assert.equal(limited.size(), 1_000);
  // Once their window is over they are gone, however few calls come after.
  limited('late', WINDOW + 5_000);
  assert.equal(limited.size(), 1);
});

test('the limiter holds a bounded number of addresses even inside one window', () => {
  const limited = createLimiter(WINDOW, 5, 100);
  for (let i = 0; i < 10_000; i += 1) limited(`172.16.${i >> 8}.${i & 255}`, i);
  assert.ok(limited.size() <= 100, `held ${limited.size()}`);
  // The newest are the ones kept, so an address in the middle of a run is still counted.
  for (let i = 0; i < 5; i += 1) limited('steady', 10_000 + i);
  assert.equal(limited('steady', 10_010), true);
});

test('the gate turns away a wrong token, and counts it', () => {
  const gate = createGate(WINDOW, 100);
  assert.equal(gate(request('9.9.9.9', null), TOKEN, 0)?.status, 401);
  assert.equal(gate(request('9.9.9.9', 'nope'), TOKEN, 1)?.status, 401);
  assert.equal(gate(request('9.9.9.9', TOKEN), TOKEN, 2), null);
});

test('an address that keeps failing the token is turned away before the token is looked at', () => {
  const gate = createGate(WINDOW, 100, 5);
  const statuses = Array.from({ length: 8 }, (_, i) => gate(request('6.6.6.6', 'guess'), TOKEN, i)?.status);
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 429, 429]);
  // Even the right token gets no answer from it, or guessing would only be a matter of patience.
  assert.equal(gate(request('6.6.6.6', TOKEN), TOKEN, 10)?.status, 429);
  // Someone else is not affected.
  assert.equal(gate(request('7.7.7.7', TOKEN), TOKEN, 12), null);
  // And it is a window, not a ban.
  assert.equal(gate(request('6.6.6.6', TOKEN), TOKEN, 2 * WINDOW + 20), null);
});

test('a right token is never counted against an address', () => {
  const gate = createGate(WINDOW, 1_000, 3);
  for (let i = 0; i < 50; i += 1) assert.equal(gate(request('5.5.5.5', TOKEN), TOKEN, i), null);
});

test('the gate still limits how often a right token may be used', () => {
  const gate = createGate(WINDOW, 3);
  const statuses = Array.from({ length: 5 }, (_, i) => gate(request('4.4.4.4', TOKEN), TOKEN, i)?.status ?? 200);
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
});
