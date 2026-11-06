import { useLocalSearchParams } from 'expo-router';

import { JournalSession } from './JournalSession';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Today's echo, at /home/session. `mode=voice` opens in Speak, and `draftId` continues that draft.
 * Back returns to Home. Reflect goes to Completion.
 */
export function DailySessionScreen() {
  const params = useLocalSearchParams<{ mode?: string; draftId?: string }>();
  const draftId = first(params.draftId);
  return (
    <JournalSession
      // A different draft is a different session: the draft hook opens one draft per mount.
      key={draftId ?? 'newest'}
      variant="daily"
      initialMode={first(params.mode) === 'voice' ? 'speak' : undefined}
      draftId={draftId}
    />
  );
}
