import { normalise } from '../src/audio.js';
import { clientIp, createLimiter, fail, json, tokenMatches } from '../src/guard.js';
import { run, styleOf, VoiceError, type Config } from '../src/pipeline.js';

const MAX_BYTES = 4_400_000;
const ALLOWED = /\.(m4a|mp4|aac|mp3|wav|webm)$/i;
const WINDOW_MS = 10 * 60 * 1000;
// A long live take that has to be sent after it ends arrives in pieces, one request each.
const WINDOW_LIMIT = 120;
const limited = createLimiter(WINDOW_MS, WINDOW_LIMIT);

/**
 * `POST /api/transcribe`, multipart `file` and an optional `style`: 'exact' (the default) returns
 * the words as heard, 'tidy' returns the polished text. Holds nothing: the audio and the words
 * exist in memory for the length of the request.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const { OPENAI_API_KEY, ECHO_VOICE_TOKEN } = process.env;
  if (!OPENAI_API_KEY || !ECHO_VOICE_TOKEN) return fail(503, 'not_configured');
  if (!tokenMatches(request.headers.get('x-echo-voice-token'), ECHO_VOICE_TOKEN)) {
    return fail(401, 'unauthorized');
  }
  if (limited(clientIp(request), started)) return fail(429, 'rate_limited', true);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES + 2048) {
    return fail(413, 'too_long');
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return fail(400, 'no_audio');
    if (file.size > MAX_BYTES) return fail(413, 'too_long');
    if (!ALLOWED.test(file.name)) return fail(415, 'unsupported_audio');
    const style = styleOf(form.get('style'));

    const audio = await normalise({
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      type: file.type || 'application/octet-stream',
    });
    const config: Config = {
      apiKey: OPENAI_API_KEY,
      transcribeModel: process.env.ECHO_TRANSCRIBE_MODEL ?? 'gpt-transcribe',
      polishModel: process.env.ECHO_POLISH_MODEL ?? 'gpt-6.1-terra',
      fetch,
    };
    const result = await run(audio, config, style);
    // Sizes, timing and which steps ran. Never audio, text, or anything derived from them.
    console.log(
      JSON.stringify({
        route: 'transcribe',
        bytes: file.size,
        ms: Date.now() - started,
        style,
        polished: result.polished,
        romanised: result.romanised,
      }),
    );
    return json(200, result);
  } catch (error) {
    const voice = error instanceof VoiceError ? error : null;
    console.log(JSON.stringify({ route: 'transcribe', failed: voice?.code ?? 'internal', ms: Date.now() - started }));
    if (voice) return fail(voice.code === 'upstream' ? 502 : 422, voice.code, voice.retryable);
    return fail(500, 'internal', true);
  }
}
