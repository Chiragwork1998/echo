import { createGate, fail, json, logRoute } from '../src/guard.js';
import { finish, styleOf, type Config } from '../src/pipeline.js';

// A take of an hour is about 12,000 words, 70,000 characters, at a fast 200 words a minute. 100,000
// is an hour and a half at that pace, or two hours at an ordinary one, and a model call that long is
// what a stolen token would otherwise get to spend. Every character costs up to three bytes.
const MAX_CHARS = 100_000;
const MAX_BYTES = MAX_CHARS * 3 + 1_000;
const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_LIMIT = 60;
const gate = createGate(WINDOW_MS, WINDOW_LIMIT);

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
  const turnedAway = gate(request, ECHO_VOICE_TOKEN, started);
  if (turnedAway) return turnedAway;
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
    logRoute('refine', 200, started, Buffer.byteLength(raw));
    return json(200, { ...done, style });
  } catch {
    logRoute('refine', 500, started);
    return fail(500, 'internal', true);
  }
}
