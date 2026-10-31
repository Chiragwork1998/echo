import {
  AuthenticationError,
  type AuthProvider,
  type AuthProviderName,
  type MagicLinkVerification,
  type ProviderSession,
  type VerifiedIdentity,
} from './auth.js';

interface SupabaseUser {
  id?: unknown;
  app_metadata?: { provider?: unknown; providers?: unknown };
  identities?: { provider?: unknown }[];
}

interface SupabaseSessionResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  user?: SupabaseUser;
}

interface JwtClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  sub?: unknown;
}

function providerFromUser(
  user: SupabaseUser,
  fallback?: AuthProviderName,
): AuthProviderName {
  const candidates = [
    ...(user.identities ?? []).map((identity) => identity.provider),
    user.app_metadata?.provider,
  ];
  for (const candidate of candidates) {
    if (
      candidate === 'apple' ||
      candidate === 'google' ||
      candidate === 'email'
    )
      return candidate;
  }
  if (fallback) return fallback;
  throw new AuthenticationError();
}

function decodeClaims(token: string): JwtClaims {
  const payload = token.split('.')[1];
  if (!payload) throw new AuthenticationError();
  try {
    return JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as JwtClaims;
  } catch {
    throw new AuthenticationError();
  }
}

export class SupabaseAuthProvider implements AuthProvider {
  readonly #authUrl: string;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;

  constructor(
    projectUrl: string,
    apiKey: string,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.#authUrl = `${projectUrl.replace(/\/$/, '')}/auth/v1`;
    this.#apiKey = apiKey;
    this.#fetch = fetchImplementation;
  }

  async #request(path: string, init: RequestInit): Promise<Response> {
    try {
      const headers = new Headers(init.headers);
      headers.set('apikey', this.#apiKey);
      headers.set('content-type', 'application/json');
      const response = await this.#fetch(`${this.#authUrl}${path}`, {
        ...init,
        headers,
      });
      if (!response.ok) throw new AuthenticationError();
      return response;
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError();
    }
  }

  async #session(
    path: string,
    body: object,
    fallbackProvider?: AuthProviderName,
  ): Promise<ProviderSession> {
    const response = await this.#request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const value = (await response.json()) as SupabaseSessionResponse;
    if (
      typeof value.access_token !== 'string' ||
      typeof value.refresh_token !== 'string' ||
      typeof value.expires_in !== 'number' ||
      typeof value.user?.id !== 'string'
    )
      throw new AuthenticationError();
    return {
      accessToken: value.access_token,
      refreshToken: value.refresh_token,
      expiresIn: value.expires_in,
      identity: {
        provider: providerFromUser(value.user, fallbackProvider),
        subject: value.user.id,
      },
    };
  }

  exchange(
    provider: 'apple' | 'google',
    assertion: string,
  ): Promise<ProviderSession> {
    return this.#session(
      '/token?grant_type=id_token',
      { provider, id_token: assertion },
      provider,
    );
  }

  async requestMagicLink(email: string): Promise<void> {
    await this.#request('/otp', {
      method: 'POST',
      body: JSON.stringify({ email, create_user: true }),
    });
  }

  verifyMagicLink(
    verification: MagicLinkVerification,
  ): Promise<ProviderSession> {
    const body =
      'tokenHash' in verification
        ? { type: 'email', token_hash: verification.tokenHash }
        : {
            type: 'email',
            email: verification.email,
            token: verification.token,
          };
    return this.#session('/verify', body, 'email');
  }

  refresh(refreshToken: string): Promise<ProviderSession> {
    return this.#session('/token?grant_type=refresh_token', {
      refresh_token: refreshToken,
    });
  }

  async verifyAccessToken(accessToken: string): Promise<VerifiedIdentity> {
    const response = await this.#request('/user', {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const user = (await response.json()) as SupabaseUser;
    const claims = decodeClaims(accessToken);
    const expectedIssuer = this.#authUrl;
    const audienceValid =
      claims.aud === 'authenticated' ||
      (Array.isArray(claims.aud) && claims.aud.includes('authenticated'));
    if (
      typeof user.id !== 'string' ||
      claims.sub !== user.id ||
      claims.iss !== expectedIssuer ||
      !audienceValid ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Math.floor(Date.now() / 1000)
    )
      throw new AuthenticationError();
    return { provider: providerFromUser(user), subject: user.id };
  }

  async logout(accessToken: string): Promise<void> {
    await this.#request('/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }
}
