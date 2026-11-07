// Proving the app is the app, before an install token is issued. Not built yet: today anyone who
// takes the shared app token out of the bundle can ask for install tokens, at the rate /api/install
// allows from one address. This is the one place the proof goes in when it is built.
//
// The plan (docs/SPEC_CONFLICTS.md, "Before public launch"): the phone gets a token from
// @expo/app-integrity (Play Integrity on Android, App Attest on iOS) bound to the install id, and
// sends it to /api/install as `attestation`. A verifier checks it with Google or Apple, and the token
// it issues carries `a: 1` (token.ts). Once every live build sends one, ECHO_REQUIRE_ATTESTATION=1
// refuses installs that do not, and the shared token stops being able to mint anything.

export type AttestationInput = { platform?: unknown; token?: unknown } | undefined;

/**
 * 'verified': the proof was checked and holds. 'absent': none was sent, or no verifier is set up.
 * 'failed': one was sent and does not hold, which is refused.
 */
export type AttestationResult = 'verified' | 'absent' | 'failed';

export type Attestor = (installId: string, input: AttestationInput) => Promise<AttestationResult>;

/** Today's verifier: none. Nothing is checked, and nothing is refused for it. */
export const noAttestor: Attestor = async () => 'absent';

/** Whether an install token may be issued without a proof. False once ECHO_REQUIRE_ATTESTATION=1. */
export const attestationOptional = (env: NodeJS.ProcessEnv) => env.ECHO_REQUIRE_ATTESTATION?.trim() !== '1';
