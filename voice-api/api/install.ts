import { attestationOptional, noAttestor, type AttestationInput, type Attestor } from '../src/attest.js';
import { createGate, addressKey, clientIp, fail, json, logRoute } from '../src/guard.js';
import { storeFromEnv, StoreError } from '../src/store.js';
import { installTag, isInstallId, issueToken, secretsFrom } from '../src/token.js';

const MAX_BYTES = 4_096;
const WINDOW_MS = 10 * 60 * 1000;
/** Per instance, per address. A phone asks once a month, and again if its token is refused. */
const WINDOW_LIMIT = 20;
const gate = createGate(WINDOW_MS, WINDOW_LIMIT);
/**
 * Per address, across every instance, in an hour. Generous enough for many phones behind one
 * carrier address, and a ceiling on how fast anyone holding the shared token can make installs,
 * each with its own free allowance, until attestation (src/attest.ts) closes that door.
 */
export const INSTALLS_PER_HOUR = 60;

/** The proof that the app is the app. None yet: see src/attest.ts. Tests replace it. */
let attestor: Attestor = noAttestor;
export const useAttestor = (next: Attestor) => void (attestor = next);

/**
 * `POST /api/install`, JSON `{ installId }` with the shared app token. Returns `{ token, expiresAt }`:
 * the install token every other route takes (src/token.ts). Stateless: nothing about the install is
 * kept here, except a count of how often its address has asked.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const { ECHO_VOICE_TOKEN } = process.env;
  const [secret] = secretsFrom(process.env);
  if (!ECHO_VOICE_TOKEN || !secret) return fail(503, 'not_configured');
  const turnedAway = gate(request, ECHO_VOICE_TOKEN, started);
  if (turnedAway) return turnedAway;
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return fail(413, 'too_long');

  let tag: string | undefined;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BYTES) return fail(413, 'too_long');
    let body: { installId?: unknown; attestation?: AttestationInput } | null;
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      return fail(400, 'bad_request');
    }
    const installId = body?.installId;
    if (!isInstallId(installId)) return fail(400, 'bad_request');
    tag = installTag(installId);

    // Across instances: how many tokens this address has asked for in the hour.
    const hour = Math.floor(started / 3_600_000);
    const { store } = storeFromEnv();
    const counted = await store.spend([
      {
        key: `rl:install:${addressKey(clientIp(request))}:${hour}`,
        amount: 1,
        limit: INSTALLS_PER_HOUR,
        expireAt: (hour + 2) * 3_600,
      },
    ]);
    if (!counted.ok) {
      const retryAfter = Math.max(1, Math.ceil(((hour + 1) * 3_600_000 - started) / 1000));
      logRoute('install', 429, started, undefined, { install: tag, refused: 'install_rate' });
      return fail(429, 'rate_limited', true, { 'retry-after': String(retryAfter) });
    }

    const proof = await attestor(installId, body?.attestation);
    if (proof === 'failed' || (proof === 'absent' && !attestationOptional(process.env))) {
      logRoute('install', 401, started, undefined, { install: tag, refused: 'attestation' });
      return fail(401, 'attestation_failed');
    }
    const issued = issueToken({ installId, attested: proof === 'verified' }, secret, started);
    logRoute('install', 200, started, undefined, { install: tag });
    return json(200, { token: issued.token, expiresAt: new Date(issued.expiresAt * 1000).toISOString() });
  } catch (error) {
    if (error instanceof StoreError) {
      logRoute('install', 503, started, undefined, { install: tag });
      return fail(503, 'busy', true, { 'retry-after': '30' });
    }
    logRoute('install', 500, started, undefined, { install: tag });
    return fail(500, 'internal', true);
  }
}
