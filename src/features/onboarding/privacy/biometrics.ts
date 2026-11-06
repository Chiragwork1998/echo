import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Whether this phone can lock the journal with biometrics: the hardware exists and the person has
 * enrolled a face or fingerprint. Never throws, and never prompts. A failed check means unavailable,
 * so onboarding always continues.
 */
export async function canUseBiometrics(): Promise<boolean> {
  try {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hardware && enrolled;
  } catch {
    return false;
  }
}
