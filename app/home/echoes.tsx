import { Redirect, useLocalSearchParams } from 'expo-router';

import { EchoesScreen } from '@/features/echoes/EchoesScreen';

/**
 * Home's recent card links here with ?entryId=<id> (src/features/home/today/shared.tsx). That opens
 * the entry directly, in place of this route, so Back returns to where the person came from.
 */
export default function EchoesRoute() {
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();
  if (entryId)
    return <Redirect href={{ pathname: '/home/entry', params: { id: entryId } } as never} />;
  return <EchoesScreen />;
}
