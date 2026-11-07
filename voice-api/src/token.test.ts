import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SECRET } from './testing.js';
import { installKey, installTag, isInstallId, issueToken, secretsFrom, TOKEN_SECONDS, verifyToken } from './token.js';

const ID = '3b2a1c0d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const DAY = 86_400_000;

test('a token issued here names its install, and is good for thirty days', () => {
  const { token, expiresAt } = issueToken({ installId: ID }, SECRET, NOW);
  assert.match(token, /^ei1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(expiresAt, Math.floor(NOW / 1000) + TOKEN_SECONDS);
  const verdict = verifyToken(token, [SECRET], NOW + 29 * DAY);
  assert.ok(verdict.ok);
  assert.equal(verdict.claims.installId, ID);
  assert.equal(verdict.claims.attested, false);
});

test('an expired token is refused as expired, so the app asks for a new one', () => {
  const { token } = issueToken({ installId: ID }, SECRET, NOW);
  assert.deepEqual(verifyToken(token, [SECRET], NOW + 30 * DAY), { ok: false, reason: 'expired' });
  assert.deepEqual(verifyToken(token, [SECRET], NOW + 365 * DAY), { ok: false, reason: 'expired' });
});

test('a tampered token is refused: another install, a longer life, a changed signature', () => {
  const { token } = issueToken({ installId: ID }, SECRET, NOW);
  const [prefix, payload, signature] = token.split('.') as [string, string, string];
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
  const forge = (changes: Record<string, unknown>) =>
    `${prefix}.${Buffer.from(JSON.stringify({ ...claims, ...changes })).toString('base64url')}.${signature}`;

  assert.deepEqual(verifyToken(forge({ i: 'ffffffff-4e5f-4a6b-8c7d-9e0f1a2b3c4d' }), [SECRET], NOW), { ok: false, reason: 'invalid' });
  assert.deepEqual(verifyToken(forge({ x: (claims.x as number) + 10 * TOKEN_SECONDS }), [SECRET], NOW), { ok: false, reason: 'invalid' });
  assert.deepEqual(verifyToken(forge({ a: 1 }), [SECRET], NOW), { ok: false, reason: 'invalid' });
  const flipped = signature.slice(0, -2) + (signature.at(-2) === 'A' ? 'B' : 'A') + signature.at(-1);
  assert.deepEqual(verifyToken(`${prefix}.${payload}.${flipped}`, [SECRET], NOW), { ok: false, reason: 'invalid' });
  // An expired token that has also been changed is invalid, not expired: nothing about it is believed.
  assert.deepEqual(verifyToken(forge({ i: 'ffffffff-4e5f-4a6b-8c7d-9e0f1a2b3c4d' }), [SECRET], NOW + 60 * DAY), {
    ok: false,
    reason: 'invalid',
  });
});

test('a token signed with any other secret is refused', () => {
  const { token } = issueToken({ installId: ID }, 'another-secret-of-the-same-length-000', NOW);
  assert.deepEqual(verifyToken(token, [SECRET], NOW), { ok: false, reason: 'invalid' });
});

test('anything that is not a token at all is refused, and a huge one is not even read', () => {
  for (const given of [null, '', 'abc', 'ei1..', 'ei1.a.b.c', 'ei2.e30.AAAA', 'Bearer x', 'ei1.' + 'A'.repeat(600) + '.B']) {
    assert.deepEqual(verifyToken(given, [SECRET], NOW), { ok: false, reason: 'invalid' }, String(given));
  }
  const { token } = issueToken({ installId: ID }, SECRET, NOW);
  assert.deepEqual(verifyToken(token, [], NOW), { ok: false, reason: 'invalid' });
});

test('a token dated in the future is not believed', () => {
  const { token } = issueToken({ installId: ID }, SECRET, NOW + DAY);
  assert.deepEqual(verifyToken(token, [SECRET], NOW), { ok: false, reason: 'invalid' });
  // A few minutes of clock difference is allowed.
  const near = issueToken({ installId: ID }, SECRET, NOW + 60_000).token;
  assert.equal(verifyToken(near, [SECRET], NOW).ok, true);
});

test('the secret can be replaced without turning every phone away at once', () => {
  const old = issueToken({ installId: ID }, SECRET, NOW).token;
  const secrets = secretsFrom({ ECHO_INSTALL_SECRET: 'the-new-secret-0123456789abcdefghij', ECHO_INSTALL_SECRET_PREVIOUS: SECRET });
  assert.equal(secrets.length, 2);
  assert.equal(verifyToken(old, secrets, NOW).ok, true);
  // A secret too short to be safe is never used.
  assert.deepEqual(secretsFrom({ ECHO_INSTALL_SECRET: 'short' }), []);
  assert.throws(() => issueToken({ installId: ID }, 'short', NOW));
});

test('only something shaped like an install id is taken', () => {
  assert.equal(isInstallId(ID), true);
  for (const bad of ['', 'short', 'has space in it 0000', 'x'.repeat(65), '../../etc/passwd-00000', 'a:b:c:d:e:f:g:h:i:j', 7, null]) {
    assert.equal(isInstallId(bad), false, String(bad));
  }
  assert.throws(() => issueToken({ installId: 'not an id' }, SECRET, NOW));
});

test('an install is stored and logged under a hash, never its id', () => {
  assert.match(installKey(ID), /^[0-9a-f]{32}$/);
  assert.equal(installTag(ID), installKey(ID).slice(0, 12));
  assert.ok(!installKey(ID).includes(ID.replace(/-/g, '').slice(0, 8)));
  assert.notEqual(installKey(ID), installKey(`${ID.slice(0, -1)}0`));
});
