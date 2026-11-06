// The gate every route shares: the same app token, the same best-effort rate limit, the same JSON
// replies.
import { timingSafeEqual } from 'node:crypto';

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/**
 * The only line a route that handles a journal writes: which route, what it answered, how large the
 * request was, and how long it took. Nothing about what was in it, and nothing derived from it:
 * not the words, not the language, not whether a step changed them.
 */
export const logRoute = (route: string, status: number, started: number, bytes?: number) =>
  console.log(
    JSON.stringify({ route, status, ...(bytes === undefined ? {} : { bytes }), ms: Date.now() - started }),
  );

export const fail = (status: number, code: string, retryable = false) =>
  json(status, { code, retryable });

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
function createWindow(windowMs: number, keep: number, maxKeys: number) {
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
 * Best effort: per instance, so a second instance counts for itself. Real protection before launch
 * is noted in the README. True once an address has made more than `limit` calls inside the window.
 */
export function createLimiter(windowMs: number, limit: number, maxKeys: number = MAX_KEYS) {
  const window = createWindow(windowMs, limit + 1, maxKeys);
  return Object.assign((ip: string, now: number) => window.add(ip, now) > limit, {
    /** How many addresses are remembered. */
    size: window.size,
  });
}

/** Wrong tokens an address may offer inside a window before it is turned away without being heard. */
const BAD_TOKENS = 20;

/**
 * The gate in front of a route: the app token, then the rate limit. Returns the reply that turns the
 * request away, or null to let it in. A wrong token is counted against the address that sent it, and
 * an address that has sent too many is answered 429 before its token is even looked at: otherwise a
 * guess at the token would cost nothing, and the right one would come through whenever it was found.
 * A right token is never counted as a failure.
 */
export function createGate(windowMs: number, limit: number, badTokens: number = BAD_TOKENS) {
  const used = createLimiter(windowMs, limit);
  const wrong = createWindow(windowMs, badTokens, MAX_KEYS);
  return (request: Request, expected: string, now: number): Response | null => {
    const ip = clientIp(request);
    if (wrong.count(ip, now) >= badTokens) {
      wrong.add(ip, now);
      return fail(429, 'rate_limited', true);
    }
    if (!tokenMatches(request.headers.get('x-echo-voice-token'), expected)) {
      wrong.add(ip, now);
      return fail(401, 'unauthorized');
    }
    return used(ip, now) ? fail(429, 'rate_limited', true) : null;
  };
}

export const clientIp = (request: Request) =>
  (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]?.trim() || 'unknown';
