// What a request may spend, and the taking of it. Every request that costs money reserves what it
// will cost before anything is sent to OpenAI: the install's allowance for the feature, and the whole
// server's ceiling for the day. A request that does not fit is refused and has spent nothing. One
// that fits and then cannot be served gives back what it took.
//
// Plans and allowances are docs/PRODUCT_V1.md's ("ECHO Plus"). Months and days are UTC. Counters
// are keyed by the hashed install id (token.ts), the period and the feature, and hold milliseconds
// of audio or counts, never anything a person said.
import type { Entitlement, EntitlementOf, Plan } from './entitlement.js';
import type { Counter, QuotaStore } from './store.js';

export type Feature = 'voice' | 'patterns' | 'live-words' | 'tidy' | 'script';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Free: 60 minutes of voice into words a month, the first pattern reading, and no live words or tidy.
 * Plus: 20 hours a month (fair use), and caps no real practice comes near. `script` is the step that
 * writes Hindi in Roman script for words that never went through /api/transcribe.
 */
export const ALLOWANCES = {
  free: { voiceMs: 60 * MINUTE, readingsEver: 1, readingTries: 5, live: 0, tidy: 0, script: 300 },
  plus: { voiceMs: 20 * HOUR, readings: 30, readingTries: 60, live: 300, tidy: 1_500, script: 3_000 },
} as const;

/**
 * The whole server's ceilings for one UTC day, so a bug or an attack has a known cost. Set from env;
 * these defaults are for a closed test.
 */
export type Ceilings = { audioMs: number; calls: number };
export const DEFAULT_CEILINGS: Ceilings = { audioMs: 10 * HOUR, calls: 3_000 };

/**
 * A live session streams straight to OpenAI and is never heard here, so its length is unknown. For
 * the day's audio ceiling it counts as this much. It is not taken from anyone's allowance.
 */
export const LIVE_GUARD_MS = 5 * MINUTE;

const positive = (value: string | undefined) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
};

/** ECHO_DAILY_AUDIO_SECONDS and ECHO_DAILY_MODEL_CALLS, or the defaults. */
export function ceilingsFrom(env: NodeJS.ProcessEnv): Ceilings {
  const seconds = positive(env.ECHO_DAILY_AUDIO_SECONDS);
  return {
    audioMs: seconds === null ? DEFAULT_CEILINGS.audioMs : seconds * 1000,
    calls: positive(env.ECHO_DAILY_MODEL_CALLS) ?? DEFAULT_CEILINGS.calls,
  };
}

// ---------------------------------------------------------------------------------------------
// Periods

const pad = (value: number) => String(value).padStart(2, '0');
export const monthOf = (now: number) => {
  const date = new Date(now);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
};
export const dayOf = (now: number) => `${monthOf(now)}-${pad(new Date(now).getUTCDate())}`;
/** The first moment of the next UTC month, in ms. */
export const nextMonth = (now: number) => {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
};
/** The first moment of the next UTC day, in ms. */
export const nextDay = (now: number) => {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
};
/** Kept a while past the end of its period, so a request that ran across midnight can still give back. */
const expiry = (endMs: number, graceDays: number) => Math.floor(endMs / 1000) + graceDays * 86_400;

// ---------------------------------------------------------------------------------------------
// What a request takes

type Role = 'use' | 'try' | 'guard';
type Taken = Counter & { role: Role; resetsAt: string | null };

export type Caller =
  | { kind: 'install'; installId: string; key: string }
  /** The shared app token alone, from builds made before install tokens. Only the global guard applies. */
  | { kind: 'legacy' };

