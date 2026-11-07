import type { BillingOff } from './keys';

/** The RevenueCat entitlement that is ECHO Plus. Products in the dashboard are attached to it. */
export const ENTITLEMENT_ID = 'plus';

/**
 * What the store last said about this person's ECHO Plus. Nothing here is journal content: it is a
 * subscription state, kept on the phone so that an offline launch still knows it.
 */
export type Entitlement = {
  status: 'free' | 'plus';
  /** Plus, in its free trial. */
  trial: boolean;
  /** When the current period ends: the end of the trial, or the next renewal. Null if it never ends. */
  expiresAt: number | null;
  /** False once the person has cancelled: Plus then ends at expiresAt and nothing more is charged. */
  willRenew: boolean;
  /** Where the store manages this subscription. */
  managementURL: string | null;
  /** 'expired': had Plus once, and it has ended. */
  history: 'never' | 'active' | 'expired';
};

export const FREE: Entitlement = {
  status: 'free',
  trial: false,
  expiresAt: null,
  willRenew: false,
  managementURL: null,
  history: 'never',
};

export type PlanPeriod = 'year' | 'month';

/** A length of time as the store gives it, such as a free trial of 1 week. */
export type StorePeriod = { unit: 'day' | 'week' | 'month' | 'year'; count: number };

/** One plan as the store sells it. Every price is the store's own text, never ECHO's. */
export type Plan = {
  id: string;
  period: PlanPeriod;
  /** The price each period once any trial is over, formatted by the store, such as "₹1,999.00". */
  price: string;
  /** The free trial this person would get with this plan, or null. */
  trial: StorePeriod | null;
};

export type PlansResult =
  | { kind: 'plans'; plans: Plan[] }
  /** The store could not be reached. */
  | { kind: 'offline' }
  /** The store answered with nothing to sell, or billing does not work on this phone. */
  | { kind: 'unavailable' };

export type PurchaseFailure =
  | 'offline'
  | 'not_allowed'
  | 'store_problem'
  | 'not_available'
  | 'already_owned'
  /** The store took the purchase, but Plus did not arrive with it. */
  | 'not_granted'
  | 'unknown';

export type PurchaseResult =
  | { kind: 'bought'; entitlement: Entitlement }
  /** The person closed the store's sheet. Nothing to say. */
  | { kind: 'cancelled' }
  /** The store is waiting on the payment, such as cash or a bank transfer. */
  | { kind: 'pending' }
  | { kind: 'failed'; reason: PurchaseFailure };

export type RestoreResult =
  | { kind: 'restored'; entitlement: Entitlement }
  | { kind: 'nothing'; entitlement: Entitlement }
  | { kind: 'failed'; reason: 'offline' | 'unknown' };

/**
 * The few things ECHO asks of a store. billing.ts speaks to RevenueCat on a phone. billing.web.ts is
 * the visual harness's stand-in, which never reaches a native bundle.
 */
export type Billing = {
  /** Null when Plus can be sold here. Otherwise why not, and every Plus feature stays open. */
  off: BillingOff | null;
  /** RevenueCat must know whose purchases these are before anything else: the install id. */
  needsAppUserID: boolean;
  /** The web harness only: memory to start from, since the harness has no storage. */
  seed?: { readingUsed?: boolean };
  /** Once, with the install id as RevenueCat's app user id. */
  configure(appUserID: string): void;
  /** Called with every change the store reports. Returns the way to stop listening. */
  listen(onChange: (entitlement: Entitlement) => void): () => void;
  entitlement(): Promise<Entitlement>;
  plans(): Promise<PlansResult>;
  purchase(planId: string): Promise<PurchaseResult>;
  restore(): Promise<RestoreResult>;
};
