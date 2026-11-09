import { countingFetch, identityConfigured, meterContext } from '../src/context.js';
import {
  DEFAULT_MODEL,
  FormatError,
  formatText,
  MAX_CHARS,
  worthFormatting,
  type Config,
} from '../src/format.js';
import { createAccess, fail, json, logRoute, textFrom } from '../src/guard.js';
import { meter, refusalResponse, type Metered } from '../src/meter.js';
import { StoreError } from '../src/store.js';

// JSON can write a character in up to six bytes (a control character is "\u0000"), so no text inside
// the limit is turned away for its size. Vercel itself refuses more than 4.5 MB.
const MAX_BYTES = MAX_CHARS * 6 + 1_000;
const WINDOW_MS = 10 * 60 * 1000;
// One request for each entry kept, and a few more when the app catches up after a while offline.
const WINDOW_LIMIT = 30;
const access = createAccess(WINDOW_MS, WINDOW_LIMIT);
/** The model once, and once more if its first version changed a word. */
const MOST_CALLS = 2;

/**
 * `POST /api/format`, JSON `{ text }` and an install token. Sets out an entry's words: paragraphs,
 * punctuation and capitals, with every word kept in the same order (src/format.ts). Returns
 * `{ text, formatted }`: when `formatted` is false, `text` is the request's text exactly as it came.
 * Holds nothing, and the log line holds sizes and timing only.
 *
 * Setting out has no allowance of its own: it is counted against the day's ceiling on model calls,
 * reserved before OpenAI is asked. Fewer than three words are returned as they are, with no call.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY || !identityConfigured(process.env)) return fail(503, 'not_configured');
  const gate = access(request, process.env, started);
  if (!gate.ok) return gate.response;
  const { caller, tag } = gate.admitted;
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES)
    return fail(400, 'bad_request');

  let bytes: number | undefined;
  let held: Metered | null = null;
  const calls = countingFetch();
  try {
    const raw = await request.text();
    bytes = Buffer.byteLength(raw);
    if (bytes > MAX_BYTES) return fail(400, 'bad_request');
    const text = textFrom(raw, MAX_CHARS);
    if (text === null) return fail(400, 'bad_request');

    // The same line whether or not the text was set out, or long enough to try: nothing in it says which.
    if (!worthFormatting(text)) {
      logRoute('format', 200, started, bytes, { install: tag });
      return json(200, { text, formatted: false });
    }

    held = await meter(meterContext(), caller, 'format', 1, { calls: MOST_CALLS });
    if (!held.ok) {
      logRoute('format', held.refusal.status, started, bytes, {
        install: tag,
        plan: held.plan,
        refused: held.refusal.status === 402 ? 'format' : 'ceiling',
      });
      return refusalResponse(held.refusal);
    }

    const config: Config = {
      apiKey: OPENAI_API_KEY,
      model: process.env.ECHO_POLISH_MODEL || DEFAULT_MODEL,
      fetch: calls.fetch,
    };
    const result = await formatText(text, config);
    await held.held.settleCalls(calls.made());
    logRoute('format', 200, started, bytes, { install: tag });
    return json(200, result);
  } catch (error) {
    if (held?.ok) {
      // The calls made are counted against the day. Anything else taken is given back.
      await held.held.settleCalls(calls.made());
      await held.held.refund(['use']);
    }
    if (error instanceof StoreError) {
      logRoute('format', 503, started, bytes, { install: tag });
      return refusalResponse({ status: 503, body: { error: 'busy', retryAfter: 30 } });
    }
    // 502 is OpenAI's fault, as on every route.
    const upstream = error instanceof FormatError ? error : null;
    logRoute('format', upstream ? 502 : 500, started, bytes, { install: tag });
    return upstream ? fail(502, 'upstream', upstream.retryable) : fail(500, 'internal', true);
  }
}
