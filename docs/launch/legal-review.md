# Privacy policy and terms: draft for the owner's legal review

**Draft for the owner's legal review.** `site/privacy/index.html` and `site/terms/index.html` are
drafts written by the launch agent from the code and `docs/PRODUCT_V1.md`. They are not legal advice and
must be reviewed by counsel before the site is published. This note is for that review: what each page
relies on, where it comes from, and the questions counsel should answer. The pages themselves carry no
draft marking, so they are ready to publish once approved.

## Facts the pages rely on, and where they come from

| Statement | Evidence |
|---|---|
| Entries, recordings, transcripts, onboarding answers and pattern cards are encrypted on the phone with AES 256 in GCM mode, key in secure storage | `src/storage/envelope.ts`, `src/storage/nativePorts.ts` (`AESKeySize.AES256`), `src/storage/vault.ts` |
| Android backup is off | `app.json`, `android.allowBackup: false` |
| No account, no cloud copy | `docs/PRODUCT_V1.md`, Not in 1.0 |
| Voice is sent only after consent that names OpenAI; Keep my voice only sends nothing | `src/features/journal-session/sessionCopy.ts` (`consent`), `VoiceConsentSheet.tsx` |
| The transcription service does not store audio or train on it | The app's consent copy, checked by the team against OpenAI's data page on 6 November 2026 (`sessionCopy.ts` comment) |
| Live words stream from the phone to OpenAI directly with a temporary key valid for 60 seconds; up to 30 days of abuse monitoring retention | `voice-api/src/live.ts` (`SECRET_SECONDS = 60`), `voice-api/README.md`, `sessionCopy.liveConsent` |
| Hindi and Tidy go through a second step at OpenAI, up to 30 days retention, no training | `voice-api/src/pipeline.ts` (`store: false`), `sessionCopy.consent` |
| Pattern cards: separate consent; newest 30 entries, first 6,000 characters; crisis screen before any model call; up to 30 days retention; cards kept encrypted on the phone | `src/services/patterns.ts`, `voice-api/api/patterns.ts`, `voice-api/src/safety.ts`, `patternsCopy.consent` |
| The voice server keeps nothing it hears; logs hold route, status, size and time only | `voice-api/src/guard.ts` (`logRoute`), `voice-api/api/*.ts` |
| IP addresses held in memory up to ten minutes for rate limits, not logged by ECHO's code | `voice-api/src/guard.ts` (`createGate`, ten minute windows, at most 5,000 addresses) |
| The install id: random, in secure storage, survives Delete everything, sent to the voice server and RevenueCat | `src/services/install.ts`, `docs/PRODUCT_V1.md` Trust and safety and Plus |
| Delete everything removes all local data and the key | `src/services/deleteAllLocal.ts` |
| Export is a zip of entries (JSON and Markdown) and audio, shared by the person | `src/services/exportJournal.ts` |
| Reminders are local with fixed text; no push service | `src/services/reminders.ts`; `app.json` blocks `com.google.android.c2dm.permission.RECEIVE` |
| Lock: biometrics checked by Android; secure window while the lock is on | `app/_layout.tsx` (`useSecureWindowWhileLocked`), `src/services/biometric.ts` |
| No analytics, crash reporting or ad SDK | `package.json` dependencies |
| Report this card sends only reason, lens id and model | `docs/PRODUCT_V1.md`, See (being built) |
| Subscription, trial, reminder two days before, cancel in Google Play | `docs/PRODUCT_V1.md`, ECHO Plus |
| Free allowance 60 minutes a month; Plus fair use 20 hours a month; recordings kept when minutes run out | `docs/PRODUCT_V1.md`, ECHO Plus |
| Adults 18 and over | The lead's brief for this work; `target-audience.md` |

## To confirm before publishing (engineering)

1. **The voice server's allowance records** (Server agent, being built): what is stored per install id,
   where, and for how long. The policy says the minutes count is kept "for as long as it is needed to
   apply the monthly allowance and to stop abuse". Replace with a concrete period if there is one.
2. **RevenueCat** (Plus agent, being built): no customer attributes with personal details, no ad id
   integrations; RevenueCat receives the install id as the app user id. If Play Integrity or any other
   check is added to the voice server, add it to the policy.
3. **Report this card**: where reports go and how long they are kept.
4. **Re-consent**: the policy promises that a change to what leaves the phone means ECHO asks again
   before sending. Voice consent is versioned (`VOICE_POLICY_VERSION` in `src/state/preferences.ts`);
   confirm pattern card consent is too, or soften the sentence.
5. **OpenAI's terms**: re-check the "does not train" and "up to 30 days" statements against OpenAI's
   current data controls on the day of publishing, as the app's consent copy also requires.

## Questions for counsel

1. **Identity and contact**: the legal entity, its address, and whether a representative in the EU or
   UK is needed (GDPR Article 27) if ECHO is offered there.
2. **Lawful bases** (GDPR): consent for voice and pattern readings; contract for the subscription and
   install id; legitimate interests for security logs. Is the install id better framed as necessary for
   the contract for everyone, including free users?
3. **Transfers**: OpenAI, Vercel and RevenueCat process in the United States. Confirm their data
   processing terms are accepted for ECHO's accounts and that standard contractual clauses (or
   another mechanism) are in place.
4. **India, the Digital Personal Data Protection Act 2023 and its Rules**: notice content and language,
   the contact for data questions (`{{grievance_officer_name}}`), response timelines, and whether
   children's data rules are met by restricting ECHO to adults with Play's Restrict Minor Access.
5. **Consumer health data in the United States**: journal entries in a mental wellness app may count as
   consumer health data under laws such as Washington's My Health My Data Act. Decide whether a
   separate consumer health data notice and consent are needed before offering ECHO in the US.
6. **Automatic renewal laws** (for example in California): are the paywall disclosures, the trial
   reminder two days before, and cancellation in Google Play enough, or is more needed in the app?
7. **Wellness and crisis wording**: the "not therapy" statements, the breathing safety line, and the
   helplines on the support page (copied from `src/features/patterns/supportResources.ts`, which is
   itself marked pending legal and owner review, numbers checked 6 November 2026).
8. **Terms**: whether the liability limits and the governing law clause hold for consumers in India,
   the EU, the UK and the US, and what to say about refunds beyond Google Play's policies.
9. **Response time**: the policy promises an answer to data requests within one month. Confirm it
   meets every target market's deadline.
10. **Trademark**: clearance for the name ECHO in the launch countries
    (`product-handoff/licensing/ASSET_LICENSING.md`).

## Placeholders in the two pages

`{{company_legal_name}}`, `{{company_address}}`, `{{support_email}}`, `{{jurisdiction}}`,
`{{effective_date}}`, `{{grievance_officer_name}}`, and `{{site_url}}` in the page headers.
