import { installRuntime, type Runtime } from '@/storage/runtime';

import { forgetInstallIdInMemory, getInstallId, INSTALL_ID_NAME } from './install';

function fakeRuntime(store: Map<string, string>, ids: string[], failFirstRead = false): Runtime {
  let next = 0;
  let reads = 0;
  return {
    secrets: {
      get: async (name: string) => {
        reads += 1;
        if (failFirstRead && reads === 1) throw new Error('store unavailable');
        return store.get(name) ?? null;
      },
      set: async (name: string, value: string) => void store.set(name, value),
      remove: async (name: string) => void store.delete(name),
    },
    newId: () => ids[next++] ?? 'unexpected',
  } as unknown as Runtime;
}

describe('getInstallId', () => {
  afterEach(() => {
    forgetInstallIdInMemory();
    installRuntime(null);
  });

  it('makes one id the first time and keeps it in the secure store', async () => {
    const store = new Map<string, string>();
    installRuntime(fakeRuntime(store, ['made-once', 'made-twice']));
    await expect(getInstallId()).resolves.toBe('made-once');
    await expect(getInstallId()).resolves.toBe('made-once');
    expect(store.get(INSTALL_ID_NAME)).toBe('made-once');
  });

  it('reads the id a previous launch kept, and makes no new one', async () => {
    const store = new Map([[INSTALL_ID_NAME, 'kept-before']]);
    installRuntime(fakeRuntime(store, ['should-not-be-used']));
    await expect(getInstallId()).resolves.toBe('kept-before');
  });

  it('does not keep a failure, so the next call can succeed', async () => {
    const store = new Map([[INSTALL_ID_NAME, 'kept-before']]);
    installRuntime(fakeRuntime(store, [], true));
    await expect(getInstallId()).rejects.toThrow('store unavailable');
    await expect(getInstallId()).resolves.toBe('kept-before');
  });
});
