import { clientIp, createLimiter, fail, json, tokenMatches } from '../src/guard.js';
import { finish, styleOf, type Config } from '../src/pipeline.js';

// Every character costs up to three bytes, and Vercel itself refuses more than 4.5 MB.
const MAX_CHARS = 150_000;
const MAX_BYTES = MAX_CHARS * 3 + 1_000;
const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_LIMIT = 60;
const limited = createLimiter(WINDOW_MS, WINDOW_LIMIT);

/**
 * `POST /api/refine`, JSON `{ text, style }` and the app token. For words that were heard live and
 * so never went through `/api/transcribe`: the same rules apply. Exact returns the text as it is,
 * with no model call, unless it holds Devanagari, when one script-only step runs. Tidy polishes.
 * Holds nothing, and the log line holds sizes and timing only.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const { OPENAI_API_KEY, ECHO_VOICE_TOKEN } = process.env;
  if (!OPENAI_API_KEY || !ECHO_VOICE_TOKEN) return fail(503, 'not_configured');
  if (!tokenMatches(request.headers.get('x-echo-voice-token'), ECHO_VOICE_TOKEN)) {
    return fail(401, 'unauthorized');
  }
  if (limited(clientIp(request), started)) return fail(429, 'rate_limited', true);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return fail(413, 'too_long');

  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BYTES) return fail(413, 'too_long');
    let body: { text?: unknown; style?: unknown } | null;
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      return fail(400, 'bad_request');
    }
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (text.length === 0) return fail(400, 'bad_request');
    if (text.length > MAX_CHARS) return fail(413, 'too_long');
    const style = styleOf(body?.style);

    const config: Config = {
      apiKey: OPENAI_API_KEY,
      transcribeModel: '',
      polishModel: process.env.ECHO_POLISH_MODEL ?? 'gpt-6.1-terra',
      fetch,
    };
    const done = await finish(text, style, config);
    console.log(
      JSON.stringify({
        route: 'refine',
        chars: text.length,
        ms: Date.now() - started,
        style,
        polished: done.polished,
        romanised: done.romanised,
      }),
    );
    return json(200, { ...done, style });
  } catch {
    console.log(JSON.stringify({ route: 'refine', failed: 'internal', ms: Date.now() - started }));
    return fail(500, 'internal', true);
  }
}
