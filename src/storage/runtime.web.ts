// Web is a preview for the visual harness. SQLite and SecureStore do not exist there, and journal
// content must never persist in a browser, so there is deliberately no storage on this platform.
import type { Runtime } from './runtime';

export type { Runtime, StoragePorts } from './runtime';

export function getRuntime(): Promise<Runtime> {
  return Promise.reject(new Error('storage is unavailable on web'));
}

export function installRuntime(): void {}
