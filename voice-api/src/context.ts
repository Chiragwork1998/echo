// What the routes share for counting: the store, the plan lookup, the day's ceilings, and a fetch
// that counts the model calls a request really made.
import { createEntitlements, ownersFrom, type EntitlementOf } from './entitlement.js';
import { ceilingsFrom, type MeterContext } from './meter.js';
import { storeFromEnv, type QuotaStore } from './store.js';

let cached: { store: QuotaStore; secret: string | undefined; owners: string | undefined; of: EntitlementOf } | null =
  null;

/** One plan lookup per instance and store, so an outage remembered by it holds across requests. */
function entitlementsFor(env: NodeJS.ProcessEnv, store: QuotaStore): EntitlementOf {
  const secret = env.REVENUECAT_SECRET_KEY?.trim() || undefined;
  const owners = env.ECHO_PLUS_INSTALLS;
  if (cached && cached.store === store && cached.secret === secret && cached.owners === owners) return cached.of;
  const of = createEntitlements({
    secretKey: secret,
    owners: ownersFrom(owners),
    store,
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
  });
  cached = { store, secret, owners, of };
  return of;
}

export function meterContext(env: NodeJS.ProcessEnv = process.env): MeterContext {
  const { store } = storeFromEnv(env);
  return { store, entitlementOf: entitlementsFor(env, store), ceilings: ceilingsFrom(env), now: () => Date.now() };
}

/**
 * A fetch that counts what it sends. Each route hands it to the code that calls OpenAI, so the day's
 * count of model calls is what was really made, retries included.
 */
export function countingFetch() {
  let made = 0;
  const counted = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    made += 1;
    return fetch(input, init);
  }) as typeof fetch;
  return { fetch: counted, made: () => made };
}

/** The server can say who someone is: a shared app token for /api/install, or a secret to check tokens. */
export const identityConfigured = (env: NodeJS.ProcessEnv) =>
  Boolean(env.ECHO_VOICE_TOKEN || env.ECHO_INSTALL_SECRET);