/** The counters an install's request takes for a feature, or null when the plan does not have it. */
export function installCounters(
  feature: Feature,
  plan: Plan,
  key: string,
  amount: number,
  now: number,
): Taken[] | null {
  const month = monthOf(now);
  const end = nextMonth(now);
  const monthly = (name: string, limit: number | null, role: Role = 'use'): Taken => ({
    key: `i:${key}:${name}:${month}`,
    amount,
    limit,
    expireAt: expiry(end, 7),
    role,
    resetsAt: new Date(end).toISOString(),
  });
  const ever = (name: string, limit: number | null): Taken => ({
    key: `i:${key}:${name}:ever`,
    amount,
    limit,
    expireAt: null,
    role: 'use',
    resetsAt: null,
  });
  const allowance = ALLOWANCES[plan];
  switch (feature) {
    case 'voice':
      return [monthly('voice', allowance.voiceMs)];
    case 'patterns':
      // Every reading counts towards the first free one, so a lapsed subscription does not bring it back.
      return plan === 'free'
        ? [ever('readings', ALLOWANCES.free.readingsEver), monthly('reading-tries', ALLOWANCES.free.readingTries, 'try')]
        : [
            monthly('readings', ALLOWANCES.plus.readings),
            monthly('reading-tries', ALLOWANCES.plus.readingTries, 'try'),
            ever('readings', null),
          ];
    case 'live-words':
      return allowance.live > 0 ? [monthly('live', allowance.live)] : null;
    case 'tidy':
      return allowance.tidy > 0 ? [monthly('tidy', allowance.tidy)] : null;
    case 'script':
      return [monthly('script', allowance.script)];
  }
}

/** The server's own counters for the day. A part with nothing to add is left out. */
export function guardCounters(ceilings: Ceilings, use: { audioMs?: number; calls?: number }, now: number): Taken[] {
  const day = dayOf(now);
  const end = nextDay(now);
  const guard = (name: string, amount: number, limit: number): Taken => ({
    key: `g:${name}:${day}`,
    amount,
    limit,
    expireAt: expiry(end, 2),
    role: 'guard',
    resetsAt: new Date(end).toISOString(),
  });
  const counters: Taken[] = [];
  if ((use.audioMs ?? 0) > 0) counters.push(guard('audio', use.audioMs!, ceilings.audioMs));
  if ((use.calls ?? 0) > 0) counters.push(guard('calls', use.calls!, ceilings.calls));
  return counters;
}

// ---------------------------------------------------------------------------------------------
// Refusals

export type Refusal =
  | {
      status: 402;
      body: { error: 'allowance_used'; feature: Feature; plan: Plan; resetsAt: string | null };
    }
  | { status: 503; body: { error: 'busy'; retryAfter: number } };

/** The reply for a refusal. `code` and `retryable` are kept for builds that read the older shape. */
export function refusalResponse(refusal: Refusal): Response {
  const retryable = refusal.status === 503;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  };
  if (refusal.status === 503) headers['retry-after'] = String(refusal.body.retryAfter);
  return new Response(
    JSON.stringify({ ...refusal.body, code: refusal.body.error, retryable }),
    { status: refusal.status, headers },
  );
}

// ---------------------------------------------------------------------------------------------
// Holding what was taken

/**
 * What one request holds. Each part can be given back once, and no more than was taken. Model calls
 * are reserved at the most a request can make and settled at what it made, so the day's ceiling is
 * checked before any call and is right afterwards.
 */
export class Held {
  private readonly held: Taken[];
  constructor(
    private readonly store: QuotaStore,
    taken: Taken[],
  ) {
    this.held = taken.map((counter) => ({ ...counter }));
  }

  /** Gives back the parts with these roles (every part by default). Never throws. */
  async refund(roles: readonly Role[] = ['use', 'try', 'guard']): Promise<void> {
    const back = this.held.filter((counter) => roles.includes(counter.role) && counter.amount > 0);
    if (back.length === 0) return;
    const given = back.map((counter) => ({ ...counter }));
    for (const counter of back) counter.amount = 0;
    await this.store.refund(given).catch(() => undefined);
  }

  /** The day's model calls, settled at what was really made. More than reserved is added without a limit. */
  async settleCalls(made: number): Promise<void> {
    const calls = this.held.find((counter) => counter.role === 'guard' && counter.key.startsWith('g:calls:'));
    if (!calls) return;
    const extra = made - calls.amount;
    if (extra < 0) {
      await this.store.refund([{ ...calls, amount: -extra }]).catch(() => undefined);
      calls.amount = made;
    } else if (extra > 0) {
      await this.store.spend([{ ...calls, amount: extra, limit: null }]).catch(() => undefined);
      calls.amount = made;
    }
  }
}

