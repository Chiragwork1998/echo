import type { Entry } from '@/features/journal';

import { BECOME_PROMPT_ID } from './becomeCopy';

export const REHEARSE_PATH = '/home/rehearse';
export const COMPLETE_PATH = '/home/complete';

/**
 * The words of the morning entry just reflected, held in memory for Rehearse and nowhere else: not in
 * the route, which the web keeps in its history, not on disk, and never in a log. Gone once Rehearse
 * has finished with them, and with the app.
 */
let held: string | null = null;

export function holdRehearsal(words: string): void {
  held = words;
}

/** The words waiting for Rehearse, without letting go of them: a screen may render more than once. */
export function heldRehearsal(): string | null {
  return held;
}

export function releaseRehearsal(): void {
  held = null;
}

/**
 * Where a daily session goes once its entry is safely kept. A morning entry rehearses first, with its
 * words handed over in memory. Any other goes straight to Completion.
 */
export function routeAfterReflect(entry: Pick<Entry, 'promptId' | 'body'>): string {
  if (entry.promptId !== BECOME_PROMPT_ID) return COMPLETE_PATH;
  holdRehearsal(entry.body);
  return REHEARSE_PATH;
}
