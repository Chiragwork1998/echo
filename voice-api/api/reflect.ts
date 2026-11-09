import { countingFetch, identityConfigured, meterContext } from '../src/context.js';
import { createAccess, fail, json, logRoute, textFrom } from '../src/guard.js';
import { meter, refusalResponse, type Metered } from '../src/meter.js';
import { DEFAULT_MODEL, MAX_CHARS, ReflectError, reflectOn, type Config } from '../src/reflect.js';
import { screenForCrisis } from '../src/safety.js';
import { StoreError } from '../src/store.js';

// JSON can write a character in up to six bytes (a control character is "\u0000"), so no entry
// inside the limit is turned away for its size.
const MAX_BYTES = MAX_CHARS * 6 + 1_000;
const WINDOW_MS = 10 * 60 * 1000;
// One reflection for each entry kept, and a try again from Completion now and then.
const WINDOW_LIMIT = 20;
const access = createAccess(WINDOW_MS, WINDOW_LIMIT);
/** The model once, and once more if the first reflection could not be shown. */
const MOST_CALLS = 2;

/**
 * `POST /api/reflect`, JSON `{ text }` and an install token: today's echo, a short reflection of one
 * entry (src/reflect.ts). Returns `{ kind: 'reflection', text }`, or `{ kind: 'support' }` when the
 * entry suggests the person may be in danger: then no reflection is written and the app offers support.
 * Holds nothing, and the log line holds sizes and timing only.
 *
 * A reflection is taken from the month's allowance, reserved before OpenAI is asked, and counts once
 * it is written: support, a reflection that could not be shown, or a failure gives it back.
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

  // Sizes and timing only. Never the entry, the reflection, or anything derived from them, which
  // includes whether support was the answer: that line is the same as a reflection's.
  let bytes: number | undefined;
  let reflection: Metered | null = null;
  const calls = countingFetch();
  try {
    const raw = await request.text();
    bytes = Buffer.byteLength(raw);
    if (bytes > MAX_BYTES) return fail(400, 'bad_request');
    const text = textFrom(raw, MAX_CHARS);
    if (text === null) return fail(400, 'bad_request');

    // A person in difficulty is met with care whatever their allowance, and that costs nothing: no
    // model is asked.
    if (screenForCrisis([text])) {
      logRoute('reflect', 200, started, bytes, { install: tag });
      return json(200, { kind: 'support' });
    }

    reflection = await meter(meterContext(), caller, 'reflect', 1, { calls: MOST_CALLS });
    if (!reflection.ok) {
      logRoute('reflect', reflection.refusal.status, started, bytes, {
        install: tag,
        plan: reflection.plan,
        refused: reflection.refusal.status === 402 ? 'reflect' : 'ceiling',
      });
      return refusalResponse(reflection.refusal);
    }

    const config: Config = {
      apiKey: OPENAI_API_KEY,
      model: process.env.ECHO_REFLECT_MODEL || DEFAULT_MODEL,
      fetch: calls.fetch,
    };
    const outcome = await reflectOn(text, config);
    await reflection.held.settleCalls(calls.made());
    // Care is never counted as a reflection.
    if (outcome.kind === 'support') await reflection.held.refund(['use']);
    logRoute('reflect', 200, started, bytes, { install: tag });
    return json(200, outcome);
  } catch (error) {
    if (reflection?.ok) {
      // The calls made are counted against the day. The reflection, never written, is given back.
      await reflection.held.settleCalls(calls.made());
      await reflection.held.refund(['use']);
    }
    if (error instanceof StoreError) {
      logRoute('reflect', 503, started, bytes, { install: tag });
      return refusalResponse({ status: 503, body: { error: 'busy', retryAfter: 30 } });
    }
    const known = error instanceof ReflectError ? error : null;
    // 422: nothing the model wrote could be shown, and asking again will not help. 502: OpenAI's fault.
    const status = !known ? 500 : known.code === 'unusable' ? 422 : 502;
    logRoute('reflect', status, started, bytes, { install: tag });
    return known ? fail(status, known.code, known.retryable) : fail(500, 'internal', true);
  }
}
