// The two routes on ECHO's server that read one entry (the contract D-017): POST /api/reflect writes
// today's echo, and POST /api/format sets an entry's words out, every word kept. Both carry this
// install's token as every voice request does (install.ts), and both answer a failure in one shape,
// { error, code, retryable }. Nothing here throws, and nothing here logs: what is sent and what comes
// back are a person's own words. Whether anything may be sent at all is decided before this is called
// (src/services/reflection.ts and src/services/formatQueue.ts).

import { installTokens, withInstallToken, type InstallTokens } from './install';
import { phoneOnline } from './reportCard';
import { authHeaders, installRefused, refusalOf, voiceApi, type VoiceApi } from './voiceApi';

export const REFLECT_PATH = '/api/reflect';
export const FORMAT_PATH = '/api/format';
/** The most of an entry today's echo is written from. The server takes no more. */
export const REFLECT_MAX_CHARS = 20_000;
/** The longest entry that can be set out. The server takes no more, and a longer one stays as it is. */
export const FORMAT_MAX_CHARS = 100_000;
/**
 * Today's echo as the server lets it through (voice-api/src/reflect.ts): one line of 10 to 220
 * characters. Anything else is not one, whatever it is, and is not shown.
 */
const ECHO_CHARS = { least: 10, most: 220 } as const;

const REFLECT_TIMEOUT_MS = 60_000;
/** A long entry set out is a long answer, written word by word, and asked for twice if the first fails its check. */
const FORMAT_TIMEOUT_MS = 150_000;

export type ReadingDeps = {
  send: typeof fetch;
  tokens: InstallTokens;
  /** Whether the phone has a connection: false only when it says it has none. */
  online: () => Promise<boolean | null>;
  /** The server, or null when this build has none that may be used (voiceApi.ts). */
  api: () => VoiceApi | null;
};

const defaults = (): ReadingDeps => ({
  send: (input, init) => fetch(input, init),
  tokens: installTokens,
  online: phoneOnline,
  api: voiceApi,
});

/** Why a request brought no answer. */
export type ReadingFailure =
  /** No server in this build, or one without its key. Nothing was sent. */
  | 'not_configured'
  /** The phone says it has no connection. */
  | 'offline'
  /** The request did not get through, or was not answered in time. */
  | 'unreachable'
  /**
   * The server says to try again later: it is busy (503), this install has asked often in a short
   * while (429), or OpenAI failed in a way that may pass (502).
   */
  | 'busy'
  /** This install's allowance for it is used (402). */
  | 'allowance_used'
  /** The server could not write one that passed its own check (422). */
  | 'unusable'
  /** Anything else the server would not take, and says trying again will not mend. */
  | 'refused'
  /** An answer of a shape the app does not know. */
  | 'invalid';

export type Failed = { kind: 'failed'; code: ReadingFailure; retryable: boolean };

export type ReflectAnswer =
  | { kind: 'reflection'; text: string }
  /** The entry suggests the person may be in danger. No reflection was written. */
  | { kind: 'support' }
  | Failed;

export type FormatAnswer =
  | { kind: 'formatted'; text: string }
  /** The server sent the words back as they were, and nothing is to be stored. */
  | { kind: 'unchanged' }
  | Failed;

const failed = (code: ReadingFailure, retryable: boolean): Failed => ({
  kind: 'failed',
  code,
  retryable,
});

/** Today's echo from a reply body, trusting nothing about its shape. */
export function parseEcho(body: unknown): ReflectAnswer | null {
  if (typeof body !== 'object' || body === null) return null;
  const { kind, text } = body as Record<string, unknown>;
  if (kind === 'support') return { kind: 'support' };
  if (kind !== 'reflection' || typeof text !== 'string') return null;
  const echo = text.trim();
  const fits = echo.length >= ECHO_CHARS.least && echo.length <= ECHO_CHARS.most;
  return fits && !/[\r\n]/.test(echo) ? { kind: 'reflection', text: echo } : null;
}

/** The words set out from a reply body, trusting nothing about its shape. */
export function parseSetOut(body: unknown): FormatAnswer | null {
  if (typeof body !== 'object' || body === null) return null;
  const { text, formatted } = body as Record<string, unknown>;
  if (typeof formatted !== 'boolean' || typeof text !== 'string') return null;
  if (!formatted) return { kind: 'unchanged' };
  const setOut = text.replace(/\r\n?/g, '\n').trim();
  return setOut.length > 0 ? { kind: 'formatted', text: setOut } : null;
}

/**
 * What a refusal means. Whether trying again could help is the server's to say, in the body's
 * `retryable`, and never read from the status: an OpenAI failure is a 502 that may or may not pass.
 * A 429 that does not say is a request to wait, as the server's own always is.
 */
function refused(status: number, body: unknown): Failed {
  const { error, retryable } = refusalOf(body);
  if (status === 402) return failed('allowance_used', false);
  if (status === 422) return failed('unusable', false);
  if (error === 'not_configured') return failed('not_configured', false);
  if (retryable ?? status === 429) return failed('busy', true);
  return failed('refused', false);
}

type Sent = { kind: 'reply'; status: number; body: unknown } | Failed;

/**
 * One request with this install's token, made once more with a new token if the server refused the
 * first. A reply of any status is returned as it came; only a request that never got one fails here.
 */
async function post(
  path: string,
  payload: { text: string },
  timeoutMs: number,
  deps: ReadingDeps,
): Promise<Sent> {
  const api = deps.api();
  if (!api) return failed('not_configured', false);
  const once = async (installToken: string | null): Promise<Sent> => {
    // Not AbortSignal.timeout: Hermes does not reliably have it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await deps.send(`${api.url}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...authHeaders(api, installToken),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch {
        const connected = await deps.online().catch(() => null);
        return connected === false ? failed('offline', true) : failed('unreachable', true);
      }
      const body: unknown = await response.json().catch(() => undefined);
      return { kind: 'reply', status: response.status, body };
    } catch {
      return failed('unreachable', true);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    return await withInstallToken(
      api,
      once,
      (sent) => sent.kind === 'reply' && installRefused(sent.status, refusalOf(sent.body)),
      deps.tokens,
    );
  } catch {
    return failed('unreachable', true);
  }
}

/** Today's echo for the words of one entry, already decrypted on this phone. */
export async function reflectText(
  text: string,
  overrides: Partial<ReadingDeps> = {},
): Promise<ReflectAnswer> {
  const sent = await post(
    REFLECT_PATH,
    { text: text.slice(0, REFLECT_MAX_CHARS) },
    REFLECT_TIMEOUT_MS,
    { ...defaults(), ...overrides },
  );
  if (sent.kind === 'failed') return sent;
  if (sent.status < 200 || sent.status >= 300) return refused(sent.status, sent.body);
  return parseEcho(sent.body) ?? failed('invalid', false);
}

/** One entry's words set out, or word that they could not be. Never sends more than the server takes. */
export async function formatText(
  text: string,
  overrides: Partial<ReadingDeps> = {},
): Promise<FormatAnswer> {
  if (text.length > FORMAT_MAX_CHARS) return failed('refused', false);
  const sent = await post(FORMAT_PATH, { text }, FORMAT_TIMEOUT_MS, {
    ...defaults(),
    ...overrides,
  });
  if (sent.kind === 'failed') return sent;
  if (sent.status < 200 || sent.status >= 300) return refused(sent.status, sent.body);
  return parseSetOut(sent.body) ?? failed('invalid', false);
}
