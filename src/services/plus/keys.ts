import { env } from '@/config/env';

export type RevenueCatKeys = { android?: string; ios?: string; test?: string };

/**
 * Why ECHO Plus cannot be sold in this build. Every Plus feature then stays open. 'rejected_key' is
 * learned at run time: RevenueCat refused the key, or the project behind it cannot be used.
 */
export type BillingOff = 'no_key' | 'test_key_in_release' | 'unsupported_platform' | 'rejected_key';

export type KeyChoice =
  { key: string; testStore: boolean; off?: undefined } | { key: null; off: BillingOff };

/**
 * RevenueCat's Test Store keys start with test_. The SDK stops a release build configured with one,
 * on purpose, so that it cannot reach the store: an alert, then a crash, on every launch
 * (https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store). ECHO never hands one to a
 * release build, whichever variable it arrived in.
 */
export const isTestKey = (key: string): boolean => key.startsWith('test_');

/**
 * The key ECHO configures RevenueCat with, or why there is none.
 *
 * - Development builds prefer the Test Store key when one is set, so purchases can be tried without
 *   Google Play, and fall back to the platform key.
 * - Release builds use the platform key only, and refuse a test key.
 * - No usable key means no billing. That is a build without ECHO Plus, and it must never lock anyone
 *   out of anything, so every Plus feature stays open (services/plus/store.ts).
 */
export function chooseKey(input: {
  platform: string;
  /** __DEV__: a development build. Every store build, internal testing included, is a release build. */
  dev: boolean;
  keys: RevenueCatKeys;
}): KeyChoice {
  const { platform, dev, keys } = input;
  if (platform !== 'android' && platform !== 'ios')
    return { key: null, off: 'unsupported_platform' };
  if (dev && keys.test) return { key: keys.test, testStore: true };
  const own = platform === 'android' ? keys.android : keys.ios;
  if (own && isTestKey(own) && !dev) return { key: null, off: 'test_key_in_release' };
  if (own) return { key: own, testStore: isTestKey(own) };
  return { key: null, off: keys.test ? 'test_key_in_release' : 'no_key' };
}

/** The keys this build was made with. Public SDK keys: they ship inside the app by design. */
export function buildKeys(): RevenueCatKeys {
  return {
    android: env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
    ios: env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    test: env.EXPO_PUBLIC_REVENUECAT_TEST_KEY,
  };
}
