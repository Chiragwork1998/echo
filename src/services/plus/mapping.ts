// Turns RevenueCat's answers into ECHO's few plain types. Type imports only, so nothing here loads
// the native module, and it can be tested without one.
import type {
  CustomerInfo,
  PricingPhase,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';

import {
  ENTITLEMENT_ID,
  FREE,
  type Entitlement,
  type Plan,
  type PlanPeriod,
  type PurchaseFailure,
  type StorePeriod,
} from './types';

/**
 * ECHO Plus, from what RevenueCat knows about this install. Active means RevenueCat lists the `plus`
 * entitlement as active. A trial is a period of type TRIAL. An entitlement that is known but not
 * active has expired.
 */
export function entitlementFrom(info: CustomerInfo): Entitlement {
  const active = info.entitlements.active[ENTITLEMENT_ID];
  if (!active) {
    const known = info.entitlements.all[ENTITLEMENT_ID];
    return { ...FREE, history: known ? 'expired' : 'never' };
  }
  return {
    status: 'plus',
    trial: active.periodType === 'TRIAL',
    expiresAt: active.expirationDateMillis ?? null,
    willRenew: active.willRenew,
    managementURL: info.managementURL ?? null,
    history: 'active',
  };
}

const UNITS: Record<string, StorePeriod['unit'] | undefined> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

function periodOf(unit: string, count: number): StorePeriod | null {
  const known = UNITS[unit];
  return known && count > 0 ? { unit: known, count } : null;
}

/** A free phase, from Google Play's pricing phases. */
function freePeriod(phase: PricingPhase | null | undefined): StorePeriod | null {
  if (!phase || phase.price.amountMicros !== 0) return null;
  return periodOf(phase.billingPeriod.unit, phase.billingPeriod.value);
}

/**
 * The free trial this person would get. Google Play lists only the offers a person is eligible for,
 * and RevenueCat's default option is the one a purchase uses, so a free phase there is a trial they
 * would really get. On iOS the introductory price is the trial, and eligibility is asked separately.
 */
export function trialOf(pkg: PurchasesPackage, iosEligible: boolean): StorePeriod | null {
  const { product } = pkg;
  const fromPlay = freePeriod(product.defaultOption?.freePhase);
  if (fromPlay) return fromPlay;
  const intro = product.introPrice;
  if (!iosEligible || !intro || intro.price !== 0) return null;
  return periodOf(intro.periodUnit, intro.periodNumberOfUnits);
}

/** The price once any trial or introductory phase is over. */
export function renewalPrice(pkg: PurchasesPackage): string {
  return pkg.product.defaultOption?.fullPricePhase?.price.formatted ?? pkg.product.priceString;
}

function packageFor(offering: PurchasesOffering, period: PlanPeriod): PurchasesPackage | null {
  const type = period === 'year' ? 'ANNUAL' : 'MONTHLY';
  const named = period === 'year' ? offering.annual : offering.monthly;
  return named ?? offering.availablePackages.find((pkg) => pkg.packageType === type) ?? null;
}

/** The offering's yearly and monthly packages, yearly first. Anything else it holds is not shown. */
export function packagesOf(offering: PurchasesOffering): PurchasesPackage[] {
  return (['year', 'month'] as const)
    .map((period) => packageFor(offering, period))
    .filter((pkg): pkg is PurchasesPackage => pkg !== null);
}

export function planFrom(pkg: PurchasesPackage, iosEligible = false): Plan {
  return {
    id: pkg.identifier,
    period: pkg.packageType === 'ANNUAL' ? 'year' : 'month',
    price: renewalPrice(pkg),
    trial: trialOf(pkg, iosEligible),
  };
}

/** RevenueCat's error codes, as the strings it uses. Listed here so this file loads no module. */
const CODES = {
  cancelled: '1',
  storeProblem: '2',
  notAllowed: '3',
  invalid: '4',
  notAvailable: '5',
  alreadyPurchased: '6',
  receiptInUse: '7',
  network: '10',
  invalidCredentials: '11',
  inProgress: '15',
  paymentPending: '20',
  configuration: '23',
  offline: '35',
} as const;

const codeOf = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : null;
};

export const isCancelled = (error: unknown): boolean =>
  codeOf(error) === CODES.cancelled ||
  (typeof error === 'object' &&
    error !== null &&
    (error as { userCancelled?: unknown }).userCancelled === true);

export const isOffline = (error: unknown): boolean => {
  const code = codeOf(error);
  return code === CODES.network || code === CODES.offline;
};

export const isPending = (error: unknown): boolean => codeOf(error) === CODES.paymentPending;

export const isInProgress = (error: unknown): boolean => codeOf(error) === CODES.inProgress;

/**
 * A key RevenueCat rejects, or a project it cannot use. That is the build, not the person: such a
 * build has no working billing, and like a build with no key at all it must not lock anyone out.
 */
export const isBuildFault = (error: unknown): boolean => {
  const code = codeOf(error);
  return code === CODES.invalidCredentials || code === CODES.configuration;
};

/** What went wrong with a purchase, in terms the paywall can explain. */
export function purchaseFailure(error: unknown): PurchaseFailure {
  if (isOffline(error)) return 'offline';
  switch (codeOf(error)) {
    case CODES.notAllowed:
      return 'not_allowed';
    case CODES.storeProblem:
      return 'store_problem';
    case CODES.notAvailable:
    case CODES.invalid:
      return 'not_available';
    case CODES.alreadyPurchased:
    case CODES.receiptInUse:
      return 'already_owned';
    default:
      return 'unknown';
  }
}
