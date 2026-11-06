import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getNotificationPermission } from './permissions';
import { cancelReminder, REMINDER_BODY, scheduleReminder } from './reminders';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('./permissions', () => ({
  getNotificationPermission: jest.fn(),
}));

const schedule = jest.mocked(Notifications.scheduleNotificationAsync);

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(getNotificationPermission)
    .mockResolvedValue({ status: 'granted', canAskAgain: true });
});

describe('scheduleReminder', () => {
  it('uses the fixed body and carries no data', async () => {
    expect(await scheduleReminder('21:30')).toEqual({ ok: true });
    const content = schedule.mock.calls[0]?.[0].content;
    expect(content?.body).toBe('A small space is waiting for you.');
    expect(content?.body).toBe(REMINDER_BODY);
    expect(content?.title).toBe('ECHO');
    expect(content?.data).toEqual({});
    expect(content?.subtitle).toBeUndefined();
  });

  it('accepts nothing that could carry content: time is its only input', () => {
    expect(scheduleReminder).toHaveLength(1);
  });

  it('schedules daily on the local clock', async () => {
    await scheduleReminder('08:05');
    expect(schedule.mock.calls[0]?.[0].trigger).toMatchObject({
      type: 'daily',
      hour: 8,
      minute: 5,
    });
  });

  it('replaces the previous reminder instead of adding another', async () => {
    await scheduleReminder('08:00');
    await scheduleReminder('09:00');
    const cancel = jest.mocked(Notifications.cancelScheduledNotificationAsync);
    expect(cancel).toHaveBeenCalledTimes(2);
    const ids = schedule.mock.calls.map((call) => call[0].identifier);
    expect(new Set(ids).size).toBe(1);
    expect(cancel).toHaveBeenLastCalledWith(ids[0]);
  });

  it('never prompts: without permission it reports and schedules nothing', async () => {
    jest
      .mocked(getNotificationPermission)
      .mockResolvedValue({ status: 'denied', canAskAgain: true });
    expect(await scheduleReminder('21:30')).toEqual({ ok: false, code: 'permission_required' });
    expect(schedule).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it.each(['9:30', '24:00', '21:60', 'evening', ''])('rejects the time %j', async (time) => {
    expect(await scheduleReminder(time)).toEqual({ ok: false, code: 'invalid_time' });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('reports a native failure instead of throwing', async () => {
    schedule.mockRejectedValueOnce(new Error('native'));
    expect(await scheduleReminder('21:30')).toEqual({ ok: false, code: 'failed' });
  });

  it('creates an Android channel, which Android requires', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    await scheduleReminder('21:30');
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalled();
    const trigger = schedule.mock.calls[0]?.[0].trigger;
    expect(trigger).toMatchObject({ channelId: 'echo.reminders' });
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });
});

describe('cancelReminder', () => {
  it('cancels the reminder', async () => {
    expect(await cancelReminder()).toEqual({ ok: true });
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  });
});
