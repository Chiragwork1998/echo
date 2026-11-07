import { identityConfigured, meterContext } from '../src/context.js';
import { createAccess, fail, json, logRoute } from '../src/guard.js';
import { delayOf, LiveError, mintLiveSession } from '../src/live.js';
import { LIVE_GUARD_MS, meter, refusalResponse, type Metered } from '../src/meter.js';
import { StoreError } from '../src/store.js';

const WINDOW_MS = 10 * 60 * 1000;
// One live take is one secret. A person may speak a good many takes in ten minutes, and each one
// that cannot connect falls back to being sent after it ends.
const WINDOW_LIMIT = 40;
const access = createAccess(WINDOW_MS, WINDOW_LIMIT);

/**
 * `POST /api/live-session`, with an install token and no body. Returns a short-lived secret and the
 * address to stream a take to, so the phone talks to OpenAI directly: this server never holds the
 * audio or the words, and the OpenAI key never leaves it.
 *
 * Live words are Plus. A free install is answered 402, and the app sends the recording after the
 * take instead, which its voice allowance then counts.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const { OPENAI_API_KEY } = process.env;
  if (!OPENAI_API_KEY || !identityConfigured(process.env)) return fail(503, 'not_configured');
  const gate = access(request, process.env, started);
  if (!gate.ok) return gate.response;
  const { caller, tag } = gate.admitted;

  let session: Metered | null = null;
  try {
    session = await meter(meterContext(), caller, 'live-words', 1, { audioMs: LIVE_GUARD_MS, calls: 1 });
    if (!session.ok) {
      logRoute('live-session', session.refusal.status, started, undefined, {
        install: tag,
        plan: session.plan,
        refused: session.refusal.status === 402 ? 'live-words' : 'ceiling',
      });
      return refusalResponse(session.refusal);
    }
    const minted = await mintLiveSession({
      apiKey: OPENAI_API_KEY,
      delay: delayOf(process.env.ECHO_LIVE_DELAY),
      fetch,
    });
    logRoute('live-session', 200, started, undefined, { install: tag, plan: session.plan });
    return json(200, minted);
  } catch (error) {
    if (session?.ok) await session.held.refund();
    if (error instanceof StoreError) {
      logRoute('live-session', 503, started, undefined, { install: tag });
      return refusalResponse({ status: 503, body: { error: 'busy', retryAfter: 30 } });
    }
    const live = error instanceof LiveError ? error : null;
    logRoute('live-session', live ? 502 : 500, started, undefined, { install: tag });
    return live ? fail(502, 'upstream', live.retryable) : fail(500, 'internal', true);
  }
}
