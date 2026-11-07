/**
 * ECHO Plus: whether this person has it, and the one way a feature asks for it. What is free and
 * what is Plus is decided in docs/PRODUCT_V1.md.
 *
 * Interface only, until the Plus work lands: everyone is treated as having Plus, so nothing is gated
 * yet. A feature calls the function from `useRequirePlus()` at the moment a Plus thing is chosen, and
 * carries on only when it returns true. The Plus work replaces the inside of this file and keeps
 * these exports, so features written against it need no change.
 */
export type PlusFeature = 'patterns' | 'breath-library' | 'live-words' | 'tidy' | 'voice-unlimited';

export type PlusStatus = 'unknown' | 'free' | 'plus';

export type PlusState = { status: PlusStatus; isPlus: boolean };

export function usePlus(): PlusState {
  return { status: 'plus', isPlus: true };
}

/**
 * Returns the check a feature calls when a Plus thing is chosen. True: carry on. False: ECHO has
 * shown the paywall instead, and the feature does nothing more.
 */
export function useRequirePlus(): (feature: PlusFeature) => boolean {
  return () => true;
}
