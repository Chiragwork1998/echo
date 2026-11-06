// Where the app reaches ECHO's server. Transcription and Pattern Cards share this, so that the one
// HTTPS rule and the two public settings live in one place. Both settings ship inside the app: the
// token only stops casual abuse (see voice-api/README.md).

export const VOICE_TOKEN_HEADER = 'x-echo-voice-token';

export type VoiceApi = { url: string; token: string };

const LOOPBACK = new Set(['localhost', '127.0.0.1']);

/**
 * The server address, if it is safe to send anything to. It must be https. The one exception is this
 * Mac's own loopback address in a development build, where the simulator reaches the local server and
 * nothing crosses a network. Anything else, including a missing setting, is null.
 */
export function resolveVoiceApi(
  url: string | undefined,
  token: string | undefined,
  development: boolean = typeof __DEV__ !== 'undefined' && __DEV__,
): VoiceApi | null {
  if (!url || !token) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const secure = parsed.protocol === 'https:';
  const local = development && parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname);
  if (!secure && !local) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

/** Expo inlines only direct reads of process.env.EXPO_PUBLIC_*, so each is spelled out here. */
export const voiceApi = (): VoiceApi | null =>
  resolveVoiceApi(process.env.EXPO_PUBLIC_VOICE_URL, process.env.EXPO_PUBLIC_VOICE_TOKEN);
