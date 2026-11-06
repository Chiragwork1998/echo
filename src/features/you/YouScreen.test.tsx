import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, Dimensions, Linking } from 'react-native';

import { showToast } from '@/components/Toast';
import { copy } from '@/content/copy';
import { commitReminder } from '@/features/onboarding/rhythm/commitReminder';
import { deleteAllLocal } from '@/services/deleteAllLocal';
import { authenticate, verifyLockAvailable } from '@/services/biometric';
import { exportJournal } from '@/services/exportJournal';
import { getNotificationPermission, openAppSettings } from '@/services/permissions';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { usePreferences, VOICE_POLICY_VERSION } from '@/state/preferences';
import { render } from '@/testing/render';

import { sessionCopy } from '@/features/journal-session/sessionCopy';

import { SUPPORT_EMAIL } from './support';
import { YouScreen } from './YouScreen';
import { youCopy } from './youCopy';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
  usePathname: () => '/home/you',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/services/biometric', () => ({
  authenticate: jest.fn(),
  verifyLockAvailable: jest.fn(),
}));
jest.mock('@/services/exportJournal', () => ({ exportJournal: jest.fn() }));
jest.mock('@/services/deleteAllLocal', () => ({ deleteAllLocal: jest.fn() }));
jest.mock('@/services/permissions', () => ({
  getNotificationPermission: jest.fn(),
  openAppSettings: jest.fn(),
}));
jest.mock('@/features/onboarding/rhythm/commitReminder', () => ({ commitReminder: jest.fn() }));
jest.mock('@/components/Toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false }],
}));

const verifyLock = jest.mocked(verifyLockAvailable);
const alert = () => jest.mocked(Alert.alert);
const lock = () => screen.getByRole('switch', { name: copy.privacy.lockIos });
const reminder = () => screen.getByRole('switch', { name: copy.rhythm.reminder });
const button = (name: string | RegExp) => screen.getByRole('button', { name });

/** Press a button in the most recent native alert, as a person would. */
async function chooseInAlert(text: string) {
  const buttons = alert().mock.lastCall?.[2];
  const chosen = buttons?.find((b) => b.text === text);
  await act(async () => chosen?.onPress?.());
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  usePreferences.setState({ theme: 'night' });
  useOnboarding.setState({ ...initialOnboarding });
  verifyLock.mockResolvedValue({ ok: true });
  jest
    .mocked(getNotificationPermission)
    .mockResolvedValue({ status: 'granted', canAskAgain: true });
  jest.mocked(commitReminder).mockResolvedValue({ status: 'off' });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
});

describe('You: theme', () => {
  it('offers Day, Night and Automatic, with Night chosen by default, and changes it', async () => {
    await render(<YouScreen />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: youCopy.night })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: youCopy.day }));
    expect(usePreferences.getState().theme).toBe('day');
    expect(screen.getByRole('radio', { name: youCopy.day })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: new RegExp(youCopy.automatic) }));
    expect(usePreferences.getState().theme).toBe('automatic');
  });
});

