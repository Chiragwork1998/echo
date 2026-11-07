// The gate every route shares: who is asking (an install token, or the shared app token from older
// builds), the same best-effort rate limit, the same JSON replies.
import { timingSafeEqual } from 'node:crypto';

import type { Caller } from './meter.js';
import { installKey, installTag, secretsFrom, verifyToken } from './token.js';

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

/**
 * What a log line may add to the route, status, size and time: the install's hashed tag (token.ts,
 * never the id or the token), its plan, and which allowance turned it away. Nothing else, so a
 * line can never carry what a person said.
 */
export type LogExtra = { install?: string; plan?: string; refused?: string };

/**
 * The only line a route that handles a journal writes: which route, what it answered, how large the
 * request was, and how long it took. Nothing about what was in it, and nothing derived from it:
 * not the words, not the language, not whether a step changed them.
 */
export const logRoute = (
  route: string,
  status: number,
  started: number,
  bytes?: number,
  extra: LogExtra = {},
) => {
  const { install, plan, refused } = extra;
  console.log(
    JSON.stringify({
      route,
      status,
      ...(bytes === undefined ? {} : { bytes }),
      ms: Date.now() - started,
      ...(install === undefined ? {} : { install }),
      ...(plan === undefined ? {} : { plan }),
      ...(refused === undefined ? {} : { refused }),
    }),
  );
};

/**
 * Every failure has one shape: `error` names it, `code` repeats it for builds made before `error`
 * existed, and `retryable` says whether trying again could help.
 */
export const fail = (status: number, code: string, retryable = false, headers?: Record<string, string>) =>
  json(status, { error: code, code, retryable }, headers);

