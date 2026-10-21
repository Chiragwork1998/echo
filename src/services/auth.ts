/**
 * Authentication boundary. Sign-in is deferred until private backup is enabled
 * or the user asks for it from You; local-only use never depends on it.
 *
 * Identity comes from Supabase Auth (docs/API_CONTRACT.md): Google through the
 * system browser with PKCE, and email through a six-digit one-time code. A new
 * account is created on first sign-in, so sign-up and sign-in are one flow.
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

export type AuthProvider = 'google' | 'email';

export type AuthResult =
  | { status: 'authenticated'; userId: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'failed' };

export type EmailCodeRequest = 'sent' | 'rate_limited' | 'unavailable' | 'failed';

export const AUTH_PROVIDERS: readonly { id: AuthProvider; label: string }[] = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'email', label: 'Continue with email' },
];

export const EMAIL_CODE_LENGTH = 6;

/** Return path for the Google browser session; see app/+native-intent.tsx. */
export const AUTH_CALLBACK_PATH = 'auth/callback';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 320 && EMAIL_PATTERN.test(email);
}

function firstParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.length > 0 ? first : null;
}

export interface AuthPort {
  signInWithGoogle(): Promise<AuthResult>;
  requestEmailCode(email: string): Promise<EmailCodeRequest>;
  verifyEmailCode(email: string, code: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}

export const authService: AuthPort = {
  async signInWithGoogle() {
    if (!supabase) {
      return { status: 'unavailable' };
    }
    try {
      const redirectTo = Linking.createURL(AUTH_CALLBACK_PATH);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        return { status: 'failed' };
      }
      const browser = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (browser.type !== 'success') {
        return { status: 'cancelled' };
      }
      const { queryParams } = Linking.parse(browser.url);
      if (firstParam(queryParams?.error) === 'access_denied') {
        return { status: 'cancelled' };
      }
      const code = firstParam(queryParams?.code);
      if (!code) {
        return { status: 'failed' };
      }
      const exchanged = await supabase.auth.exchangeCodeForSession(code);
      if (exchanged.error) {
        return { status: 'failed' };
      }
      return { status: 'authenticated', userId: exchanged.data.user.id };
    } catch {
      return { status: 'failed' };
    }
  },

  async requestEmailCode(email) {
    if (!supabase) {
      return 'unavailable';
    }
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (!error) {
        return 'sent';
      }
      return error.status === 429 ? 'rate_limited' : 'failed';
    } catch {
      return 'failed';
    }
  },

  async verifyEmailCode(email, code) {
    if (!supabase) {
      return { status: 'unavailable' };
    }
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error || !data.user) {
        return { status: 'failed' };
      }
      return { status: 'authenticated', userId: data.user.id };
    } catch {
      return { status: 'failed' };
    }
  },

  async signOut() {
    await supabase?.auth.signOut();
  },
};

/**
 * Access-token boundary.
 *
 * Authenticated requests carry the Supabase access token, refreshed by the
 * client as needed. The session is held in SecureStore and is never written to
 * logs or the bundled environment.
 */
export type AccessTokenProvider = () => Promise<string | null>;

async function supabaseAccessToken(): Promise<string | null> {
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

let accessTokenProvider: AccessTokenProvider = supabaseAccessToken;

export function setAccessTokenProvider(provider: AccessTokenProvider): void {
  accessTokenProvider = provider;
}

export function getAccessToken(): Promise<string | null> {
  return accessTokenProvider();
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getAccessToken()) !== null;
}
