import { countingFetch, identityConfigured, meterContext } from '../src/context.js';
import { createAccess, fail, json, logRoute } from '../src/guard.js';
import { meter, refusalResponse, type Metered } from '../src/meter.js';
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
import { screenForCrisis } from '../src/safety.js';
import { StoreError } from '../src/store.js';

// Thirty entries of 6,000 characters, in a script that takes three bytes a character, with room
// for the JSON around them. Vercel itself refuses more than 4.5 MB.
const MAX_BYTES = MAX_ENTRIES * MAX_CHARS_PER_ENTRY * 3 + 20_000;
const WINDOW_MS = 10 * 60 * 1000;
// A reading is far dearer than a transcription, and a person asks for one rarely.
const WINDOW_LIMIT = 8;
const access = createAccess(WINDOW_MS, WINDOW_LIMIT);
/** A reading asks the model once, and once more if the first answer could not be used. */
const MOST_CALLS = 2;

/**
 * `POST /api/patterns` with `{ entries: [{ date: 'YYYY-MM-DD', text }] }` and an install token.
 * Holds nothing: the entries exist in memory for the length of the request.
 *
 * A free install's first reading is free, and Plus reads whenever asked, up to a monthly cap. A
 * reading counts once it has made cards: one that finds nothing to name is given back, though the
 * attempt is still counted, so asking again and again cannot run up the bill.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const { OPENAI_API_KEY } = process.env;
  if (!OPENAI_API_KEY || !identityConfigured(process.env)) return fail(503, 'not_configured');
  const gate = access(request, process.env, started);
  if (!gate.ok) return gate.response;
  const { caller, tag } = gate.admitted;
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return fail(413, 'too_long');

  // Sizes and timing only. Never entries, quotes, cards, or anything derived from them, which
  // includes whether a safety message was returned.
  let bytes = 0;
  let count = 0;
  const log = (extra: Record<string, unknown>) =>
    console.log(
      JSON.stringify({
        route: 'patterns',
        bytes,
        entries: count,
        ms: Date.now() - started,
        ...(tag ? { install: tag } : {}),
        ...extra,
      }),
    );

  let reading: Metered | null = null;
  const calls = countingFetch();
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

    // A person in difficulty is met with care whatever their allowance, and that costs nothing: no
    // model is asked. Logged like any other reading, so the log says nothing about which it was.
    if (screenForCrisis(entries.map(({ text: written }) => written))) {
      log({ ok: true });
      return json(200, { status: 'support' });
    }

    reading = await meter(meterContext(), caller, 'patterns', 1, { calls: MOST_CALLS });
    if (!reading.ok) {
      log({ failed: reading.refusal.status === 402 ? 'allowance_used' : 'busy', plan: reading.plan });
      return refusalResponse(reading.refusal);
    }

    const config: Config = {
      apiKey: OPENAI_API_KEY,
      model: process.env.ECHO_PATTERNS_MODEL || DEFAULT_MODEL,
      fetch: calls.fetch,
    };
    const outcome = await readPatterns(entries, config);
    await reading.held.settleCalls(calls.made());
    // No cards, no reading: the allowance is given back, and the attempt stays counted.
    if (outcome.status !== 'cards') await reading.held.refund(['use']);
    // The same line as the care message above: nothing in it says which this was.
    log({ ok: true });
    return json(200, outcome);
  } catch (error) {
    if (reading?.ok) {
      await reading.held.settleCalls(calls.made());
      await reading.held.refund(['use', 'try']);
    }
    if (error instanceof StoreError) {
      log({ failed: 'busy' });
      return refusalResponse({ status: 503, body: { error: 'busy', retryAfter: 30 } });
    }
    const known = error instanceof PatternsError ? error : null;
    log({ failed: known?.code ?? 'internal' });
    if (known) return fail(502, known.code, known.retryable);
    return fail(500, 'internal', true);
  }
}
