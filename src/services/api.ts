import { getAccessToken } from './auth';

/**
 * Client for the backend described in `docs/API_CONTRACT.md`.
 *
 * Base path and envelope shape are fixed by the contract. The host comes from
 * `EXPO_PUBLIC_API_BASE_URL` at build time — it is a public endpoint, never a
 * provider secret — and access tokens are supplied at runtime by the auth
 * boundary. Request and response bodies are never logged.
 */

export const ECHO_API_BASE_PATH = '/v1' as const;
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const UPLOAD_REQUEST_TIMEOUT_MS = 60_000;

export type ApiError = {
  code: string;
  message: string;
  retryable: boolean;
  requestId: string;
};

export type ConfigurationResponse = {
  minimumClientVersion: string;
  privacyPolicyVersion: string;
  termsVersion: string;
  reflectionAvailable: boolean;
  featureFlags: { backup: boolean; reflection: boolean };
};

export type HealthResponse = {
  status: 'ok' | 'degraded';
  version: string;
  dependencies: Record<string, 'ok' | 'unavailable'>;
};

export type SyncItem = {
  id: string;
  kind: 'entry' | 'reflection' | 'audio' | 'profile' | 'settings';
  revision: number;
  updatedAt: string;
  deletedAt: string | null;
  ciphertext: string;
  nonce: string;
  algorithm: 'A256GCM';
  contentHash: string;
};

export type SyncPullResponse = { items: SyncItem[]; nextCursor: string | null };

export type EchoApiClient = {
  health(): Promise<HealthResponse>;
  configuration(): Promise<ConfigurationResponse>;
  syncPull(params: { cursor?: string; limit?: number }): Promise<SyncPullResponse>;
  syncPush(items: SyncItem[], idempotencyKey: string): Promise<{ accepted: string[] }>;
};

export type EchoApiConfig = {
  baseUrl: string;
  /** Resolves a short-lived access token at call time; never persisted here. */
  accessToken: () => Promise<string | null>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
};

export class ApiUnavailableError extends Error {
  constructor(operation: string) {
    super(`${operation} is not available until a staging host is configured.`);
    this.name = 'ApiUnavailableError';
  }
}

/** Non-2xx response that carried the contract error envelope. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code;
    this.retryable = body.retryable;
    this.requestId = body.requestId;
  }
}

/** Transport-level failure (offline, DNS, timeout). Retryable by definition. */
export class ApiTransportError extends Error {
  constructor(cause?: unknown) {
    super('The request could not reach the server.');
    this.name = 'ApiTransportError';
    this.cause = cause;
  }
}

export class ApiUnauthenticatedError extends Error {
  constructor() {
    super('This request needs a signed-in session.');
    this.name = 'ApiUnauthenticatedError';
  }
}

/** Public API host from the build environment; null until one is configured. */
export function resolveApiBaseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

export function hasApiHost(): boolean {
  return resolveApiBaseUrl() !== null;
}

type RequestOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  formData?: FormData;
  searchParams?: Record<string, string | number | undefined>;
  idempotencyKey?: string;
  timeoutMs?: number;
  /** Set false for endpoints that must not require a session. */
  authenticated?: boolean;
};

function buildUrl(baseUrl: string, options: RequestOptions): string {
  const url = `${baseUrl}${ECHO_API_BASE_PATH}${options.path}`;
  if (!options.searchParams) {
    return url;
  }
  const query = Object.entries(options.searchParams)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(`${value}`)}`)
    .join('&');
  return query.length > 0 ? `${url}?${query}` : url;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = (await response.json()) as Partial<ApiError>;
    return {
      code: typeof parsed.code === 'string' ? parsed.code : 'unknown_error',
      message: typeof parsed.message === 'string' ? parsed.message : 'Request failed.',
      retryable: parsed.retryable === true,
      requestId: typeof parsed.requestId === 'string' ? parsed.requestId : '',
    };
  } catch {
    return {
      code: 'unknown_error',
      message: 'Request failed.',
      retryable: response.status >= 500,
      requestId: '',
    };
  }
}

/** Performs one contract request; bodies are never logged or persisted. */
export async function request<T>(
  config: EchoApiConfig,
  options: RequestOptions,
): Promise<T> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const url = buildUrl(baseUrl, options);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (!options.formData) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.authenticated !== false) {
    const token = await config.accessToken();
    if (!token) {
      throw new ApiUnauthenticatedError();
    }
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  );
  const fetchImpl = config.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: options.method,
      headers,
      body: options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiTransportError(error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ApiRequestError(response.status, await toApiError(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function createEchoApiClient(config: EchoApiConfig): EchoApiClient {
  return {
    health() {
      return request<HealthResponse>(config, {
        method: 'GET',
        path: '/health',
        authenticated: false,
      });
    },
    configuration() {
      return request<ConfigurationResponse>(config, {
        method: 'GET',
        path: '/configuration',
        authenticated: false,
      });
    },
    syncPull({ cursor, limit }) {
      return request<SyncPullResponse>(config, {
        method: 'GET',
        path: '/sync/pull',
        searchParams: { cursor, limit },
      });
    },
    syncPush(items, idempotencyKey) {
      return request<{ accepted: string[] }>(config, {
        method: 'POST',
        path: '/sync/push',
        body: { items },
        idempotencyKey,
      });
    },
  };
}

/**
 * Client wired to the public API host, or null when no host is configured so
 * callers can show an explicit unavailable state instead of failing silently.
 */
export function getEchoApiClient(): EchoApiClient | null {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    return null;
  }
  return createEchoApiClient({ baseUrl, accessToken: getAccessToken });
}
