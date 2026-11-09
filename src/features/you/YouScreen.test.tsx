import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions, Linking, StyleSheet } from 'react-native';

import { showToast } from '@/components/Toast';
import { links } from '@/config/links';
import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { tokens } from '@/design/tokens';
import { reanimatedMock } from '@/testing/reanimatedMock';
import { supportCopy } from '@/features/patterns/supportResources';
import { commitReminder } from '@/features/onboarding/rhythm/commitReminder';
import { deleteAllLocal } from '@/services/deleteAllLocal';
import { authenticate, verifyLockAvailable } from '@/services/biometric';
import { exportJournal } from '@/services/exportJournal';
import { getNotificationPermission, openAppSettings } from '@/services/permissions';
import { plusCopy } from '@/features/plus/plusCopy';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { usePreferences, VOICE_POLICY_VERSION } from '@/state/preferences';
import {
  backOutOfDialog,
  chooseInDialog,
  dialogChoices,
  dialogPrimary,
  openDialog,
  renderWithDialogs,
} from '@/testing/dialogs';
import { withBillingForTests, withoutBillingForTests } from '@/testing/plus';
import { render } from '@/testing/render';

import { sessionCopy } from '@/features/journal-session/sessionCopy';

import { SUPPORT_EMAIL } from './support';
import { YouScreen } from './YouScreen';
import { youCopy } from './youCopy';

const mockUpdates: { isEmbeddedLaunch: boolean; createdAt: Date | null } = {
  isEmbeddedLaunch: true,
  createdAt: null,
};
jest.mock('expo-updates', () => mockUpdates);
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
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
jest.mock('@/design/haptics');
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false }],
}));

const verifyLock = jest.mocked(verifyLockAvailable);
const lock = () => screen.getByRole('switch', { name: copy.privacy.lockIos });
const reminder = () => screen.getByRole('switch', { name: copy.rhythm.reminder });
const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  jest.clearAllMocks();
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

  it('is felt as a tick on a new choice, and not on the one already chosen', async () => {
    jest.mocked(cue).mockClear();
    await render(<YouScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: youCopy.night }));
    expect(cue).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: youCopy.day }));
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('tick');
  });
});

describe('You: About', () => {
  it('says the code is as installed when the launch was the built-in one', async () => {
    mockUpdates.isEmbeddedLaunch = true;
    mockUpdates.createdAt = null;
    await render(<YouScreen />);
    expect(screen.getByTestId('you-update')).toHaveTextContent(youCopy.updateInstalled);
  });

  it('says when the update in use was made, so one can be seen to have arrived', async () => {
    mockUpdates.isEmbeddedLaunch = false;
    mockUpdates.createdAt = new Date(2026, 10, 9, 14, 5);
    await render(<YouScreen />);
    expect(screen.getByTestId('you-update')).toHaveTextContent('Update of 9 Nov, 2:05 pm');
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

  it('offers only what exists: four switches, and no row for a feature that is not there', async () => {
    await render(<YouScreen />);
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    expect(screen.queryByText(/Not available yet/)).toBeNull();
    expect(screen.queryByText(/^AI /)).toBeNull();
  });

  it('keeps the longer explanations behind About this, and opens them on a tap', async () => {
    await render(<YouScreen />);
    expect(screen.queryByText(youCopy.voiceWordsDetail)).toBeNull();
    const about = screen.getByRole('button', { name: youCopy.aboutThis });
    expect(about).toBeCollapsed();
    await fireEvent.press(about);
    expect(screen.getByText(new RegExp(youCopy.voiceWordsDetail.slice(0, 40)))).toBeTruthy();
    expect(screen.getByText(new RegExp(youCopy.tidyWordsDetail.slice(0, 40)))).toBeTruthy();
    expect(screen.getByRole('button', { name: youCopy.aboutThis })).toBeExpanded();
  });

  it('turns its chevron over 320 ms as the words arrive, and turns it back on a second tap', async () => {
    const timing = jest.spyOn(reanimatedMock, 'withTiming');
    await render(<YouScreen />);
    timing.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: youCopy.aboutThis }));
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 320 }));
    timing.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: youCopy.aboutThis }));
    expect(timing).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 320 }));
    timing.mockRestore();
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

