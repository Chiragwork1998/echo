import { installTokens, withInstallToken, type InstallTokens } from './install';
import { authHeaders, installRefused, refusalOf, voiceApi, type VoiceApi } from './voiceApi';

// Live words (docs/OWNER_DECISIONS.md, D-007, D-008): a take streamed to OpenAI's realtime
// transcription while it is spoken. The OpenAI key never reaches the phone. ECHO's server hands out a
// secret that lives for a minute and can only open one transcription session, and the phone then
// connects to OpenAI itself, so no audio passes through ECHO's server at all.
//
// Nothing here throws, and nothing here logs: not the audio, not the words, not the address.

export type LiveEvent =
  | { kind: 'delta'; itemId: string; text: string }
  /** A turn was committed. They arrive in the order the commits were sent. */
  | { kind: 'committed'; itemId: string }
  | { kind: 'completed'; itemId: string; text: string }
  | { kind: 'item_failed'; itemId: string }
  | { kind: 'error' };

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** One message from the socket, or null if it is not one we use. Never throws. */
export function parseLiveEvent(data: unknown): LiveEvent | null {
  if (typeof data !== 'string') return null;
  let message: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return null;
    message = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const itemId = text(message.item_id);
  switch (message.type) {
    case 'conversation.item.input_audio_transcription.delta':
      return itemId ? { kind: 'delta', itemId, text: text(message.delta) } : null;
    case 'input_audio_buffer.committed':
      return itemId ? { kind: 'committed', itemId } : null;
    case 'conversation.item.input_audio_transcription.completed':
      return itemId ? { kind: 'completed', itemId, text: text(message.transcript) } : null;
    case 'conversation.item.input_audio_transcription.failed':
      return itemId ? { kind: 'item_failed', itemId } : null;
    case 'error':
      return { kind: 'error' };
    default:
      return null;
  }
}

/** What the phone sends over the open socket. */
export type LiveSocket = {
  /** Base64 of 24 kHz mono 16-bit PCM. */
  appendAudio(base64: string): void;
  /** Ends a turn. This model has no voice detection, so the phone says when. */
  commit(): void;
  /** Hangs up. After this no further event is reported. */
  close(): void;
};

export type LiveHandlers = {
  onEvent: (event: LiveEvent) => void;
  /** The connection ended for any reason other than close(). */
  onClose: () => void;
};

type SocketLike = {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
};
type SocketConstructor = new (url: string, protocols: string[]) => SocketLike;

export type LiveDeps = {
  fetch: typeof fetch;
  api: VoiceApi | null;
  WebSocket: SocketConstructor;
  /** How long to wait for the secret, and then for the socket to open. */
  timeoutMs: number;
  /** Whether the person agreed to their voice being streamed as it is spoken (`liveAllowed`). */
  allowed: () => boolean;
  /** This install's token for the server, and a new one when it is refused (install.ts). */
  tokens: InstallTokens;
};

type Preferences = typeof import('@/state/preferences');

const defaults = (): LiveDeps => ({
  fetch: (input, init) => fetch(input, init),
  api: voiceApi(),
  WebSocket: WebSocket as unknown as SocketConstructor,
  timeoutMs: 12_000,
  allowed: () => {
    // Loaded here so voice-api/scripts/live-check.mts can run this file under Node.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { liveAllowed, usePreferences } = require('@/state/preferences') as Preferences;
    return liveAllowed(usePreferences.getState().voiceConsent);
  },
  tokens: installTokens,
});

export const LIVE_SESSION_PATH = '/api/live-session';

/** The one place a live voice is streamed to. The server names it, but the phone does not take its word. */
export const LIVE_HOST = 'api.openai.com';
export const LIVE_PATH = '/v1/realtime';

const OPENAI_REALTIME = new RegExp(
  `^wss://${LIVE_HOST.replace(/\./g, '\\.')}${LIVE_PATH}(?:[/?][^\\s#\\\\]*)?$`,
);

