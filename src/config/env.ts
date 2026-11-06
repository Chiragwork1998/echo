import { z } from 'zod';

const schema = z.object({
  EXPO_PUBLIC_API_URL: z.url().optional(),
});

// Expo only inlines direct process.env.EXPO_PUBLIC_* reads, so each key is listed explicitly.
export const env = schema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || undefined,
});
