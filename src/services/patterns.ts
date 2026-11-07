import { installTokens, withInstallToken, type InstallTokens } from './install';
import { authHeaders, installRefused, refusalOf, voiceApi } from './voiceApi';

/** The most entries one reading sends, newest first. Said plainly in the consent. */
export const PATTERNS_SEND_LIMIT = 30;
/** The most of one entry that is sent. */
export const PATTERNS_ENTRY_CHARS = 6000;

const TIMEOUT_MS = 110_000;

export type PatternCard = {
  name: string;
  noticed: string;
  /** Exact words from the person's own entries, checked by the server. */
  evidence: { quote: string; date: string }[];
  /**
   * One way of seeing it, credited by name in `source`. `id` names the lens in the server's list
   * (voice-api/src/lenses.ts), so that a report of the card can say which it was.
   */
  lens: { id?: string; text: string; source: string };
  practice: string;
  question: string;
};

/** A lens id or a model name, as the server sends them: a short label, never words. */
const LENS_ID = /^[a-z][a-z0-9_]{0,63}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

/** One entry as sent: its day and what was written. Nothing else leaves the phone. */
export type SentEntry = { date: string; text: string };

export type ReadFailure =
  /** The server address is not set, or is not https. */
  | 'not_configured'
  /** No connection, or the server could not be reached. */
  | 'offline'
  /** Too many readings in a short while. */
  | 'busy'
  /** The free reading has been used. ECHO Plus reads whenever asked. */
  | 'allowance_used'
  /** ECHO Plus's readings for the month are used. More come next month. */
  | 'reading_cap'
  | 'failed';

export type ReadResult =
  /** `model` is the model that wrote the cards, when the server says. */
  | { status: 'cards'; cards: PatternCard[]; entriesRead: number; model?: string }
  /** Nothing recurred clearly enough to name. */
  | { status: 'none'; entriesRead: number }
  /** Language the app answers with care instead of cards. No cards are made. */
  | { status: 'support' }
  | { status: 'error'; code: ReadFailure; retryable: boolean };

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** Trusts nothing: a card is shown only if every part of it is the shape we expect. */
export function parseCard(raw: unknown): PatternCard | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const card = raw as Record<string, unknown>;
  const lens = card.lens as Record<string, unknown> | undefined;
  if (!Array.isArray(card.evidence) || typeof lens !== 'object' || lens === null) return null;
  const evidence = card.evidence.flatMap((item): { quote: string; date: string }[] => {
    const { quote, date } = (item ?? {}) as Record<string, unknown>;
    return isText(quote) && isText(date) ? [{ quote, date }] : [];
  });
  if (
    !isText(card.name) ||
    !isText(card.noticed) ||
    !isText(card.practice) ||
    !isText(card.question) ||
    !isText(lens.text) ||
    !isText(lens.source) ||
    evidence.length === 0
  ) {
    return null;
  }
  const id = typeof lens.id === 'string' && LENS_ID.test(lens.id) ? lens.id : undefined;
  return {
    name: card.name,
    noticed: card.noticed,
    evidence: evidence.slice(0, 2),
    lens: { ...(id ? { id } : {}), text: lens.text, source: lens.source },
    practice: card.practice,
    question: card.question,
  };
}

export function parseReading(body: unknown): ReadResult | null {
  if (typeof body !== 'object' || body === null) return null;
  const { status, cards, entriesRead, model } = body as Record<string, unknown>;
  const read = typeof entriesRead === 'number' ? entriesRead : 0;
  if (status === 'support') return { status: 'support' };
  if (status === 'none') return { status: 'none', entriesRead: read };
  if (status === 'cards' && Array.isArray(cards)) {
    const parsed = cards.flatMap((card) => {
      const one = parseCard(card);
      return one ? [one] : [];
    });
    const named = typeof model === 'string' && MODEL.test(model) ? { model } : {};
    return parsed.length > 0
      ? { status: 'cards', cards: parsed.slice(0, 3), entriesRead: read, ...named }
      : { status: 'none', entriesRead: read };
  }
  return null;
}

/**
 * Sends entries, already decrypted on this phone, to ECHO's server over https, to be read. Nothing
 * throws, and nothing here is logged: the entries and the cards are the person's own words.
 */
export async function readPatternCards(
  entries: readonly SentEntry[],
  send: typeof fetch = fetch,
  tokens: InstallTokens = installTokens,
): Promise<ReadResult> {
  const api = voiceApi();
  if (!api) return { status: 'error', code: 'not_configured', retryable: false };

  const once = async (installToken: string | null) => {
    // Not AbortSignal.timeout: Hermes does not reliably have it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await send(`${api.url}/api/patterns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(api, installToken) },
          body: JSON.stringify({ entries }),
          signal: controller.signal,
        });
      } catch {
        return { result: offline, refusedInstall: false };
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      return {
        result: readingFrom(response.status, body),
        refusedInstall: installRefused(response.status, refusalOf(body)),
      };
    } finally {
      clearTimeout(timer);
    }
  };
  const { result } = await withInstallToken(api, once, (attempt) => attempt.refusedInstall, tokens);
  return result;
}

const offline: ReadResult = { status: 'error', code: 'offline', retryable: true };

/** What a reply means for the person. A refusal is named for what it was; nothing here throws. */
function readingFrom(status: number, body: unknown): ReadResult {
  if (status === 429) return { status: 'error', code: 'busy', retryable: true };
  if (status === 402 && refusalOf(body).error === 'allowance_used') {
    const code = refusalOf(body).plan === 'plus' ? 'reading_cap' : 'allowance_used';
    return { status: 'error', code, retryable: false };
  }
  if (status < 200 || status >= 300) {
    return { status: 'error', code: 'failed', retryable: status >= 500 };
  }
  if (body === undefined) return { status: 'error', code: 'failed', retryable: true };
  return parseReading(body) ?? { status: 'error', code: 'failed', retryable: true };
}
