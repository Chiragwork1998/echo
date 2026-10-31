import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

import { buildApp } from '../src/application.js';
import { readEnvironment, TRANSCRIPTION_TIMEOUT_MS } from '../src/config.js';
import { createPostgresDependency } from '../src/database.js';
import { createLoggerOptions } from '../src/logger.js';
import { companionProviderFor } from '../src/companion.js';
import { SupabaseAuthProvider } from '../src/supabase-auth.js';
import { SarvamTranscriptionProvider } from '../src/transcription.js';

async function initializeApp() {
  const environment = readEnvironment();
  const connectionUrl = new URL(environment.DATABASE_URL);
  if (connectionUrl.hostname.endsWith('.pooler.supabase.com')) {
    connectionUrl.searchParams.set('sslmode', 'verify-full');
    connectionUrl.searchParams.delete('uselibpqcompat');
    connectionUrl.searchParams.set(
      'sslrootcert',
      fileURLToPath(
        new URL('../certificates/supabase-prod-ca.crt', import.meta.url),
      ),
    );
  }
  const database = createPostgresDependency(connectionUrl.toString());
  const app = await buildApp({
    database,
    authStore: database,
    authProvider: new SupabaseAuthProvider(
      environment.SUPABASE_URL,
      environment.SUPABASE_AUTH_API_KEY,
    ),
    transcriptionProvider: new SarvamTranscriptionProvider(
      environment.SARVAM_VOICE_API,
      TRANSCRIPTION_TIMEOUT_MS,
    ),
    logger: createLoggerOptions(environment.LOG_LEVEL),
    companionProvider: companionProviderFor(environment),
    companionLocalGuest: false,
    companionAllowedOrigins:
      environment.ECHO_COMPANION_ORIGINS?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [],
  });
  await app.ready();
  return app;
}

// Reuse the app and connection pool across invocations in a warm instance.
// Unlike src/server.ts, this entrypoint never opens a listening socket.
let application: ReturnType<typeof initializeApp> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  application ??= initializeApp().catch((error: unknown) => {
    application = undefined;
    throw error;
  });
  const app = await application;
  app.server.emit('request', request, response);
}
