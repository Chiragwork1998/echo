import { Platform } from 'react-native';

type HistoryGuard = (event: PopStateEvent) => void;
type Registry = { active: { token: symbol; handler: HistoryGuard } | null };
type GuardWindow = Window & { __echoHistoryGuard?: Registry };

/**
 * Import this module from the root layout before the navigator mounts. At the
 * window event target, earlier popstate listeners may synchronously unmount a
 * screen before that screen's own listener runs. One early listener delegates
 * to the active editor; its cleanup never leaves a stale editor registered.
 */
function getRegistry(): Registry | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const host = window as GuardWindow;
  if (host.__echoHistoryGuard) return host.__echoHistoryGuard;
  const registry: Registry = { active: null };
  host.__echoHistoryGuard = registry;
  window.addEventListener('popstate', event => registry.active?.handler(event), true);
  return registry;
}

getRegistry();

export function registerWebHistoryGuard(handler: HistoryGuard): () => void {
  const registry = getRegistry();
  if (!registry) return () => undefined;
  const token = Symbol('editor');
  registry.active = { token, handler };
  return () => {
    if (registry.active?.token === token) registry.active = null;
  };
}
