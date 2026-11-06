import { JournalSession } from '@/features/journal-session/JournalSession';

/** Step 7. The same session as the daily echo, with the onboarding header and Completion next. */
export function FirstEchoScreen() {
  return <JournalSession variant="onboarding" />;
}
