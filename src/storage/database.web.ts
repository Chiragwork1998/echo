import { SCHEMA_VERSION } from './migrations';

/**
 * Web preview build: no Keychain, therefore no encrypted local store.
 *
 * The native implementation lives in `src/storage/database.ts` and is selected
 * by platform resolution, which also keeps expo-sqlite's wasm worker out of the
 * web bundle. Repositories see this variant on web and fall back to session
 * memory instead of pretending to persist.
 */

export const DATABASE_NAME = 'echo.db';
export { SCHEMA_VERSION };

export class StorageUnavailableError extends Error {
  readonly reason?: unknown;

  constructor(cause?: unknown) {
    super('Encrypted local storage is unavailable on this platform.');
    this.name = 'StorageUnavailableError';
    this.reason = cause;
  }
}

export class SchemaTooNewError extends Error {
  readonly found: number;
  readonly supported: number;

  constructor(found: number) {
    super(`Local database schema ${found} is newer than this app build (${SCHEMA_VERSION}).`);
    this.name = 'SchemaTooNewError';
    this.found = found;
    this.supported = SCHEMA_VERSION;
  }
}

export function isDatabaseSupported(): boolean {
  return false;
}

export function getDatabase(): Promise<never> {
  return Promise.reject(new StorageUnavailableError('unsupported platform'));
}

export async function closeDatabase(): Promise<void> {
  // Nothing is open on this platform.
}
