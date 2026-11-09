import { emptyContent } from '@/features/journal/content';
import type { Entry, JournalResult } from '@/features/journal/types';
import {
  READING_CONSENT_VERSION,
  resetPreferences,
  usePreferences,
  VOICE_POLICY_VERSION,
} from '@/state/preferences';
import { installRuntime } from '@/storage/runtime';
import { createTestRuntime } from '@/storage/testing/nodePorts';

import {
  createFormatQueue,
  formatShelf,
  parseWaiting,
  settingOutAllowed,
  type FormatQueueDeps,
  type Waiting,
} from './formatQueue';
import type { FormatAnswer } from './readingApi';

// Every entry here is invented.
const SPOKEN = 'um so i went down to the river today and i just sat there i didnt want to go back';
const SET_OUT =
  'Um, so I went down to the river today, and I just sat there.\n\nI didnt want to go back.';
const MINUTE = 60_000;
/** The tries a failing server is given. With no connection there are more looks than this. */
const MOST_TRIES_SEEN = 3;

const entry = (patch: Partial<Entry> = {}): Entry => ({
  ...emptyContent({ body: SPOKEN, mode: 'voice' }),
  id: 'entry-1',
  status: 'committed',
  createdAt: 1,
  updatedAt: 1,
  committedAt: 1,
  localDay: '2026-11-09',
  ...patch,
});

const flush = async () => {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((done) => setImmediate(done));
};

/** A queue with a clock of its own, a journal of one entry, and a server that sets out. */
function harness(overrides: Partial<FormatQueueDeps> = {}, kept: Entry | null = entry()) {
  let now = 1_000_000;
  let tasks: { at: number; run: () => Promise<void>; off: boolean }[] = [];
  const saved: Waiting[][] = [];
  let stored = kept;
  const format = jest.fn(async (_text: string): Promise<FormatAnswer> => ({
    kind: 'formatted',
    text: SET_OUT,
  }));
  const reformat = jest.fn(async (_id: string, text: string): Promise<JournalResult<Entry>> => {
    stored = stored && { ...stored, body: text };
    return stored
      ? { ok: true, value: stored }
      : { ok: false, error: { code: 'not_found', retryable: false } };
  });
  const setBusy = jest.fn();
  const deps: FormatQueueDeps = {
    now: () => now,
    load: async () => [],
    save: async (waiting) => {
      saved.push(waiting.map((item) => ({ ...item })));
      return true;
    },
    configured: () => true,
    allowed: () => true,
    getEntry: async (id) => ({ ok: true, value: stored?.id === id ? stored : null }),
    reformat,
    format,
    later: (run, ms) => {
      const task = { at: now + ms, run, off: false };
      tasks.push(task);
      return () => {
        task.off = true;
      };
    },
    setBusy,
    ...overrides,
  };
  const queue = createFormatQueue(deps);
  return {
    queue,
    format,
    reformat,
    setBusy,
    saved,
    stored: () => stored,
    /** Moves the clock on, running whatever falls due on the way. */
    async advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const [due] = tasks
          .filter((task) => !task.off && task.at <= until)
          .sort((a, b) => a.at - b.at);
        if (!due) break;
        now = Math.max(now, due.at);
        tasks = tasks.filter((task) => task !== due);
        await due.run();
        await flush();
      }
      now = until;
      await flush();
    },
  };
}

beforeEach(() => resetPreferences());

