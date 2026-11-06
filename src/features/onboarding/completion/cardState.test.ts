import type { ReflectionOutcome } from '@/services/reflection';

import { cardView } from './cardState';

const ready = { status: 'ready', found: true } as const;
const view = (
  outcome: ReflectionOutcome,
  waited = false,
  entry: Parameters<typeof cardView>[0]['entry'] = ready,
) => cardView({ entry, outcome, waited });

describe('cardView', () => {
  it('treats offline as the finished state, not a failure', () => {
    expect(view({ status: 'offline' })).toEqual({ state: 'offline' });
  });

  it('shows the reflection when there is one', () => {
    expect(view({ status: 'complete', text: 'Held.' })).toEqual({
      state: 'success',
      text: 'Held.',
    });
  });

  it('shows the error card only for a reflection error', () => {
    expect(view({ status: 'error' })).toEqual({ state: 'error' });
  });

  it('keeps the saved card while a reflection is still on its way, until the wait is worth naming', () => {
    expect(view({ status: 'pending' }, false)).toEqual({ state: 'offline' });
    expect(view({ status: 'pending' }, true)).toEqual({ state: 'loading' });
  });

  it('stays quiet while the entry itself is still being read', () => {
    expect(view({ status: 'pending' }, true, { status: 'loading', found: false })).toEqual({
      state: 'offline',
    });
  });

  it('does not wait forever for a reflection of an entry that is not there', () => {
    expect(view({ status: 'pending' }, true, { status: 'ready', found: false })).toEqual({
      state: 'offline',
    });
  });

  it('says the words are saved when the entry cannot be read back', () => {
    expect(view({ status: 'pending' }, false, { status: 'error', found: false })).toEqual({
      state: 'error',
    });
  });

  it('keeps the entry it already has when a later read fails', () => {
    expect(view({ status: 'offline' }, false, { status: 'error', found: true })).toEqual({
      state: 'offline',
    });
  });
});
