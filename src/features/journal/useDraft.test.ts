import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { createTestRuntime, type TestRuntime } from '@/storage/testing/nodePorts';

import { useJournalRevision } from './api';
import { setJournal } from './runtime';
import { createSqlJournal } from './sqlJournal';
import type { Journal, JournalResult } from './types';
import {
  AUTOSAVE_INTERVAL_MS,
  useDraft,
  type DraftController,
  type UseDraftOptions,
} from './useDraft';

const flushMicrotasks = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

function unwrap<T>(result: JournalResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

let rt: TestRuntime;
let journal: ReturnType<typeof createSqlJournal>;
let appStateHandlers: ((state: string) => void)[];

async function mount(options?: UseDraftOptions) {
  const view = await renderHook(() => useDraft(options));
  await flushMicrotasks();
  return view;
}

const rowCount = async () =>
  (await rt.db.first<{ total: number }>('SELECT COUNT(*) AS total FROM entries'))?.total;

const storedBody = async (id: string | null) => unwrap(await journal.getEntry(id ?? ''))?.body;

/** Fails the wrapped journal's writes while `broken` is true. */
function flaky(inner: Journal) {
  const state = { broken: false };
  const wrapped: Journal = {
    ...inner,
    saveDraft: (id, content) =>
      state.broken
        ? Promise.resolve({ ok: false, error: { code: 'write_failed', retryable: true } })
        : inner.saveDraft(id, content),
    commitEntry: (id, content) =>
      state.broken
        ? Promise.resolve({ ok: false, error: { code: 'write_failed', retryable: true } })
        : inner.commitEntry(id, content),
  };
  return { state, wrapped };
}

beforeEach(async () => {
  jest.useFakeTimers();
  rt = await createTestRuntime();
  journal = createSqlJournal(rt);
  setJournal(journal);
  appStateHandlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandlers.push(handler as (state: string) => void);
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setJournal(null);
});

const current = (view: Awaited<ReturnType<typeof mount>>): DraftController => view.result.current;

describe('starting', () => {
  it('becomes ready with a new id and writes no row until there is something to keep', async () => {
    const view = await mount();
    expect(current(view).status).toBe('ready');
    expect(current(view).id).toEqual(expect.any(String));
    expect(current(view).resumed).toBe(false);
    await advance(AUTOSAVE_INTERVAL_MS * 3);
    expect(await rowCount()).toBe(0);
  });

  it('writes no row for text that was cleared before the first save', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'nev' }));
    await act(() => current(view).update({ body: '   ' }));
    await advance(AUTOSAVE_INTERVAL_MS * 2);
    expect(await rowCount()).toBe(0);
  });

  it('applies the seed to a new draft', async () => {
    const view = await mount({ seed: { promptId: 'first-echo', moodBefore: 'heavy' } });
    expect(current(view).content).toMatchObject({ promptId: 'first-echo', moodBefore: 'heavy' });
  });

  it('resumes the newest draft with its text', async () => {
    unwrap(
      await journal.saveDraft('earlier', { body: 'was here', mode: 'text', durationSeconds: 9 }),
    );
    const view = await mount({ seed: { promptId: 'ignored' } });
    expect(current(view)).toMatchObject({ id: 'earlier', resumed: true });
    expect(current(view).content).toMatchObject({ body: 'was here', durationSeconds: 9 });
    expect(current(view).content.promptId).toBeUndefined();
  });

  it('opens a specific draft', async () => {
    unwrap(await journal.saveDraft('one', { body: 'one', mode: 'text', durationSeconds: 0 }));
    unwrap(await journal.saveDraft('two', { body: 'two', mode: 'text', durationSeconds: 0 }));
    const view = await mount({ draftId: 'one' });
    expect(current(view).content.body).toBe('one');
  });

  it('reports a draft it cannot read, and does not offer it for editing', async () => {
    unwrap(await journal.saveDraft('bad', { body: 'x', mode: 'text', durationSeconds: 0 }));
    await rt.db.exec(`UPDATE entries SET sealed = x'01'`);
    const view = await mount();
    expect(current(view).status).toBe('error');
    expect(current(view).error).toEqual({ code: 'unreadable', retryable: false });
  });

  it('refuses to open a committed entry as a draft', async () => {
    unwrap(await journal.commitEntry('done', { body: 'x', mode: 'text', durationSeconds: 0 }));
    const view = await mount({ draftId: 'done' });
    expect(current(view).status).toBe('error');
    expect(current(view).error?.code).toBe('not_draft');
  });
});

