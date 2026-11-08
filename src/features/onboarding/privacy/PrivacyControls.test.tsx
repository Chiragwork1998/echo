import { act, fireEvent, screen } from '@testing-library/react-native';

import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { verifyLockAvailable } from '@/services/biometric';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { render } from '@/testing/render';

import { PrivacyControls } from './PrivacyControls';

jest.mock('@/design/haptics');
jest.mock('@/services/biometric', () => ({ verifyLockAvailable: jest.fn() }));

const verifyLock = jest.mocked(verifyLockAvailable);
const lock = () => screen.getByRole('switch', { name: copy.privacy.lockIos });
const backup = () => screen.getByRole('switch', { name: copy.privacy.backup });
const pass = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useOnboarding.setState({ ...initialOnboarding });
  verifyLock.mockResolvedValue({ ok: true });
});

// A switch's haptic belongs to its knob, which crosses the middle of its travel as the spring runs.
describe('the haptic for a switch', () => {
  it('lands 45 ms after the choice is stored, and not before', async () => {
    await render(<PrivacyControls />);
    await fireEvent.press(backup());
    expect(cue).not.toHaveBeenCalled();
    await pass(44);
    expect(cue).not.toHaveBeenCalled();
    await pass(1);
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('on');
  });

  it('is on when a switch goes on and off when it goes off', async () => {
    await render(<PrivacyControls />);
    await fireEvent.press(backup());
    await pass(45);
    await fireEvent.press(backup());
    await pass(45);
    expect(jest.mocked(cue).mock.calls).toEqual([['on'], ['off']]);
  });

  it('follows the lock too, once the person has passed it, and when it is turned off', async () => {
    await render(<PrivacyControls />);
    await fireEvent.press(lock());
    await pass(45);
    expect(cue).toHaveBeenLastCalledWith('on');
    await fireEvent.press(lock());
    await pass(45);
    expect(cue).toHaveBeenLastCalledWith('off');
    expect(cue).toHaveBeenCalledTimes(2);
  });

  it('is not made when the lock stays off, because the knob never moves', async () => {
    verifyLock.mockResolvedValue({ ok: false, reason: 'cancelled' });
    await render(<PrivacyControls />);
    await fireEvent.press(lock());
    await pass(500);
    expect(verifyLock).toHaveBeenCalledTimes(1);
    expect(cue).not.toHaveBeenCalled();
  });

  it('does not outlive the screen', async () => {
    const { unmount } = await render(<PrivacyControls />);
    await fireEvent.press(backup());
    await unmount();
    await pass(500);
    expect(cue).not.toHaveBeenCalled();
  });

  it('is not made at all if the screen is gone before the lock has been passed', async () => {
    const { unmount } = await render(<PrivacyControls />);
    // The person leaves while the prompt is up; their answer arrives after the screen has gone.
    verifyLock.mockImplementation(async () => {
      await unmount();
      return { ok: true };
    });
    await fireEvent.press(lock());
    await pass(500);
    expect(verifyLock).toHaveBeenCalledTimes(1);
    expect(cue).not.toHaveBeenCalled();
  });
});
