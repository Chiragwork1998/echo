import { normalise } from '../src/audio.js';
import { countingFetch, identityConfigured, meterContext } from '../src/context.js';
import { createAccess, fail, json, logRoute } from '../src/guard.js';
import { measure } from '../src/measure.js';
import { meter, refusalResponse, type Metered } from '../src/meter.js';
import { run, styleOf, VoiceError, type Config, type Style } from '../src/pipeline.js';
import { StoreError } from '../src/store.js';

const MAX_BYTES = 4_400_000;
const ALLOWED = /\.(m4a|mp4|aac|mp3|wav|webm)$/i;
const WINDOW_MS = 10 * 60 * 1000;
// A long live take that has to be sent after it ends arrives in pieces, one request each.
const WINDOW_LIMIT = 120;
const access = createAccess(WINDOW_MS, WINDOW_LIMIT);
/** The transcription and, at most, one second step (Hindi in Roman script, or tidy). */
const MOST_CALLS = 2;

const busy = () => refusalResponse({ status: 503, body: { error: 'busy', retryAfter: 30 } });

/**
 * `POST /api/transcribe`, multipart `file` and an optional `style`: 'exact' (the default) returns
 * the words as heard, 'tidy' returns the polished text. Holds nothing: the audio and the words
 * exist in memory for the length of the request.
 *
 * The sound is measured from the file (src/measure.ts) and taken from the install's allowance for
 * the month, and from the day's ceiling, before anything is sent to OpenAI. A recording that does not
 * fit is refused with 402 and costs nothing. Tidy is Plus: for a free install, or past the Plus cap,
 * the words come back exact rather than not at all.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const { OPENAI_API_KEY } = process.env;
  if (!OPENAI_API_KEY || !identityConfigured(process.env)) return fail(503, 'not_configured');
  const gate = access(request, process.env, started);
  if (!gate.ok) return gate.response;
  const { caller, tag } = gate.admitted;
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES + 2048) {
    return fail(413, 'too_long');
  }

  let voice: Metered | null = null;
  let tidy: Metered | null = null;
  const calls = countingFetch();
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return fail(400, 'no_audio');
    if (file.size > MAX_BYTES) return fail(413, 'too_long');
    if (!ALLOWED.test(file.name)) return fail(415, 'unsupported_audio');
    let style: Style = styleOf(form.get('style'));

    // A copy of exactly this file's bytes: the array is made for it and covers all of it.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const measured = measure(bytes, file.name);
    // What cannot be measured cannot be counted, so it is not sent.
    if (!measured) {
      logRoute('transcribe', 415, started, file.size, { install: tag });
      return fail(415, 'unsupported_audio');
    }

    const context = meterContext();
    voice = await meter(context, caller, 'voice', measured.ms, { audioMs: measured.ms, calls: MOST_CALLS });
    if (!voice.ok) {
      logRoute('transcribe', voice.refusal.status, started, file.size, {
        install: tag,
        plan: voice.plan,
        refused: voice.refusal.status === 402 ? 'voice' : 'ceiling',
      });
      return refusalResponse(voice.refusal);
    }
    if (style === 'tidy' && caller.kind === 'install') {
      // Tidy that is not in the plan, or cannot be counted just now, leaves the words exact.
      tidy = await meter(context, caller, 'tidy', 1, {}).catch(() => null);
      if (!tidy?.ok) style = 'exact';
    }

    const audio = await normalise({
      bytes,
      filename: file.name,
      type: file.type || 'application/octet-stream',
    });
    const config: Config = {
      apiKey: OPENAI_API_KEY,
      transcribeModel: process.env.ECHO_TRANSCRIBE_MODEL ?? 'gpt-transcribe',
      polishModel: process.env.ECHO_POLISH_MODEL ?? 'gpt-6.1-terra',
      fetch: calls.fetch,
    };
    const result = await run(audio, config, style);
    await voice.held.settleCalls(calls.made());
    // Size and timing. Never audio, text, or anything derived from them, which includes which steps ran.
    logRoute('transcribe', 200, started, file.size, { install: tag, plan: voice.plan });
    return json(200, result);
  } catch (error) {
    const known = error instanceof VoiceError ? error : null;
    if (voice?.ok) {
      // Silence was still heard by OpenAI, so it counts. Anything else that failed was not served.
      if (known?.code === 'empty') await voice.held.settleCalls(calls.made());
      else await voice.held.refund();
    }
    if (tidy?.ok) await tidy.held.refund();
    if (error instanceof StoreError) {
      logRoute('transcribe', 503, started, undefined, { install: tag });
      return busy();
    }
    // 502 is OpenAI's fault, 503 is this machine's (full, or too slow), and 422 is the recording's.
    const status = !known
      ? 500
      : known.code === 'upstream'
        ? 502
        : known.code === 'busy' || known.code === 'too_slow'
          ? 503
          : 422;
    logRoute('transcribe', status, started, undefined, { install: tag });
    if (known) return fail(status, known.code, known.retryable);
    return fail(status, 'internal', true);
  }
}