describe('You: Tidy my words (D-008)', () => {
  const tidySwitch = () => screen.getByRole('switch', { name: youCopy.tidyWords });
  beforeEach(() => usePreferences.setState({ tidyWords: false }));

  it('is off by default, so a journal keeps the exact words', async () => {
    await render(<YouScreen />);
    expect(tidySwitch()).not.toBeChecked();
    expect(usePreferences.getState().tidyWords).toBe(false);
  });

  it('turns on and off at once, and says what it does to the words and to OpenAI', async () => {
    await render(<YouScreen />);
    await fireEvent.press(tidySwitch());
    expect(usePreferences.getState().tidyWords).toBe(true);
    expect(tidySwitch()).toBeChecked();
    await fireEvent.press(tidySwitch());
    expect(usePreferences.getState().tidyWords).toBe(false);
    expect(youCopy.tidyWordsDetail).toMatch(/exact words/);
    expect(youCopy.tidyWordsDetail).toMatch(/30 days/);
    expect(youCopy.voiceWordsDetail).toMatch(/not stored/);
  });

  describe('with ECHO Plus for sale', () => {
    afterEach(() => withoutBillingForTests());

    it('opens the paywall instead of turning Tidy on, for someone without Plus', async () => {
      withBillingForTests({ status: 'free', source: 'live' });
      await render(<YouScreen />);
      await fireEvent.press(tidySwitch());
      expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { feature: 'tidy' } });
      expect(usePreferences.getState().tidyWords).toBe(false);
      expect(tidySwitch()).not.toBeChecked();
    });

    it('always lets Tidy be turned off', async () => {
      withBillingForTests({ status: 'free', source: 'cache' });
      usePreferences.setState({ tidyWords: true });
      await render(<YouScreen />);
      await fireEvent.press(tidySwitch());
      expect(usePreferences.getState().tidyWords).toBe(false);
      expect(router.push).not.toHaveBeenCalled();
    });

    it('turns Tidy on for someone with Plus', async () => {
      withBillingForTests({ status: 'plus' });
      await render(<YouScreen />);
      await fireEvent.press(tidySwitch());
      expect(usePreferences.getState().tidyWords).toBe(true);
      expect(router.push).not.toHaveBeenCalled();
    });
  });
});

