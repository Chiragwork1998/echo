// Where the app reaches ECHO's server. Transcription, refining, live words and Pattern Cards share
// this, so that the one HTTPS rule and the two public settings live in one place. Both settings
// ship inside the app: the token only stops casual abuse (see voice-api/README.md).

export const VOICE_TOKEN_HEADER = 'x-echo-voice-token';

export type VoiceApi = { url: string; token: string };

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
