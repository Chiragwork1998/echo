// Install tokens: what a phone shows on every request instead of the shared app token. The server
// keeps no list of them. A token is the install id and when it was issued, signed with a secret only
// this server holds (HMAC-SHA256), so it cannot be made or changed without that secret, and it names
// the install it was issued to. It holds nothing about the person and nothing they said.
//
//   ei1.<payload>.<signature>
//
// payload is base64url JSON { i: install id, t: issued (unix s), x: expires (unix s), a: 0 | 1 },
// where a is 1 once the phone has proved it is the real app (attest.ts). signature is base64url of
// HMAC-SHA256(secret, "ei1." + payload). Nothing here logs, and a token is never logged anywhere.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'ei1';
/** How long a token lasts. The app asks for a new one when it ends, or when one is refused. */
export const TOKEN_SECONDS = 30 * 24 * 60 * 60;
/** A token issued this far in the future is not believed: clocks differ, but not by more. */
const SKEW_SECONDS = 5 * 60;
/** Far longer than any real token, so a huge header is refused before it is decoded. */
const MAX_TOKEN_LENGTH = 512;
/** A secret shorter than this is a mistake, and nothing is signed with it. */
export const MIN_SECRET_LENGTH = 32;

/**
 * What the app sends as an install id: a random UUID made on the phone (src/services/install.ts).
 * Anything of a similar shape is taken, and nothing else, so an id can be part of a key or a log line.
 */
const INSTALL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{15,63}$/;
export const isInstallId = (value: unknown): value is string =>
  typeof value === 'string' && INSTALL_ID.test(value);

export type InstallClaims = {
  installId: string;
  issuedAt: number;
  expiresAt: number;
  /** The phone proved it is the real app when this was issued. Always false until attest.ts can say so. */
  attested: boolean;
};

export type Verdict = { ok: true; claims: InstallClaims } | { ok: false; reason: 'invalid' | 'expired' };

const base64url = (bytes: Buffer) => bytes.toString('base64url');
const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest();

/** The secrets a token may be signed with: the current one first, then the one it replaced. */
export function secretsFrom(env: NodeJS.ProcessEnv): string[] {
  return [env.ECHO_INSTALL_SECRET, env.ECHO_INSTALL_SECRET_PREVIOUS].filter(
    (secret): secret is string => typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH,
  );
}

export function issueToken(
  claims: { installId: string; attested?: boolean },
  secret: string,
  nowMs: number,
  lifetimeSeconds: number = TOKEN_SECONDS,
): { token: string; expiresAt: number } {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error('install secret too short');
  if (!isInstallId(claims.installId)) throw new Error('not an install id');
  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + lifetimeSeconds;
  const payload = base64url(
    Buffer.from(
      JSON.stringify({ i: claims.installId, t: issuedAt, x: expiresAt, a: claims.attested ? 1 : 0 }),
      'utf8',
    ),
  );
  const body = `${PREFIX}.${payload}`;
  return { token: `${body}.${base64url(sign(secret, body))}`, expiresAt };
}

/**
 * The claims of a token this server signed, or why not. 'invalid' covers everything that is not a
 * token signed with one of `secrets`: wrong shape, wrong signature, a changed payload. 'expired' is
 * a real token whose time is up, which the app answers by asking for a new one.
 */
export function verifyToken(token: string | null, secrets: readonly string[], nowMs: number): Verdict {
  if (!token || token.length > MAX_TOKEN_LENGTH || secrets.length === 0) {
    return { ok: false, reason: 'invalid' };
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1] || !parts[2]) {
    return { ok: false, reason: 'invalid' };
  }
  const body = `${PREFIX}.${parts[1]}`;
  const given = Buffer.from(parts[2], 'base64url');
  // base64url decoding skips what is not base64url, so the signature is checked as it was written too.
  if (base64url(given) !== parts[2]) return { ok: false, reason: 'invalid' };
  const signed = secrets.some((secret) => {
    const expected = sign(secret, body);
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!signed) return { ok: false, reason: 'invalid' };

  let claims: { i?: unknown; t?: unknown; x?: unknown; a?: unknown };
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as typeof claims;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const { i, t, x, a } = claims ?? {};
  if (!isInstallId(i) || !Number.isSafeInteger(t) || !Number.isSafeInteger(x)) {
    return { ok: false, reason: 'invalid' };
  }
  const now = Math.floor(nowMs / 1000);
  if ((t as number) > now + SKEW_SECONDS || (x as number) <= (t as number)) {
    return { ok: false, reason: 'invalid' };
  }
  if ((x as number) <= now) return { ok: false, reason: 'expired' };
  return {
    ok: true,
    claims: { installId: i, issuedAt: t as number, expiresAt: x as number, attested: a === 1 },
  };
}

/**
 * The name an install goes by in the quota store and in logs. The id itself is random and names no
 * one, but it is also what purchases are attached to, so it is never written down as it is. A hash
 * of a random UUID cannot be turned back into it.
 */
export const installKey = (installId: string) =>
  createHash('sha256').update(`echo-install:${installId}`).digest('hex').slice(0, 32);

/** Shorter still, for a log line: enough to follow one install through the logs, and no more. */
export const installTag = (installId: string) => installKey(installId).slice(0, 12);
