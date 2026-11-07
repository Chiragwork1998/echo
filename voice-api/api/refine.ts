import { countingFetch, identityConfigured, meterContext } from '../src/context.js';
import { createAccess, fail, json, logRoute } from '../src/guard.js';
import { meter, refusalResponse, type Caller, type MeterContext, type Metered } from '../src/meter.js';
import { finish, hasDevanagari, HINDI_SCRIPT, styleOf, type Config, type Style } from '../src/pipeline.js';
import { StoreError } from '../src/store.js';

// A take of an hour is about 12,000 words, 70,000 characters, at a fast 200 words a minute. 100,000
// is an hour and a half at that pace, or two hours at an ordinary one, and a model call that long is
// what a stolen token would otherwise get to spend. Every character costs up to three bytes.
const MAX_CHARS = 100_000;
const MAX_BYTES = MAX_CHARS * 3 + 1_000;
const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_LIMIT = 60;
const access = createAccess(WINDOW_MS, WINDOW_LIMIT);

/**
 * What the model call for these words may take. Tidy is Plus. Hindi in Roman script is part of
 * exact words for everyone, within a monthly cap. Whatever the allowance cannot cover, the words
 * come back as they are rather than not at all: the same as when a second step fails. Only the
 * day's ceiling turns a request away.
 */
async function reserveFor(
  context: MeterContext,
  caller: Caller,
  wanted: Style,
  text: string,
): Promise<{ style: Style; call: Metered | null } | Response> {
  const script = HINDI_SCRIPT === 'roman' && hasDevanagari(text);
  if (caller.kind === 'legacy') {
    if (wanted === 'exact' && !script) return { style: wanted, call: null };
    const call = await meter(context, caller, null, 0, { calls: 1 });
    return call.ok ? { style: wanted, call } : refusalResponse(call.refusal);
  }
  if (wanted === 'tidy') {
    const call = await meter(context, caller, 'tidy', 1, { calls: 1 });
    if (call.ok) return { style: 'tidy', call };
    if (call.refusal.status === 503) return refusalResponse(call.refusal);
  }
  if (!script) return { style: 'exact', call: null };
  const call = await meter(context, caller, 'script', 1, { calls: 1 });
  if (call.ok) return { style: 'exact', call };
  if (call.refusal.status === 503) return refusalResponse(call.refusal);
  // No allowance for the script step: the words are returned untouched, with no model call.
  return { style: 'exact', call: null };
}

/**
 * `POST /api/refine`, JSON `{ text, style }` and an install token. For words that were heard live and
 * so never went through `/api/transcribe`: the same rules apply. Exact returns the text as it is,
 * with no model call, unless it holds Devanagari, when one script-only step runs. Tidy polishes.
 * Holds nothing, and the log line holds sizes and timing only.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const { OPENAI_API_KEY } = process.env;
  if (!OPENAI_API_KEY || !identityConfigured(process.env)) return fail(503, 'not_configured');
  const gate = access(request, process.env, started);
  if (!gate.ok) return gate.response;
  const { caller, tag } = gate.admitted;
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return fail(413, 'too_long');

  let held: Metered | null = null;
  const calls = countingFetch();
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

    const reserved = await reserveFor(meterContext(), caller, styleOf(body?.style), text);
    if (reserved instanceof Response) {
      logRoute('refine', reserved.status, started, Buffer.byteLength(raw), { install: tag, refused: 'ceiling' });
      return reserved;
    }
    held = reserved.call;
    const { style } = reserved;

    const config: Config = {
      apiKey: OPENAI_API_KEY,
      transcribeModel: '',
      polishModel: process.env.ECHO_POLISH_MODEL ?? 'gpt-6.1-terra',
      fetch: calls.fetch,
    };
    // With nothing reserved for it, no model call is made: exact words with no Hindi, or past a cap.
    const done = held
      ? await finish(text, style, config)
      : { text, polished: false, romanised: false };
    if (held?.ok) await held.held.settleCalls(calls.made());
    logRoute('refine', 200, started, Buffer.byteLength(raw), { install: tag });
    return json(200, { ...done, style });
  } catch (error) {
    if (held?.ok) await held.held.refund();
    if (error instanceof StoreError) {
      logRoute('refine', 503, started, undefined, { install: tag });
      return refusalResponse({ status: 503, body: { error: 'busy', retryAfter: 30 } });
    }
    logRoute('refine', 500, started, undefined, { install: tag });
    return fail(500, 'internal', true);
  }
}
