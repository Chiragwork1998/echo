# Google Play Data safety answers

For Play Console, Policy, App content, Data safety. Each answer is matched to what the code does, with
the file that shows it. Play's definitions used here (checked on 8 November 2026 in the Play Console
Help article "Provide information for Google Play's Data safety section"):

- **Collected** means sent off the phone, by ECHO or by any library in it.
- **Shared** means passed to a third party. A service provider that processes data on ECHO's behalf and
  under its instructions is not sharing. So OpenAI, Vercel and RevenueCat count as collection, not
  sharing.
- **Processed ephemerally** means held only in memory, no longer than the request needs.

Three parts of 1.0 were still being built by other agents when this was written: the RevenueCat
integration, the per install allowance on the voice server, and "Report this card". Their answers below
follow `docs/PRODUCT_V1.md`; the lead re-checks them against the merged code before submitting (see
"Before you submit").

## 1. Data collection and security

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | Voice, entry text, the install id and purchase records leave the phone (below). |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | The voice server is HTTPS (`src/services/transcription.ts` refuses an unsafe address), live words use WSS to OpenAI (`voice-api/src/live.ts`), RevenueCat and Google Play Billing use HTTPS. |
| Which methods of account creation does your app support? | **My app does not allow users to create an account** | No accounts in 1.0 (`docs/PRODUCT_V1.md`, Not in 1.0). |
| Do you provide a way for users to request that their data is deleted? | **Yes** | In the app: You, Your data, Delete all data (`src/services/deleteAllLocal.ts`) removes everything on the phone. For the records held off the phone (minutes count by install id, RevenueCat purchase records), by email to {{support_email}}, as the privacy policy says. Link: {{site_url}}/support/ |

Optional badges: do not claim the independent security review (none has been done). The Families
commitment does not apply (adults only).

## 2. Data types

### Declared as collected

#### Audio files: Voice or sound recordings

| Question | Answer |
|---|---|
| Collected or shared | Collected. Not shared. |
| Processed ephemerally | **No.** The after recording path is ephemeral (the voice server holds audio in memory only, and OpenAI's transcription service does not store it), but live words stream to OpenAI's realtime service, which keeps abuse monitoring data for up to 30 days. Answer for the whole app. |
| Required or optional | **Optional.** Nothing is sent until the person chooses Allow; Keep my voice only keeps recordings on the phone (`VoiceConsentSheet.tsx`, `sessionCopy.consent`). |
| Purposes | **App functionality** (turning the person's voice into their journal's words). |

Evidence: `voice-api/api/transcribe.ts`, `voice-api/api/live-session.ts`, `voice-api/src/live.ts`,
`src/features/journal-session/sessionCopy.ts` (consent and liveConsent facts).

#### App activity: Other user generated content

The journal text that leaves the phone: entries sent for pattern cards (`voice-api/api/patterns.ts`,
newest 30, first 6,000 characters each), and transcripts that go through the second step for Hindi or
Tidy my words (`voice-api/api/refine.ts`).

| Question | Answer |
|---|---|
| Collected or shared | Collected. Not shared. |
| Processed ephemerally | **No.** ECHO's server holds it in memory only, but OpenAI may keep it for up to 30 days for abuse monitoring. |
| Required or optional | **Optional.** Pattern cards need their own consent (`patternsCopy.consent`); Tidy is off by default; Hindi only applies to Hindi speech. |
| Purposes | **App functionality.** |

#### Health and fitness: Health info (recommended, the owner's call)

ECHO never asks for health information and the mood and breath check ins stay on the phone. But the
entries above are free text in a mental wellness app, and a person may write about how they are doing.
Declaring Health info is the cautious reading of Play's definition ("information about a user's health,
such as medical records or symptoms"). Recommended: declare it, with the same answers as Other user
generated content (collected, not shared, not ephemeral, optional, App functionality). If counsel reads
it the other way, leave it undeclared and keep this note on file.

#### App activity: Other actions

"Report this card" sends the reason chosen, the lens id and the model, never the card or the person's
words (`docs/PRODUCT_V1.md`, See).

| Question | Answer |
|---|---|
| Collected or shared | Collected. Not shared. |
| Processed ephemerally | **No** (reports are kept to review). |
| Required or optional | **Optional.** |
| Purposes | **App functionality**; **Fraud prevention, security, and compliance** (the AI generated content policy asks for reports to inform moderation). |

#### Device or other IDs

The random install id (`src/services/install.ts`): made on the phone, not derived from the device or any
account, kept in secure storage. It goes to ECHO's voice server with requests (free allowance and Plus
status) and to RevenueCat as the app user id.

