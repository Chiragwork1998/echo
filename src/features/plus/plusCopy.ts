import { Platform } from 'react-native';

import type { PlanPeriod, PurchaseFailure, StorePeriod } from '@/services/plus/types';

/**
 * WORKING COPY. The paywall's words are the lead's, from docs/PRODUCT_V1.md (ECHO Plus), verbatim.
 * The rest (plan names, states, errors, You's rows) is written to match, and the owner approves or
 * replaces it. No price is ever written here: every price is the store's own text.
 *
 * The store is Google Play; the same words name the App Store when iOS ships.
 */
const ios = Platform.OS === 'ios';
const store = ios ? 'the App Store' : 'Google Play';
const Store = ios ? 'The App Store' : 'Google Play';
const account = ios ? 'Apple ID' : 'Google account';

/** "6 November 2026", in the device's language. */
export const longDate = (at: number): string =>
  new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** A free trial's length as people say it: a week is "7 days", as the brief has it. */
export function trialLength({ unit, count }: StorePeriod): string {
  if (unit === 'day' || unit === 'week') {
    const days = unit === 'week' ? count * 7 : count;
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (unit === 'month') return count === 1 ? '1 month' : `${count} months`;
  return count === 1 ? '1 year' : `${count} years`;
}

const per: Record<PlanPeriod, string> = { year: 'a year', month: 'a month' };

export const plusCopy = {
  heading: 'ECHO Plus',
  lead: 'The whole practice, with nothing held back.',
  benefits: [
    {
      title: 'Pattern cards',
      line: 'ECHO reads your entries and names what keeps returning, in your own words.',
    },
    {
      title: 'Unlimited voice',
      line: 'Speak for as long as you need. Free includes 60 minutes a month.',
    },
    {
      title: 'Every breath',
      line: 'Focus and Sleep, any length, and Steady at your own pace.',
    },
    {
      title: 'Live words and Tidy',
      line: 'Watch your words arrive as you speak, or have them tidied.',
    },
  ],

  plansLabel: 'Plans',
  planName: { year: 'Yearly', month: 'Monthly' } as Record<PlanPeriod, string>,
  /** "7 days free, then ₹1,999.00 a year", or "₹299.00 a month". The price is the store's. */
  planLine: (period: PlanPeriod, price: string, trial: StorePeriod | null) =>
    trial ? `${trialLength(trial)} free, then ${price} ${per[period]}` : `${price} ${per[period]}`,
  loadingPlans: 'Loading the plans',

  start: (trial: StorePeriod) => `Start ${trialLength(trial)} free`,
  continue: 'Continue',
  tryAgain: 'Try again',

  finePrint: `Cancel anytime in ${store}. You won’t be charged until the trial ends, and ECHO will remind you two days before.`,
  /** The same, when notifications are off for ECHO: the reminder is a promise ECHO can only keep with them. */
  finePrintNoNotifications: `Cancel anytime in ${store}. You won’t be charged until the trial ends, and ECHO will remind you two days before if notifications are on.`,
  finePrintNoTrial: `Cancel anytime in ${store}.`,

  restore: 'Restore purchases',
  restoring: 'Restoring',
  terms: 'Terms',
  privacy: 'Privacy',
  notNow: 'Not now',
  opensInBrowser: 'Opens in your browser',

  offline: `You’re offline, so the plans can’t be shown. Connect to the internet, then try again.`,
  unavailable: 'ECHO Plus can’t be bought on this phone right now. Try again later.',

  failed: {
    offline: `ECHO couldn’t reach ${store}. Check your connection, then try again.`,
    not_allowed: `Purchases aren’t allowed on this phone. Check the settings in ${store}, then try again.`,
    store_problem: `${Store} had a problem, so the purchase didn’t finish. Try again in a moment.`,
    not_available: 'This plan can’t be bought right now. Try again later.',
    already_owned: `Your ${account} already has ECHO Plus. Use Restore purchases to bring it here.`,
    not_granted:
      'The purchase went through, but ECHO Plus hasn’t arrived yet. Use Restore purchases in a moment.',
    unknown: 'The purchase didn’t finish. Try again in a moment.',
  } satisfies Record<PurchaseFailure, string>,
  pending: `${Store} is waiting for your payment. ECHO Plus starts as soon as it goes through.`,

  restored: 'ECHO Plus is back on this phone.',
  nothingToRestore: `No ECHO Plus purchase was found for this ${account}.`,
  restoreOffline: `ECHO couldn’t reach ${store}. Check your connection, then try again.`,
  restoreFailed: 'Restoring didn’t finish. Try again in a moment.',

  yours: 'ECHO Plus is yours.',
  trialUntil: (at: number) => `Free until ${longDate(at)}.`,
  renewsOn: (at: number) => `Renews on ${longDate(at)}.`,
  endsOn: (at: number) => `Ends on ${longDate(at)}.`,

  // You
  youRow: 'ECHO Plus',
  youRowDetail: 'The whole practice, with nothing held back.',
  youTrialEnds: (at: number) => `Trial ends on ${longDate(at)}`,
  youRenews: (at: number) => `Renews on ${longDate(at)}`,
  youEnds: (at: number) => `Ends on ${longDate(at)}`,
  youActive: 'Active',
  manage: 'Manage subscription',
  manageDetail: `Opens ${store}`,
  restoreDetail: `If ECHO Plus is missing on this phone`,
  manageFailed: `${Store} couldn’t be opened. You can manage ECHO Plus in ${store}’s subscriptions.`,
} as const;
