import { createGate, fail, json } from '../src/guard.js';
import {
  DEFAULT_MODEL,
  MAX_CHARS_PER_ENTRY,
  MAX_ENTRIES,
  MIN_ENTRIES,
  parseEntries,
  PatternsError,
  readPatterns,
  type Config,
} from '../src/patterns.js';

// Thirty entries of 6,000 characters, in a script that takes three bytes a character, with room
// for the JSON around them. Vercel itself refuses more than 4.5 MB.
const MAX_BYTES = MAX_ENTRIES * MAX_CHARS_PER_ENTRY * 3 + 20_000;
const WINDOW_MS = 10 * 60 * 1000;
// A reading is far dearer than a transcription, and a person asks for one rarely.
const WINDOW_LIMIT = 8;
const gate = createGate(WINDOW_MS, WINDOW_LIMIT);

/**
 * `POST /api/patterns` with `{ entries: [{ date: 'YYYY-MM-DD', text }] }` and the app token.
 * Holds nothing: the entries exist in memory for the length of the request.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const { OPENAI_API_KEY, ECHO_VOICE_TOKEN } = process.env;
  if (!OPENAI_API_KEY || !ECHO_VOICE_TOKEN) return fail(503, 'not_configured');
  const turnedAway = gate(request, ECHO_VOICE_TOKEN, started);
  if (turnedAway) return turnedAway;
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return fail(413, 'too_long');

  // Sizes and timing only. Never entries, quotes, cards, or anything derived from them, which
  // includes whether a safety message was returned.
  let bytes = 0;
  let count = 0;
  const log = (extra: Record<string, unknown>) =>
    console.log(JSON.stringify({ route: 'patterns', bytes, entries: count, ms: Date.now() - started, ...extra }));

  try {
    const text = await request.text();
    bytes = Buffer.byteLength(text);
    if (bytes > MAX_BYTES) return fail(413, 'too_long');
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail(400, 'bad_request');
    }
    const entries = parseEntries(body);
    if (!entries) return fail(400, 'bad_request');
    count = entries.length;
    if (entries.length < MIN_ENTRIES) return fail(400, 'too_few');

    const config: Config = {
      apiKey: OPENAI_API_KEY,
      model: process.env.ECHO_PATTERNS_MODEL || DEFAULT_MODEL,
      fetch,
    };
    const outcome = await readPatterns(entries, config);
    log({ ok: true });
    return json(200, outcome);
  } catch (error) {
    const known = error instanceof PatternsError ? error : null;
    log({ failed: known?.code ?? 'internal' });
    if (known) return fail(502, known.code, known.retryable);
    return fail(500, 'internal', true);
  }
}
