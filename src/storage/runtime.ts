import { migrate } from './migrations';
import type { AesPort, FilePort, SecretStore, SqlDb, StoragePaths } from './ports';
import { createVault, type Vault } from './vault';

export type StoragePorts = {
  aes: AesPort;
  secrets: SecretStore;
  db: SqlDb;
  files: FilePort;
  paths: StoragePaths;
  newId: () => string;
  now: () => number;
};

export type Runtime = StoragePorts & { vault: Vault };

export async function createRuntime(ports: StoragePorts): Promise<Runtime> {
  await migrate(ports.db);
  return { ...ports, vault: createVault(ports) };
}

let active: Promise<Runtime> | null = null;

async function openNative(): Promise<Runtime> {
  // Required here rather than imported at the top, so that importing state or hooks stays free of
  // native modules. That keeps Jest and the web harness working.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const native = require('./nativePorts') as typeof import('./nativePorts');
  return createRuntime({
    aes: native.expoAes,
    secrets: native.expoSecrets,
    db: await native.openNativeDatabase(),
    files: native.expoFiles,
    paths: native.nativePaths(),
    newId: native.newNativeId,
    now: () => Date.now(),
  });
}

/** Opens and migrates the database once. A failure is not cached, so a retry can succeed. */
export function getRuntime(): Promise<Runtime> {
  active ??= openNative().catch((error: unknown) => {
    active = null;
    throw error;
  });
  return active;
}

export function installRuntime(runtime: Runtime | null): void {
  active = runtime ? Promise.resolve(runtime) : null;
}
