import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createVault, VaultNotReadyError } from './vault';
import { createTestRuntime, memorySecrets, nodeAes, nodeFiles } from './testing/nodePorts';
import type { Runtime } from './runtime';

const vaultFor = (runtime: Runtime) => createVault(runtime);

async function sealSomething(runtime: Runtime) {
  await runtime.vault.prepare();
  const sealed = await runtime.vault.sealJson('entry', 'id', { body: 'kept' });
  await runtime.db.run(
    `INSERT INTO entries (id, status, sealed, created_at, updated_at) VALUES (?, 'draft', ?, 1, 1)`,
    ['id', sealed],
  );
}

describe('first run', () => {
  it('generates one key and reuses it from then on', async () => {
    const runtime = await createTestRuntime();
    const key = [...runtime.secrets.items.values()][0];
    expect(key).toBeDefined();
    expect(Buffer.from(key ?? '', 'base64')).toHaveLength(32);

    const again = await runtime.reopen();
    expect(await again.vault.prepare()).toEqual({ state: 'ready' });
    expect([...again.secrets.items.values()][0]).toBe(key);
    expect(again.secrets.writes).toBe(1);
  });

  it('will not use a key it cannot read back', async () => {
    const secrets = memorySecrets();
    const setter = secrets.set;
    secrets.set = async (name) => setter(name, 'something-else');
    await expect(createTestRuntime({ secrets })).rejects.toThrow('vault unavailable');
  });
});

describe('key-loss guard', () => {
  it('reports key_missing and creates nothing when entries exist', async () => {
    const runtime = await createTestRuntime();
    await sealSomething(runtime);
    runtime.secrets.items.clear();
    const writes = runtime.secrets.writes;

    expect(await vaultFor(runtime).prepare()).toEqual({ state: 'key_missing' });
    expect(runtime.secrets.items.size).toBe(0);
    expect(runtime.secrets.writes).toBe(writes);
  });

  it('counts the canary alone as data', async () => {
    const runtime = await createTestRuntime();
    runtime.secrets.items.clear();
    expect(await vaultFor(runtime).prepare()).toEqual({ state: 'key_missing' });
  });

  it('notices audio files even if the database has been lost', async () => {
    const runtime = await createTestRuntime();
    await runtime.db.exec('DELETE FROM sealed_kv');
    runtime.secrets.items.clear();
    mkdirSync(runtime.paths.audioDir, { recursive: true });
    writeFileSync(join(runtime.paths.audioDir, 'orphan.enc'), 'ciphertext');

    expect(await vaultFor(runtime).prepare()).toEqual({ state: 'key_missing' });
    expect(runtime.secrets.items.size).toBe(0);
  });

  it('never treats a failed read as a missing key', async () => {
    const runtime = await createTestRuntime();
    await sealSomething(runtime);
    const key = [...runtime.secrets.items.values()][0];
    runtime.secrets.failReads = true;
    const writes = runtime.secrets.writes;

    expect(await vaultFor(runtime).prepare()).toEqual({
      state: 'unavailable',
      reason: 'secure_store',
    });
    expect(runtime.secrets.writes).toBe(writes);
    expect([...runtime.secrets.items.values()][0]).toBe(key);
  });

  it('recovers when the same key returns', async () => {
    const runtime = await createTestRuntime();
    await sealSomething(runtime);
    const saved = new Map(runtime.secrets.items);
    runtime.secrets.items.clear();
    const vault = vaultFor(runtime);
    expect(await vault.prepare()).toEqual({ state: 'key_missing' });

    for (const [name, value] of saved) runtime.secrets.items.set(name, value);
    expect(await vault.prepare()).toEqual({ state: 'ready' });
    const row = await runtime.db.first<{ sealed: Uint8Array }>('SELECT sealed FROM entries');
    expect(await vault.openJson('entry', 'id', row?.sealed ?? new Uint8Array())).toEqual({
      body: 'kept',
    });
  });

  it('reports key_mismatch for a different key and leaves that key alone', async () => {
    const runtime = await createTestRuntime();
    await sealSomething(runtime);
    const name = [...runtime.secrets.items.keys()][0] ?? '';
    const wrong = await nodeAes.generateKey();
    runtime.secrets.items.set(name, wrong);

    expect(await vaultFor(runtime).prepare()).toEqual({ state: 'key_mismatch' });
    expect(runtime.secrets.items.get(name)).toBe(wrong);
  });

  it('treats a malformed key as a mismatch when data exists', async () => {
    const runtime = await createTestRuntime();
    await sealSomething(runtime);
    const name = [...runtime.secrets.items.keys()][0] ?? '';
    runtime.secrets.items.set(name, 'not-a-key');
    expect(await vaultFor(runtime).prepare()).toEqual({ state: 'key_mismatch' });
  });

  it('refuses to seal or open anything until a key is confirmed', async () => {
    const runtime = await createTestRuntime();
    const vault = vaultFor(runtime);
    await expect(vault.sealJson('entry', 'id', {})).rejects.toBeInstanceOf(VaultNotReadyError);
    runtime.secrets.items.clear();
    await vault.prepare();
    await expect(vault.sealJson('entry', 'id', {})).rejects.toBeInstanceOf(VaultNotReadyError);
  });

  it('does not create a key if the database cannot say whether data exists', async () => {
    const runtime = await createTestRuntime();
    runtime.secrets.items.clear();
    const vault = createVault({
      ...runtime,
      db: { ...runtime.db, first: () => Promise.reject(new Error('database is locked')) },
    });
    expect(await vault.prepare()).toEqual({ state: 'unavailable', reason: 'database' });
    expect(runtime.secrets.items.size).toBe(0);
  });
});

describe('reinstall on iOS, where the Keychain outlives the app', () => {
  it('adopts the surviving key when the database is new', async () => {
    const secrets = memorySecrets();
    await createTestRuntime({ secrets });
    const key = [...secrets.items.values()][0];

    const fresh = await createTestRuntime({ secrets, files: nodeFiles });
    expect([...fresh.secrets.items.values()][0]).toBe(key);
  });
});

describe('destroying the key', () => {
  it('lets a fresh start create a new one only when no data remains', async () => {
    const runtime = await createTestRuntime();
    const before = [...runtime.secrets.items.values()][0];
    await runtime.db.exec('DELETE FROM sealed_kv');
    await runtime.vault.destroyKey();

    expect(await runtime.vault.prepare()).toEqual({ state: 'ready' });
    expect([...runtime.secrets.items.values()][0]).not.toBe(before);
  });
});
