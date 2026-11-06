import * as LocalAuthentication from 'expo-local-authentication';

import { authenticate, getLockMethod, verifyLockAvailable } from './biometric';

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

const level = jest.mocked(LocalAuthentication.getEnrolledLevelAsync);
const prompt = jest.mocked(LocalAuthentication.authenticateAsync);
const { SecurityLevel } = LocalAuthentication;

beforeEach(() => jest.clearAllMocks());

describe('getLockMethod', () => {
  it.each([
    [SecurityLevel.BIOMETRIC_STRONG, 'biometric'],
    [SecurityLevel.BIOMETRIC_WEAK, 'biometric'],
    [SecurityLevel.SECRET, 'passcode'],
    [SecurityLevel.NONE, 'none'],
  ])('maps level %s to %s', async (enrolled, method) => {
    level.mockResolvedValue(enrolled);
    expect(await getLockMethod()).toBe(method);
  });

  it('assumes a credential exists if it cannot tell, so the lock stays', async () => {
    level.mockRejectedValue(new Error('native'));
    expect(await getLockMethod()).toBe('passcode');
  });
});

describe('authenticate', () => {
  it.each([
    ['user_cancel', 'cancelled'],
    ['system_cancel', 'cancelled'],
    ['app_cancel', 'cancelled'],
    ['lockout', 'lockout'],
    ['authentication_failed', 'failed'],
    ['not_enrolled', 'no_credentials'],
    ['passcode_not_set', 'no_credentials'],
    ['not_available', 'system'],
    ['unknown', 'system'],
    ['unable_to_process', 'system'],
  ] as const)('classifies %s as %s', async (error, reason) => {
    prompt.mockResolvedValue({ success: false, error });
    expect(await authenticate()).toEqual({ ok: false, reason });
  });

  it('never disables the passcode fallback', async () => {
    prompt.mockResolvedValue({ success: true });
    await authenticate();
    expect(prompt.mock.calls[0]?.[0]?.disableDeviceFallback).toBe(false);
  });

  it('reports a thrown native error as a system failure', async () => {
    prompt.mockRejectedValue(new Error('native'));
    expect(await authenticate()).toEqual({ ok: false, reason: 'system' });
  });
});

describe('verifyLockAvailable', () => {
  it('will not enable a lock on a device with no credential', async () => {
    level.mockResolvedValue(SecurityLevel.NONE);
    expect(await verifyLockAvailable()).toEqual({ ok: false, reason: 'no_credentials' });
    expect(prompt).not.toHaveBeenCalled();
  });

  it('proves the user can pass before the lock turns on', async () => {
    level.mockResolvedValue(SecurityLevel.SECRET);
    prompt.mockResolvedValue({ success: true });
    expect(await verifyLockAvailable()).toEqual({ ok: true });
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
