// The one identity ECHO has for a phone: a random id, made the first time it is needed and kept in the
// device's secure store. It names no one, is not derived from the device, and holds no journal content.
// The voice server counts the free allowance against it, and ECHO Plus purchases are attached to it, so
// it survives "Delete everything" (docs/PRODUCT_V1.md, Trust and safety).
import { getRuntime } from '@/storage/runtime';

export const INSTALL_ID_NAME = 'echo.install-id';

let pending: Promise<string> | null = null;

/** The install id, made once. A failure is not kept, so a later call can succeed. */
export function getInstallId(): Promise<string> {
  pending ??= (async () => {
    const { secrets, newId } = await getRuntime();
    const existing = await secrets.get(INSTALL_ID_NAME);
    if (existing) return existing;
    const made = newId();
    await secrets.set(INSTALL_ID_NAME, made);
    return made;
  })().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

/** Tests only: forget the id held in memory, so the next call reads the store again. */
export function forgetInstallIdInMemory(): void {
  pending = null;
}
