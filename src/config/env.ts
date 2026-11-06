import { z } from 'zod';

const schema = z.object({
  EXPO_PUBLIC_API_URL: z.url().optional(),
  // Plain strings on purpose: a mistyped value must leave voice unavailable, never stop the app from
  // opening. services/transcription.ts checks the address and refuses anything unsafe.
  EXPO_PUBLIC_VOICE_URL: z.string().optional(),
  EXPO_PUBLIC_VOICE_TOKEN: z.string().optional(),
});

// Expo only inlines direct process.env.EXPO_PUBLIC_* reads, so each key is listed explicitly.
export const env = schema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || undefined,
  EXPO_PUBLIC_VOICE_URL: process.env.EXPO_PUBLIC_VOICE_URL?.trim() || undefined,
  EXPO_PUBLIC_VOICE_TOKEN: process.env.EXPO_PUBLIC_VOICE_TOKEN?.trim() || undefined,
});
