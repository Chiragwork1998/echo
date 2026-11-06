import { createGate, fail, json } from '../src/guard.js';
import { delayOf, LiveError, mintLiveSession } from '../src/live.js';

const WINDOW_MS = 10 * 60 * 1000;
// One live take is one secret. A person may speak a good many takes in ten minutes, and each one
// that cannot connect falls back to being sent after it ends.
const WINDOW_LIMIT = 40;
const gate = createGate(WINDOW_MS, WINDOW_LIMIT);

/**
 * `POST /api/live-session`, with the app token and no body. Returns a short-lived secret and the
 * address to stream a take to, so the phone talks to OpenAI directly: this server never holds the
 * audio or the words, and the OpenAI key never leaves it.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const { OPENAI_API_KEY, ECHO_VOICE_TOKEN } = process.env;
  if (!OPENAI_API_KEY || !ECHO_VOICE_TOKEN) return fail(503, 'not_configured');
  const turnedAway = gate(request, ECHO_VOICE_TOKEN, started);
  if (turnedAway) return turnedAway;

  try {
    const session = await mintLiveSession({
      apiKey: OPENAI_API_KEY,
      delay: delayOf(process.env.ECHO_LIVE_DELAY),
      fetch,
    });
    console.log(JSON.stringify({ route: 'live-session', ms: Date.now() - started }));
    return json(200, session);
  } catch (error) {
    const live = error instanceof LiveError ? error : null;
    console.log(JSON.stringify({ route: 'live-session', failed: live ? 'upstream' : 'internal', ms: Date.now() - started }));
    return live ? fail(502, 'upstream', live.retryable) : fail(500, 'internal', true);
  }
}
