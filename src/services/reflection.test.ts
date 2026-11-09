import { renderHook, act } from '@testing-library/react-native';

import { emptyContent } from '@/features/journal/content';
import { setJournal } from '@/features/journal/runtime';
import { createSqlJournal } from '@/features/journal/sqlJournal';
import { useReflection } from '@/features/journal/useReflection';
import { READING_CONSENT_VERSION, resetPreferences, usePreferences } from '@/state/preferences';
import { createTestRuntime } from '@/storage/testing/nodePorts';

import type { ReflectAnswer } from './readingApi';
import {
  createReadingProvider,
  offlineProvider,
  readingProvider,
  requestReflection,
  type ReflectionProvider,
} from './reflection';

// Every entry and echo here is invented.
let journal: ReturnType<typeof createSqlJournal>;

const original = {
  url: process.env.EXPO_PUBLIC_VOICE_URL,
  token: process.env.EXPO_PUBLIC_VOICE_TOKEN,
};

beforeEach(async () => {
  resetPreferences();
  journal = createSqlJournal(await createTestRuntime());
  setJournal(journal);
  await journal.commitEntry('entry', emptyContent({ body: 'a saved entry' }));
});

afterEach(() => {
  setJournal(null);
  process.env.EXPO_PUBLIC_VOICE_URL = original.url;
  process.env.EXPO_PUBLIC_VOICE_TOKEN = original.token;
  jest.restoreAllMocks();
});

