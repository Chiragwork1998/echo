// The one identity ECHO has for a phone: a random id, made the first time it is needed and kept in the
// device's secure store. It names no one, is not derived from the device, and holds no journal content.
// The voice server counts the free allowance against it, and ECHO Plus purchases are attached to it, so
// it survives "Delete everything" (docs/PRODUCT_V1.md, Trust and safety).
//
// The server knows the install by a token it signs (voice-api/src/token.ts), asked for once with the
// id and kept in the secure store beside it. Every voice request carries it. Nothing here logs, and a
// token, like the id, never leaves the phone except to ECHO's own server.
import { getRuntime } from '@/storage/runtime';

import { VOICE_TOKEN_HEADER, type VoiceApi } from './voiceApi';

export const INSTALL_ID_NAME = 'echo.install-id';
export const INSTALL_TOKEN_NAME = 'echo.install-token';
export const INSTALL_PATH = '/api/install';

let pending: Promise<string> | null = null;

/** The install id, made once. A failure is not kept, so a later call can succeed. */
export function getInstallId(): Promise<string> {
  pending ??= (async () => {
    const { secrets, newId } = await getRuntime();
    const existing = await secrets.get(INSTALL_ID_NAME);
    if (existing) return existing;
    const made = newId();
    await secrets.set(INSTALL_ID_NAME, made);
    return made;
  })().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

// ---------------------------------------------------------------------------------------------
// The install token

/** A token, when it ends, and which server it is for: a token from one server means nothing to another. */
type Kept = { token: string; expiresAt: number; origin: string };

export type InstallTokenDeps = { fetch: typeof fetch; now: () => number };

const TIMEOUT_MS = 10_000;
/** A token this close to its end is replaced before it is used, while it can still be used if that fails. */
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;
/**
 * After the server could not give a token (no connection, or a server that does not issue them yet),
 * how long before it is asked again. Requests go on meanwhile with the shared token alone, which such
 * a server still takes. A token the server refuses is asked for again at once.
 */
const QUIET_AFTER_FAILURE_MS = 60_000;

let kept: Kept | null = null;
let asking: Promise<string | null> | null = null;
let failedAt = Number.NEGATIVE_INFINITY;

const tokenDefaults = (): InstallTokenDeps => ({
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
});

async function readKept(origin: string): Promise<Kept | null> {
  if (kept?.origin === origin) return kept;
  const { secrets } = await getRuntime();
  const raw = await secrets.get(INSTALL_TOKEN_NAME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Kept>;
    if (
      typeof parsed.token === 'string' &&
      typeof parsed.expiresAt === 'number' &&
      parsed.origin === origin
    ) {
      kept = parsed as Kept;
      return kept;
    }
  } catch {
    // Unreadable: asked for again.
  }
  return null;
}

/** Asks the server for a token for this install. Null on any failure: nothing here throws. */
async function ask(api: VoiceApi, deps: InstallTokenDeps): Promise<string | null> {
  const installId = await getInstallId();
  // Not AbortSignal.timeout: Hermes does not reliably have it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await deps.fetch(`${api.url}${INSTALL_PATH}`, {
      method: 'POST',
      headers: {
        [VOICE_TOKEN_HEADER]: api.token,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ installId }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as {
      token?: unknown;
      expiresAt?: unknown;
    } | null;
    const token = body?.token;
    const expiresAt = typeof body?.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN;
    if (typeof token !== 'string' || token.length === 0 || !Number.isFinite(expiresAt)) return null;
    kept = { token, expiresAt, origin: api.url };
    // Kept for the next launch. If the store will not take it, it is still good for this one.
    try {
      const { secrets } = await getRuntime();
      await secrets.set(INSTALL_TOKEN_NAME, JSON.stringify(kept));
    } catch {
      // Asked for again next launch.
    }
    return token;
  } finally {
    clearTimeout(timer);
  }
}

/** One question at a time: requests that need a token while one is being asked for share the answer. */
function fresh(api: VoiceApi, deps: InstallTokenDeps): Promise<string | null> {
  asking ??= ask(api, deps)
    .catch(() => null)
    .then((token) => {
      failedAt = token ? Number.NEGATIVE_INFINITY : deps.now();
      return token;
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}

/**
 * This install's token for `api`, asked for the first time it is needed and kept in the secure store.
 * Null when there is none to be had: no connection, or a server that does not issue them. The request
 * then goes with the shared token alone, so nothing a person does waits on this. Never throws.
 */
export async function getInstallToken(
  api: VoiceApi | null,
  overrides: Partial<InstallTokenDeps> = {},
): Promise<string | null> {
  if (!api) return null;
  const deps = { ...tokenDefaults(), ...overrides };
  try {
    const held = await readKept(api.url).catch(() => null);
    const now = deps.now();
    if (held && held.expiresAt - RENEW_BEFORE_MS > now) return held.token;
    const usable = held && held.expiresAt > now ? held.token : null;
    if (now - failedAt < QUIET_AFTER_FAILURE_MS) return usable;
    return (await fresh(api, deps)) ?? usable;
  } catch {
    return null;
  }
}

/**
 * A new token, after the server refused `stale` (changed, or its time was up) or asked for one when
 * none was sent. If another request has already replaced it, that one is used and nothing is asked.
 */
export async function renewInstallToken(
  api: VoiceApi | null,
  stale: string | null,
  overrides: Partial<InstallTokenDeps> = {},
): Promise<string | null> {
  if (!api) return null;
  const deps = { ...tokenDefaults(), ...overrides };
  try {
    if (asking) {
      const shared = await asking;
      if (shared && shared !== stale) return shared;
    }
    const held = await readKept(api.url).catch(() => null);
    if (held && held.token !== stale && held.expiresAt > deps.now()) return held.token;
    kept = null;
    try {
      const { secrets } = await getRuntime();
      await secrets.remove(INSTALL_TOKEN_NAME);
    } catch {
      // Replaced below, or asked for again next time.
    }
    return await fresh(api, deps);
  } catch {
    return null;
  }
}

export type InstallTokens = {
  get: (api: VoiceApi) => Promise<string | null>;
  renew: (api: VoiceApi, stale: string | null) => Promise<string | null>;
};

export const installTokens: InstallTokens = {
  get: (api) => getInstallToken(api),
  renew: (api, stale) => renewInstallToken(api, stale),
};

/**
 * One request made with this install's token, and made once more with a new token if the server
 * refused the first. `refused` says, from what the request returned, whether that is what happened.
 */
export async function withInstallToken<T>(
  api: VoiceApi,
  attempt: (installToken: string | null) => Promise<T>,
  refused: (result: T) => boolean,
  tokens: InstallTokens = installTokens,
): Promise<T> {
  const token = await tokens.get(api).catch(() => null);
  const first = await attempt(token);
  if (!refused(first)) return first;
  const renewed = await tokens.renew(api, token).catch(() => null);
  if (!renewed || renewed === token) return first;
  return attempt(renewed);
}

/** Tests only: forget the id and the token held in memory, so the next call reads the store again. */
export function forgetInstallIdInMemory(): void {
  pending = null;
  kept = null;
  asking = null;
  failedAt = Number.NEGATIVE_INFINITY;
}