describe('You: reminder', () => {
  it('saves the choice and applies it through commitReminder', async () => {
    await render(<YouScreen />);
    expect(reminder()).not.toBeChecked();
    await fireEvent.press(reminder());
    expect(useOnboarding.getState().reminder.enabled).toBe(true);
    await waitFor(() => expect(commitReminder).toHaveBeenCalledWith('21:30', true));
    await fireEvent.press(reminder());
    await waitFor(() => expect(commitReminder).toHaveBeenLastCalledWith('21:30', false));
    expect(useOnboarding.getState().reminder.enabled).toBe(false);
  });

  it('meets a reminder that was scheduled with a toast, and says nothing otherwise', async () => {
    await render(<YouScreen />);
    jest.mocked(commitReminder).mockResolvedValueOnce({ status: 'scheduled', time: '21:30' });
    await fireEvent.press(reminder());
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('We’ll meet you at 9:30 PM.'));
    await fireEvent.press(reminder());
    await waitFor(() => expect(commitReminder).toHaveBeenLastCalledWith('21:30', false));
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('does not promise a reminder the phone will not deliver, and links to Settings', async () => {
    jest
      .mocked(getNotificationPermission)
      .mockResolvedValue({ status: 'denied', canAskAgain: false });
    await render(<YouScreen />);
    await fireEvent.press(reminder());
    expect(await screen.findByText(youCopy.reminderBlocked)).toBeTruthy();
    await fireEvent.press(button(youCopy.openSettings));
    expect(openAppSettings).toHaveBeenCalled();
  });

  it('shows the saved time as a button that opens the picker', async () => {
    await render(<YouScreen />);
    expect(button(new RegExp(youCopy.reminderTime))).toBeTruthy();
  });
});

describe('You: privacy', () => {
  it('turns the lock on only after the person has passed it', async () => {
    await render(<YouScreen />);
    await fireEvent.press(lock());
    await waitFor(() => expect(lock()).toBeChecked());
    expect(verifyLock).toHaveBeenCalledTimes(1);
    expect(useOnboarding.getState().privacy.biometricLock).toBe(true);
  });

  it('keeps the lock off, and says why, when the phone has no passcode or biometrics', async () => {
    verifyLock.mockResolvedValue({ ok: false, reason: 'no_credentials' });
    await render(<YouScreen />);
    await fireEvent.press(lock());
    expect(await screen.findByText(youCopy.lockUnavailable)).toBeTruthy();
    expect(lock()).not.toBeChecked();
    expect(useOnboarding.getState().privacy.biometricLock).toBe(false);
  });

  it('says nothing when the person dismisses the prompt, and leaves the lock off', async () => {
    verifyLock.mockResolvedValue({ ok: false, reason: 'cancelled' });
    await render(<YouScreen />);
    await fireEvent.press(lock());
    await waitFor(() => expect(verifyLock).toHaveBeenCalled());
    expect(screen.queryByText(youCopy.lockUnavailable)).toBeNull();
    expect(screen.queryByText(youCopy.lockFailed)).toBeNull();
    expect(lock()).not.toBeChecked();
  });

  it('turns the lock off only after the person passes it, keeping the backup choice', async () => {
    useOnboarding.setState({ privacy: { biometricLock: true, privateBackup: true } });
    jest.mocked(authenticate).mockResolvedValue({ ok: true });
    await render(<YouScreen />);
    await fireEvent.press(lock());
    await waitFor(() => expect(lock()).not.toBeChecked());
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(useOnboarding.getState().privacy).toEqual({ biometricLock: false, privateBackup: true });
  });

  it.each(['cancelled', 'failed', 'lockout', 'system'] as const)(
    'keeps the lock on when turning it off ends with %s',
    async (reason) => {
      useOnboarding.setState({ privacy: { biometricLock: true, privateBackup: false } });
      jest.mocked(authenticate).mockResolvedValue({ ok: false, reason });
      await render(<YouScreen />);
      await fireEvent.press(lock());
      await waitFor(() => expect(authenticate).toHaveBeenCalled());
      expect(useOnboarding.getState().privacy.biometricLock).toBe(true);
    },
  );

  it('lets the lock go when the device has no credentials left, so nobody is trapped', async () => {
    useOnboarding.setState({ privacy: { biometricLock: true, privateBackup: false } });
    jest.mocked(authenticate).mockResolvedValue({ ok: false, reason: 'no_credentials' });
    await render(<YouScreen />);
    await fireEvent.press(lock());
    await waitFor(() => expect(useOnboarding.getState().privacy.biometricLock).toBe(false));
  });

  it('shows private backup and AI reflection as not available yet, with no control', async () => {
    await render(<YouScreen />);
    expect(screen.getByLabelText(new RegExp(`${youCopy.backup}. Not available yet`))).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(`${youCopy.ai}. Not available yet`))).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
  });
});

describe('You: Turn my voice into words', () => {
  const voiceSwitch = () => screen.getByRole('switch', { name: youCopy.voiceWords });

  beforeEach(() => usePreferences.setState({ voiceConsent: null }));

  it('is off until the person has agreed, and sends nothing by being looked at', async () => {
    await render(<YouScreen />);
    expect(voiceSwitch()).not.toBeChecked();
    expect(screen.queryByText(sessionCopy.consent.title)).toBeNull();
  });

  it('shows what leaves the phone before turning on, and turns on only with Allow', async () => {
    await render(<YouScreen />);
    await fireEvent.press(voiceSwitch());
    expect(await screen.findByText(sessionCopy.consent.title)).toBeTruthy();
    for (const fact of sessionCopy.consent.facts) expect(screen.getByText(fact)).toBeTruthy();
    expect(voiceSwitch()).not.toBeChecked();
    expect(usePreferences.getState().voiceConsent).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.consent.allow }));
    expect(usePreferences.getState().voiceConsent).toEqual({
      choice: 'allowed',
      version: VOICE_POLICY_VERSION,
    });
    expect(voiceSwitch()).toBeChecked();
  });

  it('keeps the voice on the phone with Keep my voice only', async () => {
    await render(<YouScreen />);
    await fireEvent.press(voiceSwitch());
    await fireEvent.press(await screen.findByRole('button', { name: sessionCopy.consent.keep }));
    expect(usePreferences.getState().voiceConsent?.choice).toBe('voice_only');
    expect(voiceSwitch()).not.toBeChecked();
  });

  it('turns off at once, and a choice made under an older policy asks again', async () => {
    usePreferences.setState({
      voiceConsent: { choice: 'allowed', version: VOICE_POLICY_VERSION },
    });
    await render(<YouScreen />);
    expect(voiceSwitch()).toBeChecked();
    await fireEvent.press(voiceSwitch());
    expect(usePreferences.getState().voiceConsent?.choice).toBe('voice_only');
    expect(voiceSwitch()).not.toBeChecked();

    await act(async () =>
      usePreferences.setState({ voiceConsent: { choice: 'allowed', version: 0 } }),
    );
    expect(voiceSwitch()).not.toBeChecked();
  });
});

