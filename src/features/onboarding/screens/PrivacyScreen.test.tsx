import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { Dimensions, Platform } from 'react-native';

import { copy } from '@/content/copy';
import { BIOMETRICS_UNAVAILABLE } from '@/features/onboarding/privacy/PrivacyControls';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { render } from '@/testing/render';

import { PrivacyScreen } from './PrivacyScreen';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const hasHardware = jest.mocked(LocalAuthentication.hasHardwareAsync);
const isEnrolled = jest.mocked(LocalAuthentication.isEnrolledAsync);

function setWindow(width: number, height: number, fontScale = 1) {
  const metrics = { width, height, scale: 2, fontScale };
  Dimensions.set({ window: metrics, screen: metrics });
}

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  useOnboarding.setState({ ...initialOnboarding });
  hasHardware.mockResolvedValue(true);
  isEnrolled.mockResolvedValue(true);
  Platform.OS = originalOS;
  setWindow(393, 852);
});

const lock = () => screen.getByRole('switch', { name: copy.privacy.lockIos });
const backup = () => screen.getByRole('switch', { name: copy.privacy.backup });
const cta = () => screen.getByRole('button', { name: copy.privacy.cta });

describe('PrivacyScreen', () => {
  it('shows the heading, both switches off, the caption and the CTA', async () => {
    await render(<PrivacyScreen />);
    expect(screen.getByRole('header', { name: copy.privacy.title })).toBeTruthy();
    expect(screen.getByText(copy.privacy.subtitle)).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(lock()).not.toBeChecked();
    expect(backup()).not.toBeChecked();
    expect(screen.getByText(copy.privacy.caption)).toBeTruthy();
    expect(cta()).toBeEnabled();
  });

  it('names the lock Face ID on iOS', async () => {
    await render(<PrivacyScreen />);
    expect(screen.getByRole('switch', { name: copy.privacy.lockIos })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: copy.privacy.lockAndroid })).toBeNull();
  });

  it('names the lock biometrics on Android', async () => {
    Platform.OS = 'android';
    await render(<PrivacyScreen />);
    expect(screen.getByRole('switch', { name: copy.privacy.lockAndroid })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: copy.privacy.lockIos })).toBeNull();
  });

  it('leaves the caption as plain information: not a button, switch or link', async () => {
    await render(<PrivacyScreen />);
    const caption = screen.getByText(copy.privacy.caption);
    expect(caption.props.onPress).toBeUndefined();
    expect(caption.props.accessibilityRole).toBeUndefined();
    expect(screen.queryByRole('button', { name: copy.privacy.caption })).toBeNull();
  });

  it('stores the backup choice and sends nothing: no capability check, no sign-in', async () => {
    await render(<PrivacyScreen />);
    await fireEvent.press(backup());
    expect(useOnboarding.getState().privacy).toEqual({ biometricLock: false, privateBackup: true });
    expect(backup()).toBeChecked();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(hasHardware).not.toHaveBeenCalled();

    await fireEvent.press(backup());
    expect(useOnboarding.getState().privacy.privateBackup).toBe(false);
  });

  it('turns the lock on after checking the phone has biometrics set up', async () => {
    await render(<PrivacyScreen />);
    await fireEvent.press(lock());
    await waitFor(() => expect(lock()).toBeChecked());
    expect(hasHardware).toHaveBeenCalledTimes(1);
    expect(isEnrolled).toHaveBeenCalledTimes(1);
    expect(useOnboarding.getState().privacy).toEqual({ biometricLock: true, privateBackup: false });
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
  });

  it('keeps the two choices independent of each other', async () => {
    await render(<PrivacyScreen />);
    await fireEvent.press(backup());
    await fireEvent.press(lock());
    await waitFor(() => expect(lock()).toBeChecked());
    expect(useOnboarding.getState().privacy).toEqual({ biometricLock: true, privateBackup: true });
    await fireEvent.press(lock());
    expect(useOnboarding.getState().privacy).toEqual({ biometricLock: false, privateBackup: true });
  });

  it('does not check the phone again when the lock is turned off', async () => {
    useOnboarding.setState({ privacy: { biometricLock: true, privateBackup: false } });
    await render(<PrivacyScreen />);
    await fireEvent.press(lock());
    expect(lock()).not.toBeChecked();
    expect(hasHardware).not.toHaveBeenCalled();
  });

  it.each([
    ['has no biometric hardware', () => hasHardware.mockResolvedValue(false)],
    ['has no face or fingerprint enrolled', () => isEnrolled.mockResolvedValue(false)],
    ['fails to answer', () => hasHardware.mockRejectedValue(new Error('unavailable'))],
  ])('shows the lock as unavailable, with a hint, when the phone %s', async (_name, arrange) => {
    arrange();
    await render(<PrivacyScreen />);
    await fireEvent.press(lock());
    await waitFor(() => expect(lock()).toBeDisabled());
    expect(lock()).not.toBeChecked();
    expect(lock().props.accessibilityHint).toBe(BIOMETRICS_UNAVAILABLE);
    expect(screen.getByText(BIOMETRICS_UNAVAILABLE)).toBeTruthy();
    expect(useOnboarding.getState().privacy.biometricLock).toBe(false);
  });

  it('never blocks the journey when biometrics are unavailable', async () => {
    hasHardware.mockResolvedValue(false);
    await render(<PrivacyScreen />);
    await fireEvent.press(lock());
    await waitFor(() => expect(lock()).toBeDisabled());
    expect(cta()).toBeEnabled();
    await fireEvent.press(backup());
    await fireEvent.press(cta());
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/arrival');
  });

  it('continues to Arrival with every combination of choices, and keeps what was chosen', async () => {
    await render(<PrivacyScreen />);
    await fireEvent.press(backup());
    await fireEvent.press(cta());
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/arrival');
    expect(useOnboarding.getState().privacy.privateBackup).toBe(true);
  });

  it('goes back to Rhythm', async () => {
    await render(<PrivacyScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/rhythm');
  });
});

describe('PrivacyScreen at large text sizes and in landscape', () => {
  it('keeps both switches, the caption and the CTA usable at 150% text', async () => {
    setWindow(393, 852, 1.5);
    await render(<PrivacyScreen />);
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(screen.getByText(copy.privacy.caption)).toBeTruthy();
    await fireEvent.press(backup());
    expect(useOnboarding.getState().privacy.privateBackup).toBe(true);
    await fireEvent.press(cta());
    expect(router.navigate).toHaveBeenCalledWith('/onboarding/arrival');
  });

  it('keeps both switches and the CTA in landscape', async () => {
    setWindow(852, 393);
    await render(<PrivacyScreen />);
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(cta()).toBeEnabled();
  });
});
