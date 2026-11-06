import { createTestRuntime } from '@/storage/testing/nodePorts';

import {
  hydratePreferences,
  resetPreferences,
  usePreferences,
  VOICE_POLICY_VERSION,
  voiceStatus,
} from './preferences';

beforeEach(() => resetPreferences());

const row = (rt: Awaited<ReturnType<typeof createTestRuntime>>, key: string) =>
  rt.db.first<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [key]);

describe('voice consent', () => {
  it('starts unset, so nothing is sent', () => {
    expect(usePreferences.getState().voiceConsent).toBeNull();
    expect(voiceStatus(usePreferences.getState().voiceConsent)).toBe('unset');
  });

  it('reads a choice made under an older policy as unset', () => {
    expect(voiceStatus({ choice: 'allowed', version: VOICE_POLICY_VERSION })).toBe('allowed');
    expect(voiceStatus({ choice: 'voice_only', version: VOICE_POLICY_VERSION })).toBe('voice_only');
    expect(voiceStatus({ choice: 'allowed', version: VOICE_POLICY_VERSION - 1 })).toBe('unset');
    expect(voiceStatus({ choice: 'allowed', version: VOICE_POLICY_VERSION + 1 })).toBe('unset');
  });

  it('stores the choice with its policy version, and it survives a relaunch', async () => {
    const rt = await createTestRuntime();
    await hydratePreferences(rt.db);
    usePreferences.getState().setVoiceConsent('allowed');
    expect(JSON.parse((await row(rt, 'voiceConsent'))?.value ?? 'null')).toEqual({
      choice: 'allowed',
      version: VOICE_POLICY_VERSION,
    });

    resetPreferences();
    expect(usePreferences.getState().voiceConsent).toBeNull();
    await hydratePreferences(await rt.reopen().then((next) => next.db));
    expect(voiceStatus(usePreferences.getState().voiceConsent)).toBe('allowed');
  });

  it('remembers Keep my voice only, so nothing is sent after a relaunch either', async () => {
    const rt = await createTestRuntime();
    await hydratePreferences(rt.db);
    usePreferences.getState().setVoiceConsent('voice_only');
    resetPreferences();
    await hydratePreferences(await rt.reopen().then((next) => next.db));
    expect(voiceStatus(usePreferences.getState().voiceConsent)).toBe('voice_only');
  });

  it.each(['not json', '{"choice":"yes","version":1}', '{"choice":"allowed"}', 'null', '[]'])(
    'treats a stored value it cannot read (%s) as no consent',
    async (value) => {
      const rt = await createTestRuntime();
      await rt.db.run('INSERT INTO preferences (key, value) VALUES (?, ?)', [
        'voiceConsent',
        value,
      ]);
      await hydratePreferences(rt.db);
      expect(voiceStatus(usePreferences.getState().voiceConsent)).toBe('unset');
    },
  );

  it('does not touch the theme', async () => {
    const rt = await createTestRuntime();
    await hydratePreferences(rt.db);
    usePreferences.getState().setTheme('day');
    usePreferences.getState().setVoiceConsent('allowed');
    resetPreferences();
    await hydratePreferences(await rt.reopen().then((next) => next.db));
    expect(usePreferences.getState().theme).toBe('day');
  });
});

describe('the mode a session opens in', () => {
  it('is Speak until the person chooses otherwise (D-006)', () => {
    expect(usePreferences.getState().lastMode).toBe('speak');
  });

  it('remembers the last choice across a relaunch', async () => {
    const rt = await createTestRuntime();
    await hydratePreferences(rt.db);
    usePreferences.getState().setLastMode('write');
    resetPreferences();
    expect(usePreferences.getState().lastMode).toBe('speak');
    await hydratePreferences(await rt.reopen().then((next) => next.db));
    expect(usePreferences.getState().lastMode).toBe('write');
  });

  it('falls back to Speak on a stored value it does not recognise', async () => {
    const rt = await createTestRuntime();
    await rt.db.run('INSERT INTO preferences (key, value) VALUES (?, ?)', ['sessionMode', 'poem']);
    await hydratePreferences(rt.db);
    expect(usePreferences.getState().lastMode).toBe('speak');
  });
});
