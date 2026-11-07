/* eslint-disable @typescript-eslint/no-require-imports */
// ECHO Plus on a phone: RevenueCat over Google Play (and the App Store, once iOS ships).
// billing.web.ts replaces this file in the web harness, so this one never reaches a web bundle and
// the harness's stand-in never reaches a phone.
import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { buildKeys, chooseKey, type KeyChoice } from './keys';
import {
  entitlementFrom,
  isCancelled,
  isInProgress,
  isOffline,
  isPending,
  packagesOf,
  planFrom,
  purchaseFailure,
} from './mapping';
import type { Billing } from './types';

// Required on first use rather than imported, the way services/nativeModules.ts loads native code,
// so that a test can replace it with jest.mock.
const load = () => require('react-native-purchases') as typeof import('react-native-purchases');

/** RevenueCat's INTRO_ELIGIBILITY_STATUS_ELIGIBLE. */
const ELIGIBLE = 2;

/** iOS only: whether this Apple ID would get each product's introductory offer. */
async function iosEligibility(packages: PurchasesPackage[]): Promise<Set<string>> {
  if (Platform.OS !== 'ios') return new Set();
  try {
    const ids = packages.map((pkg) => pkg.product.identifier);
    const answer = await load().default.checkTrialOrIntroductoryPriceEligibility(ids);
    return new Set(ids.filter((id) => answer[id]?.status === ELIGIBLE));
  } catch {
    // Unknown eligibility is shown as no trial: a trial is never promised that might not apply.
    return new Set();
  }
}

/** A billing adapter for one key choice. The app makes one, from the keys it was built with. */
export function createBilling(choice: KeyChoice): Billing {
  // The packages last shown, so that a purchase buys exactly the plan the person saw.
  let shown = new Map<string, PurchasesPackage>();
  const Purchases = () => load().default;

  return {
    off: choice.key === null ? choice.off : null,
    needsAppUserID: true,

    configure(appUserID) {
      if (choice.key === null) return;
      const { default: purchases, LOG_LEVEL } = load();
      // Warnings and errors only in a release build. RevenueCat logs no journal content either way.
      if (!__DEV__) purchases.setLogLevel(LOG_LEVEL.WARN).catch(() => undefined);
      purchases.configure({
        apiKey: choice.key,
        appUserID,
        // ECHO uses no attribution network, so nothing about the device is collected for one.
        automaticDeviceIdentifierCollectionEnabled: false,
      });
    },

    listen(onChange) {
      const listener = (info: Parameters<typeof entitlementFrom>[0]) =>
        onChange(entitlementFrom(info));
      Purchases().addCustomerInfoUpdateListener(listener);
      return () => {
        Purchases().removeCustomerInfoUpdateListener(listener);
      };
    },

    async entitlement() {
      return entitlementFrom(await Purchases().getCustomerInfo());
    },

    async plans() {
      try {
        const offerings = await Purchases().getOfferings();
        const packages = offerings.current ? packagesOf(offerings.current) : [];
        if (packages.length === 0) return { kind: 'unavailable' };
        const eligible = await iosEligibility(packages);
        shown = new Map(packages.map((pkg) => [pkg.identifier, pkg]));
        return {
          kind: 'plans',
          plans: packages.map((pkg) => planFrom(pkg, eligible.has(pkg.product.identifier))),
        };
      } catch (error) {
        return isOffline(error) ? { kind: 'offline' } : { kind: 'unavailable' };
      }
    },

    async purchase(planId) {
      const pkg = shown.get(planId);
      if (!pkg) return { kind: 'failed', reason: 'not_available' };
      try {
        const { customerInfo } = await Purchases().purchasePackage(pkg);
        const entitlement = entitlementFrom(customerInfo);
        return entitlement.status === 'plus'
          ? { kind: 'bought', entitlement }
          : { kind: 'failed', reason: 'not_granted' };
      } catch (error) {
        // A second tap while the store's sheet is already open is the same purchase: nothing to say.
        if (isCancelled(error) || isInProgress(error)) return { kind: 'cancelled' };
        if (isPending(error)) return { kind: 'pending' };
        return { kind: 'failed', reason: purchaseFailure(error) };
      }
    },

    async restore() {
      try {
        const entitlement = entitlementFrom(await Purchases().restorePurchases());
        return entitlement.status === 'plus'
          ? { kind: 'restored', entitlement }
          : { kind: 'nothing', entitlement };
      } catch (error) {
        return { kind: 'failed', reason: isOffline(error) ? 'offline' : 'unknown' };
      }
    },
  };
}

/** The keys this build carries, checked: a release build never uses RevenueCat's Test Store. */
export const billing: Billing = createBilling(
  chooseKey({ platform: Platform.OS, dev: __DEV__, keys: buildKeys() }),
);
