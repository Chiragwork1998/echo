import { act, renderHook } from '@testing-library/react-native';

import { hideEcho, resetRemovedEchoes, useLeftOut, useRemovedEchoes } from './removed';

const ids = () => [...useRemovedEchoes.getState().deleted.keys()];
const reading = (...names: string[]) => names.map((id) => ({ id }));
type Read = ReturnType<typeof reading> | null;

/** One list of the archive: what it has read, and the words of its search. */
const list = (read: Read, query = '') =>
  renderHook((props: { read: Read; query: string }) => useLeftOut(props.read, props.query), {
    initialProps: { read, query },
  });

beforeEach(resetRemovedEchoes);

describe('echoes that have been deleted', () => {
  it('are remembered from the moment the deletion is known, each once', () => {
    hideEcho('a');
    hideEcho('b');
    hideEcho('a');
    expect(ids()).toEqual(['a', 'b']);
  });
});

describe('what a list leaves out', () => {
  it('leaves a deleted echo out of what it read until its own reading no longer holds it', async () => {
    const view = await list(reading('a', 'b', 'c'));
    await act(async () => hideEcho('b'));
    expect([...view.result.current.listed]).toEqual(['b']);
    // A second answer from before the deletion, as late as you like, still holds it.
    await view.rerender({ read: reading('a', 'b', 'c'), query: '' });
    expect([...view.result.current.listed]).toEqual(['b']);
    // Read again without it: done with it.
    await view.rerender({ read: reading('a', 'c'), query: '' });
    expect(view.result.current.listed.size).toBe(0);
  });

  it('is not let off by another list that has read the archive again: each list waits for its own reading', async () => {
    // The walk (v11): three Echoes pages were open, one above another. The one below read the
    // archive again first, the deletion was forgotten, and the one in view listed the echo again
    // from its own older reading, whole, for two frames, before its own answer took it away.
    const below = await list(reading('a', 'b', 'c'));
    const inView = await list(reading('a', 'b', 'c'));
    await act(async () => hideEcho('b'));
    await below.rerender({ read: reading('a', 'c'), query: '' });
    expect(below.result.current.listed.size).toBe(0);
    expect([...inView.result.current.listed]).toEqual(['b']);
    await inView.rerender({ read: reading('a', 'c'), query: '' });
    expect(inView.result.current.listed.size).toBe(0);
  });

  it('leaves nothing out of a list opened after the deletion: it never read the echo', async () => {
    hideEcho('b');
    const view = await list(null);
    // A backup restored after Delete all data brings the echo back with its own id.
    await view.rerender({ read: reading('a', 'b'), query: '' });
    expect(view.result.current.listed.size).toBe(0);
    expect(view.result.current.either.size).toBe(0);
  });

  it('lists an echo that comes back after its own reading was without it: it is really there', async () => {
    const view = await list(reading('a', 'b'));
    await act(async () => hideEcho('b'));
    await view.rerender({ read: reading('a'), query: '' });
    await view.rerender({ read: reading('a', 'b'), query: '' });
    expect(view.result.current.listed.size).toBe(0);
  });

  it('leaves a deleted echo out of the answer to a search typed before it was deleted, and not after', async () => {
    // A search is answered once for its words, and not again when the archive changes.
    const view = await list(reading('a', 'b'), 'river');
    await act(async () => hideEcho('b'));
    await view.rerender({ read: reading('a'), query: 'river' });
    expect([...view.result.current.searched]).toEqual(['b']);
    expect([...view.result.current.either]).toEqual(['b']);
    await view.rerender({ read: reading('a'), query: 'rive' });
    expect(view.result.current.searched.size).toBe(0);
  });

  it('gives the same sets while nothing changes, so the page does not redraw for them', async () => {
    const view = await list(reading('a', 'b'));
    await act(async () => hideEcho('b'));
    const before = view.result.current;
    await view.rerender({ read: reading('a', 'b'), query: '' });
    expect(view.result.current.listed).toBe(before.listed);
    expect(view.result.current.either).toBe(before.either);
  });
});
