// The gate every route shares: the same app token, the same best-effort rate limit, the same JSON
// replies. Patterns uses it now. /api/transcribe keeps its own copy until it is next touched.
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

/** Best effort: per instance. Real protection before launch is noted in the README. */
export function createLimiter(windowMs: number, limit: number) {
  const hits = new Map<string, number[]>();
  return (ip: string, now: number) => {
    const recent = (hits.get(ip) ?? []).filter((at) => now - at < windowMs);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > limit;
  };
}

export const clientIp = (request: Request) =>
  (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]?.trim() || 'unknown';
