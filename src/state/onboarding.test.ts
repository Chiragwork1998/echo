import { createTestRuntime, everyStoredByte, type TestRuntime } from '@/storage/testing/nodePorts';

import {
  completeOnboarding,
  flushOnboarding,
  hydrateOnboarding,
  initialOnboarding,
  resetOnboarding,
  setOnboardingStep,
  useOnboarding,
  type OnboardingPersistence,
} from './onboarding';
import { createOnboardingPersistence } from './onboardingStore';

let rt: TestRuntime;
let persistence: OnboardingPersistence;

beforeEach(async () => {
  resetOnboarding();
  rt = await createTestRuntime();
  persistence = createOnboardingPersistence(rt);
});

const state = () => useOnboarding.getState();
const update = (patch: Parameters<ReturnType<typeof state>['update']>[0]) => state().update(patch);

/** What the app sees after being killed: an empty store, then a launch from what is on disk. */
async function terminateAndRelaunch() {
  await flushOnboarding();
  resetOnboarding();
  rt = await rt.reopen();
  persistence = createOnboardingPersistence(rt);
  return hydrateOnboarding(persistence);
}

describe('before hydration', () => {
  it('works in memory with the existing fields and update action', () => {
    update({ intent: 'quiet', reminder: { time: '08:00', enabled: true, preset: 'morning' } });
    expect(state().intent).toBe('quiet');
    expect(state().reminder.preset).toBe('morning');
    expect(state().privacy).toEqual({ biometricLock: false, privateBackup: false });
    expect(typeof state().update).toBe('function');
  });

  it('writes nothing, so that defaults cannot overwrite a real record', async () => {
    const save = jest.spyOn(persistence, 'save');
    update({ intent: 'quiet' });
    await flushOnboarding();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('hydration', () => {
  it('reports a first launch', async () => {
    expect(await hydrateOnboarding(persistence)).toBe('fresh');
    expect(state()).toMatchObject(initialOnboarding);
  });

  it('never saves while loading, or defaults could replace the real record', async () => {
    await hydrateOnboarding(persistence);
    update({ intent: 'understand_self', step: 4 });
    await flushOnboarding();
    resetOnboarding();

    const save = jest.spyOn(persistence, 'save');
    const slow: OnboardingPersistence = {
      save: persistence.save,
      load: async () => {
        update({ mood: 'heavy' });
        await flushOnboarding();
        return persistence.load();
      },
    };
    await hydrateOnboarding(slow);

    expect(save).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ intent: 'understand_self', step: 4 });
  });

  it('restores every choice after termination', async () => {
    await hydrateOnboarding(persistence);
    update({
      intent: 'understand_self',
      horizon: 'present',
      mode: 'speak',
      mood: 'unsettled',
      reminder: { time: '22:15', enabled: true },
      privacy: { biometricLock: true, privateBackup: false },
      step: 6,
    });

    expect(await terminateAndRelaunch()).toBe('restored');
    expect(state()).toMatchObject({
      intent: 'understand_self',
      horizon: 'present',
      mode: 'speak',
      mood: 'unsettled',
      reminder: { time: '22:15', enabled: true },
      privacy: { biometricLock: true, privateBackup: false },
      step: 6,
    });
  });

  it('works entirely offline, against the local database alone', async () => {
    await hydrateOnboarding(persistence);
    update({ intent: 'direction', step: 2 });
    await flushOnboarding();
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    await terminateAndRelaunch();
    expect(state().intent).toBe('direction');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('fills fields added by a later version with their defaults', async () => {
    const sealed = await rt.vault.sealJson('onboarding', 'v1', { intent: 'quiet' });
    await rt.db.run('INSERT INTO sealed_kv (key, sealed, updated_at) VALUES (?, ?, 1)', [
      'onboarding',
      sealed,
    ]);
    await hydrateOnboarding(persistence);
    expect(state()).toMatchObject({ intent: 'quiet', step: 0, reminder: { time: '21:30' } });
  });

  it('starts over if the record is corrupt, leaving it until a new one replaces it', async () => {
    await hydrateOnboarding(persistence);
    update({ intent: 'quiet' });
    await flushOnboarding();
    await rt.db.exec(`UPDATE sealed_kv SET sealed = x'01' WHERE key = 'onboarding'`);
    resetOnboarding();

    expect(await hydrateOnboarding(persistence)).toBe('reset');
    expect(state().intent).toBeUndefined();

    update({ intent: 'direction' });
    await flushOnboarding();
    resetOnboarding();
    expect(await hydrateOnboarding(persistence)).toBe('restored');
    expect(state().intent).toBe('direction');
  });

  it('does not treat a passing read failure as corruption', async () => {
    await hydrateOnboarding(persistence);
    update({ intent: 'quiet' });
    await flushOnboarding();
    resetOnboarding();
    const flaky: OnboardingPersistence = {
      ...persistence,
      load: () => Promise.reject(new Error('database is locked')),
    };
    await expect(hydrateOnboarding(flaky)).rejects.toThrow('database is locked');
    // Nothing was allowed to overwrite the good record in the meantime.
    expect(await hydrateOnboarding(persistence)).toBe('restored');
    expect(state().intent).toBe('quiet');
  });
});

describe('persistence', () => {
  beforeEach(async () => {
    await hydrateOnboarding(persistence);
  });

  it('seals every personal choice, so none of it is readable at rest', async () => {
    update({
      intent: 'understand_self',
      horizon: 'present',
      mode: 'speak',
      mood: 'unsettled',
      reminder: { time: '21:47', enabled: true, preset: 'before_sleep' },
    });
    await flushOnboarding();
    const stored = everyStoredByte(rt.root);
    for (const secret of [
      'understand_self',
      'present',
      'speak',
      'unsettled',
      '21:47',
      'before_sleep',
    ]) {
      expect(stored.includes(secret)).toBe(false);
    }
  });

  it('cannot be read as any other record', async () => {
    update({ intent: 'quiet' });
    await flushOnboarding();
    const row = await rt.db.first<{ sealed: Uint8Array }>(
      "SELECT sealed FROM sealed_kv WHERE key = 'onboarding'",
    );
    await expect(rt.vault.openJson('entry', 'v1', row?.sealed ?? new Uint8Array())).rejects.toThrow(
      'decryption failed',
    );
  });

  it('writes after each meaningful change', async () => {
    const save = jest.spyOn(persistence, 'save');
    update({ intent: 'quiet' });
    await flushOnboarding();
    update({ horizon: 'future' });
    await flushOnboarding();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('ends on the newest state after a burst of changes', async () => {
    update({ mood: 'light' });
    update({ mood: 'steady' });
    update({ mood: 'heavy' });
    await terminateAndRelaunch();
    expect(state().mood).toBe('heavy');
  });

  it('does not persist store internals or actions', async () => {
    const save = jest.spyOn(persistence, 'save');
    update({ intent: 'quiet' });
    await flushOnboarding();
    expect(Object.keys(save.mock.lastCall?.[0] ?? {})).not.toContain('update');
    expect(Object.keys(save.mock.lastCall?.[0] ?? {})).not.toContain('saveFailed');
  });

  it('surfaces a failed save, keeps the choice, and retries', async () => {
    const save = jest.spyOn(persistence, 'save');
    save.mockRejectedValue(new Error('disk full'));
    update({ intent: 'quiet' });
    expect(await flushOnboarding()).toBe(false);
    expect(state().saveFailed).toBe(true);
    expect(state().intent).toBe('quiet');

    save.mockRestore();
    expect(await flushOnboarding()).toBe(true);
    expect(state().saveFailed).toBe(false);
    await terminateAndRelaunch();
    expect(state().intent).toBe('quiet');
  });
});

describe('step tracking', () => {
  beforeEach(async () => {
    await hydrateOnboarding(persistence);
  });

  it('persists the current step', async () => {
    setOnboardingStep(4);
    await terminateAndRelaunch();
    expect(state().step).toBe(4);
  });

  it('follows the user backwards too, so they return to where they were', async () => {
    setOnboardingStep(5);
    setOnboardingStep(3);
    await terminateAndRelaunch();
    expect(state().step).toBe(3);
  });

  it('does not write when the step has not changed', async () => {
    setOnboardingStep(2);
    await flushOnboarding();
    const save = jest.spyOn(persistence, 'save');
    setOnboardingStep(2);
    await flushOnboarding();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('completeOnboarding', () => {
  beforeEach(async () => {
    await hydrateOnboarding(persistence);
  });

  it('is on disk before it resolves', async () => {
    expect(await completeOnboarding(1234)).toBe(true);
    resetOnboarding();
    await hydrateOnboarding(createOnboardingPersistence(rt));
    expect(state()).toMatchObject({ completedAt: 1234, step: 8 });
  });

  it('cannot return to an incomplete state', async () => {
    await completeOnboarding(1234);
    await completeOnboarding(9999);
    setOnboardingStep(3);
    expect(state()).toMatchObject({ completedAt: 1234, step: 8 });
  });

  it('reports failure and stays incomplete when it cannot be saved', async () => {
    jest.spyOn(persistence, 'save').mockRejectedValue(new Error('disk full'));
    expect(await completeOnboarding()).toBe(false);
    expect(state().completedAt).toBeUndefined();
  });
});

describe('resetOnboarding', () => {
  it('clears everything and stops persisting', async () => {
    await hydrateOnboarding(persistence);
    update({ intent: 'quiet', mood: 'heavy' });
    await completeOnboarding();
    const save = jest.spyOn(persistence, 'save');
    resetOnboarding();
    expect(state()).toMatchObject({ ...initialOnboarding, saveFailed: false });
    expect(state().intent).toBeUndefined();
    expect(state().completedAt).toBeUndefined();
    update({ intent: 'direction' });
    await flushOnboarding();
    expect(save).not.toHaveBeenCalled();
  });
});