describe('reflection', () => {
  it('reports offline when this build has no server, and reads nothing', async () => {
    delete process.env.EXPO_PUBLIC_VOICE_URL;
    expect(await offlineProvider.reflect({ entryId: 'entry' })).toEqual({ status: 'offline' });
    expect(await requestReflection('entry')).toEqual({ status: 'offline' });
  });

  it('sends nothing over the network without the reading agreement', async () => {
    process.env.EXPO_PUBLIC_VOICE_URL = 'https://voice.example.com';
    process.env.EXPO_PUBLIC_VOICE_TOKEN = 'app-token';
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    expect(await requestReflection('entry')).toEqual({ status: 'unagreed' });
    // Under the Pattern cards agreement of before, which did not cover today's echo, nor anything.
    usePreferences.setState({ patternsConsent: 'patterns-1' });
    expect(await requestReflection('entry')).toEqual({ status: 'unagreed' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('hands a provider an id, never the words', async () => {
    const reflect = jest.fn(async () => ({ status: 'offline' as const }));
    await requestReflection('entry', { reflect });
    expect(reflect).toHaveBeenCalledWith({ entryId: 'entry' });
  });

  it('turns a provider failure into a state, without touching the entry', async () => {
    const failing: ReflectionProvider = { reflect: () => Promise.reject(new Error('down')) };
    expect(await requestReflection('entry', failing)).toEqual({ status: 'error' });
    const entry = await journal.getEntry('entry');
    expect(entry.ok && entry.value).toMatchObject({ body: 'a saved entry', status: 'committed' });
  });

  it('seals a completed reflection and does not ask twice', async () => {
    const reflect = jest.fn(async () => ({ status: 'complete' as const, text: 'You noticed.' }));
    expect(await requestReflection('entry', { reflect })).toEqual({
      status: 'complete',
      text: 'You noticed.',
    });
    expect(await requestReflection('entry', { reflect })).toEqual({
      status: 'complete',
      text: 'You noticed.',
    });
    expect(reflect).toHaveBeenCalledTimes(1);
  });

  it('keeps no answer of support, which is not a reflection', async () => {
    const reflect = jest.fn(async () => ({ status: 'support' as const }));
    expect(await requestReflection('entry', { reflect })).toEqual({ status: 'support' });
    expect(await journal.getReflection('entry')).toEqual({ ok: true, value: null });
  });

  it('commits an entry with no provider involved at all', async () => {
    const result = await journal.commitEntry('another', emptyContent({ body: 'independent' }));
    expect(result.ok).toBe(true);
  });

  it('ships the provider that reads, not the one that does nothing', () => {
    expect(readingProvider).not.toBe(offlineProvider);
  });
});

describe('the provider that reads the entry (D-017)', () => {
  const echo = 'You’re carrying more than you’ve said out loud.';
  const answer = (value: ReflectAnswer) => jest.fn(async (_text: string) => value);

  function provider(reflect: jest.Mock, agreed = true) {
    return createReadingProvider({ configured: () => true, agreed: () => agreed, reflect });
  }

  it('opens the entry itself and sends its title and words, under the agreement', async () => {
    await journal.commitEntry(
      'titled',
      emptyContent({ title: 'The river', body: 'i walked down to the river' }),
    );
    const reflect = answer({ kind: 'reflection', text: echo });
    expect(await provider(reflect).reflect({ entryId: 'titled' })).toEqual({
      status: 'complete',
      text: echo,
    });
    expect(reflect).toHaveBeenCalledWith('The river\n\ni walked down to the river');
  });

  it('asks for the agreement, and sends nothing, when there is none', async () => {
    const reflect = answer({ kind: 'reflection', text: echo });
    expect(await provider(reflect, false).reflect({ entryId: 'entry' })).toEqual({
      status: 'unagreed',
    });
    expect(reflect).not.toHaveBeenCalled();
  });

  it('reads the agreement as it stands, under its current words', async () => {
    const reflect = answer({ kind: 'reflection', text: echo });
    const live = createReadingProvider({ configured: () => true, reflect });
    expect(await live.reflect({ entryId: 'entry' })).toEqual({ status: 'unagreed' });
    usePreferences.setState({ patternsConsent: READING_CONSENT_VERSION });
    expect(await live.reflect({ entryId: 'entry' })).toEqual({ status: 'complete', text: echo });
  });

  it('answers support with support, and writes no reflection', async () => {
    expect(await provider(answer({ kind: 'support' })).reflect({ entryId: 'entry' })).toEqual({
      status: 'support',
    });
  });

  it('has nothing to reflect in an entry with no words, or none at all, and asks nothing', async () => {
    const reflect = answer({ kind: 'reflection', text: echo });
    // A recording kept without becoming words: an entry with nothing written in it.
    const silent = createReadingProvider({
      configured: () => true,
      agreed: () => true,
      reflect,
      getEntry: async (id) => ({
        ok: true,
        value: {
          ...emptyContent({ body: '  ', mode: 'voice' }),
          id,
          status: 'committed',
          createdAt: 1,
          updatedAt: 1,
          committedAt: 1,
          localDay: '2026-11-09',
        },
      }),
    });
    expect(await silent.reflect({ entryId: 'silent' })).toEqual({ status: 'offline' });
    expect(await provider(reflect).reflect({ entryId: 'missing' })).toEqual({ status: 'offline' });
    expect(reflect).not.toHaveBeenCalled();
  });

  it('offers Try again only where trying again could help', async () => {
    const outcome = (value: ReflectAnswer) => provider(answer(value)).reflect({ entryId: 'entry' });
    expect(await outcome({ kind: 'failed', code: 'busy', retryable: true })).toEqual({
      status: 'error',
    });
    expect(await outcome({ kind: 'failed', code: 'unreachable', retryable: true })).toEqual({
      status: 'error',
    });
    for (const code of ['offline', 'allowance_used', 'unusable', 'refused', 'invalid'] as const) {
      expect(await outcome({ kind: 'failed', code, retryable: code === 'offline' })).toEqual({
        status: 'offline',
      });
    }
  });

  it('sends nothing where this build has no server', async () => {
    const reflect = answer({ kind: 'reflection', text: echo });
    const none = createReadingProvider({ configured: () => false, agreed: () => true, reflect });
    expect(await none.reflect({ entryId: 'entry' })).toEqual({ status: 'offline' });
    expect(reflect).not.toHaveBeenCalled();
  });
});

describe('useReflection', () => {
  it('starts pending and settles to offline', async () => {
    delete process.env.EXPO_PUBLIC_VOICE_URL;
    const view = await renderHook(() => useReflection('entry'));
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(view.result.current.outcome).toEqual({ status: 'offline' });
  });

  it('stays pending with no entry yet', async () => {
    const view = await renderHook(() => useReflection(null));
    expect(view.result.current.outcome).toEqual({ status: 'pending' });
  });
});
