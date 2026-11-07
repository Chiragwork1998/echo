/**
 * ECHO Plus: whether this person has it, and the one way a feature asks for it. What is free and
 * what is Plus is decided in docs/PRODUCT_V1.md.
 *
 * A feature calls the function from `useRequirePlus()` at the moment a Plus thing is chosen, and
 * carries on only when it returns true. When it returns false the paywall is already open, and the
 * feature does nothing more.
 *
 * A build that cannot sell Plus (no RevenueCat key, or a Test Store key in a release build) treats
 * everyone as having it, so nothing is gated there. The store, the paywall and RevenueCat live in
 * the files beside this one; these exports are the whole interface other features use.
 */
import { requirePlus } from './engine';
import { hasPlus, usePlusStore } from './store';

export type PlusFeature = 'patterns' | 'breath-library' | 'live-words' | 'tidy' | 'voice-unlimited';

export type PlusStatus = 'unknown' | 'free' | 'plus';

export type PlusState = { status: PlusStatus; isPlus: boolean };

export function usePlus(): PlusState {
  const status = usePlusStore((state): PlusStatus => (hasPlus(state) ? 'plus' : state.status));
  return { status, isPlus: status === 'plus' };
}

/**
 * Returns the check a feature calls when a Plus thing is chosen. True: carry on. False: ECHO has
 * shown the paywall instead, and the feature does nothing more.
 */
export function useRequirePlus(): (feature: PlusFeature) => boolean {
  return requirePlus;
}
