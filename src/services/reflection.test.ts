import { renderHook, act } from '@testing-library/react-native';

import { emptyContent } from '@/features/journal/content';
import { setJournal } from '@/features/journal/runtime';
import { createSqlJournal } from '@/features/journal/sqlJournal';
import { useReflection } from '@/features/journal/useReflection';
import { createTestRuntime } from '@/storage/testing/nodePorts';

import { offlineProvider, requestReflection, type ReflectionProvider } from './reflection';

let journal: ReturnType<typeof createSqlJournal>;

beforeEach(async () => {
  journal = createSqlJournal(await createTestRuntime());
  setJournal(journal);
  await journal.commitEntry('entry', emptyContent({ body: 'a saved entry' }));
});

afterEach(() => setJournal(null));

describe('reflection', () => {
  it('reports offline, which is all that ships', async () => {
    expect(await offlineProvider.reflect({ entryId: 'entry' })).toEqual({ status: 'offline' });
    expect(await requestReflection('entry')).toEqual({ status: 'offline' });
  });

  it('sends nothing over the network', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    await requestReflection('entry');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
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

  it('commits an entry with no provider involved at all', async () => {
    const result = await journal.commitEntry('another', emptyContent({ body: 'independent' }));
    expect(result.ok).toBe(true);
  });
});

describe('useReflection', () => {
  it('starts pending and settles to offline', async () => {
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
