import { installRuntime } from '@/storage/runtime';
import { createTestRuntime, everyStoredByte, type TestRuntime } from '@/storage/testing/nodePorts';

import {
  NAMED_OPENS_NOTICED,
  countNamedOpen,
  loadBookOwner,
  markAsked,
  removeName,
  resetBookOwner,
  useBookOwner,
  writeName,
} from './owner';
import { loadOwner } from './ownerStore';

// An invented name.
const NAME = 'Tamsin Vale';

let rt: TestRuntime;
beforeEach(async () => {
  resetBookOwner();
  rt = await createTestRuntime();
  installRuntime(rt);
});
afterEach(() => {
  installRuntime(null);
  resetBookOwner();
});

describe('whose book this is', () => {
  it('is read once, lazily, and starts as nobody, not yet asked', async () => {
    expect(useBookOwner.getState().loaded).toBe(false);
    await loadBookOwner();
    expect(useBookOwner.getState()).toEqual({
      loaded: true,
      name: null,
      asked: false,
      namedOpens: 0,
    });
  });

  it('never asks when its record cannot be read', async () => {
    installRuntime(null);
    await loadBookOwner();
    expect(useBookOwner.getState()).toMatchObject({ loaded: true, asked: true, name: null });
  });

  it('is asked once: the question appearing is enough, and it is kept', async () => {
    await markAsked();
    expect(useBookOwner.getState().asked).toBe(true);
    expect(await loadOwner()).toMatchObject({ ok: true, value: { asked: true, name: null } });
  });

  it('writes a name cleaned and sealed, and counts its openings from none', async () => {
    expect(await writeName(`  ${NAME}  `)).toBe(true);
    expect(useBookOwner.getState()).toMatchObject({ name: NAME, asked: true, namedOpens: 0 });
    expect(await loadOwner()).toMatchObject({ ok: true, value: { name: NAME } });
    expect(everyStoredByte(rt.root).includes(NAME)).toBe(false);
  });

  it('writes nothing when nothing was written', async () => {
    expect(await writeName('   ')).toBe(false);
    expect(useBookOwner.getState().name).toBeNull();
  });

  it('counts the first few openings of the named book, and then stops counting', async () => {
    await writeName(NAME);
    for (let i = 0; i < NAMED_OPENS_NOTICED + 2; i++) await countNamedOpen();
    expect(useBookOwner.getState().namedOpens).toBe(NAMED_OPENS_NOTICED);
    expect(await loadOwner()).toMatchObject({ ok: true, value: { namedOpens: 3 } });
  });

  it('does not count openings of a book with no name', async () => {
    await countNamedOpen();
    expect(useBookOwner.getState().namedOpens).toBe(0);
  });

  it('takes a name off, and does not ask again', async () => {
    await writeName(NAME);
    await removeName();
    expect(useBookOwner.getState()).toMatchObject({ name: null, asked: true });
    expect(await loadOwner()).toMatchObject({ ok: true, value: { name: null, asked: true } });
  });

  it('forgets everything it held when everything is deleted', async () => {
    await writeName(NAME);
    await rt.vault.destroyKey();
    resetBookOwner();
    expect(useBookOwner.getState()).toEqual({
      loaded: false,
      name: null,
      asked: false,
      namedOpens: 0,
    });
    await loadBookOwner();
    expect(useBookOwner.getState().name).toBeNull();
  });
});