describe('autosave', () => {
  it('ignores a change made before the draft has loaded, which would overwrite it', async () => {
    unwrap(
      await journal.saveDraft('earlier', { body: 'long draft', mode: 'text', durationSeconds: 0 }),
    );
    let attempted = false;
    const view = await renderHook(() => {
      const draft = useDraft();
      if (draft.status === 'loading') {
        attempted = true;
        draft.update({ body: 'x' });
      }
      return draft;
    });
    await flushMicrotasks();
    expect(attempted).toBe(true);
    await advance(AUTOSAVE_INTERVAL_MS * 2);
    expect(current(view).content.body).toBe('long draft');
    expect(await storedBody('earlier')).toBe('long draft');
  });

  it('does not refresh lists on every save, only when the session closes', async () => {
    const view = await mount();
    const before = useJournalRevision.getState().revision;
    await act(() => current(view).update({ body: 'typing' }));
    await advance(AUTOSAVE_INTERVAL_MS * 3);
    expect(useJournalRevision.getState().revision).toBe(before);

    await view.unmount();
    await flushMicrotasks();
    expect(useJournalRevision.getState().revision).toBeGreaterThan(before);
  });

  it('saves within the interval after the first change', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'hello' }));
    expect(await rowCount()).toBe(0);
    await advance(AUTOSAVE_INTERVAL_MS);
    expect(await storedBody(current(view).id)).toBe('hello');
    expect(current(view).saveState).toBe('saved');
  });

  it('keeps saving for someone who never stops typing', async () => {
    const view = await mount();
    const keystroke = AUTOSAVE_INTERVAL_MS / 4;
    for (let index = 0; index < 8; index += 1) {
      await act(() => current(view).update({ body: 'x'.repeat(index + 1) }));
      await advance(keystroke);
    }
    const stored = (await storedBody(current(view).id)) ?? '';
    expect(stored.length).toBeGreaterThanOrEqual(4);
  });

  it('coalesces a burst into the latest text', async () => {
    const view = await mount();
    await act(() => {
      current(view).update({ body: 'a' });
      current(view).update({ body: 'ab' });
      current(view).update({ body: 'abc' });
    });
    await advance(AUTOSAVE_INTERVAL_MS);
    expect(await storedBody(current(view).id)).toBe('abc');
  });

  it('saves immediately when the app leaves the foreground', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'going to the background' }));
    await act(async () => {
      appStateHandlers.forEach((handler) => handler('background'));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(await storedBody(current(view).id)).toBe('going to the background');
  });

  it('saves on unmount', async () => {
    const view = await mount();
    const { id } = current(view);
    await act(() => current(view).update({ body: 'left the screen' }));
    await view.unmount();
    await flushMicrotasks();
    expect(await storedBody(id)).toBe('left the screen');
  });

  it('writes an emptied draft, so clearing the text sticks', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'something' }));
    await advance(AUTOSAVE_INTERVAL_MS);
    await act(() => current(view).update({ body: '' }));
    await advance(AUTOSAVE_INTERVAL_MS);
    expect(await storedBody(current(view).id)).toBe('');
  });

  it('flush resolves only once the text is stored', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'keep draft' }));
    await act(async () => {
      expect((await current(view).flush()).ok).toBe(true);
    });
    expect(await storedBody(current(view).id)).toBe('keep draft');
  });
});

describe('a failed save', () => {
  it('reports the error, keeps the text, and retries on the next change', async () => {
    const { state, wrapped } = flaky(journal);
    setJournal(wrapped);
    state.broken = true;
    const view = await mount();

    await act(() => current(view).update({ body: 'do not lose this' }));
    await advance(AUTOSAVE_INTERVAL_MS);
    expect(current(view).saveState).toBe('error');
    expect(current(view).error).toEqual({ code: 'write_failed', retryable: true });
    expect(current(view).content.body).toBe('do not lose this');

    state.broken = false;
    await act(() => current(view).update({ body: 'do not lose this either' }));
    await advance(AUTOSAVE_INTERVAL_MS);
    expect(current(view).saveState).toBe('saved');
    expect(current(view).error).toBeNull();
    expect(await storedBody(current(view).id)).toBe('do not lose this either');
  });

  it('retries on flush with no further typing', async () => {
    const { state, wrapped } = flaky(journal);
    setJournal(wrapped);
    state.broken = true;
    const view = await mount();
    await act(() => current(view).update({ body: 'still here' }));
    await advance(AUTOSAVE_INTERVAL_MS);

    state.broken = false;
    await act(async () => {
      expect((await current(view).flush()).ok).toBe(true);
    });
    expect(await storedBody(current(view).id)).toBe('still here');
  });
});

