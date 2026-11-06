import { timingSafeEqual } from 'node:crypto';

import { normalise } from '../src/audio.js';
import { run, VoiceError, type Config } from '../src/pipeline.js';

const MAX_BYTES = 4_400_000;
const ALLOWED = /\.(m4a|mp4|aac|mp3|wav|webm)$/i;
const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_LIMIT = 30;
const hits = new Map<string, number[]>();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const fail = (status: number, code: string, retryable = false) => json(status, { code, retryable });

function tokenMatches(given: string | null, expected: string) {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Best effort: per instance. Real protection before launch is noted in the README. */
function limited(ip: string, now: number) {
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > WINDOW_LIMIT;
}

export async function POST(request: Request) {
  const started = Date.now();
  const { OPENAI_API_KEY, ECHO_VOICE_TOKEN } = process.env;
  if (!OPENAI_API_KEY || !ECHO_VOICE_TOKEN) return fail(503, 'not_configured');
  if (!tokenMatches(request.headers.get('x-echo-voice-token'), ECHO_VOICE_TOKEN)) {
    return fail(401, 'unauthorized');
  }
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]?.trim() ?? 'unknown';
  if (limited(ip, started)) return fail(429, 'rate_limited', true);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES + 2048) {
    return fail(413, 'too_long');
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return fail(400, 'no_audio');
    if (file.size > MAX_BYTES) return fail(413, 'too_long');
    if (!ALLOWED.test(file.name)) return fail(415, 'unsupported_audio');

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
    const result = await run(audio, config);
    // Sizes and timing only. Never audio, text, or anything derived from them.
    console.log(
      JSON.stringify({ route: 'transcribe', bytes: file.size, ms: Date.now() - started, polished: result.polished }),
    );
    return json(200, result);
  } catch (error) {
    const voice = error instanceof VoiceError ? error : null;
    console.log(JSON.stringify({ route: 'transcribe', failed: voice?.code ?? 'internal', ms: Date.now() - started }));
    if (voice) return fail(voice.code === 'upstream' ? 502 : 422, voice.code, voice.retryable);
    return fail(500, 'internal', true);
  }
}
