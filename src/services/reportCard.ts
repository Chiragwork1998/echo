// Reporting a pattern card (docs/PRODUCT_V1.md, See; Google Play's AI content policy). A report says
// why, which lens the card used, which model wrote it, and this app's version. It never carries the
// card's words, a quote, or anything the person wrote, and nothing here is logged.
//
// It goes to POST /api/report on the voice server (voice-api/api/report.ts), which refuses any field
// but these four. When the server cannot take it now (no connection, a server that does not answer or
// is busy, or one without the report route yet) the report is kept on this phone, sealed like the
// cards themselves, and sent the next time Patterns opens, once and only once.

import { getRuntime } from '@/storage/runtime';

import { installTokens, withInstallToken, type InstallTokens } from './install';
import { authHeaders, installRefused, refusalOf, voiceApi } from './voiceApi';

/** Why a person reports a card. The server takes exactly these. */
export const REPORT_REASONS = ['harmful', 'wrong', 'upsetting', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Everything a report says. Four labels, and nothing else can ride along. */
export type CardReport = {
  reason: ReportReason;
  /** The lens id from the server's list, such as 'siegel_naming', or null. */
  lens: string | null;
  /** The model that wrote the card, when the server named it, or null. */
  model: string | null;
  appVersion: string | null;
};

/** As the server accepts them: a name or a version, with no spaces, so words cannot travel in one. */
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const LENS_ID = /^[a-z][a-z0-9_]{0,63}$/;
const TIMEOUT_MS = 15_000;
/** Far more than a person would ever leave waiting. The oldest go first. */
const MOST_KEPT = 20;

const label = (value: string | null | undefined) => (value && LABEL.test(value) ? value : null);
const isReason = (value: unknown): value is ReportReason =>
  typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);

/** A report built from four values. Anything that is not a label becomes null. */
export function cardReport(input: {
  reason: ReportReason;
  lens?: string | null;
  model?: string | null;
  appVersion?: string | null;
}): CardReport {
  return {
    reason: input.reason,
    lens: input.lens && LENS_ID.test(input.lens) ? input.lens : null,
    model: label(input.model),
    appVersion: label(input.appVersion),
  };
}

/** The body as sent, written out field by field. */
export const reportBody = (report: CardReport): string =>
  JSON.stringify({
    reason: report.reason,
    lens: report.lens,
    model: report.model,
    appVersion: report.appVersion,
  });

/**
 * What one attempt came to. Worth another try later: `offline` (the phone says it has no
 * connection), `unreachable` (the request did not get through, and the phone has a connection or
 * cannot say), `busy` (429 or 5xx), and `missing` (404: a server without the report route yet). Not
 * worth one: `refused` (the server would not take it) and `unavailable` (this build has no server).
 */
export type SendOutcome =
  'sent' | 'offline' | 'unreachable' | 'busy' | 'missing' | 'refused' | 'unavailable';

const outcomeOf = (status: number): SendOutcome =>
  status >= 200 && status < 300
    ? 'sent'
    : status === 404
      ? 'missing'
      : status === 429 || status >= 500
        ? 'busy'
        : 'refused';

const LATER: readonly SendOutcome[] = ['offline', 'unreachable', 'busy', 'missing'];
const later = (outcome: SendOutcome) => LATER.includes(outcome);

/**
 * Whether the phone has a connection: false only when the phone itself says it has none, and null
 * when it cannot say. The same rule as a recording's (src/services/transcription.ts): a person is
 * never told to check a connection that is fine.
 */
export async function phoneOnline(): Promise<boolean | null> {
  try {
    // Required here so that importing this file stays free of native modules in tests and on web.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const network = require('expo-network') as typeof import('expo-network');
    const state = await network.getNetworkStateAsync();
    return state.isConnected === false || state.isInternetReachable === false ? false : true;
  } catch {
    return null;
  }
}

type Online = () => Promise<boolean | null>;

/** One report, once, with this install's token and the shared one. Nothing throws. */
export async function sendReport(
  report: CardReport,
  send: typeof fetch = fetch,
  tokens: InstallTokens = installTokens,
  online: Online = phoneOnline,
): Promise<SendOutcome> {
  const api = voiceApi();
  if (!api) return 'unavailable';
  const once = async (installToken: string | null) => {
    // Not AbortSignal.timeout: Hermes does not reliably have it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await send(`${api.url}/api/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(api, installToken) },
          body: reportBody(report),
          signal: controller.signal,
        });
      } catch {
        const connected = await online().catch(() => null);
        const outcome: SendOutcome = connected === false ? 'offline' : 'unreachable';
        return { outcome, refusedInstall: false };
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      return {
        outcome: outcomeOf(response.status),
        refusedInstall: installRefused(response.status, refusalOf(body)),
      };
    } finally {
      clearTimeout(timer);
    }
  };
  const { outcome } = await withInstallToken(
    api,
    once,
    (attempt) => attempt.refusedInstall,
    tokens,
  );
  return outcome;
}

