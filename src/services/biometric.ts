import * as LocalAuthentication from 'expo-local-authentication';

// The lock is a gate in front of the app. It is deliberately not tied to the encryption key, so a
// change in biometric enrolment can never make entries unreadable. Its job is to stop someone who
// picks up an unlocked phone, and it stands on the strength of the device's own credentials.

const PROMPT = 'Unlock ECHO';

/** What can satisfy the lock on this device right now. */
export type LockMethod =
  /** Biometrics enrolled, with the device passcode as the OS fallback. */
  | 'biometric'
  /** No biometrics, perhaps unenrolled since the lock was turned on. The passcode still works. */
  | 'passcode'
  /** No credential at all, so nothing can satisfy the lock. */
  | 'none';

export type AuthFailure =
  | 'cancelled'
  /** Too many attempts. The OS offers the device passcode. */
  | 'lockout'
  | 'failed'
  /** The device has no passcode or biometrics. */
  | 'no_credentials'
  /**
   * The OS could not run the prompt. A person at the screen can cause some of these, such as
   * unable_to_process with a smudged sensor, so this must never count towards turning the lock off.
   */
  | 'system';

export type AuthOutcome = { ok: true } | { ok: false; reason: AuthFailure };

export async function getLockMethod(): Promise<LockMethod> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return 'none';
    return level === LocalAuthentication.SecurityLevel.SECRET ? 'passcode' : 'biometric';
  } catch {
    // Fail closed. 'none' would offer to disable the lock.
    return 'passcode';
  }
}

function classify(error: LocalAuthentication.LocalAuthenticationError): AuthFailure {
  switch (error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
    case 'user_fallback':
    case 'timeout': // Android: left on screen until it gave up. Nobody tried and failed.
      return 'cancelled';
    case 'lockout':
      return 'lockout';
    case 'authentication_failed':
      return 'failed';
    case 'not_enrolled':
    case 'passcode_not_set':
      return 'no_credentials';
    default:
      return 'system';
  }
}

/**
 * Device fallback stays on, which is what keeps people from being locked out: with biometrics
 * unenrolled or locked out, the OS asks for the passcode instead of failing.
 */
export async function authenticate(): Promise<AuthOutcome> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: PROMPT,
      disableDeviceFallback: false,
    });
    return result.success ? { ok: true } : { ok: false, reason: classify(result.error) };
  } catch {
    return { ok: false, reason: 'system' };
  }
}

export type EnableLockResult = { ok: true } | { ok: false; reason: AuthFailure };

/**
 * The capability check behind Protect my journal. Proves the user can pass the lock before it is
 * turned on, so that enabling it cannot be what locks them out. The caller then persists the choice
 * with update({ privacy: { ..., biometricLock: true } }).
 */
export async function verifyLockAvailable(): Promise<EnableLockResult> {
  if ((await getLockMethod()) === 'none') return { ok: false, reason: 'no_credentials' };
  return authenticate();
}
