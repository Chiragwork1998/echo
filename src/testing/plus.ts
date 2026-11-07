import { createBilling } from '@/services/plus/billing';
import { resetPlusEngine } from '@/services/plus/engine';
import { resetPlusStore, type PlusMemory } from '@/services/plus/store';
import { forgetTrialReminder } from '@/services/plus/trialReminder';

/**
 * ECHO Plus as a build with a RevenueCat key has it, over the mocked Purchases module
 * (testing/purchasesMock.ts). Tests run without keys, where Plus is off and everything is open, so a
 * test of a gate turns billing on with this. `memory` starts the store somewhere, such as free.
 */
export function withBillingForTests(memory: Partial<PlusMemory> = {}): void {
  resetPlusEngine(createBilling({ key: 'goog_synthetic_key', testStore: false }));
  resetPlusStore({ off: null, ...memory });
  forgetTrialReminder();
}

/** Back to the test default: a build without billing, where everyone has everything. */
export function withoutBillingForTests(): void {
  resetPlusEngine();
  resetPlusStore();
  forgetTrialReminder();
}
