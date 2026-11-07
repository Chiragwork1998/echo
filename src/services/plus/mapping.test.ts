import type { PurchasesPackage } from 'react-native-purchases';

import { customerInfo, failure, RC, storePackage } from '@/testing/purchasesMock';

import {
  entitlementFrom,
  isBuildFault,
  isCancelled,
  packagesOf,
  planFrom,
  purchaseFailure,
} from './mapping';

const DAY = 24 * 60 * 60 * 1000;

describe('ECHO Plus from what RevenueCat knows', () => {
  it('none: never had it, so free', () => {
    expect(entitlementFrom(customerInfo())).toEqual({
      status: 'free',
      trial: false,
      expiresAt: null,
      willRenew: false,
      managementURL: null,
      history: 'never',
    });
  });

  it('active: Plus, with when it renews and where to manage it', () => {
    const renews = Date.UTC(2027, 10, 8);
    expect(entitlementFrom(customerInfo({ expiresAt: renews }))).toEqual({
      status: 'plus',
      trial: false,
      expiresAt: renews,
      willRenew: true,
      managementURL: 'https://play.google.com/store/account/subscriptions',
      history: 'active',
    });
  });

  it('trial: Plus, in its free trial', () => {
    const ends = Date.now() + 7 * DAY;
    const plus = entitlementFrom(customerInfo({ periodType: 'TRIAL', expiresAt: ends }));
    expect(plus).toMatchObject({ status: 'plus', trial: true, expiresAt: ends, willRenew: true });
  });

  it('a cancelled trial still has Plus until it ends, and will not renew', () => {
    const plus = entitlementFrom(customerInfo({ periodType: 'TRIAL', willRenew: false }));
    expect(plus).toMatchObject({ status: 'plus', trial: true, willRenew: false });
  });

  it('expired: had Plus, and it has ended, so free', () => {
    expect(entitlementFrom(customerInfo('expired'))).toMatchObject({
      status: 'free',
      history: 'expired',
    });
  });
});

describe('plans from the offering', () => {
  it('reads the trial from the free phase, as days, and the price after it', () => {
    expect(planFrom(storePackage('year', { price: '₹1,999.00', trialWeeks: 1 }))).toEqual({
      id: '$rc_annual',
      period: 'year',
      price: '₹1,999.00',
      trial: { unit: 'week', count: 1 },
    });
    expect(planFrom(storePackage('month', { price: '₹299.00' }))).toEqual({
      id: '$rc_monthly',
      period: 'month',
      price: '₹299.00',
      trial: null,
    });
  });

  it('shows no trial the person would not get', () => {
    const plan = planFrom(storePackage('year', { price: '₹1,999.00' }));
    expect(plan.trial).toBeNull();
  });

  it('uses the iOS introductory price only when Apple says the person is eligible', () => {
    const pkg = storePackage('year', { price: '$49.99' }) as unknown as {
      product: Record<string, unknown>;
    };
    pkg.product.defaultOption = null;
    pkg.product.introPrice = { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7 };
    const ios = pkg as unknown as PurchasesPackage;
    expect(planFrom(ios, true).trial).toEqual({ unit: 'day', count: 7 });
    expect(planFrom(ios, false).trial).toBeNull();
    expect(planFrom(ios, true).price).toBe('$49.99');
  });

  it('takes yearly and monthly from the offering, yearly first, and nothing else', () => {
    const month = storePackage('month', { price: '₹299.00' });
    const year = storePackage('year', { price: '₹1,999.00' });
    const weekly = {
      ...month,
      identifier: '$rc_weekly',
      packageType: 'WEEKLY',
    } as PurchasesPackage;
    const offering = {
      availablePackages: [weekly, month, year],
      annual: null,
      monthly: null,
    } as unknown as Parameters<typeof packagesOf>[0];
    expect(packagesOf(offering).map((pkg) => pkg.identifier)).toEqual([
      '$rc_annual',
      '$rc_monthly',
    ]);
  });
});

describe('what went wrong', () => {
  it('knows a cancelled purchase, by code or by the flag', () => {
    expect(isCancelled(failure(RC.cancelled))).toBe(true);
    expect(isCancelled(failure(RC.storeProblem, { userCancelled: true }))).toBe(true);
    expect(isCancelled(failure(RC.storeProblem))).toBe(false);
  });

  it('names each failure the paywall explains', () => {
    expect(purchaseFailure(failure(RC.network))).toBe('offline');
    expect(purchaseFailure(failure('35'))).toBe('offline');
    expect(purchaseFailure(failure(RC.notAllowed))).toBe('not_allowed');
    expect(purchaseFailure(failure(RC.storeProblem))).toBe('store_problem');
    expect(purchaseFailure(failure('5'))).toBe('not_available');
    expect(purchaseFailure(failure(RC.alreadyPurchased))).toBe('already_owned');
    expect(purchaseFailure(failure('7'))).toBe('already_owned');
    expect(purchaseFailure(failure('0'))).toBe('unknown');
    expect(purchaseFailure(new Error('not from RevenueCat'))).toBe('unknown');
  });

  it('tells a broken build from a passing fault', () => {
    expect(isBuildFault(failure(RC.invalidCredentials))).toBe(true);
    expect(isBuildFault(failure('23'))).toBe(true);
    expect(isBuildFault(failure(RC.network))).toBe(false);
  });
});
