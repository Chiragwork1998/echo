import { router } from 'expo-router';
import { AppState, type NativeEventSubscription } from 'react-native';

import { getInstallId } from '@/services/install';
import { usePreferences } from '@/state/preferences';
import { PLUS_PATH } from '@/state/routing';

import { billing as buildBilling } from './billing';
import type { PlusFeature } from './index';
import { isBuildFault } from './mapping';
import { applyEntitlement, hasPlus, markReadingUsed, setBillingOff, usePlusStore } from './store';
import { syncTrialReminder } from './trialReminder';
import type { Billing, Entitlement, PlansResult, PurchaseResult, RestoreResult } from './types';

let billing: Billing = buildBilling;
let configured = false;
let starting: Promise<boolean> | null = null;
let foreground: NativeEventSubscription | null = null;
let stopListening: (() => void) | null = null;
let stopWatchingChoices: (() => void) | null = null;
let paywallOpen = false;

/**
 * Live words and Tidy my words are ECHO Plus. When the store says Plus has ended, both go back to
 * off, so that nothing streams or is tidied for someone who no longer has them. It watches the
 * preferences too, because they may be read from the phone after the store has answered.
 */
function stopPlusOnlyChoices(): void {
  const plus = usePlusStore.getState();
  if (plus.off !== null || plus.source !== 'live' || plus.status !== 'free') return;
  const prefs = usePreferences.getState();
  if (prefs.wordsShown) prefs.setWordsShown(false);
  if (prefs.tidyWords) prefs.setTidyWords(false);
}

function apply(entitlement: Entitlement): void {
  applyEntitlement(entitlement);
  stopPlusOnlyChoices();
  void syncTrialReminder(entitlement);
}

async function configure(): Promise<boolean> {
  setBillingOff(billing.off);
  if (billing.seed?.readingUsed) markReadingUsed();
  if (billing.off !== null) return false;
  let appUserID = '';
  if (billing.needsAppUserID) {
    try {
      // The install id is RevenueCat's app user id, so that purchases stay with this phone's ECHO.
      // RevenueCat is never configured without it: an anonymous id would split a purchase from it.
      appUserID = await getInstallId();
    } catch {
      // The secure store can be briefly unavailable. The next foreground, or the paywall, tries again.
      return false;
    }
  }
  billing.configure(appUserID);
  configured = true;
  stopListening = billing.listen(apply);
  stopWatchingChoices = usePreferences.subscribe(stopPlusOnlyChoices);
  return true;
}

/** Configures RevenueCat once. A failure is not kept, so a later call can succeed. */
function ensureConfigured(): Promise<boolean> {
  if (configured) return Promise.resolve(true);
  starting ??= configure().finally(() => {
    starting = null;
  });
  return starting;
}

/**
 * Asks the store what this person has. Offline, or on a passing fault, what was known stays: the last
 * launch's answer, kept on the phone. A key RevenueCat rejects means this build has no working
 * billing, and like a build with no key it opens everything rather than lock anyone out.
 */
export async function refreshPlus(): Promise<void> {
  if (!(await ensureConfigured())) return;
  try {
    apply(await billing.entitlement());
  } catch (error) {
    if (isBuildFault(error)) setBillingOff('rejected_key');
  }
}

/** Once, at start-up: configures RevenueCat and keeps ECHO Plus current from then on. */
export function startPlus(): Promise<void> {
  foreground ??= AppState.addEventListener('change', (next) => {
    if (next === 'active') void refreshPlus();
  });
  return refreshPlus();
}

export async function loadPlans(): Promise<PlansResult> {
  if (!(await ensureConfigured())) return { kind: 'unavailable' };
  return billing.plans();
}

export async function buyPlan(planId: string): Promise<PurchaseResult> {
  if (!(await ensureConfigured())) return { kind: 'failed', reason: 'not_available' };
  const result = await billing.purchase(planId);
  if (result.kind === 'bought') apply(result.entitlement);
  return result;
}

export async function restorePlus(): Promise<RestoreResult> {
  if (!(await ensureConfigured())) return { kind: 'failed', reason: 'unknown' };
  const result = await billing.restore();
  if (result.kind !== 'failed') apply(result.entitlement);
  return result;
}

export type PaywallParams = {
  /** What was chosen that needs Plus. */
  feature?: PlusFeature;
  /** 'onboarding': the one offer as onboarding ends. "Not now" then goes Home. */
  from?: 'onboarding';
};

/** The paywall reports that it is open, so that a second touch does not stack another. */
export function notePaywallOpen(open: boolean): void {
  paywallOpen = open;
}

export function openPaywall(params: PaywallParams = {}): void {
  if (paywallOpen) return;
  router.push({ pathname: PLUS_PATH, params } as never);
}

/**
 * True: carry on. False: this is ECHO Plus and the person does not have it, so the paywall is open
 * instead, and the feature does nothing more. Read at the moment of the touch, never from a render.
 */
export function requirePlus(feature: PlusFeature): boolean {
  if (hasPlus(usePlusStore.getState())) return true;
  openPaywall({ feature });
  return false;
}

/** Tests only: a billing adapter in place of the build's, and everything started forgotten. */
export function resetPlusEngine(next: Billing = buildBilling): void {
  foreground?.remove();
  stopListening?.();
  stopWatchingChoices?.();
  billing = next;
  configured = false;
  starting = null;
  foreground = null;
  stopListening = null;
  stopWatchingChoices = null;
  paywallOpen = false;
}