describe('commit', () => {
  it('stores the latest text, even inside the autosave window', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'the final words' }));
    await act(async () => {
      const result = await current(view).commit();
      expect(unwrap(result)).toMatchObject({ body: 'the final words', status: 'committed' });
    });
  });

  it('is durable before it resolves', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'durable' }));
    const { id } = current(view);
    await act(async () => {
      await current(view).commit();
    });
    const after = createSqlJournal(await rt.reopen());
    expect(unwrap(await after.getEntry(id ?? ''))).toMatchObject({
      body: 'durable',
      status: 'committed',
    });
  });

  it('accepts last-moment fields', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'with a mood' }));
    await act(async () => {
      const entry = unwrap(await current(view).commit({ moodBefore: 'heavy' }));
      expect(entry.moodBefore).toBe('heavy');
    });
  });

  it('a double tap makes one entry', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'tapped twice' }));
    await act(async () => {
      const [first, second] = await Promise.all([current(view).commit(), current(view).commit()]);
      expect(first.ok && second.ok).toBe(true);
    });
    expect(await rowCount()).toBe(1);
  });

  it('on failure keeps the draft in memory and on disk, then succeeds on retry', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'saved as draft' }));
    await advance(AUTOSAVE_INTERVAL_MS);

    const { state, wrapped } = flaky(journal);
    setJournal(wrapped);
    state.broken = true;
    await act(async () => {
      const result = await current(view).commit();
      expect(result).toEqual({ ok: false, error: { code: 'write_failed', retryable: true } });
    });
    expect(current(view).commitState).toBe('error');
    expect(current(view).content.body).toBe('saved as draft');
    expect(unwrap(await journal.getEntry(current(view).id ?? ''))?.status).toBe('draft');

    state.broken = false;
    await act(async () => {
      expect((await current(view).commit()).ok).toBe(true);
    });
    expect(current(view).commitState).toBe('idle');
  });

  it('stops autosaving afterwards', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'done' }));
    await act(async () => {
      await current(view).commit();
    });
    await act(() => current(view).update({ body: 'typed after commit' }));
    await advance(AUTOSAVE_INTERVAL_MS * 2);
    expect(await storedBody(current(view).id)).toBe('done');
  });
});

describe('discard', () => {
  it('removes the draft, and a pending autosave cannot bring it back', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'saved' }));
    await advance(AUTOSAVE_INTERVAL_MS);
    await act(() => current(view).update({ body: 'still pending' }));
    await act(async () => {
      expect((await current(view).discard()).ok).toBe(true);
    });
    await advance(AUTOSAVE_INTERVAL_MS * 2);
    expect(await rowCount()).toBe(0);

    // The screen closes next, and closing flushes. That must not recreate what was just discarded.
    await view.unmount();
    await flushMicrotasks();
    expect(await rowCount()).toBe(0);
  });

  it('does nothing harmful for a draft never saved', async () => {
    const view = await mount();
    await act(async () => {
      expect((await current(view).discard()).ok).toBe(true);
    });
    expect(await rowCount()).toBe(0);
  });
});

describe('reflect gating', () => {
  it('needs 10 non-space characters', async () => {
    const view = await mount();
    await act(() => current(view).update({ body: 'a b c d e f g h i' }));
    expect(current(view).canReflect).toBe(false);
    await act(() => current(view).update({ body: 'a b c d e f g h i j' }));
    expect(current(view).canReflect).toBe(true);
  });

  it('asks about back only when there is something to lose', async () => {
    const view = await mount();
    expect(current(view).hasContent).toBe(false);
    await act(() => current(view).update({ body: '   ' }));
    expect(current(view).hasContent).toBe(false);
    await act(() => current(view).update({ body: 'x' }));
    expect(current(view).hasContent).toBe(true);
  });
});