| Question | Answer |
|---|---|
| Collected or shared | Collected. Not shared (RevenueCat and the voice server act for ECHO). |
| Processed ephemerally | **No.** The server keeps a minutes count against it; RevenueCat keeps it with purchase records. |
| Required or optional | **Required.** It is sent whenever the app checks Plus status or turns voice into words, and it cannot be switched off. |
| Purposes | **App functionality** (allowance, entitlement); **Fraud prevention, security, and compliance** (per install limits on the voice server). |

#### Financial info: Purchase history

RevenueCat receives purchase records from Google Play (RevenueCat's own Data safety guidance, checked 8
November 2026, says to declare Purchase history as collected and required, for App functionality and
Analytics).

| Question | Answer |
|---|---|
| Collected or shared | Collected. Not shared. |
| Processed ephemerally | **No.** |
| Required or optional | **Required** (for anyone who buys or restores ECHO Plus). |
| Purposes | **App functionality** (unlocking Plus); **Analytics** (subscription revenue in RevenueCat). |

### Not collected

| Category | Answer and reason |
|---|---|
| Location (approximate, precise) | Not collected. The app has no location permission. The voice server sees the IP address only to rate limit, in memory for up to ten minutes (`voice-api/src/guard.ts`), and never uses it to infer location. RevenueCat receives locale and currency, which Play does not count as location. The device region chosen for helplines is read on the phone and never sent (`src/features/patterns/deviceRegion.ts`). |
| Personal info (name, email, user IDs, address, phone, race and ethnicity, political or religious beliefs, sexual orientation, other) | Not collected. No accounts. Support email opens the person's own email app with no body (`src/features/you/support.ts`); anything they choose to send arrives outside the app. |
| Financial info: user payment info, credit score, other | Not collected. Google Play takes payment; ECHO never sees card details. |
| Health and fitness: fitness info | Not collected. |
| Messages (emails, SMS or MMS, other in app messages) | Not collected. |
| Photos and videos | Not collected. No camera or media permission. |
| Audio files: music files, other audio files | Not collected. |
| Files and docs | Not collected. Export writes a file the person shares where they choose (`src/services/exportJournal.ts`); ECHO receives nothing. |
| Calendar, Contacts | Not collected. No permission. |
| App activity: app interactions, in app search history, installed apps | Not collected. No analytics SDK; search runs on the phone. The install referrer service is blocked in `app.json`. |
| Web browsing | Not collected. |
| App info and performance: crash logs, diagnostics, other performance data | Not collected. No crash reporting or analytics SDK (`package.json`). Server log lines hold route, status, size and time only (`voice-api/src/guard.ts` `logRoute`), and are about the server, not the phone. |

## 3. What the listing will show

Data shared with third parties: **No data shared.** Data collected: Audio, App activity, Financial info,
Device or other IDs, and Health and fitness if declared. Security practices: data is encrypted in
transit; you can request that data be deleted.

## Before you submit

1. **RevenueCat.** Confirm the merged Plus code sets no customer attributes with personal details and
   enables no ad id integration (`gpsAdId`, `androidId`). If either is added, declare Personal info or
   Device or other IDs for that purpose too.
2. **Advertising ID.** Check the merged manifest of the release build has no
   `com.google.android.gms.permission.AD_ID`; then answer the Advertising ID declaration "No".
3. **Voice server.** Confirm what the per install allowance stores and for how long, and whether Play
   Integrity is used. If Play Integrity is used, read Google's own Data safety note for it
   (developer.android.com, Play Integrity, Terms of Service and data safety) and decide with counsel
   whether its device attestation data changes any answer here.
4. **Report this card.** Confirm the endpoint sends only reason, lens id and model, and whether it
   sends the install id (it is already declared).
5. Re-read the privacy policy beside this file; the two must say the same thing.
