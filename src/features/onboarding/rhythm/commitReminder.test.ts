import { Alert } from 'react-native';

import {
  getNotificationPermission,
  openAppSettings,
  requestNotificationPermission,
} from '@/services/permissions';
import { cancelReminder, scheduleReminder } from '@/services/reminders';

import { commitReminder } from './commitReminder';

jest.mock('@/services/permissions', () => ({
  getNotificationPermission: jest.fn(),
  requestNotificationPermission: jest.fn(),
  openAppSettings: jest.fn(),
}));
jest.mock('@/services/reminders', () => ({
  cancelReminder: jest.fn(),
  scheduleReminder: jest.fn(),
}));

const current = jest.mocked(getNotificationPermission);
const request = jest.mocked(requestNotificationPermission);

/** Answers each alert in turn, pressing the named button. */
function answer(...choices: string[]) {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    const choice = choices.shift();
    buttons?.find((button) => button.text === choice)?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(scheduleReminder).mockResolvedValue({ ok: true });
});

describe('commitReminder', () => {
  it('cancels, and never asks, when the reminder is off', async () => {
    expect(await commitReminder('21:30', false)).toEqual({ status: 'off' });
    expect(cancelReminder).toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it('schedules without prompting when already allowed, and says so', async () => {
    current.mockResolvedValue({ status: 'granted', canAskAgain: true });
    expect(await commitReminder('21:30', true)).toEqual({ status: 'scheduled', time: '21:30' });
    expect(request).not.toHaveBeenCalled();
    expect(scheduleReminder).toHaveBeenCalledWith('21:30');
  });

  it('explains first, then shows the OS prompt, then schedules', async () => {
    current.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    request.mockResolvedValue({ status: 'granted', canAskAgain: true });
    answer('Allow');
    expect(await commitReminder('08:00', true)).toEqual({ status: 'scheduled', time: '08:00' });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(scheduleReminder).toHaveBeenCalledWith('08:00');
  });

  it('never shows the OS prompt when the person says not now', async () => {
    current.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    answer('Not now');
    expect(await commitReminder('08:00', true)).toEqual({ status: 'not_allowed' });
    expect(request).not.toHaveBeenCalled();
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it('offers Settings only after a denial', async () => {
    current.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    request.mockResolvedValue({ status: 'denied', canAskAgain: false });
    answer('Allow', 'Enable in Settings');
    expect(await commitReminder('08:00', true)).toEqual({ status: 'not_allowed' });
    expect(openAppSettings).toHaveBeenCalledTimes(1);
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it('does not claim a reminder the phone refused to schedule', async () => {
    current.mockResolvedValue({ status: 'granted', canAskAgain: true });
    jest.mocked(scheduleReminder).mockResolvedValue({ ok: false, code: 'failed' });
    expect(await commitReminder('21:30', true)).toEqual({ status: 'failed' });
  });
});
