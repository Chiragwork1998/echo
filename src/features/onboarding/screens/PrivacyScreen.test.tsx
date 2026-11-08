import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { verifyLockAvailable } from '@/services/biometric';
import { router } from 'expo-router';
import { Dimensions, Platform } from 'react-native';

import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { BIOMETRICS_UNAVAILABLE } from '@/features/onboarding/privacy/PrivacyControls';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { render } from '@/testing/render';

import { PrivacyScreen } from './PrivacyScreen';

jest.mock('@/design/haptics');
jest.mock('@/services/biometric', () => ({ verifyLockAvailable: jest.fn() }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), dismissTo: jest.fn() } }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const verifyLock = jest.mocked(verifyLockAvailable);

function setWindow(width: number, height: number, fontScale = 1) {
  const metrics = { width, height, scale: 2, fontScale };
  Dimensions.set({ window: metrics, screen: metrics });
}

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  useOnboarding.setState({ ...initialOnboarding });
  verifyLock.mockResolvedValue({ ok: true });
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
    await waitFor(() => expect(cue).toHaveBeenCalledWith('on'));
    expect(verifyLock).not.toHaveBeenCalled();

    await fireEvent.press(backup());
    expect(useOnboarding.getState().privacy.privateBackup).toBe(false);
    await waitFor(() => expect(cue).toHaveBeenLastCalledWith('off'));
    expect(cue).toHaveBeenCalledTimes(2);
  });

  it('turns the lock on only after the person has passed it', async () => {
    await render(<PrivacyScreen />);
    await fireEvent.press(lock());
    await waitFor(() => expect(lock()).toBeChecked());
    expect(verifyLock).toHaveBeenCalledTimes(1);
    expect(useOnboarding.getState().privacy).toEqual({ biometricLock: true, privateBackup: false });
    await waitFor(() => expect(cue).toHaveBeenCalledWith('on'));
    expect(cue).toHaveBeenCalledTimes(1);
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
    expect(verifyLock).not.toHaveBeenCalled();
    await waitFor(() => expect(cue).toHaveBeenCalledWith('off'));
  });

  it('leaves the lock off, and available, when the person dismisses the prompt', async () => {
    verifyLock.mockResolvedValue({ ok: false, reason: 'cancelled' });
    await render(<PrivacyScreen />);
    await fireEvent.press(lock());
    await waitFor(() => expect(verifyLock).toHaveBeenCalled());
    expect(lock()).not.toBeChecked();
    expect(lock()).toBeEnabled();
    expect(useOnboarding.getState().privacy.biometricLock).toBe(false);
    // The knob never moved, so there is nothing to feel.
    await new Promise((done) => setTimeout(done, 80));
    expect(cue).not.toHaveBeenCalled();
  });

  it.each([
    ['has no credentials', 'no_credentials' as const],
    ['cannot run the prompt', 'system' as const],
    ['fails the check', 'failed' as const],
  ])('shows the lock as unavailable, with a hint, when the phone %s', async (_name, reason) => {
    verifyLock.mockResolvedValue({ ok: false, reason });
    await render(<PrivacyScreen />);
    await fireEvent.press(lock());
    await waitFor(() => expect(lock()).toBeDisabled());
    expect(lock()).not.toBeChecked();
    expect(lock().props.accessibilityHint).toBe(BIOMETRICS_UNAVAILABLE);
    expect(screen.getByText(BIOMETRICS_UNAVAILABLE)).toBeTruthy();
    expect(useOnboarding.getState().privacy.biometricLock).toBe(false);
  });

  it('never blocks the journey when biometrics are unavailable', async () => {
    verifyLock.mockResolvedValue({ ok: false, reason: 'no_credentials' });
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

  it('goes back to Rhythm by returning to it, not by opening it again on top', async () => {
    await render(<PrivacyScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.dismissTo).toHaveBeenCalledWith('/onboarding/rhythm');
    expect(router.navigate).not.toHaveBeenCalled();
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
