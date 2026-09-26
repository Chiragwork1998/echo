import { z } from 'zod';

const EnvironmentSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  SUPABASE_URL: z.string().url().startsWith('https://'),
  SUPABASE_AUTH_API_KEY: z.string().min(20),
  OPENAI_API_KEY: z.string().min(20),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export function readEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Environment {
  return EnvironmentSchema.parse(environment);
}

export const publicConfiguration = {
  minimumSupportedClientVersion: '0.0.0',
  policyVersions: {
    privacy: 'pending',
    terms: 'pending',
  },
  reflectionAvailable: false,
  featureFlags: {
    backup: false,
    reflection: false,
  },
} as const;

export const REFRESH_SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
export const TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;
export const TRANSCRIPTION_TIMEOUT_MS = 60_000;
export const TRANSCRIPTION_RATE_LIMIT_PER_HOUR = 10;
