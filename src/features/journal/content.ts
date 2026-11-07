import type { Entry, EntryContent, EntrySummary, SearchResults } from './types';

const SESSION_SECONDS = 7 * 60;
const MIN_CHARACTERS = 10;
const MIN_AUDIO_SECONDS = 3;
const TITLE_LENGTH = 60;
const PREVIEW_LENGTH = 140;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const emptyContent = (seed: Partial<EntryContent> = {}): EntryContent => ({
  body: '',
  mode: 'text',
  durationSeconds: 0,
  ...seed,
});

export const hasContent = (content: EntryContent, hasAudio: boolean) =>
  hasAudio || content.body.trim().length > 0;

/** First Echo enables Reflect at 10 non-space characters or 3 seconds of audio. */
export function canReflect(content: EntryContent, audio?: Entry['audio']): boolean {
  if (content.body.replace(/\s/g, '').length >= MIN_CHARACTERS) return true;
  if (!audio) return false;
  return audio.recovered || (audio.durationSeconds ?? 0) >= MIN_AUDIO_SECONDS;
}

export const minutesLeft = (durationSeconds: number) =>
  Math.ceil(Math.max(0, SESSION_SECONDS - durationSeconds) / 60);

/**
 * The words of `text` that fit in `limit` characters, ending on a whole word, with an ellipsis when
 * anything was left out. A word too long to break at is cut where it must be. Runs on decrypted
 * text in memory only.
 */
export function cutAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit + 1);
  const space = head.search(/\s\S*$/);
  const words = space > limit / 2 ? head.slice(0, space) : text.slice(0, limit);
  return `${words.replace(/[\s,;:.!?\-–—]+$/u, '')}…`;
}

function firstLine(body: string): string {
  const line =
    body
      .split('\n')
      .map((text) => text.trim())
      .find(Boolean) ?? '';
  return cutAtWord(line, TITLE_LENGTH);
}

function previewOf(body: string): string {
  return cutAtWord(body.replace(/\s+/g, ' ').trim(), PREVIEW_LENGTH);
}

export const toSummary = (entry: Entry): EntrySummary => ({
  id: entry.id,
  status: entry.status,
  readable: true,
  title: entry.title?.trim() || firstLine(entry.body),
  preview: previewOf(entry.body),
  moodBefore: entry.moodBefore,
  promptId: entry.promptId,
  mode: entry.mode,
  durationSeconds: entry.durationSeconds,
  hasAudio: entry.audio !== undefined,
  recovered: entry.audio?.recovered ?? false,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  committedAt: entry.committedAt,
  localDay: entry.localDay,
});

type RowFacts = Pick<
  Entry,
  'id' | 'status' | 'createdAt' | 'updatedAt' | 'committedAt' | 'localDay'
>;

export const unreadableSummary = (row: RowFacts): EntrySummary => ({
  ...row,
  readable: false,
  title: '',
  preview: '',
  mode: 'text',
  durationSeconds: 0,
  hasAudio: false,
  recovered: false,
});

const fold = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** The ways someone might type a date: 2026-11-06, november 6, nov 2026, friday. */
function dateText(localDay: string): string {
  const [year, month, day] = localDay.split('-').map(Number);
  if (!year || !month || !day) return localDay;
  const name = MONTHS[month - 1] ?? '';
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
  const short = name.slice(0, 3);
  return `${localDay} ${name} ${day} ${short} ${day} ${day} ${name} ${year} ${weekday}`;
}

/** Runs on decrypted text in memory. Nothing here is indexed or written anywhere. */
export function matchesQuery(entry: Entry, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return false;
  const haystack = fold(
    [entry.title ?? '', entry.body, entry.localDay ? dateText(entry.localDay) : ''].join('\n'),
  );
  return terms.every((term) => haystack.includes(term));
}

export function searchIn(
  entries: Entry[],
  query: string,
  unreadable: number,
  isCancelled?: () => boolean,
): SearchResults {
  const results: EntrySummary[] = [];
  for (const entry of entries) {
    if (isCancelled?.()) break;
    if (matchesQuery(entry, query)) results.push(toSummary(entry));
  }
  return { results, unreadable };
}
