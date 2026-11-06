import { migrate } from './migrations';
import type { AesPort, FilePort, SecretStore, SqlDb, StoragePaths, WriteQueue } from './ports';
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

export type Runtime = StoragePorts & { vault: Vault; serial: WriteQueue };

/**
 * The one way to write to the database. Everything shares a single connection, and a transaction on
 * it is only BEGIN, the task, then COMMIT: a statement from anywhere else that arrives in between
 * joins the transaction. If that rolls back, the write disappears after reporting that it saved,
 * which for onboarding can be the lock being turned on.
 *
 * Why not withExclusiveTransactionAsync: it opens a second connection with none of the PRAGMAs in
 * nativePorts.ts. secure_delete is off there, so ciphertext deleted in a transaction would stay in
 * echo.db. synchronous cannot be set once its BEGIN has run. And writers on this connection would
 * fail with "database is locked" instead of waiting.
 */
function createWriteQueue(): WriteQueue {
  let queue: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };
}

export async function createRuntime(ports: StoragePorts): Promise<Runtime> {
  await migrate(ports.db);
  const serial = createWriteQueue();
  return { ...ports, serial, vault: createVault({ ...ports, serial }) };
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
