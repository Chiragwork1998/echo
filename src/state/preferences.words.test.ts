import { createTestRuntime } from '@/storage/testing/nodePorts';

import {
  hydratePreferences,
  liveAllowed,
  resetPreferences,
  usePreferences,
  VOICE_POLICY_VERSION,
  voiceStatus,
} from './preferences';

beforeEach(() => resetPreferences());

const row = (rt: Awaited<ReturnType<typeof createTestRuntime>>, key: string) =>
  rt.db.first<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [key]);
const relaunch = async (rt: Awaited<ReturnType<typeof createTestRuntime>>) => {
  resetPreferences();
  const next = await rt.reopen();
  await hydratePreferences(next.db);
  return next;
};

describe('exact words and hidden words, by default (D-008)', () => {
  it('starts with a journal that keeps exact words, and words hidden', () => {
    expect(usePreferences.getState().tidyWords).toBe(false);
    expect(usePreferences.getState().wordsShown).toBe(false);
  });

  it('remembers Tidy my words and Show words, and forgets nothing else', async () => {
    const rt = await createTestRuntime();
    await hydratePreferences(rt.db);
    usePreferences.getState().setTidyWords(true);
    usePreferences.getState().setWordsShown(true);
    usePreferences.getState().setTheme('day');
    const next = await relaunch(rt);
    expect(usePreferences.getState()).toMatchObject({
      tidyWords: true,
      wordsShown: true,
      theme: 'day',
    });

    usePreferences.getState().setTidyWords(false);
    usePreferences.getState().setWordsShown(false);
    expect(await row(next, 'tidyWords')).toBeNull();
    await relaunch(next);
    expect(usePreferences.getState()).toMatchObject({ tidyWords: false, wordsShown: false });
  });

  it('reads anything but a stored yes as no', async () => {
    const rt = await createTestRuntime();
    await rt.db.run('INSERT INTO preferences (key, value) VALUES (?, ?)', ['tidyWords', '1']);
    await rt.db.run('INSERT INTO preferences (key, value) VALUES (?, ?)', ['wordsShown', 'yes']);
    await hydratePreferences(rt.db);
    expect(usePreferences.getState()).toMatchObject({ tidyWords: false, wordsShown: false });
  });
});

describe('the separate agreement to live words', () => {
  it('raises the policy version, so everyone is asked again under the new words', () => {
    expect(VOICE_POLICY_VERSION).toBeGreaterThanOrEqual(2);
    expect(voiceStatus({ choice: 'allowed', version: 1 })).toBe('unset');
  });

  it('is not given by allowing a voice to be sent, and not by showing words either', () => {
    usePreferences.getState().setVoiceConsent('allowed');
    usePreferences.getState().setWordsShown(true);
    expect(liveAllowed(usePreferences.getState().voiceConsent)).toBe(false);
  });

  it('is given by agreeing to it, which also allows the voice to be sent', async () => {
    const rt = await createTestRuntime();
    await hydratePreferences(rt.db);
    usePreferences.getState().allowLiveWords();
    expect(usePreferences.getState().voiceConsent).toEqual({
      choice: 'allowed',
      version: VOICE_POLICY_VERSION,
      live: true,
    });
    expect(liveAllowed(usePreferences.getState().voiceConsent)).toBe(true);
    await relaunch(rt);
    expect(liveAllowed(usePreferences.getState().voiceConsent)).toBe(true);
  });

  it('survives turning the voice off and on again only within the same policy', () => {
    usePreferences.getState().allowLiveWords();
    usePreferences.getState().setVoiceConsent('voice_only');
    expect(liveAllowed(usePreferences.getState().voiceConsent)).toBe(false);
    // Allowing again from You does not quietly bring back a live agreement that was switched off.
    usePreferences.getState().setVoiceConsent('allowed');
    expect(liveAllowed(usePreferences.getState().voiceConsent)).toBe(false);

    usePreferences.getState().allowLiveWords();
    usePreferences.getState().setVoiceConsent('allowed');
    expect(liveAllowed(usePreferences.getState().voiceConsent)).toBe(true);
  });

  it('is gone under an older policy, and is never granted without a sent voice', () => {
    expect(liveAllowed({ choice: 'allowed', version: VOICE_POLICY_VERSION - 1, live: true })).toBe(
      false,
    );
    expect(liveAllowed({ choice: 'voice_only', version: VOICE_POLICY_VERSION, live: true })).toBe(
      false,
    );
    expect(liveAllowed(null)).toBe(false);
  });
});