/** Where reports wait while the server cannot be reached. */
export type ReportShelf = {
  /** null when the shelf cannot be read at all. */
  load: () => Promise<CardReport[] | null>;
  save: (reports: CardReport[]) => Promise<boolean>;
};

const ROW = 'pattern-reports';
const OBJECT_ID = 'reports';

function fromShelf(raw: unknown): CardReport | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { reason, lens, model, appVersion } = raw as Record<string, unknown>;
  if (!isReason(reason)) return null;
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return cardReport({ reason, lens: text(lens), model: text(model), appVersion: text(appVersion) });
}

/**
 * Sealed in the database like the cards (src/features/patterns/readingStore.ts): one AES-256-GCM
 * object, bound to its kind and id. "Delete everything" takes it with the key. On the web preview
 * there is no storage, so nothing waits there.
 */
export const sealedShelf: ReportShelf = {
  load: async () => {
    try {
      const rt = await getRuntime();
      const row = await rt.db.first<{ sealed: Uint8Array }>(
        'SELECT sealed FROM sealed_kv WHERE key = ?',
        [ROW],
      );
      if (!row) return [];
      const kept = await rt.vault.openJson<unknown>('patterns', OBJECT_ID, row.sealed);
      return Array.isArray(kept)
        ? kept.flatMap((item) => {
            const report = fromShelf(item);
            return report ? [report] : [];
          })
        : [];
    } catch {
      return null;
    }
  },
  save: async (reports) => {
    try {
      const rt = await getRuntime();
      if (reports.length === 0) {
        await rt.serial(() => rt.db.run('DELETE FROM sealed_kv WHERE key = ?', [ROW]));
        return true;
      }
      const sealed = await rt.vault.sealJson('patterns', OBJECT_ID, reports);
      await rt.serial(() =>
        rt.db.run(
          `INSERT INTO sealed_kv (key, sealed, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET sealed = excluded.sealed, updated_at = excluded.updated_at`,
          [ROW, sealed, rt.now()],
        ),
      );
      return true;
    } catch {
      return false;
    }
  },
};

export type ReportDeps = {
  send?: typeof fetch;
  tokens?: InstallTokens;
  shelf?: ReportShelf;
  online?: Online;
};

// Keeping and sending what waits take turns, so a report kept during a send is never lost.
let turn: Promise<unknown> = Promise.resolve();
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const next = turn.then(task, task);
  turn = next.catch(() => undefined);
  return next;
}

/**
 * Sent: the server has it. Kept: ECHO could not take it now, and it waits on this phone to be sent
 * the next time Patterns opens. Offline: kept in the same way, because the phone has no connection.
 * Failed: it was not sent and is not waiting.
 */
export type ReportResult = 'sent' | 'kept' | 'offline' | 'failed';

/** Sends a report now, or keeps it for later when the server cannot take it now. */
export async function reportCard(
  report: CardReport,
  {
    send = fetch,
    tokens = installTokens,
    shelf = sealedShelf,
    online = phoneOnline,
  }: ReportDeps = {},
): Promise<ReportResult> {
  const outcome = await sendReport(report, send, tokens, online);
  if (outcome === 'sent') {
    void sendWaitingReports({ send, tokens, shelf, online });
    return 'sent';
  }
  if (!later(outcome)) return 'failed';
  const kept = await inTurn(async () => {
    const waiting = await shelf.load();
    if (waiting === null) return false;
    return shelf.save([...waiting, report].slice(-MOST_KEPT));
  });
  if (!kept) return 'failed';
  return outcome === 'offline' ? 'offline' : 'kept';
}

/**
 * Sends whatever waits, oldest first, and stops at the first that still cannot go. Each one is let
 * go of the moment it has gone, before the next is tried, so a report the server has is never sent
 * again, even when ECHO is closed partway. Ones the server refuses are let go too: sending them
 * again would be refused again.
 */
export function sendWaitingReports({
  send = fetch,
  tokens = installTokens,
  shelf = sealedShelf,
  online = phoneOnline,
}: ReportDeps = {}): Promise<void> {
  return inTurn(async () => {
    let waiting = await shelf.load();
    while (waiting && waiting.length > 0) {
      const [report, ...rest] = waiting;
      if (!report || later(await sendReport(report, send, tokens, online))) return;
      // A shelf that cannot be written stops this here, so that only the one just sent, still on
      // it, could ever go a second time.
      if (!(await shelf.save(rest))) return;
      waiting = rest;
    }
  });
}