describe('You: ECHO Plus', () => {
  afterEach(() => withoutBillingForTests());

  it('leads with the ECHO Plus row where Plus can be bought', async () => {
    withBillingForTests({ status: 'free', source: 'live' });
    await render(<YouScreen />);
    expect(button(`${plusCopy.youRow}. ${plusCopy.youRowDetail}`)).toBeTruthy();
  });

  it('has no Plus row in a build without billing', async () => {
    await render(<YouScreen />);
    expect(screen.queryByText(plusCopy.youRowDetail)).toBeNull();
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

  it('says what was prepared on the Export row itself, never below the group under the tab bar', async () => {
    jest.mocked(exportJournal).mockResolvedValue({ ok: true, exported: 4, unreadable: 0 });
    await render(<YouScreen />);
    await fireEvent.press(button(new RegExp(youCopy.export)));
    const row = await screen.findByRole('button', {
      name: /^Export your journal\. Prepared 4 echoes for sharing\.$/,
    });
    expect(within(row).getByText(/Prepared 4 echoes for sharing\./)).toBeTruthy();
    expect(screen.getAllByText(/Prepared 4 echoes for sharing\./)).toHaveLength(1);
  });

  it('holds the row at two lines of detail whether it describes or reports: nothing below it moves', async () => {
    const room = (text: string | RegExp) =>
      (StyleSheet.flatten(screen.getByText(text).props.style) as { minHeight?: number }).minHeight;
    jest.mocked(exportJournal).mockResolvedValue({ ok: true, exported: 9, unreadable: 0 });
    await render(<YouScreen />);
    const idle = room(youCopy.exportDetail);
    expect(idle).toBeGreaterThanOrEqual(40);
    await fireEvent.press(button(new RegExp(youCopy.export)));
    await screen.findByText(/Prepared 9 echoes for sharing\./);
    expect(room(/Prepared 9 echoes for sharing\./)).toBe(idle);
  });

  it.each([
    ['failed' as const, youCopy.exportFailed],
    ['unavailable' as const, youCopy.exportUnavailable],
  ])('says so on the Export row when the export is %s', async (code, message) => {
    jest.mocked(exportJournal).mockResolvedValue({ ok: false, code });
    await render(<YouScreen />);
    await fireEvent.press(button(new RegExp(youCopy.export)));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(within(button(new RegExp(youCopy.export))).getByText(message)).toBeTruthy();
  });
});

describe('You: delete all data', () => {
  const start = async () => {
    await renderWithDialogs(<YouScreen />);
    await fireEvent.press(button(new RegExp(youCopy.deleteAll)));
  };

  it('sets its row in the page’s ink, never orange: the dialogs carry the weight', async () => {
    await render(<YouScreen />);
    const night = tokens.color.night;
    const label = within(button(new RegExp(youCopy.deleteAll))).getByText(youCopy.deleteAll);
    const ink = StyleSheet.flatten(label.props.style).color;
    expect(ink).toBe(night.textPrimary);
    expect(ink).not.toBe(night.danger);
  });

  it('asks twice, and states that it cannot be undone, before anything is deleted', async () => {
    await start();
    expect(screen.getByRole('header', { name: youCopy.deleteFirstTitle })).toBeTruthy();
    expect(screen.getByText(youCopy.deleteFirstBody)).toBeTruthy();
    expect(youCopy.deleteFirstBody).toMatch(/can’t be undone/);
    // Going on toward deleting is never the inviting button: both are quiet, and Cancel is last.
    expect(dialogChoices()).toEqual([youCopy.deleteContinue, youCopy.deleteCancel]);
    expect(dialogPrimary()).toBeNull();
    await chooseInDialog(youCopy.deleteContinue);
    expect(screen.getByRole('header', { name: youCopy.deleteFinalTitle })).toBeTruthy();
    expect(screen.getByText(youCopy.deleteFinalBody)).toBeTruthy();
    expect(youCopy.deleteFinalBody).toMatch(/gone for good/);
    expect(dialogChoices()).toEqual([youCopy.deleteConfirm, youCopy.deleteCancel]);
    expect(dialogPrimary()).toBeNull();
    expect(deleteAllLocal).not.toHaveBeenCalled();
  });

  it('deletes only after the second confirmation', async () => {
    jest.mocked(deleteAllLocal).mockResolvedValue({ ok: true });
    await start();
    await chooseInDialog(youCopy.deleteContinue);
    await chooseInDialog(youCopy.deleteConfirm);
    expect(deleteAllLocal).toHaveBeenCalledTimes(1);
  });

  it('is felt once, as a settling, at the final confirmation and nowhere before it', async () => {
    jest.mocked(deleteAllLocal).mockResolvedValue({ ok: true });
    jest.mocked(cue).mockClear();
    await start();
    await chooseInDialog(youCopy.deleteContinue);
    expect(cue).not.toHaveBeenCalled();
    await chooseInDialog(youCopy.deleteConfirm);
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('settle');
  });

  it('deletes nothing when either step is cancelled', async () => {
    await start();
    await chooseInDialog(youCopy.deleteCancel);
    expect(openDialog()).toBeNull();
    await fireEvent.press(button(new RegExp(youCopy.deleteAll)));
    await chooseInDialog(youCopy.deleteContinue);
    await chooseInDialog(youCopy.deleteCancel);
    expect(openDialog()).toBeNull();
    expect(deleteAllLocal).not.toHaveBeenCalled();
  });

  it('deletes nothing when either step is left with Back', async () => {
    await start();
    await backOutOfDialog();
    expect(openDialog()).toBeNull();
    await fireEvent.press(button(new RegExp(youCopy.deleteAll)));
    await chooseInDialog(youCopy.deleteContinue);
    await backOutOfDialog();
    expect(openDialog()).toBeNull();
    expect(deleteAllLocal).not.toHaveBeenCalled();
  });

  it('shows progress, then an error that invites another try when it does not finish', async () => {
    let finish: (value: Awaited<ReturnType<typeof deleteAllLocal>>) => void = () => undefined;
    jest.mocked(deleteAllLocal).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await start();
    await chooseInDialog(youCopy.deleteContinue);
    await chooseInDialog(youCopy.deleteConfirm);
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

  it('says plainly that the voice in Breathe is AI generated, made with OpenAI', async () => {
    await render(<YouScreen />);
    expect(screen.getByText(youCopy.breatheVoice)).toBeTruthy();
    expect(youCopy.breatheVoice).toBe(
      'The voice in Breathe is AI generated, made with OpenAI. It is not a real person.',
    );
  });

  it('opens the support panel at any time, with someone to call and a way to close it', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await render(<YouScreen />);
    expect(screen.queryByRole('header', { name: supportCopy.openTitle })).toBeNull();
    await fireEvent.press(button(new RegExp(youCopy.struggling)));
    expect(await screen.findByRole('header', { name: supportCopy.openTitle })).toBeTruthy();
    expect(screen.getByText(supportCopy.reach)).toBeTruthy();
    // It assumes nothing: the line about pattern cards belongs to Patterns alone.
    expect(screen.queryByText(supportCopy.body)).toBeNull();
    await fireEvent.press(screen.getByRole('link', { name: /Find a Helpline/ }));
    expect(open).toHaveBeenCalledWith('https://findahelpline.com');
    await fireEvent.press(screen.getByRole('button', { name: supportCopy.close }));
    await waitFor(() =>
      expect(screen.queryByRole('header', { name: supportCopy.openTitle })).toBeNull(),
    );
  });

  it('opens the privacy policy and the terms from the one list of links', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await render(<YouScreen />);
    await fireEvent.press(screen.getByRole('link', { name: youCopy.privacyPolicy }));
    expect(open).toHaveBeenLastCalledWith(links.privacy);
    await fireEvent.press(screen.getByRole('link', { name: youCopy.terms }));
    expect(open).toHaveBeenLastCalledWith(links.terms);
  });

  it('says where a page is when it cannot be opened', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));
    await render(<YouScreen />);
    await fireEvent.press(screen.getByRole('link', { name: youCopy.terms }));
    expect(await screen.findByText(youCopy.pageFailed(links.terms))).toBeTruthy();
  });

  it('reads the support address from the one list of links', () => {
    expect(SUPPORT_EMAIL).toBe(links.supportEmail);
  });
});
