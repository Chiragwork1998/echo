/**
 * Supabase Auth client. Only the public project URL and publishable key are
 * bundled; the session lives in SecureStore and never reaches logs.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

type DigestInput = Parameters<typeof Crypto.digest>[1];

type WebCryptoShim = {
  getRandomValues?: <T extends Parameters<typeof Crypto.getRandomValues>[0]>(array: T) => T;
  subtle?: { digest?: (algorithm: string, data: DigestInput) => Promise<ArrayBuffer> };
};

/** PKCE needs Web Crypto, which Hermes lacks; back it with expo-crypto. */
function installWebCrypto(): void {
  const scope = globalThis as unknown as { crypto?: WebCryptoShim };
  try {
    scope.crypto ??= {};
    const webCrypto = scope.crypto;
    if (typeof webCrypto.getRandomValues !== 'function') {
      webCrypto.getRandomValues = (array) => Crypto.getRandomValues(array);
    }
    if (typeof webCrypto.subtle?.digest !== 'function') {
      webCrypto.subtle = {
        ...webCrypto.subtle,
        digest: async (algorithm, data) => {
          if (algorithm !== 'SHA-256') {
            throw new Error('Unsupported digest algorithm');
          }
          return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data);
        },
      };
    }
  } catch {
    // auth-js falls back to a plain PKCE challenge when Web Crypto is missing.
  }
}

const CHUNK_SIZE = 1800;

/**
 * SecureStore adapter that splits values into chunks, because some platforms
 * reject single entries above roughly 2 KB and a session can exceed that.
 */
const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!Number.isInteger(count) || count < 1) {
      return null;
    }
    const parts: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${index}`);
      if (part === null) {
        return null;
      }
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const previous = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    for (let index = 0; index < count; index += 1) {
      await SecureStore.setItemAsync(
        `${key}.${index}`,
        value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
      );
    }
    await SecureStore.setItemAsync(`${key}.n`, String(count));
    for (let index = count; index < previous; index += 1) {
      await SecureStore.deleteItemAsync(`${key}.${index}`);
    }
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    await SecureStore.deleteItemAsync(`${key}.n`);
    for (let index = 0; index < count; index += 1) {
      await SecureStore.deleteItemAsync(`${key}.${index}`);
    }
  },
};

function createSupabaseClient(): SupabaseClient | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    return null;
  }
  installWebCrypto();
  return createClient(url, publishableKey, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

/** `null` when this build has no Supabase configuration; the app stays local-only. */
export const supabase = createSupabaseClient();

if (supabase && Platform.OS !== 'web') {
  // Refresh tokens only while the app is in the foreground.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
