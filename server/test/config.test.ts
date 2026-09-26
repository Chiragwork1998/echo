import { describe, expect, it } from 'vitest';

import { readEnvironment } from '../src/config.js';

describe('environment configuration', () => {
  it('parses a complete valid environment', () => {
    expect(
      readEnvironment({
        DATABASE_URL: 'postgresql://echo:secret@localhost:5432/echo',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_AUTH_API_KEY: 'test-key-that-is-long-enough',
        OPENAI_API_KEY: 'test-openai-key-that-is-long-enough',
        HOST: '0.0.0.0',
        PORT: '8080',
        LOG_LEVEL: 'warn',
      }),
    ).toEqual({
      DATABASE_URL: 'postgresql://echo:secret@localhost:5432/echo',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_AUTH_API_KEY: 'test-key-that-is-long-enough',
      OPENAI_API_KEY: 'test-openai-key-that-is-long-enough',
      HOST: '0.0.0.0',
      PORT: 8080,
      LOG_LEVEL: 'warn',
    });
  });

  it('rejects a missing database URL', () => {
    expect(() => readEnvironment({})).toThrow();
  });
});
