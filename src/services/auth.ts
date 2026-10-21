/**
 * Authentication boundary. Sign-in is deferred until private backup is enabled
 * or the user asks for it from You; local-only use never depends on it.
 */

export type AuthProvider = 'apple' | 'google' | 'email_magic_link';

export type AuthResult =
  | { status: 'authenticated'; userId: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' };

export const AUTH_PROVIDERS: readonly { id: AuthProvider; label: string }[] = [
  { id: 'apple', label: 'Continue with Apple' },
  { id: 'google', label: 'Continue with Google' },
  { id: 'email_magic_link', label: 'Email me a sign-in link' },
];

export interface AuthPort {
  signIn(provider: AuthProvider): Promise<AuthResult>;
}

/** Placeholder until provider configuration is approved (docs/DECISIONS_REQUIRED.md). */
export const authService: AuthPort = {
  async signIn() {
    return { status: 'unavailable' };
  },
};

/**
 * Access-token boundary.
 *
 * Provider sign-in is still gated on owner decisions, so no token is issued in
 * this build and authenticated requests report `unauthenticated` instead of
 * pretending to succeed. Tokens are held in memory only and are never written
 * to logs, storage or the bundled environment.
 */
export type AccessTokenProvider = () => Promise<string | null>;

let accessTokenProvider: AccessTokenProvider = async () => null;

export function setAccessTokenProvider(provider: AccessTokenProvider): void {
  accessTokenProvider = provider;
}

export function getAccessToken(): Promise<string | null> {
  return accessTokenProvider();
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getAccessToken()) !== null;
}
