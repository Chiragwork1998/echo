import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions, Linking } from 'react-native';

import { getInstallId } from '@/services/install';
import { getNotificationPermission } from '@/services/permissions';
import { withBillingForTests, withoutBillingForTests } from '@/testing/plus';
import { customerInfo, mockStore, Purchases, resetPurchasesMock } from '@/testing/purchasesMock';
import { render } from '@/testing/render';

import { longDate, plusCopy } from './plusCopy';
import { PlusSection } from './PlusSection';

jest.mock(
  'react-native-purchases',
  () => jest.requireActual('@/testing/purchasesMock').purchasesModule,
);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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
const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  jest.clearAllMocks();
  resetPurchasesMock();
  jest.mocked(getInstallId).mockResolvedValue('install-synthetic-0001');
  jest
    .mocked(getNotificationPermission)
    .mockResolvedValue({ status: 'granted', canAskAgain: true });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
});
afterEach(() => withoutBillingForTests());

describe("You's ECHO Plus rows", () => {
  it('free: one row, which opens the paywall', async () => {
    withBillingForTests({ status: 'free', source: 'live' });
    await render(<PlusSection />);
    await fireEvent.press(button(`${plusCopy.youRow}. ${plusCopy.youRowDetail}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: {} });
    expect(screen.queryByText(plusCopy.manage)).toBeNull();
  });

  it('in a trial: when it ends, a way to manage it, and Restore purchases', async () => {
    const ends = Date.now() + 5 * DAY;
    withBillingForTests({
      status: 'plus',
      trial: true,
      willRenew: true,
      expiresAt: ends,
      managementURL: 'https://play.google.com/store/account/subscriptions?sku=synthetic',
    });
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<PlusSection />);
    expect(screen.getByText(`Trial ends on ${longDate(ends)}`)).toBeTruthy();
    await fireEvent.press(button(new RegExp(`^${plusCopy.manage}`)));
    expect(openURL).toHaveBeenCalledWith(
      'https://play.google.com/store/account/subscriptions?sku=synthetic',
    );
    expect(button(new RegExp(`^${plusCopy.restore}`))).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('paid: when it renews', async () => {
    const at = Date.now() + 300 * DAY;
    withBillingForTests({ status: 'plus', willRenew: true, expiresAt: at });
    await render(<PlusSection />);
    expect(screen.getByText(`Renews on ${longDate(at)}`)).toBeTruthy();
  });

  it('cancelled: when it ends', async () => {
    const at = Date.now() + 300 * DAY;
    withBillingForTests({ status: 'plus', willRenew: false, expiresAt: at });
    await render(<PlusSection />);
    expect(screen.getByText(`Ends on ${longDate(at)}`)).toBeTruthy();
  });

  it('opens the store’s own subscriptions page when RevenueCat gave none', async () => {
    withBillingForTests({ status: 'plus', willRenew: true, expiresAt: Date.now() + DAY });
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<PlusSection />);
    await fireEvent.press(button(new RegExp(`^${plusCopy.manage}`)));
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/subscriptions$/));
  });

  it('restores, and says what it found', async () => {
    withBillingForTests({ status: 'plus', willRenew: true, expiresAt: Date.now() + DAY });
    mockStore.afterRestore = customerInfo({ expiresAt: Date.now() + 90 * DAY });
    await render(<PlusSection />);
    await fireEvent.press(button(new RegExp(`^${plusCopy.restore}`)));
    expect(await screen.findByText(plusCopy.restored)).toBeTruthy();
    expect(Purchases.restorePurchases).toHaveBeenCalledTimes(1);
  });

  it('shows nothing in a build that cannot sell Plus, where everything is already open', async () => {
    withoutBillingForTests();
    await render(<PlusSection />);
    expect(screen.queryByText(plusCopy.youRow)).toBeNull();
  });
});