export type Metered =
  | { ok: true; plan: Plan | 'legacy'; held: Held }
  | { ok: false; refusal: Refusal; plan: Plan | 'legacy' };

export type MeterContext = {
  store: QuotaStore;
  entitlementOf: EntitlementOf;
  ceilings: Ceilings;
  now: () => number;
};

/** An answer from the cache this old is checked again before a free install is refused. */
const RECHECK_MS = 15_000;

const notInPlan = (feature: Feature, plan: Plan): Refusal => ({
  status: 402,
  body: { error: 'allowance_used', feature, plan, resetsAt: null },
});

async function take(
  store: QuotaStore,
  install: Taken[],
  guard: Taken[],
  feature: Feature | null,
  plan: Plan | 'legacy',
  now: number,
): Promise<Metered> {
  const all = [...install, ...guard];
  const spent = await store.spend(all);
  if (spent.ok) return { ok: true, plan, held: new Held(store, all) };
  const failed = all[spent.index]!;
  if (failed.role === 'guard' || feature === null || plan === 'legacy') {
    const retryAfter = Math.max(1, Math.ceil((nextDay(now) - now) / 1000));
    return { ok: false, plan, refusal: { status: 503, body: { error: 'busy', retryAfter } } };
  }
  return {
    ok: false,
    plan,
    refusal: { status: 402, body: { error: 'allowance_used', feature, plan, resetsAt: failed.resetsAt } },
  };
}

/**
 * Reserves what a request will cost. `feature` and `amount` are what it takes from the install's
 * allowance (milliseconds for voice, otherwise one), and `guard` what it takes from the day's
 * ceilings. Throws StoreError when the store cannot be reached: the route then refuses as busy.
 */
export async function meter(
  context: MeterContext,
  caller: Caller,
  feature: Feature | null,
  amount: number,
  guard: { audioMs?: number; calls?: number },
): Promise<Metered> {
  const now = context.now();
  const guarded = guardCounters(context.ceilings, guard, now);
  if (caller.kind === 'legacy' || feature === null) {
    return take(context.store, [], guarded, feature, 'legacy', now);
  }

  const attempt = async (entitlement: Entitlement): Promise<Metered> => {
    const install = installCounters(feature, entitlement.plan, caller.key, amount, now);
    if (!install) return { ok: false, plan: entitlement.plan, refusal: notInPlan(feature, entitlement.plan) };
    return take(context.store, install, guarded, feature, entitlement.plan, now);
  };

  const entitlement = await context.entitlementOf(caller.installId);
  const first = await attempt(entitlement);
  // Before a free install is told its allowance is used, RevenueCat is asked again, unless it was
  // asked a moment ago: someone who has just subscribed is not turned away by a cached answer.
  if (
    !first.ok &&
    first.refusal.status === 402 &&
    entitlement.plan === 'free' &&
    entitlement.source === 'cache' &&
    now - entitlement.checkedAt > RECHECK_MS
  ) {
    const fresh = await context.entitlementOf(caller.installId, true);
    if (fresh.plan === 'plus') return attempt(fresh);
  }
  return first;
}

/** What an install has used of its voice allowance this month, for /api/allowance. */
export async function voiceUsage(context: MeterContext, caller: Caller) {
  if (caller.kind === 'legacy') return { plan: 'legacy' as const, voice: null };
  const now = context.now();
  const { plan } = await context.entitlementOf(caller.installId);
  const [counter] = installCounters('voice', plan, caller.key, 0, now)!;
  const [used = 0] = await context.store.read([counter!.key]);
  return {
    plan,
    voice: {
      usedSeconds: Math.ceil(Math.max(0, used) / 1000),
      limitSeconds: Math.floor(counter!.limit! / 1000),
      resetsAt: counter!.resetsAt,
    },
  };
}
