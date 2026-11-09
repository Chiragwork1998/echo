import { confirmGone, hideEcho, resetRemovedEchoes, useRemovedEchoes } from './removed';

const ids = () => [...useRemovedEchoes.getState().ids];

beforeEach(resetRemovedEchoes);

describe('echoes that have been deleted', () => {
  it('are remembered from the moment the deletion is known', () => {
    hideEcho('a');
    hideEcho('b');
    hideEcho('a');
    expect(ids()).toEqual(['a', 'b']);
  });

  it('are forgotten once the list has been read again without them', () => {
    hideEcho('a');
    hideEcho('b');
    confirmGone(new Set(['a', 'c']));
    // 'b' is gone from the archive; 'a' is still there in what was read, which was read before.
    expect(ids()).toEqual(['a']);
  });

  it('are not held against an echo that comes back, as a restored backup brings one', () => {
    hideEcho('a');
    confirmGone(new Set(['b']));
    expect(ids()).toEqual([]);
    // A later list that has it again is not filtered.
    confirmGone(new Set(['a', 'b']));
    expect(ids()).toEqual([]);
  });

  it('leave the set as it was when nothing changes, so nothing is drawn again for it', () => {
    hideEcho('a');
    const before = useRemovedEchoes.getState().ids;
    confirmGone(new Set(['a']));
    hideEcho('a');
    expect(useRemovedEchoes.getState().ids).toBe(before);
  });
});
