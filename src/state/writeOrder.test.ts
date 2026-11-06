import { emptyContent } from '@/features/journal/content';
import { createSqlJournal } from '@/features/journal/sqlJournal';
import { createTestRuntime, type TestRuntime } from '@/storage/testing/nodePorts';

import { flushOnboarding, hydrateOnboarding, resetOnboarding, useOnboarding } from './onboarding';
import { createOnboardingPersistence } from './onboardingStore';
import { hydratePreferences, resetPreferences, usePreferences } from './preferences';

// expo-sqlite's withTransactionAsync is BEGIN, the task, then COMMIT on the one connection, and it
// does not hold other callers off. openTestDb's transaction has the same shape, so anything written
// while one is open joins it, and goes when it rolls back, after its own promise said it was saved.

let rt: TestRuntime;

const macrotask = () => new Promise((resolve) => setImmediate(resolve));

/** Runs `during` inside a journal transaction that then fails and rolls back. */
async function duringFailedTransaction(during: () => void) {
  const journal = createSqlJournal(rt);
  await journal.commitEntry('a', emptyContent({ body: 'x' }));
  const run = rt.db.run.bind(rt.db);
  const spy = jest.spyOn(rt.db, 'run').mockImplementation(async (source, params) => {
    if (source.startsWith('DELETE FROM reflections')) {
      during();
      await macrotask(); // Long enough for an unqueued write to land inside the transaction.
      throw new Error('disk full');
    }
    return run(source, params);
  });
  expect((await journal.deleteEntry('a')).ok).toBe(false);
  spy.mockRestore();
}

beforeEach(async () => {
  resetOnboarding();
  resetPreferences();
  rt = await createTestRuntime();
});

afterEach(() => jest.restoreAllMocks());

it('keeps an onboarding save made while a journal transaction rolls back', async () => {
  await hydrateOnboarding(createOnboardingPersistence(rt));

  await duringFailedTransaction(() => {
    useOnboarding.getState().update({
      privacy: { biometricLock: true, privateBackup: false },
    });
  });
  expect(await flushOnboarding()).toBe(true);

  resetOnboarding();
  await hydrateOnboarding(createOnboardingPersistence(rt));
  expect(useOnboarding.getState().privacy.biometricLock).toBe(true);
});

it('keeps a theme save made while a journal transaction rolls back', async () => {
  await hydratePreferences(rt.db, rt.serial);

  await duringFailedTransaction(() => usePreferences.getState().setTheme('day'));
  await macrotask();

  resetPreferences();
  await hydratePreferences(rt.db, rt.serial);
  expect(usePreferences.getState().theme).toBe('day');
});

it('does not let a write land inside a journal transaction at all', async () => {
  await hydrateOnboarding(createOnboardingPersistence(rt));
  const journal = createSqlJournal(rt);
  await journal.commitEntry('a', emptyContent({ body: 'x' }));

  const order: string[] = [];
  const run = rt.db.run.bind(rt.db);
  jest.spyOn(rt.db, 'run').mockImplementation(async (source, params) => {
    order.push(source.includes('sealed_kv') ? 'onboarding' : 'transaction');
    if (source.startsWith('DELETE FROM audio')) {
      useOnboarding.getState().update({ intent: 'quiet' });
      await macrotask();
    }
    return run(source, params);
  });

  await journal.deleteEntry('a');
  await flushOnboarding();

  expect(order).toEqual(['transaction', 'transaction', 'transaction', 'onboarding']);
});
