import type { EntrySummary } from '@/features/journal';

import { dayLabel, entryDisplay, homeLabels, minutesOf } from './homeLabels';

const summary = (patch: Partial<EntrySummary>): EntrySummary => ({
  id: 'a',
  status: 'committed',
  readable: true,
  title: '',
  preview: '',
  mode: 'text',
  durationSeconds: 360,
  hasAudio: false,
  recovered: false,
  createdAt: 0,
  updatedAt: 0,
  ...patch,
});

describe('dayLabel', () => {
  it('counts calendar days, not 24 hour blocks', () => {
    expect(dayLabel('2026-11-05', '2026-11-05')).toBe('Today');
    expect(dayLabel('2026-11-04', '2026-11-05')).toBe(homeLabels.yesterday);
    // Across the end of daylight saving time, 3 days is still 3 days.
    expect(dayLabel('2026-10-31', '2026-11-03')).toBe(homeLabels.daysAgo(3));
  });

  it('falls back to a short date for older entries and to today when unknown', () => {
    expect(dayLabel('2026-09-01', '2026-11-05')).toMatch(/Sep/);
    expect(dayLabel(undefined, '2026-11-05')).toBe('Today');
  });
});

describe('entryDisplay', () => {
  it('shows an unreadable entry as unopenable', () => {
    expect(entryDisplay(summary({ readable: false }))).toMatchObject({
      title: homeLabels.unreadable,
      openable: false,
    });
  });

  it('names a voice-only entry by its kind, and uses the preview when there is no title', () => {
    expect(entryDisplay(summary({ mode: 'voice' }))).toMatchObject({
      title: homeLabels.voiceEcho,
      voiceOnly: true,
    });
    expect(entryDisplay(summary({ preview: 'Some words' }))).toMatchObject({
      title: 'Some words',
      preview: '',
    });
  });

  it('keeps title and preview apart when both exist', () => {
    expect(entryDisplay(summary({ title: 'T', preview: 'P' }))).toMatchObject({
      title: 'T',
      preview: 'P',
      openable: true,
    });
  });
});

it('rounds a duration to whole minutes, never below one', () => {
  expect(minutesOf(10)).toBe(1);
  expect(minutesOf(360)).toBe(6);
  expect(minutesOf(400)).toBe(7);
});