describe('You: export', () => {
  it('shows that it is working, then what was prepared', async () => {
    let finish: (value: Awaited<ReturnType<typeof exportJournal>>) => void = () => undefined;
    jest.mocked(exportJournal).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render(<YouScreen />);
    await fireEvent.press(button(new RegExp(youCopy.export)));
    expect(
      await screen.findByRole('button', { name: new RegExp(youCopy.exporting) }),
    ).toBeDisabled();
    await act(async () => finish({ ok: true, exported: 3, unreadable: 1 }));
    expect(await screen.findByText(/Prepared 3 echoes for sharing\./)).toBeTruthy();
    expect(screen.getByText(/1 echo can’t be opened, so it was left out\./)).toBeTruthy();
  });

  it.each([
    ['failed' as const, youCopy.exportFailed],
    ['unavailable' as const, youCopy.exportUnavailable],
  ])('says so when the export is %s', async (code, message) => {
    jest.mocked(exportJournal).mockResolvedValue({ ok: false, code });
    await render(<YouScreen />);
    await fireEvent.press(button(new RegExp(youCopy.export)));
    expect(await screen.findByText(message)).toBeTruthy();
  });
});

describe('You: delete all data', () => {
  const start = async () => {
    await render(<YouScreen />);
    await fireEvent.press(button(new RegExp(youCopy.deleteAll)));
  };

  it('asks twice, and states that it cannot be undone, before anything is deleted', async () => {
    await start();
    expect(alert()).toHaveBeenCalledTimes(1);
    expect(alert().mock.lastCall?.[1]).toMatch(/can’t be undone/);
    await chooseInAlert(youCopy.deleteContinue);
    expect(alert()).toHaveBeenCalledTimes(2);
    expect(alert().mock.lastCall?.[0]).toBe(youCopy.deleteFinalTitle);
    expect(alert().mock.lastCall?.[1]).toMatch(/gone for good/);
    expect(deleteAllLocal).not.toHaveBeenCalled();
  });

  it('deletes only after the second confirmation', async () => {
    jest.mocked(deleteAllLocal).mockResolvedValue({ ok: true });
    await start();
    await chooseInAlert(youCopy.deleteContinue);
    await chooseInAlert(youCopy.deleteConfirm);
    expect(deleteAllLocal).toHaveBeenCalledTimes(1);
  });

  it('deletes nothing when either step is cancelled', async () => {
    await start();
    await chooseInAlert(youCopy.deleteCancel);
    expect(alert()).toHaveBeenCalledTimes(1);
    await fireEvent.press(button(new RegExp(youCopy.deleteAll)));
    await chooseInAlert(youCopy.deleteContinue);
    await chooseInAlert(youCopy.deleteCancel);
    expect(deleteAllLocal).not.toHaveBeenCalled();
  });

  it('shows progress, then an error that invites another try when it does not finish', async () => {
    let finish: (value: Awaited<ReturnType<typeof deleteAllLocal>>) => void = () => undefined;
    jest.mocked(deleteAllLocal).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await start();
    await chooseInAlert(youCopy.deleteContinue);
    await chooseInAlert(youCopy.deleteConfirm);
    expect(
      await screen.findByRole('button', { name: new RegExp(youCopy.deleting) }),
    ).toBeDisabled();
    await act(async () => finish({ ok: false, code: 'delete_incomplete' }));
    expect(await screen.findByText(youCopy.deleteFailed)).toBeTruthy();
    expect(button(new RegExp(youCopy.deleteAll))).toBeEnabled();
  });
});

describe('You: support and about', () => {
  it('opens an email with no echoes attached, and says if there is no email app', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await render(<YouScreen />);
    await fireEvent.press(button(new RegExp(youCopy.supportAction)));
    const url = String(open.mock.calls[0]?.[0]);
    expect(url).toContain(`mailto:${SUPPORT_EMAIL}`);
    expect(url).not.toMatch(/body=/);

    open.mockRejectedValue(new Error('no mail app'));
    await fireEvent.press(button(new RegExp(youCopy.supportAction)));
    expect(await screen.findByText(youCopy.supportFailed(SUPPORT_EMAIL))).toBeTruthy();
  });

  it('states that ECHO is wellness software, not therapy, diagnosis or emergency care', async () => {
    await render(<YouScreen />);
    expect(screen.getByText(youCopy.statement)).toBeTruthy();
    expect(screen.getByRole('header', { name: youCopy.title })).toBeTruthy();
  });
});