/**
 * The address the server gave, if it is safe to stream a voice to: OpenAI's realtime API over wss,
 * exactly (host `api.openai.com`, a path that starts `/v1/realtime`, no user, no port), or this
 * Mac's own loopback in a development build. Anything else is refused, so a wrong reply, or someone
 * standing in for the server, can never send a voice to a host of their choosing, or in the clear.
 * Parsed by hand: the URL class is not complete on every React Native runtime.
 */
export function liveAddress(
  url: unknown,
  development: boolean = typeof __DEV__ !== 'undefined' && __DEV__,
): string | null {
  if (typeof url !== 'string') return null;
  if (OPENAI_REALTIME.test(url) && !url.includes('..')) return url;
  if (
    development &&
    /^ws:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?(\/[^\s#]*)?(\?[^\s#]*)?$/i.test(url)
  ) {
    return url;
  }
  return null;
}

type Granted = { url: string; secret: string; update: unknown };

/**
 * Asks for a secret with this install's token, and once more with a new token if it was refused.
 * Any other refusal, such as live words not being in the person's plan (402), is no secret: the take
 * is then sent after it ends, and its words come that way.
 */
async function mint(deps: LiveDeps): Promise<Granted | null> {
  const api = deps.api;
  if (!api) return null;
  const once = async (installToken: string | null) => {
    const response = await deps.fetch(`${api.url}${LIVE_SESSION_PATH}`, {
      method: 'POST',
      headers: { ...authHeaders(api, installToken), Accept: 'application/json' },
      signal: AbortSignal.timeout(deps.timeoutMs),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: response.ok, status: response.status, body };
  };
  const { ok, body } = await withInstallToken(
    api,
    once,
    (answer) => installRefused(answer.status, refusalOf(answer.body)),
    deps.tokens,
  );
  if (!ok) return null;
  const url = liveAddress(body?.url);
  if (!url || typeof body?.secret !== 'string' || body.secret.length === 0) return null;
  return { url, secret: body.secret, update: body.update };
}

/**
 * Opens a live transcription session and resolves once audio can be sent, or with null if it could
 * not be opened for any reason. A connection that later ends is reported through `onClose`, once.
 * It checks the person's consent itself, before it asks the server for anything, so no caller can
 * stream a voice that was not agreed to be streamed.
 */
export async function openLiveSocket(
  handlers: LiveHandlers,
  overrides: Partial<LiveDeps> = {},
): Promise<LiveSocket | null> {
  const deps = { ...defaults(), ...overrides };
  if (!deps.allowed()) return null;
  let granted: Granted | null;
  try {
    granted = await mint(deps);
  } catch {
    return null;
  }
  if (!granted) return null;
  const { url, secret, update } = granted;

  return new Promise<LiveSocket | null>((resolve) => {
    let settled = false;
    let hungUp = false;
    let socket: SocketLike;
    const finish = (value: LiveSocket | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      hungUp = true;
      try {
        socket.close();
      } catch {
        // Already gone.
      }
      finish(null);
    }, deps.timeoutMs);

    try {
      socket = new deps.WebSocket(url, ['realtime', `openai-insecure-api-key.${secret}`]);
    } catch {
      finish(null);
      return;
    }
    const send = (message: unknown) => {
      if (!hungUp) socket.send(JSON.stringify(message));
    };
    socket.onopen = () => {
      try {
        send(update);
      } catch {
        finish(null);
        return;
      }
      finish({
        appendAudio: (audio) => send({ type: 'input_audio_buffer.append', audio }),
        commit: () => send({ type: 'input_audio_buffer.commit' }),
        close: () => {
          hungUp = true;
          try {
            socket.close();
          } catch {
            // Already gone.
          }
        },
      });
    };
    socket.onmessage = (event) => {
      if (hungUp) return;
      const parsed = parseLiveEvent(event.data);
      if (parsed) handlers.onEvent(parsed);
    };
    const ended = () => {
      if (hungUp) return;
      hungUp = true;
      if (!settled) finish(null);
      else handlers.onClose();
    };
    socket.onerror = ended;
    socket.onclose = ended;
  });
}
