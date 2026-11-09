import { VOICE_POLICY_VERSION } from '@/state/preferences';

import { sessionCopy } from './sessionCopy';

// Consent is a promise. These are the lines that make it, and each one has to be literally true of
// what the app does, so the facts they rest on are written beside them.

describe('what the voice consent promises', () => {
  const asked = [...sessionCopy.consent.facts, ...sessionCopy.liveConsent.facts].join(' ');

  it('says recordings and words are encrypted when they are saved, because while a take is made, and while it is sent, they are not', () => {
    // A recording is plain in the app's private cache while it is made and while it is sent, and is
    // encrypted when it is saved. Words are encrypted when they are saved. So no line may say they
    // "stay" encrypted: that would be true of a saved entry and false of a take in progress.
    expect(asked).not.toMatch(/stay encrypted/i);
    expect(sessionCopy.consent.facts).toContain(
      'Your recording and your words are encrypted when saved on this phone.',
    );
    expect(sessionCopy.liveConsent.facts).toContain(
      'ECHO’s own server keeps none of your voice or words. Your recording and your words are encrypted when saved on this phone.',
    );
  });

  it('does not say that hiding words avoids all of it, because it avoids only the streaming', () => {
    const live = sessionCopy.liveConsent.facts.join(' ');
    expect(live).not.toMatch(/avoids all of this/i);
    expect(live).not.toMatch(/sent once/i);
    // The voice is still sent, after the take, in parts when it is long; and Hindi and Tidy my words
    // still go through the second step at OpenAI.
    expect(live).toMatch(/Hiding words stops the streaming\./);
    expect(live).toMatch(/sent after you stop, in parts if the take is long/);
    expect(live).toMatch(/The second step above still applies\./);
  });

  it('says that every spoken entry goes through the second step to be set out, because it does', () => {
    // A kept spoken entry is set out in paragraphs at OpenAI under this agreement (D-017), where the
    // words agreed to under version 2 said the second step was only for Hindi and Tidy my words.
    const fact = sessionCopy.consent.facts.find((line) => /second step/.test(line)) ?? '';
    expect(fact).toMatch(/sets them out in paragraphs, keeping every word/);
    expect(fact).toMatch(/30 days/);
    expect(fact).not.toMatch(/^If you speak Hindi/);
    expect(sessionCopy.liveConsent.facts.join(' ')).toMatch(/sets it out in paragraphs/);
  });

  it('is under the policy version that was current when these words were agreed to', () => {
    // The owner agreed to version 2 on his own phone (D-016), so these words could no longer be
    // corrected in place: setting spoken entries out raised it to 3, and everyone who agreed to 2 is
    // asked again before their next upload (state/preferences.ts).
    expect(VOICE_POLICY_VERSION).toBe(3);
  });
});