describe('setting a kept entry out', () => {
  it('waits for the book to close, then sets the entry out and keeps it', async () => {
    const run = harness();
    await run.queue.add(entry());
    expect(run.format).not.toHaveBeenCalled();
    await run.advance(1_000);
    expect(run.format).not.toHaveBeenCalled();
    await run.advance(300);
    expect(run.format).toHaveBeenCalledWith(SPOKEN);
    expect(run.reformat).toHaveBeenCalledWith('entry-1', SET_OUT);
    expect(run.stored()?.body).toBe(SET_OUT);
    expect(run.queue.waiting()).toEqual([]);
    expect(run.saved.at(-1)).toEqual([]);
  });

  it('says which entry is away while it is, and nothing once it is back', async () => {
    const run = harness();
    await run.queue.add(entry());
    await run.advance(2_000);
    expect(run.setBusy.mock.calls).toEqual([['entry-1'], [null]]);
  });

  it('keeps only ids and times, never a word of the entry', async () => {
    const run = harness({
      format: async () => ({ kind: 'failed', code: 'busy', retryable: true }),
    });
    await run.queue.add(entry());
    await run.advance(2_000);
    const written = JSON.stringify(run.saved);
    expect(written).not.toMatch(/river|went|back/);
    for (const kept of run.saved.flat()) {
      expect(Object.keys(kept).sort()).toEqual(['at', 'id', 'since', 'tries']);
    }
  });

  it('never keeps a version with a word changed, and does not ask again', async () => {
    const run = harness({
      format: async () => ({ kind: 'formatted', text: 'So I went down to the river today.' }),
    });
    await run.queue.add(entry());
    await run.advance(2_000);
    expect(run.reformat).not.toHaveBeenCalled();
    expect(run.stored()?.body).toBe(SPOKEN);
    expect(run.queue.waiting()).toEqual([]);
  });

  it('never asks again when the server sends the words back unchanged', async () => {
    const format = jest.fn(async (): Promise<FormatAnswer> => ({ kind: 'unchanged' }));
    const run = harness({ format });
    await run.queue.add(entry());
    await run.advance(2_000);
    await run.advance(24 * 60 * MINUTE);
    expect(format).toHaveBeenCalledTimes(1);
    expect(run.reformat).not.toHaveBeenCalled();
    expect(run.queue.waiting()).toEqual([]);
  });

  it('tries again later after a failure the server says may pass, three times in all', async () => {
    const format = jest.fn(async (): Promise<FormatAnswer> => ({
      kind: 'failed',
      code: 'busy',
      retryable: true,
    }));
    const run = harness({ format });
    await run.queue.add(entry());
    await run.advance(2_000);
    expect(format).toHaveBeenCalledTimes(1);
    await run.advance(5 * MINUTE);
    expect(format).toHaveBeenCalledTimes(2);
    await run.advance(60 * MINUTE);
    expect(format).toHaveBeenCalledTimes(3);
    expect(run.queue.waiting()).toEqual([]);
    await run.advance(24 * 60 * MINUTE);
    expect(format).toHaveBeenCalledTimes(3);
    expect(run.stored()?.body).toBe(SPOKEN);
  });

  it('sets it out on a later try once the server can', async () => {
    const format = jest
      .fn<Promise<FormatAnswer>, [string]>()
      .mockResolvedValueOnce({ kind: 'failed', code: 'unreachable', retryable: true })
      .mockResolvedValueOnce({ kind: 'formatted', text: SET_OUT });
    const run = harness({ format });
    await run.queue.add(entry());
    await run.advance(2_000);
    expect(run.stored()?.body).toBe(SPOKEN);
    await run.advance(5 * MINUTE);
    expect(run.stored()?.body).toBe(SET_OUT);
  });

  it('waits out a phone with no connection without counting it as a try', async () => {
    const format = jest.fn(async (): Promise<FormatAnswer> => ({
      kind: 'failed',
      code: 'offline',
      retryable: true,
    }));
    const run = harness({ format });
    await run.queue.add(entry());
    await run.advance(2_000);
    for (let hour = 0; hour < 6; hour += 1) await run.advance(60 * MINUTE);
    expect(format.mock.calls.length).toBeGreaterThan(MOST_TRIES_SEEN);
    expect(run.queue.waiting()).toHaveLength(1);
    expect(run.queue.waiting()[0]?.tries).toBe(0);
  });

  it('decides from the server’s word whether to try again, never from the status', async () => {
    const limited = harness({
      format: async () => ({ kind: 'failed', code: 'busy', retryable: true }),
    });
    await limited.queue.add(entry());
    await limited.advance(2_000);
    expect(limited.queue.waiting()).toHaveLength(1);

    // OpenAI said no: a 502 the server calls final.
    for (const code of ['refused', 'unusable', 'allowance_used', 'invalid'] as const) {
      const final = harness({ format: async () => ({ kind: 'failed', code, retryable: false }) });
      await final.queue.add(entry());
      await final.advance(2_000);
      expect([code, final.queue.waiting()]).toEqual([code, []]);
    }
  });

  it('lets go of an entry that was deleted, or is not a kept one', async () => {
    const gone = harness({}, null);
    await gone.queue.add(entry());
    await gone.advance(2_000);
    expect(gone.format).not.toHaveBeenCalled();
    expect(gone.queue.waiting()).toEqual([]);

    const draft = harness({}, entry({ status: 'draft' }));
    await draft.queue.add(entry());
    await draft.advance(2_000);
    expect(draft.format).not.toHaveBeenCalled();
  });

  it('sends nothing, and keeps nothing waiting, when no agreement covers the entry', async () => {
    const run = harness({ allowed: () => false });
    await run.queue.add(entry());
    await run.advance(2_000);
    expect(run.format).not.toHaveBeenCalled();
    expect(run.saved).toEqual([]);
  });

  it('sends nothing once the agreement is withdrawn before the try', async () => {
    let allowed = true;
    const run = harness({ allowed: () => allowed });
    await run.queue.add(entry());
    allowed = false;
    await run.advance(2_000);
    expect(run.format).not.toHaveBeenCalled();
    expect(run.queue.waiting()).toEqual([]);
  });

  it('keeps nothing that comes back after the agreement was withdrawn while it was away', async () => {
    let allowed = true;
    const run = harness({
      allowed: () => allowed,
      format: async () => {
        allowed = false;
        return { kind: 'formatted', text: SET_OUT };
      },
    });
    await run.queue.add(entry());
    await run.advance(2_000);
    expect(run.reformat).not.toHaveBeenCalled();
    expect(run.stored()?.body).toBe(SPOKEN);
  });

  it('sends nothing where this build has no server', async () => {
    const run = harness({ configured: () => false });
    await run.queue.add(entry());
    await run.advance(2_000);
    expect(run.format).not.toHaveBeenCalled();
  });

  it('picks up what waited from before, once the launch has settled', async () => {
    const run = harness({
      load: async () => [{ id: 'entry-1', tries: 1, at: 0, since: 999_000 }],
    });
    await run.queue.resume();
    await run.advance(3_000);
    expect(run.format).not.toHaveBeenCalled();
    await run.advance(1_500);
    expect(run.format).toHaveBeenCalledWith(SPOKEN);
    expect(run.stored()?.body).toBe(SET_OUT);
  });

  it('asks once for an entry added twice', async () => {
    const run = harness();
    await run.queue.add(entry());
    await run.queue.add(entry());
    await run.advance(2_000);
    expect(run.format).toHaveBeenCalledTimes(1);
  });
});

