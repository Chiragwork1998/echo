import { installRuntime } from '@/storage/runtime';
import { createTestRuntime, everyStoredByte, type TestRuntime } from '@/storage/testing/nodePorts';

import { loadOwner, saveOwner, type OwnerRecord } from './ownerStore';

// An invented name, which the database must never show as text.
const NAME = 'Mirabel Quince';
const named: OwnerRecord = { v: 1, name: NAME, asked: true, namedOpens: 2 };

let rt: TestRuntime;
beforeEach(async () => {
  rt = await createTestRuntime();
  installRuntime(rt);
});
afterEach(() => installRuntime(null));

describe('ownerStore', () => {
  it('knows nothing until something is saved: no name, and not yet asked', async () => {
    expect(await loadOwner()).toEqual({
      ok: true,
      value: { v: 1, name: null, asked: false, namedOpens: 0 },
    });
  });

  it('keeps the name sealed on the phone, never as readable text', async () => {
    expect(await saveOwner(named)).toEqual({ ok: true, value: null });
    expect(await loadOwner()).toEqual({ ok: true, value: named });
    const stored = everyStoredByte(rt.root);
    expect(stored.includes(NAME)).toBe(false);
    expect(stored.includes('Mirabel')).toBe(false);
    expect(stored.includes('namedOpens')).toBe(false);
  });

  it('survives the app being closed and opened again', async () => {
    await saveOwner(named);
    const again = await rt.reopen();
    installRuntime(again);
    expect(await loadOwner()).toEqual({ ok: true, value: named });
  });

  it('replaces what it kept, so a name can be changed or taken off', async () => {
    await saveOwner(named);
    await saveOwner({ ...named, name: null });
    expect(await loadOwner()).toEqual({ ok: true, value: { ...named, name: null } });
  });

  it('goes with the key when everything on the phone is deleted', async () => {
    await saveOwner(named);
    await rt.vault.destroyKey();
    const row = await rt.db.first('SELECT key FROM sealed_kv WHERE key = ?', ['book']);
    expect(row).toBeNull();
  });

  it('reads a damaged record as nothing kept, and says so rather than throwing', async () => {
    await rt.db.run('INSERT INTO sealed_kv (key, sealed, updated_at) VALUES (?, ?, ?)', [
      'book',
      new Uint8Array([1, 2, 3]),
      1,
    ]);
    expect(await loadOwner()).toEqual({ ok: false });
  });

  it('keeps only what it should: a name that was tampered into the record is cleaned', async () => {
    const sealed = await rt.vault.sealJson('book', 'v1', {
      v: 1,
      name: `  ${'z'.repeat(40)}\u0000 `,
      asked: 'yes',
      namedOpens: -4,
    });
    await rt.db.run('INSERT INTO sealed_kv (key, sealed, updated_at) VALUES (?, ?, ?)', [
      'book',
      sealed,
      1,
    ]);
    expect(await loadOwner()).toEqual({
      ok: true,
      value: { v: 1, name: 'z'.repeat(24), asked: true, namedOpens: 0 },
    });
  });

  it('says it could not, rather than throwing, when storage is not open', async () => {
    installRuntime(null);
    expect(await loadOwner()).toEqual({ ok: false });
    expect(await saveOwner(named)).toEqual({ ok: false });
  });
});
