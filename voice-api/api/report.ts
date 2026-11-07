import { identityConfigured } from '../src/context.js';
import { createAccess, fail, json, logRoute } from '../src/guard.js';
import { isLensId } from '../src/lenses.js';
import { dayOf, nextDay } from '../src/meter.js';
import { storeFromEnv, StoreError } from '../src/store.js';

const MAX_BYTES = 1_024;
const WINDOW_MS = 10 * 60 * 1000;
/** Per install (or per address, for the shared token), per instance. */
const WINDOW_LIMIT = 10;
const access = createAccess(WINDOW_MS, WINDOW_LIMIT);
/** Per install, across every instance, in one UTC day. Far more than a person reports. */
export const REPORTS_PER_DAY = 30;
/** How long the day's counts are kept. */
const KEEP_DAYS = 400;

export const REASONS = ['harmful', 'wrong', 'upsetting', 'other'] as const;
type Reason = (typeof REASONS)[number];
const FIELDS = new Set(['reason', 'lens', 'model', 'appVersion']);
/**
 * What `model` and `appVersion` may be: a name or a version, never words. No spaces, so not even a
 * few words of a card or a quote can travel in them, and never longer than 64 characters.
 */
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

type Report = { reason: Reason; lens: string | null; model: string | null; appVersion: string | null };

/**
 * The report, or null for anything that is not exactly one: an object with no field but `reason`
 * (one of REASONS), `lens` (a lens id from src/lenses.ts, or null), `model` and `appVersion` (short
 * labels). A field it does not know, such as `text` or `quote`, refuses the whole report, so a card's
 * words can never be sent here, whatever a client puts in.
 */
export function parseReport(body: unknown): Report | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const fields = Object.keys(body);
  if (fields.some((field) => !FIELDS.has(field))) return null;
  const { reason, lens, model, appVersion } = body as Record<string, unknown>;
  if (typeof reason !== 'string' || !(REASONS as readonly string[]).includes(reason)) return null;
  if (lens !== undefined && lens !== null && !isLensId(lens)) return null;
  const label = (value: unknown) =>
    value === undefined || value === null ? null : typeof value === 'string' && LABEL.test(value) ? value : false;
  const modelLabel = label(model);
  const versionLabel = label(appVersion);
  if (modelLabel === false || versionLabel === false) return null;
  return { reason: reason as Reason, lens: (lens as string | null | undefined) ?? null, model: modelLabel, appVersion: versionLabel };
}

/**
 * `POST /api/report`, JSON `{ reason, lens, model, appVersion }` and an install token (or the shared
 * token while ECHO_LEGACY_TOKEN allows it). Google Play asks that a person can report what a model
 * wrote. A report says why and which lens, never what the card said: it is counted by day, reason and
 * lens, and logged in one line of those labels.
 */
export async function POST(request: Request) {
  const started = Date.now();
  if (!identityConfigured(process.env)) return fail(503, 'not_configured');
  const gate = access(request, process.env, started);
  if (!gate.ok) return gate.response;
  const { caller, tag } = gate.admitted;
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return fail(413, 'too_long');

  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BYTES) return fail(413, 'too_long');
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(400, 'bad_request');
    }
    const report = parseReport(body);
    if (!report) return fail(400, 'bad_request');

    const { store } = storeFromEnv();
    const day = dayOf(started);
    const dayEnd = Math.floor(nextDay(started) / 1000);
    if (caller.kind === 'install') {
      const counted = await store.spend([
        { key: `i:${caller.key}:reports:${day}`, amount: 1, limit: REPORTS_PER_DAY, expireAt: dayEnd + 86_400 },
      ]);
      if (!counted.ok) {
        logRoute('report', 429, started, undefined, { install: tag, refused: 'reports' });
        return fail(429, 'rate_limited', true, { 'retry-after': String(Math.max(1, dayEnd - Math.floor(started / 1000))) });
      }
    }
    await store.spend([
      {
        key: `rep:${day}:${report.reason}:${report.lens ?? 'none'}`,
        amount: 1,
        limit: null,
        expireAt: dayEnd + KEEP_DAYS * 86_400,
      },
    ]);
    // Labels only: the reason and the lens are from fixed lists, and the model a short name.
    console.log(
      JSON.stringify({
        route: 'report',
        status: 200,
        ms: Date.now() - started,
        ...(tag ? { install: tag } : {}),
        reason: report.reason,
        lens: report.lens ?? 'none',
        ...(report.model ? { model: report.model } : {}),
      }),
    );
    return json(200, { received: true });
  } catch (error) {
    if (error instanceof StoreError) {
      logRoute('report', 503, started, undefined, { install: tag });
      return fail(503, 'busy', true, { 'retry-after': '30' });
    }
    logRoute('report', 500, started, undefined, { install: tag });
    return fail(500, 'internal', true);
  }
}
