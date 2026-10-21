import { AUTH_CALLBACK_PATH } from '@/services/auth';

/**
 * The Google sign-in return link is consumed by WebBrowser.openAuthSessionAsync,
 * so Expo Router must not navigate to it while the app is open.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (path.includes(AUTH_CALLBACK_PATH)) {
    return initial ? '/' : null;
  }
  return path;
}
