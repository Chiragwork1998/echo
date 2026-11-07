// The web harness has no store, so this stands in for RevenueCat with one fixed offering, and lets
// the visual harness put the paywall and You into each of their states from the address:
//
//   ?plus=free | plus | trial               what the store says about this person (default free)
//   ?paywall=loading | offline | unavailable | failed | cancelled
//   ?reading=used                           the free pattern reading has been made
//
// Metro takes billing.ts on a phone, so nothing here, prices included, is ever in a native bundle.
// The prices are examples in the shape Google Play formats them; a phone only ever shows the store's.
import type { Billing, Entitlement, Plan, PlansResult } from './types';
import { FREE } from './types';

const DAY = 24 * 60 * 60 * 1000;
/** The harness's fixed moment (features/journal/runtime.web.ts), so dates never drift in screenshots. */
const QA_NOW = new Date(2026, 10, 5, 9, 41).getTime();

function param(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

function harnessEntitlement(): Entitlement {
  const plus = param('plus');
  if (plus === 'trial') {
    return {
      status: 'plus',
      trial: true,
      expiresAt: QA_NOW + 7 * DAY,
      willRenew: true,
      managementURL: 'https://play.google.com/store/account/subscriptions',
      history: 'active',
    };
  }
  if (plus === 'plus') {
    return {
      status: 'plus',
      trial: false,
      expiresAt: QA_NOW + 365 * DAY,
      willRenew: true,
      managementURL: 'https://play.google.com/store/account/subscriptions',
      history: 'active',
    };
  }
  return FREE;
}

const PLANS: Plan[] = [
  { id: '$rc_annual', period: 'year', price: '₹1,999.00', trial: { unit: 'week', count: 1 } },
  { id: '$rc_monthly', period: 'month', price: '₹299.00', trial: null },
];

const never = <T>() => new Promise<T>(() => undefined);

export const billing: Billing = {
  off: null,
  needsAppUserID: false,
  seed: { readingUsed: param('reading') === 'used' },
  configure: () => undefined,
  listen: () => () => undefined,
  entitlement: async () => harnessEntitlement(),
  plans(): Promise<PlansResult> {
    const state = param('paywall');
    if (state === 'loading') return never();
    if (state === 'offline') return Promise.resolve({ kind: 'offline' });
    if (state === 'unavailable') return Promise.resolve({ kind: 'unavailable' });
    return Promise.resolve({ kind: 'plans', plans: PLANS });
  },
  async purchase() {
    const state = param('paywall');
    if (state === 'failed') return { kind: 'failed', reason: 'store_problem' };
    if (state === 'cancelled') return { kind: 'cancelled' };
    return {
      kind: 'bought',
      entitlement: { ...harnessEntitlement(), status: 'plus', trial: true, history: 'active' },
    };
  },
  restore: async () => ({ kind: 'nothing', entitlement: harnessEntitlement() }),
};
