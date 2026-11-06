import { useLocalSearchParams } from 'expo-router';

import { EntryReaderScreen } from '@/features/echoes/EntryReaderScreen';

/** One echo, full screen. The tab bar hides here, because it shows on the four tab routes only. */
export default function EntryRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <EntryReaderScreen id={typeof id === 'string' && id ? id : null} />;
}