describe('which agreement covers it (D-017)', () => {
  const voice = (choice: 'allowed' | 'voice_only', version = VOICE_POLICY_VERSION) =>
    usePreferences.setState({ voiceConsent: { choice, version } });

  it('sets out what was spoken under the voice agreement, and only that', () => {
    voice('allowed');
    expect(settingOutAllowed({ mode: 'voice' })).toBe(true);
    expect(settingOutAllowed({ mode: 'text' })).toBe(false);
    voice('voice_only');
    expect(settingOutAllowed({ mode: 'voice' })).toBe(false);
    // An agreement under the voice words of before, which did not say so, does not cover it.
    voice('allowed', 2);
    expect(settingOutAllowed({ mode: 'voice' })).toBe(false);
  });

  it('sets out what was written only under the reading agreement', () => {
    usePreferences.setState({ patternsConsent: READING_CONSENT_VERSION });
    expect(settingOutAllowed({ mode: 'text' })).toBe(true);
    expect(settingOutAllowed({ mode: 'voice' })).toBe(false);
    // The Pattern cards agreement of before covered the cards alone.
    usePreferences.setState({ patternsConsent: 'patterns-1' });
    expect(settingOutAllowed({ mode: 'text' })).toBe(false);
  });
});

describe('what is kept on disk', () => {
  afterEach(() => installRuntime(null));

  it('is a list of ids and times in the plain preferences table, and nothing else', async () => {
    const rt = await createTestRuntime();
    installRuntime(rt);
    const waiting: Waiting[] = [{ id: 'f2f1c6d0-0c4e', tries: 1, at: 5, since: 4 }];
    expect(await formatShelf.save(waiting)).toBe(true);
    const row = await rt.db.first<{ value: string }>(
      "SELECT value FROM preferences WHERE key = 'formatQueue'",
    );
    expect(JSON.parse(row?.value ?? 'null')).toEqual(waiting);
    expect(await formatShelf.load()).toEqual(waiting);
    expect(await formatShelf.save([])).toBe(true);
    expect(await formatShelf.load()).toEqual([]);
  });

  it('reads back only what has the shape of an id and times', () => {
    expect(
      parseWaiting([
        { id: 'a-1', tries: 0, at: 1, since: 1 },
        { id: 'words with spaces', tries: 0, at: 1, since: 1 },
        { id: 'b-2', tries: 'x', at: 1, since: 1 },
        'nonsense',
      ]),
    ).toEqual([{ id: 'a-1', tries: 0, at: 1, since: 1 }]);
    expect(parseWaiting({ not: 'a list' })).toEqual([]);
  });
});