export function tokenMatches(given: string | null, expected: string) {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The most addresses a table remembers. Past this the longest unseen go, however recent their hits. */
const MAX_KEYS = 5_000;

/**
 * Hits per key inside a sliding window, in memory that cannot grow without bound: a key with nothing
 * left in its window is dropped (the table is swept once a window), a key keeps no more than `keep`
 * hits, and the table holds at most `maxKeys` keys, least recently seen going first.
 */
export function createWindow(windowMs: number, keep: number, maxKeys: number) {
  const hits = new Map<string, number[]>();
  let sweptAt = Number.NEGATIVE_INFINITY;
  const sweep = (now: number) => {
    sweptAt = now;
    for (const [key, times] of hits) {
      if (now - times[times.length - 1]! >= windowMs) hits.delete(key);
    }
  };
  const within = (key: string, now: number) =>
    (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  return {
    /** Records a hit, and says how many are in the window (never more than `keep`). */
    add(key: string, now: number) {
      if (now - sweptAt >= windowMs) sweep(now);
      const recent = within(key, now);
      recent.push(now);
      if (recent.length > keep) recent.splice(0, recent.length - keep);
      // Last in the table is the most recently seen, so the first is the one to go if it is full.
      hits.delete(key);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        sweep(now);
        for (const oldest of hits.keys()) {
          if (hits.size <= maxKeys) break;
          hits.delete(oldest);
        }
      }
      return recent.length;
    },
    /** How many are in the window now, without counting this as one. */
    count: (key: string, now: number) => within(key, now).length,
    size: () => hits.size,
  };
}

/**
 * Best effort: per instance, so a second instance counts for itself. The counts that hold across
 * instances are the allowances and the day's ceilings (meter.ts). True once a key has made more than
 * `limit` calls inside the window.
 */
export function createLimiter(windowMs: number, limit: number, maxKeys: number = MAX_KEYS) {
  const window = createWindow(windowMs, limit + 1, maxKeys);
  return Object.assign((key: string, now: number) => window.add(key, now) > limit, {
    /** How many keys are remembered. */
    size: window.size,
  });
}

/** Wrong tokens an address may offer inside a window before it is turned away without being heard. */
const BAD_TOKENS = 20;

/**
 * The gate in front of /api/install, which takes the shared app token alone: the token, then the
 * rate limit. Returns the reply that turns the request away, or null to let it in. A wrong token is
 * counted against the address that sent it, and an address that has sent too many is answered 429
 * before its token is even looked at: otherwise a guess at the token would cost nothing, and the
 * right one would come through whenever it was found. A right token is never counted as a failure.
 */
export function createGate(windowMs: number, limit: number, badTokens: number = BAD_TOKENS) {
  const used = createLimiter(windowMs, limit);
  const wrong = createWindow(windowMs, badTokens, MAX_KEYS);
  return (request: Request, expected: string, now: number): Response | null => {
    const address = addressKey(clientIp(request));
    if (wrong.count(address, now) >= badTokens) {
      wrong.add(address, now);
      return fail(429, 'rate_limited', true);
    }
    if (!tokenMatches(request.headers.get('x-echo-voice-token'), expected)) {
      wrong.add(address, now);
      return fail(401, 'unauthorized');
    }
    return used(address, now) ? fail(429, 'rate_limited', true) : null;
  };
}

export const INSTALL_TOKEN_HEADER = 'x-echo-install-token';
export const VOICE_TOKEN_HEADER = 'x-echo-voice-token';

export type Admitted = { caller: Caller; tag: string | undefined };

/**
 * The gate in front of every route that spends: who is asking, then how often.
 *
 * - An install token (token.ts) names the install, and its allowance applies. A token that was not
 *   signed here is refused as `install_invalid` and counted as a wrong guess. An expired one is
 *   refused the same way, so the app asks for a new one, and is not counted.
 * - The shared app token alone is a build made before install tokens. It is served under the day's
 *   ceilings while ECHO_LEGACY_TOKEN is not 'deny', and refused as `install_required` when it is.
 * - Anything else is refused and counted, as before.
 *
 * The rate limit is per install for an install token, so people behind one address do not share
 * it, and per address otherwise. An IPv6 address counts as its /64, which one phone holds whole.
 */
export function createAccess(windowMs: number, limit: number, badTokens: number = BAD_TOKENS) {
  const used = createLimiter(windowMs, limit);
  const wrong = createWindow(windowMs, badTokens, MAX_KEYS);
  return (
    request: Request,
    env: NodeJS.ProcessEnv,
    now: number,
  ): { ok: true; admitted: Admitted } | { ok: false; response: Response } => {
    const address = addressKey(clientIp(request));
    const refuse = (response: Response) => ({ ok: false as const, response });
    if (wrong.count(address, now) >= badTokens) {
      wrong.add(address, now);
      return refuse(fail(429, 'rate_limited', true));
    }

    let admitted: Admitted;
    let limitKey: string;
    const presented = request.headers.get(INSTALL_TOKEN_HEADER);
    if (presented) {
      const verdict = verifyToken(presented, secretsFrom(env), now);
      if (!verdict.ok) {
        if (verdict.reason === 'invalid') wrong.add(address, now);
        return refuse(fail(401, 'install_invalid'));
      }
      const { installId } = verdict.claims;
      const key = installKey(installId);
      admitted = { caller: { kind: 'install', installId, key }, tag: installTag(installId) };
      limitKey = `install:${key}`;
    } else if (env.ECHO_VOICE_TOKEN && tokenMatches(request.headers.get(VOICE_TOKEN_HEADER), env.ECHO_VOICE_TOKEN)) {
      if (legacyMode(env) === 'deny') return refuse(fail(401, 'install_required'));
      admitted = { caller: { kind: 'legacy' }, tag: undefined };
      limitKey = `address:${address}`;
    } else {
      wrong.add(address, now);
      return refuse(fail(401, 'unauthorized'));
    }
    if (used(limitKey, now)) return refuse(fail(429, 'rate_limited', true));
    return { ok: true, admitted };
  };
}

/** ECHO_LEGACY_TOKEN: 'allow' (the default, for the owner's current test build) or 'deny'. */
export const legacyMode = (env: NodeJS.ProcessEnv): 'allow' | 'deny' =>
  env.ECHO_LEGACY_TOKEN?.trim().toLowerCase() === 'deny' ? 'deny' : 'allow';

export const clientIp = (request: Request) =>
  (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]?.trim() || 'unknown';

/**
 * The key an address is counted under. IPv4 as it is. IPv6 as its /64, because a phone is handed a
 * whole /64 and can move around inside it at will. An IPv4 address written as IPv6 is IPv4.
 */
export function addressKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const plain = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]!;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(plain);
  if (mapped) return mapped[1]!;
  const halves = plain.split('::');
  if (halves.length > 2) return plain;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups =
    halves.length === 2 ? [...head, ...new Array<string>(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail] : head;
  const prefix = groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, '') || '0');
  while (prefix.length < 4) prefix.push('0');
  return `${prefix.join(':')}::/64`;
}
