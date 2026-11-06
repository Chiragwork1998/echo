// Live words: a short-lived secret that lets the phone stream a take straight to OpenAI's realtime
// transcription, so the OpenAI key never leaves this server and no audio passes through it. Errors
// carry codes only, and nothing here is logged.

const OPENAI = 'https://api.openai.com/v1';
const TIMEOUT_MS = 15_000;

export const LIVE_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';
export const LIVE_MODEL = 'gpt-live-transcribe';
export const LIVE_RATE = 24_000;
/** A new secret opens a connection within this long. The session it opens carries on after. */
export const SECRET_SECONDS = 60;
export const LIVE_LANGUAGES = ['en', 'hi'];
/**
 * Asks for the words as said. Without it the live model quietly drops fillers ("um") that a journal
 * keeps (D-008). Measured against the plain request, it kept every one.
 */
export const LIVE_PROMPT =
  'A private spoken journal entry. Transcribe exactly what is said, word for word. Keep every filler (um, uh, you know), repetition, false start and self-correction. The speaker may move between English and Hindi.';

export type LiveDelay = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
const DELAYS: readonly string[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
export const delayOf = (value: string | undefined): LiveDelay =>
  DELAYS.includes(value ?? '') ? (value as LiveDelay) : 'low';

export type LiveConfig = { apiKey: string; delay: LiveDelay; fetch: typeof fetch };

export type LiveSession = {
  /** Where to connect. The phone insists on wss. */
  url: string;
  /** Sent in the WebSocket subprotocols, after 'realtime'. Opens one transcription session. */
  secret: string;
  expiresAt: number;
  sampleRate: number;
  /** The first message to send once the socket opens, exactly as given. */
  update: unknown;
};

export class LiveError extends Error {
  readonly retryable: boolean;
  constructor(retryable: boolean) {
    super('live_unavailable');
    this.retryable = retryable;
  }
}

const transcription = (delay?: LiveDelay) => ({
  model: LIVE_MODEL,
  languages: LIVE_LANGUAGES,
  prompt: LIVE_PROMPT,
  ...(delay ? { delay } : {}),
});

const input = (delay?: LiveDelay) => ({
  format: { type: 'audio/pcm', rate: LIVE_RATE },
  transcription: transcription(delay),
  // This model has no voice detection: the phone commits each turn at a pause.
  turn_detection: null,
});

/** The body that mints a transcription secret. `delay` is a session setting, not a secret one. */
export const secretBody = () => ({
  expires_after: { anchor: 'created_at', seconds: SECRET_SECONDS },
  session: { type: 'transcription', audio: { input: input() } },
});

export async function mintLiveSession(config: LiveConfig): Promise<LiveSession> {
  let response: Response;
  try {
    response = await config.fetch(`${OPENAI}/realtime/client_secrets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(secretBody()),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new LiveError(true);
  }
  if (!response.ok) throw new LiveError(response.status >= 500 || response.status === 429);
  const body = (await response.json().catch(() => null)) as {
    value?: unknown;
    expires_at?: unknown;
  } | null;
  if (typeof body?.value !== 'string' || body.value.length === 0) throw new LiveError(true);
  return {
    url: LIVE_URL,
    secret: body.value,
    expiresAt: typeof body.expires_at === 'number' ? body.expires_at : 0,
    sampleRate: LIVE_RATE,
    update: {
      type: 'session.update',
      session: { type: 'transcription', audio: { input: input(config.delay) } },
    },
  };
}
