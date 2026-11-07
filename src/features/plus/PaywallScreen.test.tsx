import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AccessibilityInfo, Dimensions, Linking } from 'react-native';

import { links } from '@/config/links';
import { getInstallId } from '@/services/install';
import { getNotificationPermission } from '@/services/permissions';
import { usePlusStore } from '@/services/plus/store';
import { withBillingForTests, withoutBillingForTests } from '@/testing/plus';
import {
  customerInfo,
  failure,
  mockStore,
  offerings,
  Purchases,
  RC,
  resetPurchasesMock,
  storePackage,
} from '@/testing/purchasesMock';
import { render } from '@/testing/render';

import { PaywallScreen } from './PaywallScreen';
import { longDate, plusCopy } from './plusCopy';

jest.mock(
  'react-native-purchases',
  () => jest.requireActual('@/testing/purchasesMock').purchasesModule,
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/services/install', () => ({ getInstallId: jest.fn() }));
jest.mock('@/services/permissions', () => ({ getNotificationPermission: jest.fn() }));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));

const DAY = 24 * 60 * 60 * 1000;
const yearlyLine = '7 days free, then ₹1,999 a year';
const monthlyLine = '₹299 a month';

const radio = (name: string | RegExp) => screen.getByRole('radio', { name });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const cta = () => button(/^(Start 7 days free|Continue|Try again)$/);

async function open(params: Record<string, string> = {}) {
  jest.mocked(useLocalSearchParams).mockReturnValue(params);
  await render(<PaywallScreen />);
}

/** Lets a promise the test is holding go, as the store answering would. */
function holdCall(call: keyof typeof mockStore.hold) {
  let release = () => undefined as void;
  mockStore.hold[call] = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => act(async () => release());
}

beforeEach(() => {
  jest.clearAllMocks();
  resetPurchasesMock();
  withBillingForTests({ status: 'free', source: 'live' });
  jest.mocked(getInstallId).mockResolvedValue('install-synthetic-0001');
  jest
    .mocked(getNotificationPermission)
    .mockResolvedValue({ status: 'granted', canAskAgain: true });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
});
afterEach(() => withoutBillingForTests());

