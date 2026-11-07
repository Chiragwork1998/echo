import { act, renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { AppState } from 'react-native';

import { getInstallId } from '@/services/install';
import { getNotificationPermission } from '@/services/permissions';
import { usePreferences } from '@/state/preferences';
import { withBillingForTests, withoutBillingForTests } from '@/testing/plus';
import {
  customerInfo,
  failure,
  mockStore,
  Purchases,
  pushCustomerInfo,
  RC,
  resetPurchasesMock,
} from '@/testing/purchasesMock';

import { createBilling } from './billing';
import { buyPlan, loadPlans, refreshPlus, requirePlus, resetPlusEngine, startPlus } from './engine';
import { usePlus, useRequirePlus } from './index';
import { chooseKey } from './keys';
import { resetPlusStore, usePlusStore } from './store';
import { TRIAL_REMINDER_ID } from './trialReminder';

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
const INSTALL_ID = 'install-synthetic-0001';

beforeEach(() => {
  jest.clearAllMocks();
  resetPurchasesMock();
  jest.mocked(getInstallId).mockResolvedValue(INSTALL_ID);
  jest
    .mocked(getNotificationPermission)
    .mockResolvedValue({ status: 'granted', canAskAgain: true });
  usePreferences.setState({ wordsShown: false, tidyWords: false });
});
afterEach(() => withoutBillingForTests());

const plusNow = async () => (await renderHook(() => usePlus())).result.current;

describe('a build without billing', () => {
  it('with no key: Plus is unavailable, everything stays open, and nothing is configured', async () => {
    withoutBillingForTests();
    await startPlus();
    expect(usePlusStore.getState().off).toBe('no_key');
    expect(await plusNow()).toEqual({ status: 'plus', isPlus: true });
    expect(requirePlus('patterns')).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
    expect(Purchases.configure).not.toHaveBeenCalled();
  });

  it('with a test key in a release build: the key is refused, and nobody is locked out', async () => {
    const choice = chooseKey({
      platform: 'android',
      dev: false,
      keys: { test: 'test_synthetic_store' },
    });
    resetPlusEngine(createBilling(choice));
    resetPlusStore({ off: null, status: 'free' });
    await startPlus();
    expect(usePlusStore.getState().off).toBe('test_key_in_release');
    expect(Purchases.configure).not.toHaveBeenCalled();
    expect((await plusNow()).isPlus).toBe(true);
    expect(requirePlus('live-words')).toBe(true);
  });

  it('with a key RevenueCat rejects: billing is off, and everything stays open', async () => {
    withBillingForTests({ status: 'free' });
    mockStore.failures.getCustomerInfo = failure(RC.invalidCredentials);
    await startPlus();
    expect(usePlusStore.getState().off).toBe('rejected_key');
    expect(requirePlus('tidy')).toBe(true);
  });
});

describe('with billing', () => {
  beforeEach(() => withBillingForTests());

  it('configures RevenueCat once, with the install id as the app user id', async () => {
    await startPlus();
    await refreshPlus();
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.configure).toHaveBeenCalledWith({
      apiKey: 'goog_synthetic_key',
      appUserID: INSTALL_ID,
      automaticDeviceIdentifierCollectionEnabled: false,
    });
  });

  it('never configures without the install id, and tries again later', async () => {
    jest.mocked(getInstallId).mockRejectedValueOnce(new Error('secure store locked'));
    await startPlus();
    expect(Purchases.configure).not.toHaveBeenCalled();
    await refreshPlus();
    expect(Purchases.configure).toHaveBeenCalledWith(
      expect.objectContaining({ appUserID: INSTALL_ID }),
    );
  });

  it.each([
    ['none', customerInfo(), 'free'],
    ['active', customerInfo({ expiresAt: Date.now() + 300 * DAY }), 'plus'],
    ['trial', customerInfo({ periodType: 'TRIAL', expiresAt: Date.now() + 7 * DAY }), 'plus'],
    ['expired', customerInfo('expired'), 'free'],
  ] as const)('maps %s to %s', async (_name, info, status) => {
    mockStore.customerInfo = info;
    await startPlus();
    expect(await plusNow()).toEqual({ status, isPlus: status === 'plus' });
    expect(usePlusStore.getState().source).toBe('live');
  });

  it('follows RevenueCat as it changes, without being asked', async () => {
    await startPlus();
    expect((await plusNow()).isPlus).toBe(false);
    await act(async () => pushCustomerInfo(customerInfo({ expiresAt: Date.now() + 30 * DAY })));
    expect((await plusNow()).isPlus).toBe(true);
  });

  it('asks again when ECHO comes back to the foreground', async () => {
    await startPlus();
    const calls = Purchases.getCustomerInfo.mock.calls.length;
    mockStore.customerInfo = customerInfo({ expiresAt: Date.now() + 30 * DAY });
    const change = jest.mocked(AppState.addEventListener).mock.calls.at(-1)?.[1];
    await act(async () => change?.('active'));
    expect(Purchases.getCustomerInfo.mock.calls.length).toBeGreaterThan(calls);
    expect((await plusNow()).isPlus).toBe(true);
  });

  it('keeps what it knew when the store cannot be reached', async () => {
    resetPlusStore({ off: null, status: 'plus', source: 'cache', expiresAt: Date.now() + DAY });
    mockStore.failures.getCustomerInfo = failure(RC.network);
    await startPlus();
    expect((await plusNow()).isPlus).toBe(true);
    expect(usePlusStore.getState().source).toBe('cache');
  });

  it('turns live words and Tidy off when Plus has ended', async () => {
    usePreferences.setState({ wordsShown: true, tidyWords: true });
    mockStore.customerInfo = customerInfo('expired');
    await startPlus();
    expect(usePreferences.getState()).toMatchObject({ wordsShown: false, tidyWords: false });
  });

  it('turns them off even when the preferences are read from the phone afterwards', async () => {
    mockStore.customerInfo = customerInfo('expired');
    await startPlus();
    await act(async () => usePreferences.setState({ wordsShown: true, tidyWords: true }));
    expect(usePreferences.getState()).toMatchObject({ wordsShown: false, tidyWords: false });
  });

  it('leaves them alone for someone with Plus', async () => {
    usePreferences.setState({ wordsShown: true, tidyWords: true });
    mockStore.customerInfo = customerInfo({ expiresAt: Date.now() + 30 * DAY });
    await startPlus();
    expect(usePreferences.getState()).toMatchObject({ wordsShown: true, tidyWords: true });
  });

  it('schedules the trial reminder as a trial starts, and cancels it once paid', async () => {
    const ends = Date.now() + 7 * DAY;
    mockStore.afterPurchase = customerInfo({ periodType: 'TRIAL', expiresAt: ends });
    await startPlus();
    await loadPlans();
    await buyPlan('$rc_annual');
    await act(async () => undefined);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: TRIAL_REMINDER_ID,
        trigger: expect.objectContaining({ date: new Date(ends - 2 * DAY) }),
      }),
    );
    jest.mocked(Notifications.cancelScheduledNotificationAsync).mockClear();
    await act(async () => pushCustomerInfo(customerInfo({ expiresAt: Date.now() + 365 * DAY })));
    await act(async () => undefined);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(TRIAL_REMINDER_ID);
  });
});

describe('requirePlus', () => {
  beforeEach(() => withBillingForTests({ status: 'free', source: 'live' }));

  it('opens the paywall for the feature and returns false, for someone without Plus', async () => {
    const { result } = await renderHook(() => useRequirePlus());
    expect(result.current('patterns')).toBe(false);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/plus',
      params: { feature: 'patterns' },
    });
  });

  it('returns true and opens nothing for someone with Plus', () => {
    resetPlusStore({ off: null, status: 'plus' });
    expect(requirePlus('breath-library')).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('treats a status not yet known as not Plus, and lets the paywall find out', () => {
    resetPlusStore({ off: null, status: 'unknown' });
    expect(requirePlus('voice-unlimited')).toBe(false);
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
