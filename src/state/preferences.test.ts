import { createTestRuntime, type TestRuntime } from '@/storage/testing/nodePorts';

import { hydratePreferences, resetPreferences, usePreferences } from './preferences';

let rt: TestRuntime;
beforeEach(async () => {
  rt = await createTestRuntime();
});
afterEach(() => resetPreferences());

const stored = (key: string) =>
  rt.db.first<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [key]);

describe('preferences', () => {
  it('starts with night and no pattern-card agreement', async () => {
    await hydratePreferences(rt.db, rt.serial);
    expect(usePreferences.getState()).toMatchObject({ theme: 'night', patternsConsent: null });
  });

  it('keeps the pattern-card agreement across launches, and removes it when withdrawn', async () => {
    await hydratePreferences(rt.db, rt.serial);
    usePreferences.getState().setPatternsConsent('patterns-1');
    await rt.serial(async () => undefined);
    expect(await stored('patternsConsent')).toEqual({ value: 'patterns-1' });

    resetPreferences();
    await hydratePreferences(rt.db, rt.serial);
    expect(usePreferences.getState().patternsConsent).toBe('patterns-1');

    usePreferences.getState().setPatternsConsent(null);
    await rt.serial(async () => undefined);
    expect(await stored('patternsConsent')).toBeNull();
  });

  it('keeps the theme and the agreement apart', async () => {
    await hydratePreferences(rt.db, rt.serial);
    usePreferences.getState().setTheme('day');
    usePreferences.getState().setPatternsConsent('patterns-1');
    await rt.serial(async () => undefined);
    resetPreferences();
    await hydratePreferences(rt.db, rt.serial);
    expect(usePreferences.getState()).toMatchObject({
      theme: 'day',
      patternsConsent: 'patterns-1',
    });
  });

  it('forgets the agreement when everything is reset', async () => {
    await hydratePreferences(rt.db, rt.serial);
    usePreferences.getState().setPatternsConsent('patterns-1');
    resetPreferences();
    expect(usePreferences.getState().patternsConsent).toBeNull();
  });

  it('remembers that Home has welcomed, and Delete everything lets it welcome again', async () => {
    await hydratePreferences(rt.db, rt.serial);
    expect(usePreferences.getState().homeWelcomed).toBe(false);
    usePreferences.getState().setHomeWelcomed(true);
    await rt.serial(async () => undefined);
    expect(await stored('homeWelcomed')).toEqual({ value: 'true' });

    resetPreferences();
    expect(usePreferences.getState().homeWelcomed).toBe(false);
    await hydratePreferences(rt.db, rt.serial);
    expect(usePreferences.getState().homeWelcomed).toBe(true);

    // Reset is what Delete everything calls: it comes back as a first launch.
    resetPreferences();
    expect(usePreferences.getState().homeWelcomed).toBe(false);
  });
});