describe('the paywall', () => {
  it('says what Plus is, in the brief’s words', async () => {
    await open();
    expect(screen.getByRole('header', { name: 'ECHO Plus' })).toBeTruthy();
    expect(screen.getByText('The whole practice, with nothing held back.')).toBeTruthy();
    for (const { title, line } of plusCopy.benefits) {
      expect(screen.getByText(new RegExp(`${title}\\. ${line.replace('.', '\\.')}`))).toBeTruthy();
    }
    expect(await screen.findByText(yearlyLine)).toBeTruthy();
  });

  it('is shaped like the plans while they load, and offers nothing to press', async () => {
    const release = holdCall('getOfferings');
    await open();
    expect(screen.getByLabelText(plusCopy.loadingPlans)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByTestId('plans-loading')).toBeTruthy();
    await release();
    expect(await screen.findByText(yearlyLine)).toBeTruthy();
  });

  it('opens with yearly chosen, its trial from the store, and the trial button and fine print', async () => {
    await open();
    await screen.findByText(yearlyLine);
    expect(radio(/^Yearly/)).toBeSelected();
    expect(radio(/^Monthly/)).not.toBeSelected();
    expect(radio(`Yearly. ${yearlyLine}`)).toBeTruthy();
    expect(screen.getByText(monthlyLine)).toBeTruthy();
    expect(button('Start 7 days free')).toBeTruthy();
    expect(screen.getByText(plusCopy.finePrint)).toBeTruthy();
  });

  it('with monthly chosen: no trial, "Continue", and the short fine print', async () => {
    await open();
    await screen.findByText(yearlyLine);
    await fireEvent.press(radio(/^Monthly/));
    expect(radio(/^Monthly/)).toBeSelected();
    expect(button('Continue')).toBeTruthy();
    expect(screen.getByText(plusCopy.finePrintNoTrial)).toBeTruthy();
    expect(screen.queryByText(plusCopy.finePrint)).toBeNull();
  });

  it('says "Continue" when the store gives this person no trial', async () => {
    mockStore.offerings = offerings([storePackage('year', { price: '₹1,999.00' })]);
    await open();
    expect(await screen.findByText('₹1,999 a year')).toBeTruthy();
    expect(button('Continue')).toBeTruthy();
  });

  it('does not promise a reminder that cannot arrive when notifications are off', async () => {
    jest
      .mocked(getNotificationPermission)
      .mockResolvedValue({ status: 'denied', canAskAgain: false });
    await open();
    expect(await screen.findByText(plusCopy.finePrintNoNotifications)).toBeTruthy();
  });

  it('offline: says so in place of the plans, and tries again', async () => {
    mockStore.failures.getOfferings = failure(RC.network);
    await open();
    expect(await screen.findByText(plusCopy.offline)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    mockStore.failures = {};
    await fireEvent.press(button('Try again'));
    expect(await screen.findByText(yearlyLine)).toBeTruthy();
    expect(Purchases.getOfferings).toHaveBeenCalledTimes(2);
  });

  it('with nothing to sell: says Plus cannot be bought here right now', async () => {
    mockStore.offerings = offerings(null);
    await open();
    expect(await screen.findByText(plusCopy.unavailable)).toBeTruthy();
    expect(button('Try again')).toBeTruthy();
  });

  it('buys the chosen plan, then says Plus is theirs, with the trial’s end', async () => {
    const ends = Date.now() + 7 * DAY;
    mockStore.afterPurchase = customerInfo({ periodType: 'TRIAL', expiresAt: ends });
    await open();
    await screen.findByText(yearlyLine);
    await fireEvent.press(button('Start 7 days free'));
    expect(await screen.findByText(plusCopy.yours)).toBeTruthy();
    expect(screen.getByText(`Free until ${longDate(ends)}.`)).toBeTruthy();
    expect(Purchases.purchasePackage).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: '$rc_annual' }),
    );
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(plusCopy.yours);
    expect(screen.queryByRole('button', { name: plusCopy.notNow })).toBeNull();
    await fireEvent.press(button('Continue'));
    expect(router.back).toHaveBeenCalled();
  });

  it('buys monthly when monthly is chosen', async () => {
    mockStore.afterPurchase = customerInfo({ expiresAt: Date.now() + 30 * DAY });
    await open();
    await screen.findByText(yearlyLine);
    await fireEvent.press(radio(/^Monthly/));
    await fireEvent.press(button('Continue'));
    await screen.findByText(plusCopy.yours);
    expect(Purchases.purchasePackage).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: '$rc_monthly' }),
    );
  });

  it('shows it is working while the store’s sheet is open', async () => {
    const release = holdCall('purchasePackage');
    await open();
    await screen.findByText(yearlyLine);
    await fireEvent.press(button('Start 7 days free'));
    expect(screen.getByRole('button', { busy: true })).toBeTruthy();
    expect(radio(/^Monthly/)).toBeDisabled();
    await release();
    expect(await screen.findByText(plusCopy.yours)).toBeTruthy();
  });

  it('a cancelled purchase says nothing and leaves the plans as they were', async () => {
    mockStore.failures.purchasePackage = failure(RC.cancelled, { userCancelled: true });
    await open();
    await screen.findByText(yearlyLine);
    await fireEvent.press(button('Start 7 days free'));
    await waitFor(() => expect(button('Start 7 days free')).toBeEnabled());
    expect(screen.queryByTestId('paywall-notice')).toBeNull();
    expect(radio(/^Yearly/)).toBeSelected();
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });

  it.each([
    [RC.storeProblem, plusCopy.failed.store_problem],
    [RC.network, plusCopy.failed.offline],
    [RC.notAllowed, plusCopy.failed.not_allowed],
    [RC.alreadyPurchased, plusCopy.failed.already_owned],
    ['0', plusCopy.failed.unknown],
  ])('a failed purchase (code %s) says what failed and what to do, inline', async (code, said) => {
    mockStore.failures.purchasePackage = failure(code);
    await open();
    await screen.findByText(yearlyLine);
    await fireEvent.press(button('Start 7 days free'));
    expect(await screen.findByText(said)).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(said);
    // The plans and the button stay, so trying again is one touch.
    expect(radio(/^Yearly/)).toBeSelected();
    expect(button('Start 7 days free')).toBeEnabled();
  });

  it('a payment the store is waiting on is said plainly, not as a failure', async () => {
    mockStore.failures.purchasePackage = failure(RC.paymentPending);
    await open();
    await screen.findByText(yearlyLine);
    await fireEvent.press(button('Start 7 days free'));
    expect(await screen.findByText(plusCopy.pending)).toBeTruthy();
  });

  it('restores a purchase that was already made', async () => {
    mockStore.afterRestore = customerInfo({ expiresAt: Date.now() + 200 * DAY });
    await open();
    await screen.findByText(yearlyLine);
    await fireEvent.press(button(plusCopy.restore));
    expect(await screen.findByText(plusCopy.restored)).toBeTruthy();
    expect(screen.getByText(plusCopy.yours)).toBeTruthy();
  });

  it('says so when there is nothing to restore', async () => {
    await open();
    await screen.findByText(yearlyLine);
    await fireEvent.press(button(plusCopy.restore));
    expect(await screen.findByText(plusCopy.nothingToRestore)).toBeTruthy();
    expect(radio(/^Yearly/)).toBeTruthy();
  });

  it('already Plus: says so, with when it renews, and nothing to buy', async () => {
    const renews = Date.now() + 120 * DAY;
    mockStore.customerInfo = customerInfo({ expiresAt: renews });
    withBillingForTests({ status: 'plus', source: 'cache', expiresAt: renews, willRenew: true });
    await open();
    expect(await screen.findByText(plusCopy.yours)).toBeTruthy();
    expect(screen.getByText(`Renews on ${longDate(renews)}.`)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: plusCopy.restore })).toBeNull();
  });

  it('opens Terms and Privacy from the links file', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await open();
    await fireEvent.press(screen.getByRole('link', { name: plusCopy.terms }));
    await fireEvent.press(screen.getByRole('link', { name: plusCopy.privacy }));
    expect(openURL).toHaveBeenCalledWith(links.terms);
    expect(openURL).toHaveBeenCalledWith(links.privacy);
  });
});

describe('leaving', () => {
  it('"Not now" closes back to the feature that opened it', async () => {
    await open({ feature: 'patterns' });
    await fireEvent.press(button(plusCopy.notNow));
    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(usePlusStore.getState().offered).toBe(false);
  });

  it('after onboarding, it counts as seen the moment it appears, and "Not now" goes Home', async () => {
    await open({ from: 'onboarding' });
    expect(usePlusStore.getState().offered).toBe(true);
    await fireEvent.press(button(plusCopy.notNow));
    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('has a "Not now" whatever state the plans are in', async () => {
    mockStore.failures.getOfferings = failure(RC.network);
    await open();
    await screen.findByText(plusCopy.offline);
    expect(button(plusCopy.notNow)).toBeTruthy();
    expect(cta()).toBeTruthy();
  });
});
