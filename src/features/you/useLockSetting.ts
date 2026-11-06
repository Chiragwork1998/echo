import { useCallback, useRef, useState } from 'react';

import { verifyLockAvailable } from '@/services/biometric';
import { useOnboarding } from '@/state/onboarding';

export type LockNote = 'none' | 'checking' | 'unavailable' | 'failed';

/**
 * The biometric lock switch. Turning it on first makes the person pass it, so enabling the lock can
 * never be what locks them out. Turning it off needs nothing: they are already inside the app.
 */
export function useLockSetting() {
  const enabled = useOnboarding((state) => state.privacy.biometricLock);
  const [note, setNote] = useState<LockNote>('none');
  const checking = useRef(false);

  const write = useCallback((biometricLock: boolean) => {
    const { privacy, update } = useOnboarding.getState();
    update({ privacy: { ...privacy, biometricLock } });
  }, []);

  const change = useCallback(
    async (next: boolean) => {
      if (checking.current) return;
      if (!next) {
        write(false);
        setNote('none');
        return;
      }
      checking.current = true;
      setNote('checking');
      const result = await verifyLockAvailable();
      checking.current = false;
      if (result.ok) {
        write(true);
        setNote('none');
      } else {
        // Dismissing the prompt is a choice, not a fault, so it says nothing.
        setNote(
          result.reason === 'cancelled'
            ? 'none'
            : result.reason === 'no_credentials'
              ? 'unavailable'
              : 'failed',
        );
      }
    },
    [write],
  );

  return { enabled, note, change };
}
