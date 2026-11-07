import * as Notifications from 'expo-notifications';

import { getNotificationPermission } from '@/services/permissions';

import {
  forgetTrialReminder,
  reminderAt,
  syncTrialReminder,
  TRIAL_REMINDER_BODY,
  TRIAL_REMINDER_ID,
  type TrialState,
} from './trialReminder';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  requestPermissionsAsync: jest.fn(),
}));
jest.mock('@/services/permissions', () => ({ getNotificationPermission: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 8, 9, 0);
const schedule = jest.mocked(Notifications.scheduleNotificationAsync);
const cancel = jest.mocked(Notifications.cancelScheduledNotificationAsync);

const trial = (patch: Partial<TrialState> = {}): TrialState => ({
  status: 'plus',
  trial: true,
  expiresAt: NOW + 7 * DAY,
  willRenew: true,
  ...patch,
});

beforeEach(() => {
  jest.clearAllMocks();
  forgetTrialReminder();
  jest
    .mocked(getNotificationPermission)
    .mockResolvedValue({ status: 'granted', canAskAgain: true });
});

describe('the trial reminder', () => {
  it('is scheduled two days before a trial ends, with fixed words and no data', async () => {
    expect(await syncTrialReminder(trial(), NOW)).toBe('scheduled');
    const request = schedule.mock.calls[0]?.[0];
    expect(request?.identifier).toBe(TRIAL_REMINDER_ID);
    expect(request?.content).toEqual({
      title: 'ECHO',
      body: 'Your ECHO Plus trial ends in 2 days.',
      data: {},
    });
    expect(request?.content.body).toBe(TRIAL_REMINDER_BODY);
    expect(request?.trigger).toMatchObject({ type: 'date', date: new Date(NOW + 5 * DAY) });
  });

  it('takes no text, so nothing a person wrote can reach it', () => {
    expect(syncTrialReminder.length).toBeLessThanOrEqual(2);
    expect(Object.keys(trial()).sort()).toEqual(['expiresAt', 'status', 'trial', 'willRenew']);
  });

  it('replaces itself rather than stacking, and does nothing when nothing changed', async () => {
    await syncTrialReminder(trial(), NOW);
    expect(await syncTrialReminder(trial(), NOW)).toBe('unchanged');
    expect(schedule).toHaveBeenCalledTimes(1);
    await syncTrialReminder(trial({ expiresAt: NOW + 6 * DAY }), NOW);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenLastCalledWith(TRIAL_REMINDER_ID);
  });

  it('is cancelled once the person is no longer in a trial', async () => {
    await syncTrialReminder(trial(), NOW);
    expect(await syncTrialReminder(trial({ trial: false, expiresAt: NOW + 365 * DAY }), NOW)).toBe(
      'cancelled',
    );
    expect(cancel).toHaveBeenLastCalledWith(TRIAL_REMINDER_ID);
    expect(await syncTrialReminder({ ...trial(), status: 'free', trial: false }, NOW)).toBe(
      'cancelled',
    );
  });

  it('is cancelled when the trial was cancelled: no charge is coming', async () => {
    expect(await syncTrialReminder(trial({ willRenew: false }), NOW)).toBe('cancelled');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('never asks for permission: without it, nothing is scheduled', async () => {
    jest
      .mocked(getNotificationPermission)
      .mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    expect(await syncTrialReminder(trial(), NOW)).toBe('not_allowed');
    expect(schedule).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('says nothing once fewer than two days are left, where "in 2 days" would be untrue', () => {
    expect(reminderAt(trial({ expiresAt: NOW + 1.5 * DAY }), NOW)).toBeNull();
    expect(reminderAt(trial({ expiresAt: NOW + 2 * DAY + 60_000 }), NOW)).toBe(NOW + 60_000);
  });

  it('leaves things as they are while the status is still unknown', async () => {
    expect(await syncTrialReminder({ ...trial(), status: 'unknown' }, NOW)).toBe('unchanged');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('reports a native failure instead of throwing', async () => {
    schedule.mockRejectedValueOnce(new Error('native'));
    expect(await syncTrialReminder(trial(), NOW)).toBe('failed');
  });
});
