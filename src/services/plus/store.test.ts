import { createTestRuntime, type TestRuntime } from '@/storage/testing/nodePorts';

import {
  applyEntitlement,
  hasPlus,
  hydratePlus,
  markOffered,
  markReadingUsed,
  resetPlusStore,
  shouldOfferPlus,
  usePlusStore,
} from './store';
import { FREE } from './types';

const DAY = 24 * 60 * 60 * 1000;
const trial = {
  status: 'plus' as const,
  trial: true,
  expiresAt: Date.UTC(2026, 10, 15),
  willRenew: true,
  managementURL: 'https://play.google.com/store/account/subscriptions',
  history: 'active' as const,
};

let rt: TestRuntime;
beforeEach(async () => {
  rt = await createTestRuntime();
  resetPlusStore({ off: null });
});
afterEach(() => resetPlusStore());

const settle = () => rt.serial(async () => undefined);
const stored = (key: string) =>
  rt.db.first<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [key]);
/** A new launch: memory is gone, and what was saved is read back. */
async function relaunch() {
  resetPlusStore({ off: null });
  await hydratePlus(rt.db, rt.serial);
}

describe('ECHO Plus kept on the phone', () => {
  it('knows the last status and expiry on an offline launch, before the store answers', async () => {
    await hydratePlus(rt.db, rt.serial);
    applyEntitlement(trial);
    await settle();
    await relaunch();
    expect(usePlusStore.getState()).toMatchObject({
      status: 'plus',
      trial: true,
      expiresAt: trial.expiresAt,
      willRenew: true,
      source: 'cache',
    });
    expect(hasPlus(usePlusStore.getState())).toBe(true);
  });

  it('keeps only the subscription state: no management link, nothing else', async () => {
    await hydratePlus(rt.db, rt.serial);
    applyEntitlement(trial);
    await settle();
    expect(JSON.parse((await stored('plus.status'))!.value)).toEqual({
      status: 'plus',
      trial: true,
      expiresAt: trial.expiresAt,
      willRenew: true,
    });
  });

  it('keeps an answer the store gave before the database was open, and saves it then', async () => {
    applyEntitlement({ ...FREE, history: 'expired' });
    await hydratePlus(rt.db, rt.serial);
    expect(usePlusStore.getState()).toMatchObject({ status: 'free', source: 'live' });
    await settle();
    expect(JSON.parse((await stored('plus.status'))!.value)).toMatchObject({ status: 'free' });
  });

  it('starts unknown on a first launch', async () => {
    await hydratePlus(rt.db, rt.serial);
    expect(usePlusStore.getState()).toMatchObject({ status: 'unknown', source: 'none' });
    expect(hasPlus(usePlusStore.getState())).toBe(false);
  });

  it('ignores a saved status it cannot read', async () => {
    await rt.db.run('INSERT INTO preferences (key, value) VALUES (?, ?)', ['plus.status', '{oops']);
    await hydratePlus(rt.db, rt.serial);
    expect(usePlusStore.getState().status).toBe('unknown');
  });

  it('remembers that the onboarding offer was seen, and the free reading used', async () => {
    await hydratePlus(rt.db, rt.serial);
    expect(shouldOfferPlus(usePlusStore.getState())).toBe(true);
    markOffered();
    markReadingUsed();
    await settle();
    await relaunch();
    expect(usePlusStore.getState()).toMatchObject({ offered: true, readingUsed: true });
    expect(shouldOfferPlus(usePlusStore.getState())).toBe(false);
  });

  it('forgets all of it when "Delete everything" empties the table', async () => {
    await hydratePlus(rt.db, rt.serial);
    markOffered();
    markReadingUsed();
    await settle();
    await rt.db.run('DELETE FROM preferences');
    await hydratePlus(rt.db, rt.serial);
    expect(usePlusStore.getState()).toMatchObject({ offered: false, readingUsed: false });
  });
});

describe('who has ECHO Plus', () => {
  it('everyone, in a build that cannot sell it', () => {
    resetPlusStore({ off: 'no_key', status: 'free' });
    expect(hasPlus(usePlusStore.getState())).toBe(true);
    expect(shouldOfferPlus(usePlusStore.getState())).toBe(false);
  });

  it('only those the store says have it, where it can be sold', () => {
    resetPlusStore({ off: null, status: 'free' });
    expect(hasPlus(usePlusStore.getState())).toBe(false);
    resetPlusStore({ off: null, status: 'plus', expiresAt: Date.now() + DAY });
    expect(hasPlus(usePlusStore.getState())).toBe(true);
    expect(shouldOfferPlus(usePlusStore.getState())).toBe(false);
  });
});
