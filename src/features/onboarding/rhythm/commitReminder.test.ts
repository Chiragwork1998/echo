import { screen } from '@testing-library/react-native';

import {
  getNotificationPermission,
  openAppSettings,
  requestNotificationPermission,
} from '@/services/permissions';
import { cancelReminder, scheduleReminder } from '@/services/reminders';
import {
  backOutOfDialog,
  chooseInDialog,
  dialogChoices,
  dialogPrimary,
  openDialog,
  renderDialogHost,
} from '@/testing/dialogs';

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

// commitReminder asks from outside React, so only the dialog host is on screen here.
beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(scheduleReminder).mockResolvedValue({ ok: true });
  await renderDialogHost();
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
    const committed = commitReminder('08:00', true);
    expect(await screen.findByRole('header', { name: 'Gentle reminder' })).toBeTruthy();
    expect(screen.getByText('ECHO can gently remind you at the time you choose.')).toBeTruthy();
    expect(dialogChoices()).toEqual(['Allow', 'Not now']);
    expect(dialogPrimary()).toBe('Allow');
    expect(request).not.toHaveBeenCalled();
    await chooseInDialog('Allow');
    expect(await committed).toEqual({ status: 'scheduled', time: '08:00' });
    expect(openDialog()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(scheduleReminder).toHaveBeenCalledWith('08:00');
  });

  // Android 13 and later report a permission that was never asked as `denied`, with canAskAgain true,
  // because notifications count as off until it is granted (expo-notifications reads
  // areNotificationsEnabled before the status). Waiting for `undetermined` meant the system prompt never
  // came on a real phone, and a reminder could never be turned on. Expo Go hides it. Seen on the
  // installed release build: the switch went on, the page said notifications were off, no prompt.
  it('asks when the phone reports denied but the prompt has not been used up', async () => {
    current.mockResolvedValue({ status: 'denied', canAskAgain: true });
    request.mockResolvedValue({ status: 'granted', canAskAgain: true });
    const committed = commitReminder('08:00', true);
    await chooseInDialog('Allow');
    expect(await committed).toEqual({ status: 'scheduled', time: '08:00' });
    expect(openDialog()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not ask again once the system will no longer show its prompt', async () => {
    current.mockResolvedValue({ status: 'denied', canAskAgain: false });
    expect(await commitReminder('08:00', true)).toEqual({ status: 'not_allowed' });
    expect(openDialog()).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it.each([
    ['says not now', () => chooseInDialog('Not now')],
    [
      'goes Back',
      async () => {
        await screen.findByTestId('dialog');
        await backOutOfDialog();
      },
    ],
  ])('never shows the OS prompt when the person %s', async (_way, leave) => {
    current.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    const committed = commitReminder('08:00', true);
    await leave();
    expect(await committed).toEqual({ status: 'not_allowed' });
    expect(request).not.toHaveBeenCalled();
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it('offers Settings only after a denial', async () => {
    current.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    request.mockResolvedValue({ status: 'denied', canAskAgain: false });
    const committed = commitReminder('08:00', true);
    await chooseInDialog('Allow');
    expect(await screen.findByRole('button', { name: 'Enable in Settings' })).toBeTruthy();
    expect(dialogChoices()).toEqual(['Enable in Settings', 'Not now']);
    await chooseInDialog('Enable in Settings');
    expect(await committed).toEqual({ status: 'not_allowed' });
    expect(openAppSettings).toHaveBeenCalledTimes(1);
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it('does not claim a reminder the phone refused to schedule', async () => {
    current.mockResolvedValue({ status: 'granted', canAskAgain: true });
    jest.mocked(scheduleReminder).mockResolvedValue({ ok: false, code: 'failed' });
    expect(await commitReminder('21:30', true)).toEqual({ status: 'failed' });
  });
});
