import { identityConfigured, meterContext } from '../src/context.js';
import { createAccess, fail, json } from '../src/guard.js';
import { voiceUsage } from '../src/meter.js';
import { StoreError } from '../src/store.js';

const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_LIMIT = 60;
const access = createAccess(WINDOW_MS, WINDOW_LIMIT);

/**
 * `GET /api/allowance`, with an install token. What the install has used of this month's voice into
 * words: `{ plan, voice: { usedSeconds, limitSeconds, resetsAt } }`. The app asks before sending a
 * long take in pieces, so a take that cannot fit is kept whole for later instead of being half
 * spent. It costs nothing and changes nothing. A build with only the shared token gets
 * `{ plan: 'legacy', voice: null }`.
 */
export async function GET(request: Request) {
  const started = Date.now();
  if (!identityConfigured(process.env)) return fail(503, 'not_configured');
  const gate = access(request, process.env, started);
  if (!gate.ok) return gate.response;
  try {
    return json(200, await voiceUsage(meterContext(), gate.admitted.caller));
  } catch (error) {
    if (error instanceof StoreError) return fail(503, 'busy', true, { 'retry-after': '30' });
    return fail(500, 'internal', true);
  }
}
