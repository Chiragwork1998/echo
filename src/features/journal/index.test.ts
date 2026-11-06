// Parallel screen agents import this barrel into their own tests, with no mocks. If it ever pulled a
// native module in at import, every one of those suites would fail. expo-audio is the one that throws.
import { act, renderHook } from '@testing-library/react-native';

import {
  createMemoryJournal,
  setJournal,
  useDraft,
  useHomeSummary,
  useVoiceRecorder,
} from '@/features/journal';

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });

beforeEach(() => setJournal(createMemoryJournal()));
afterEach(() => setJournal(null));

describe('the journal barrel, with nothing mocked', () => {
  it('drives a draft to a commit on the in-memory journal', async () => {
    const view = await renderHook(() => useDraft());
    await settle();
    await act(() => view.result.current.update({ body: 'written in a screen test' }));
    await act(async () => {
      const result = await view.result.current.commit();
      expect(result.ok).toBe(true);
    });
  });

  it('reports the recorder unavailable instead of throwing', async () => {
    const view = await renderHook(() => useVoiceRecorder(useDraft()));
    await settle();
    expect(view.result.current.available).toBe(false);
  });

  it('gives Home an empty, renderable state', async () => {
    const view = await renderHook(() => useHomeSummary());
    await settle();
    expect(view.result.current).toMatchObject({
      status: 'ready',
      recent: null,
      continueDraft: null,
    });
    expect(view.result.current.rhythm.week).toHaveLength(7);
  });

  it('reports not_ready, without crashing, when no journal is installed', async () => {
    setJournal(null);
    const view = await renderHook(() => useDraft());
    await settle();
    expect(view.result.current.status).toBe('error');
    expect(view.result.current.error?.code).toBe('not_ready');
  });
});
