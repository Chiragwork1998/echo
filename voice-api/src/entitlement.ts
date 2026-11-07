// Whether an install has ECHO Plus. The phone is never asked: it could say anything. RevenueCat is,
// through its REST API with ECHO's secret key, because a purchase is attached there to the install
// id (the app uses it as RevenueCat's app user id). The owner's own installs can be named in
// ECHO_PLUS_INSTALLS. Nothing here logs, and nothing about a purchase leaves this file but the plan.
//
// With no RevenueCat key configured, everyone has Plus, as the app treats everyone today, and the
// global guard is what limits spending. When RevenueCat cannot be asked, the answer is free: an
// outage costs a Plus subscriber some patience, and never costs ECHO an unlimited bill.
import type { QuotaStore } from './store.js';
import { installKey } from './token.js';

export type Plan = 'free' | 'plus';

export type Entitlement = {
  plan: Plan;
  /** Where the answer came from. 'cache' means RevenueCat said so within the last few minutes. */
  source: 'owner' | 'unconfigured' | 'revenuecat' | 'cache' | 'unavailable';
  /** When RevenueCat was asked, for an answer that came from it. */
  checkedAt: number;
};

const REVENUECAT = 'https://api.revenuecat.com/v1/subscribers';
export const ENTITLEMENT_ID = 'plus';
/** How long an answer from RevenueCat is kept, in seconds. */
export const CACHE_SECONDS = 10 * 60;
/** After an outage, how long before RevenueCat is asked again from this instance. */
const OUTAGE_MS = 30_000;
const TIMEOUT_MS = 4_000;

export type EntitlementConfig = {
  /** REVENUECAT_SECRET_KEY. Absent: everyone has Plus. */
  secretKey: string | undefined;
  /** ECHO_PLUS_INSTALLS, already split. */
  owners: ReadonlySet<string>;
  store: QuotaStore;
  fetch: typeof fetch;
  now: () => number;
};

export function ownersFrom(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

type Subscriber = {
  subscriber?: {
    entitlements?: Record<
      string,
      { expires_date?: string | null; grace_period_expires_date?: string | null } | undefined
    >;
  };
};

/** True when the 'plus' entitlement is active now: no end, or an end (or grace period) still to come. */
export function activeIn(body: unknown, nowMs: number): boolean {
  const plus = (body as Subscriber | null)?.subscriber?.entitlements?.[ENTITLEMENT_ID];
  if (!plus || typeof plus !== 'object') return false;
  const later = (date: string | null | undefined) =>
    typeof date === 'string' && Number.isFinite(Date.parse(date)) && Date.parse(date) > nowMs;
  return plus.expires_date === null || later(plus.expires_date) || later(plus.grace_period_expires_date);
}

/**
 * Makes the function a route asks. `fresh` skips the cache: a route asks again before it refuses a
 * free install, so a person who has just subscribed is not told their allowance is used.
 */
export function createEntitlements(config: EntitlementConfig) {
  /** Per instance: when RevenueCat last failed, so an outage is not asked about on every request. */
  let failedAt = Number.NEGATIVE_INFINITY;

  return async function entitlementOf(installId: string, fresh = false): Promise<Entitlement> {
    const now = config.now();
    if (config.owners.has(installId)) return { plan: 'plus', source: 'owner', checkedAt: now };
    if (!config.secretKey) return { plan: 'plus', source: 'unconfigured', checkedAt: now };

    const cacheKey = `ent:v1:${installKey(installId)}`;
    if (!fresh) {
      const cached = await config.store.getText(cacheKey).catch(() => null);
      const match = cached ? /^(free|plus):(\d+)$/.exec(cached) : null;
      if (match) return { plan: match[1] as Plan, source: 'cache', checkedAt: Number(match[2]) };
    }
    if (now - failedAt < OUTAGE_MS) return { plan: 'free', source: 'unavailable', checkedAt: now };

    let plan: Plan;
    try {
      const response = await config.fetch(`${REVENUECAT}/${encodeURIComponent(installId)}`, {
        headers: { Authorization: `Bearer ${config.secretKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error('revenuecat');
      plan = activeIn(await response.json(), now) ? 'plus' : 'free';
    } catch {
      failedAt = now;
      return { plan: 'free', source: 'unavailable', checkedAt: now };
    }
    await config.store.setText(cacheKey, `${plan}:${now}`, CACHE_SECONDS).catch(() => undefined);
    return { plan, source: 'revenuecat', checkedAt: now };
  };
}

export type EntitlementOf = ReturnType<typeof createEntitlements>;
