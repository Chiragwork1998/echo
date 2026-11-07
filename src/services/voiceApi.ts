// Where the app reaches ECHO's server. Transcription, refining, live words and Pattern Cards share
// this, so that the one HTTPS rule and the two public settings live in one place. Both settings
// ship inside the app, so the shared token proves nothing on its own: it is used to ask for this
// install's own token (src/services/install.ts), which every voice request then carries, and which
// the server counts the free allowance against (see voice-api/README.md).

export const VOICE_TOKEN_HEADER = 'x-echo-voice-token';
export const INSTALL_TOKEN_HEADER = 'x-echo-install-token';

export type VoiceApi = { url: string; token: string };

/**
 * The headers that say who is asking: the shared token always, so a server that has not yet learned
 * install tokens still answers, and this install's token when there is one.
 */
export const authHeaders = (
  api: VoiceApi,
  installToken: string | null,
): Record<string, string> => ({
  [VOICE_TOKEN_HEADER]: api.token,
  ...(installToken ? { [INSTALL_TOKEN_HEADER]: installToken } : {}),
});

/** What the server says about a refusal. Every field is optional: an older server sends less. */
export type ServerRefusal = {
  error?: string;
  code?: string;
  retryable?: boolean;
  feature?: string;
  plan?: string;
  resetsAt?: string | null;
};

/** The refusal in a reply body, read without trusting its shape. */
export function refusalOf(body: unknown): ServerRefusal {
  if (typeof body !== 'object' || body === null) return {};
  const { error, code, retryable, feature, plan, resetsAt } = body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  return {
    error: text(error) ?? text(code),
    code: text(code) ?? text(error),
    retryable: typeof retryable === 'boolean' ? retryable : undefined,
    feature: text(feature),
    plan: text(plan),
    resetsAt: typeof resetsAt === 'string' ? resetsAt : null,
  };
}

/**
 * The server did not accept this install's token (it was changed, or its time is up), or it now
 * requires one and none was sent. Either way the answer is to ask for a new one, once.
 */
export const installRefused = (status: number, refusal: ServerRefusal) =>
  status === 401 && (refusal.error === 'install_invalid' || refusal.error === 'install_required');

const LOOPBACK = new Set(['localhost', '127.0.0.1']);

/**
 * The one rule for where the app may send anything to ECHO's server: transcription, refining, live
 * words and Pattern Cards all go through it. The origin must be https. The one exception is this
 * Mac's own loopback address in a development build, where the simulator reaches the local server and
 * nothing crosses a network; a release build has no exception. Anything else, including a missing
 * setting, is null.
 *
 * Parsed by hand, because the URL class is not complete on every React Native runtime, and strict:
 * an origin and nothing more, so that a host like "127.0.0.1.example.com" or "localhost@example.com"
 * cannot pass for a local one, and a user, path or query cannot ride along.
 */
export function voiceOrigin(
  raw: string | undefined,
  development: boolean = typeof __DEV__ !== 'undefined' && __DEV__,
): string | null {
  const match = /^(https?):\/\/([^/?#@\s]+)\/?$/i.exec((raw ?? '').trim());
  if (!match) return null;
  const scheme = match[1]!.toLowerCase();
  const authority = match[2]!.toLowerCase();
  const host = authority.replace(/:\d{1,5}$/, '');
  if (host.length === 0 || host.includes(':')) return null;
  if (scheme === 'http' && !(development && LOOPBACK.has(host))) return null;
  return `${scheme}://${authority}`;
}

/** The server's origin and the token, if both are set and the origin passes `voiceOrigin`. */
export function resolveVoiceApi(
  url: string | undefined,
  token: string | undefined,
  development?: boolean,
): VoiceApi | null {
  const origin = voiceOrigin(url, development);
  return origin && token ? { url: origin, token } : null;
}

/** Expo inlines only direct reads of process.env.EXPO_PUBLIC_*, so each is spelled out here. */
export const voiceApi = (): VoiceApi | null =>
  resolveVoiceApi(process.env.EXPO_PUBLIC_VOICE_URL, process.env.EXPO_PUBLIC_VOICE_TOKEN);
