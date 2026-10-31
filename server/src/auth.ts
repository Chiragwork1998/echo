export type AuthProviderName = 'apple' | 'google' | 'email';

export interface VerifiedIdentity {
  provider: AuthProviderName;
  subject: string;
}

export interface ProviderSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  identity: VerifiedIdentity;
}

export type MagicLinkVerification =
  | { email: string; token: string }
  | { tokenHash: string };

export interface AuthProvider {
  exchange(
    provider: Exclude<AuthProviderName, 'email'>,
    assertion: string,
  ): Promise<ProviderSession>;
  requestMagicLink(email: string): Promise<void>;
  verifyMagicLink(
    verification: MagicLinkVerification,
  ): Promise<ProviderSession>;
  refresh(refreshToken: string): Promise<ProviderSession>;
  verifyAccessToken(accessToken: string): Promise<VerifiedIdentity>;
  logout(accessToken: string): Promise<void>;
}

export class AuthenticationError extends Error {
  constructor() {
    super('Authentication failed');
    this.name = 'AuthenticationError';
  }
}

export const unavailableAuthProvider: AuthProvider = {
  exchange: () => Promise.reject(new AuthenticationError()),
  requestMagicLink: () => Promise.reject(new AuthenticationError()),
  verifyMagicLink: () => Promise.reject(new AuthenticationError()),
  refresh: () => Promise.reject(new AuthenticationError()),
  verifyAccessToken: () => Promise.reject(new AuthenticationError()),
  logout: () => Promise.reject(new AuthenticationError()),
};
