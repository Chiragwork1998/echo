import 'dotenv/config';

import { buildApp } from './application.js';
import { readEnvironment } from './config.js';
import { createPostgresDependency } from './database.js';
import { createLoggerOptions } from './logger.js';
import { SupabaseAuthProvider } from './supabase-auth.js';

const environment = readEnvironment();
const database = createPostgresDependency(environment.DATABASE_URL);
const authProvider = new SupabaseAuthProvider(
  environment.SUPABASE_URL,
  environment.SUPABASE_AUTH_API_KEY,
);
const app = await buildApp({
  database,
  authProvider,
  authStore: database,
  logger: createLoggerOptions(environment.LOG_LEVEL),
});

async function shutdown(signal: string): Promise<void> {
  app.log.info({ event: 'service.stopping', signal });
  await app.close();
  process.exitCode = 0;
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  await app.listen(
    process.env['VERCEL'] === '1'
      ? { port: environment.PORT }
      : { host: environment.HOST, port: environment.PORT },
  );
} catch {
  app.log.fatal({ event: 'service.start_failed' });
  await app.close();
  process.exitCode = 1;
}
