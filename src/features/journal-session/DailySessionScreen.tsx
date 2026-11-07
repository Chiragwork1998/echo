import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { arriveOffered } from '@/features/become/arrive';
import { ArriveFirst } from '@/features/become/ArriveFirst';
import { useHomeDissolve } from '@/features/home/dissolve';
import { usePreferences } from '@/state/preferences';

import { JournalSession } from './JournalSession';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** An explicit mode in the route wins. Without one the session opens the way it was last used. */
function modeFrom(value: string | undefined) {
  if (value === 'voice' || value === 'speak') return 'speak';
  return value === 'write' ? 'write' : undefined;
}

/**
 * Today's echo, at /home/session. `mode=voice` opens in Speak, `mode=write` in Write, and
 * `draftId` continues that draft. Back returns to Home. Reflect goes to Completion.
 *
 * A morning session (Become) carries `prompt=become`: it asks "Who will you be today?" and rehearses
 * after Reflect. `arrive=1` opens it with Arrive, until that has been skipped three mornings running.
 */
export function DailySessionScreen() {
  // Home dissolved to make room for this. While it is here Home stays empty, and when it goes Home
  // comes back over the same photograph.
  const { sessionOpened, sessionClosed } = useHomeDissolve();
  useEffect(() => {
    sessionOpened();
    return sessionClosed;
  }, [sessionOpened, sessionClosed]);
  const params = useLocalSearchParams<{
    mode?: string;
    draftId?: string;
    prompt?: string;
    arrive?: string;
  }>();
  const draftId = first(params.draftId);
  const [arriving, setArriving] = useState(
    () => first(params.arrive) === '1' && arriveOffered(usePreferences.getState().practice),
  );
  // Arrive first, then the book. Nothing of the session starts until it has handed over.
  if (arriving) return <ArriveFirst onArrived={() => setArriving(false)} />;
  return (
    <JournalSession
      // A different draft is a different session: the draft hook opens one draft per mount.
      key={draftId ?? 'newest'}
      variant="daily"
      initialMode={modeFrom(first(params.mode))}
      draftId={draftId}
      become={first(params.prompt) === 'become'}
    />
  );
}
