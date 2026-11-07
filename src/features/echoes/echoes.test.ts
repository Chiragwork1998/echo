import type { EntrySummary } from '@/features/journal';

import { echoesCopy } from './echoesCopy';
import { byMonth } from './EchoesList';
import {
  entryMeta,
  entryPreview,
  entryTitle,
  isMorning,
  listMeta,
  marginDate,
  monthKey,
} from './entryFacts';
import { deriveEchoesView } from './useEchoes';
import { readerView } from './useEntryReader';

const row = (patch: Partial<EntrySummary> = {}): EntrySummary => ({
  id: 'a',
  status: 'committed',
  readable: true,
  title: 'The weight',
  preview: 'A longer preview of the words',
  mode: 'text',
  durationSeconds: 360,
  hasAudio: false,
  recovered: false,
  createdAt: 0,
  updatedAt: 0,
  localDay: '2026-11-05',
  ...patch,
});

const idle = { status: 'idle' as const, results: [], unreadable: 0 };

describe('entry labels', () => {
  it('names a voice-only echo and an unreadable one, never leaving a blank', () => {
    expect(entryTitle(row({ title: '', preview: '' }))).toBe(echoesCopy.voiceEcho);
    expect(entryTitle(row({ readable: false, title: '', preview: '' }))).toBe(
      echoesCopy.unreadable,
    );
  });

  it('gives an unreadable row a date only, and a readable one its length and mood', () => {
    expect(entryMeta(row({ readable: false }))).not.toContain('min');
    expect(entryMeta(row({ moodBefore: 'steady' }))).toMatch(/6 min · Mood: Steady$/);
  });

  it('hides a preview that only repeats the title', () => {
    expect(entryPreview(row({ title: 'Same words', preview: 'Same words and more' }))).toBe('');
    expect(entryPreview(row())).toBe('A longer preview of the words');
  });

  it('leads a morning echo with Morning, and says nothing more of an unreadable one', () => {
    expect(listMeta(row({ promptId: 'become', moodBefore: 'light' }))).toEqual({
      morning: true,
      rest: '6 min · Mood: Light',
    });
    expect(listMeta(row({ promptId: 'daily' }))).toEqual({ morning: false, rest: '6 min' });
    expect(listMeta(row({ readable: false, promptId: 'become' }))).toEqual({
      morning: false,
      rest: '',
    });
    expect(isMorning({ promptId: 'become' })).toBe(true);
    expect(isMorning({})).toBe(false);
  });

  it('gathers the archive under months, keeping the newest first', () => {
    const months = byMonth([
      row({ id: 'a', localDay: '2026-11-05' }),
      row({ id: 'b', localDay: '2026-11-01' }),
      row({ id: 'c', localDay: '2026-10-30' }),
    ]);
    expect(months.map((month) => month.rows.map((entry) => entry.id))).toEqual([['a', 'b'], ['c']]);
    expect(monthKey('2026-11-05')).toBe('2026-11');
    expect(marginDate('2026-11-05')?.day).toBe('5');
    expect(marginDate(undefined)).toBeNull();
  });
});

describe('deriveEchoesView', () => {
  it('shows loading, then the empty state, then the list', () => {
    expect(deriveEchoesView({ status: 'loading', data: null }, idle)).toEqual({ kind: 'loading' });
    expect(deriveEchoesView({ status: 'ready', data: [] }, idle)).toEqual({ kind: 'empty' });
    const view = deriveEchoesView({ status: 'ready', data: [row()] }, idle);
    expect(view).toMatchObject({ kind: 'list', stale: false });
  });

  it('keeps the list when a refresh fails, and says it may be out of date', () => {
    const view = deriveEchoesView({ status: 'error', data: [row()] }, idle);
    expect(view).toMatchObject({ kind: 'list', stale: true });
  });

  it('shows an error only when there is nothing to show', () => {
    expect(deriveEchoesView({ status: 'error', data: null }, idle)).toEqual({
      kind: 'error',
      searching: false,
    });
  });

  it('turns search into searching, results, no matches or an error', () => {
    const entries = { status: 'ready' as const, data: [row()] };
    expect(deriveEchoesView(entries, { ...idle, status: 'searching' })).toEqual({
      kind: 'searching',
    });
    expect(deriveEchoesView(entries, { ...idle, status: 'ready', unreadable: 2 })).toEqual({
      kind: 'no_matches',
      unreadable: 2,
    });
    expect(deriveEchoesView(entries, { ...idle, status: 'ready', results: [row()] })).toMatchObject(
      { kind: 'list' },
    );
    expect(deriveEchoesView(entries, { ...idle, status: 'error' })).toEqual({
      kind: 'error',
      searching: true,
    });
  });
});

describe('readerView', () => {
  it('treats unreadable as its own state, and not found as gone', () => {
    const fail = (code: string) => ({
      status: 'error' as const,
      data: null,
      error: { code, retryable: false } as never,
    });
    expect(readerView('a', fail('unreadable'))).toEqual({ kind: 'unreadable' });
    expect(readerView('a', fail('not_found'))).toEqual({ kind: 'gone' });
    expect(readerView('a', fail('read_failed'))).toEqual({ kind: 'error' });
    expect(readerView(null, { status: 'ready', data: null, error: null })).toEqual({
      kind: 'gone',
    });
    expect(readerView('a', { status: 'ready', data: null, error: null })).toEqual({
      kind: 'gone',
    });
  });
});
