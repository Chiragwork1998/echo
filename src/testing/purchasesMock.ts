// A stand-in for react-native-purchases. Tests say what the store knows and how it fails, then run the
// real billing adapter, engine and screens against it. Every value is synthetic.
//
//   jest.mock('react-native-purchases', () => jest.requireActual('@/testing/purchasesMock').purchasesModule);
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

type Failure = { code: string; message: string; userCancelled?: boolean };
type Call = 'getCustomerInfo' | 'getOfferings' | 'purchasePackage' | 'restorePurchases';

const DAY = 24 * 60 * 60 * 1000;

/** RevenueCat's error codes the tests use, as RevenueCat sends them. */
export const RC = {
  cancelled: '1',
  storeProblem: '2',
  notAllowed: '3',
  alreadyPurchased: '6',
  network: '10',
  invalidCredentials: '11',
  paymentPending: '20',
} as const;

export const failure = (code: string, extra: Partial<Failure> = {}): Failure => ({
  code,
  message: `synthetic failure ${code}`,
  ...extra,
});

type PlusSpec = {
  periodType?: 'NORMAL' | 'TRIAL';
  expiresAt?: number | null;
  willRenew?: boolean;
};

/** What RevenueCat knows: nothing, ECHO Plus active (or in its trial), or Plus that has expired. */
export function customerInfo(plus?: PlusSpec | 'expired'): CustomerInfo {
  const entitlement = (spec: PlusSpec, isActive: boolean) => ({
    identifier: 'plus',
    isActive,
    willRenew: spec.willRenew ?? true,
    periodType: spec.periodType ?? 'NORMAL',
    expirationDateMillis: spec.expiresAt === undefined ? Date.now() + 30 * DAY : spec.expiresAt,
  });
  const all: Record<string, unknown> = {};
  const active: Record<string, unknown> = {};
  if (plus === 'expired') {
    all.plus = entitlement({ expiresAt: Date.now() - DAY, willRenew: false }, false);
  } else if (plus) {
    all.plus = active.plus = entitlement(plus, true);
  }
  return {
    entitlements: { all, active, verification: 'NOT_REQUESTED' },
    managementURL:
      plus && plus !== 'expired' ? 'https://play.google.com/store/account/subscriptions' : null,
  } as unknown as CustomerInfo;
}

type PackageSpec = { price: string; trialWeeks?: number; trialDays?: number };

export function storePackage(period: 'year' | 'month', spec: PackageSpec): PurchasesPackage {
  const freeWeeks = spec.trialWeeks;
  const freeDays = spec.trialDays;
  const freePhase =
    freeWeeks || freeDays
      ? {
          billingPeriod: freeWeeks
            ? { unit: 'WEEK', value: freeWeeks, iso8601: `P${freeWeeks}W` }
            : { unit: 'DAY', value: freeDays, iso8601: `P${freeDays}D` },
          price: { formatted: 'Free', amountMicros: 0, currencyCode: 'INR' },
        }
      : null;
  return {
    identifier: period === 'year' ? '$rc_annual' : '$rc_monthly',
    packageType: period === 'year' ? 'ANNUAL' : 'MONTHLY',
    product: {
      identifier: `echo_plus:${period === 'year' ? 'yearly' : 'monthly'}`,
      priceString: spec.price,
      introPrice: null,
      defaultOption: {
        freePhase,
        fullPricePhase: { price: { formatted: spec.price, amountMicros: 1, currencyCode: 'INR' } },
      },
    },
  } as unknown as PurchasesPackage;
}

export function offerings(packages: PurchasesPackage[] | null): PurchasesOfferings {
  if (packages === null) return { all: {}, current: null } as unknown as PurchasesOfferings;
  const current = {
    identifier: 'default',
    availablePackages: packages,
    annual: packages.find((pkg) => pkg.packageType === 'ANNUAL') ?? null,
    monthly: packages.find((pkg) => pkg.packageType === 'MONTHLY') ?? null,
  };
  return { all: { default: current }, current } as unknown as PurchasesOfferings;
}

/** The usual offering: yearly with a week free, and monthly. Synthetic prices. */
export const defaultOfferings = () =>
  offerings([
    storePackage('year', { price: '₹1,999.00', trialWeeks: 1 }),
    storePackage('month', { price: '₹299.00' }),
  ]);

/** What the stand-in store holds. Reset it in beforeEach with resetPurchasesMock(). */
export const mockStore = {
  customerInfo: customerInfo(),
  /** What a purchase or restore returns. By default, Plus in its trial. */
  afterPurchase: customerInfo({ periodType: 'TRIAL', expiresAt: Date.now() + 7 * DAY }),
  afterRestore: customerInfo(),
  offerings: defaultOfferings(),
  failures: {} as Partial<Record<Call, Failure>>,
  /** A promise the call waits on, so a test can see the state in between. */
  hold: {} as Partial<Record<Call, Promise<void>>>,
  listeners: [] as ((info: CustomerInfo) => void)[],
};

async function answer<T>(call: Call, value: () => T): Promise<T> {
  await mockStore.hold[call];
  const failed = mockStore.failures[call];
  if (failed) throw failed;
  return value();
}

export const Purchases = {
  configure: jest.fn(),
  setLogLevel: jest.fn(async () => undefined),
  getCustomerInfo: jest.fn(() => answer('getCustomerInfo', () => mockStore.customerInfo)),
  getOfferings: jest.fn(() => answer('getOfferings', () => mockStore.offerings)),
  purchasePackage: jest.fn((pkg: PurchasesPackage) =>
    answer('purchasePackage', () => {
      mockStore.customerInfo = mockStore.afterPurchase;
      return {
        customerInfo: mockStore.afterPurchase,
        productIdentifier: pkg.product.identifier,
      };
    }),
  ),
  restorePurchases: jest.fn(() =>
    answer('restorePurchases', () => {
      mockStore.customerInfo = mockStore.afterRestore;
      return mockStore.afterRestore;
    }),
  ),
  addCustomerInfoUpdateListener: jest.fn((listener: (info: CustomerInfo) => void) => {
    mockStore.listeners.push(listener);
  }),
  removeCustomerInfoUpdateListener: jest.fn((listener: (info: CustomerInfo) => void) => {
    mockStore.listeners = mockStore.listeners.filter((each) => each !== listener);
    return true;
  }),
  checkTrialOrIntroductoryPriceEligibility: jest.fn(async () => ({})),
};

/** RevenueCat telling the app that something changed, as its listener does. */
export function pushCustomerInfo(info: CustomerInfo): void {
  mockStore.customerInfo = info;
  mockStore.listeners.forEach((listener) => listener(info));
}

export function resetPurchasesMock(): void {
  Object.values(Purchases).forEach((fn) => fn.mockClear());
  mockStore.customerInfo = customerInfo();
  mockStore.afterPurchase = customerInfo({ periodType: 'TRIAL', expiresAt: Date.now() + 7 * DAY });
  mockStore.afterRestore = customerInfo();
  mockStore.offerings = defaultOfferings();
  mockStore.failures = {};
  mockStore.hold = {};
  mockStore.listeners = [];
}

export const purchasesModule = {
  __esModule: true,
  default: Purchases,
  LOG_LEVEL: { VERBOSE: 'VERBOSE', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
};
