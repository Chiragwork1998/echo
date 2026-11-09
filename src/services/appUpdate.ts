/**
 * Which code the app is running: the code it was installed with, or an update that came over the air
 * (EAS Update). Said on You, under the version, so the owner can see an update has arrived. Nothing here
 * is sent anywhere.
 */
export type RunningCode = { kind: 'installed' } | { kind: 'update'; createdAt: Date | null };

type ExpoUpdates = typeof import('expo-updates');

function loadUpdates(): ExpoUpdates | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-updates') as ExpoUpdates;
  } catch {
    // expo-updates throws on import without its native module, as on web and under Jest.
    return null;
  }
}

export function runningCode(
  updates: Pick<ExpoUpdates, 'isEmbeddedLaunch' | 'createdAt'> | null = loadUpdates(),
): RunningCode {
  // Only a launch the updater says plainly was not the built-in one is an update.
  if (!updates || updates.isEmbeddedLaunch !== false) return { kind: 'installed' };
  return { kind: 'update', createdAt: updates.createdAt ?? null };
}

/** "9 Nov, 2:05 pm": when the update in use was published, in the phone's own time. */
export function updateLabel(createdAt: Date | null): string | null {
  if (!createdAt || Number.isNaN(createdAt.getTime())) return null;
  const day = createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = createdAt
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase();
  return `${day}, ${time}`;
}
