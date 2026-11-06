import { useCallback, useEffect, useState } from 'react';

import { requestReflection, type ReflectionOutcome } from '@/services/reflection';

export type ReflectionState = {
  /** 'pending' shows “Listening for what returned…”. 'offline' shows the saved-entry card. */
  outcome: ReflectionOutcome;
  retry(): void;
};

type Settled = { key: string; outcome: ReflectionOutcome };

const PENDING: ReflectionOutcome = { status: 'pending' };

/** For Completion. The entry is already saved, so nothing here can affect it. */
export function useReflection(entryId: string | null): ReflectionState {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${entryId}:${attempt}`;

  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    void requestReflection(entryId).then((outcome) => {
      if (!cancelled) setSettled({ key, outcome });
    });
    return () => {
      cancelled = true;
    };
  }, [entryId, key]);

  return {
    outcome: settled?.key === key ? settled.outcome : PENDING,
    retry: useCallback(() => setAttempt((count) => count + 1), []),
  };
}
