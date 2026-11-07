import { z } from 'zod';

const schema = z.object({
  EXPO_PUBLIC_API_URL: z.url().optional(),
  // Plain strings on purpose: a mistyped value must leave voice unavailable, never stop the app from
  // opening. services/transcription.ts checks the address and refuses anything unsafe.
  EXPO_PUBLIC_VOICE_URL: z.string().optional(),
  EXPO_PUBLIC_VOICE_TOKEN: z.string().optional(),
  // RevenueCat's public SDK keys. Plain strings for the same reason: without a usable key ECHO Plus
  // is simply unavailable and every Plus feature stays open (services/plus/keys.ts). The test key is
  // RevenueCat's Test Store, for development builds only; a release build refuses it.
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: z.string().optional(),
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: z.string().optional(),
  EXPO_PUBLIC_REVENUECAT_TEST_KEY: z.string().optional(),
});

// Expo only inlines direct process.env.EXPO_PUBLIC_* reads, so each key is listed explicitly.
export const env = schema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || undefined,
  EXPO_PUBLIC_VOICE_URL: process.env.EXPO_PUBLIC_VOICE_URL?.trim() || undefined,
  EXPO_PUBLIC_VOICE_TOKEN: process.env.EXPO_PUBLIC_VOICE_TOKEN?.trim() || undefined,
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY:
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.trim() || undefined,
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim() || undefined,
  EXPO_PUBLIC_REVENUECAT_TEST_KEY: process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY?.trim() || undefined,
});
