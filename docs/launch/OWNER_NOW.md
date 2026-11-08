# What only the owner can do

Everything else is the lead's. These are in the order that unblocks launch fastest. The full Play
sequence is in `launch-checklist.md`.

## Today

1. **Google Play developer account** (play.google.com/console). US$25. Personal or organisation.
   A personal account made after November 2023 must run a closed test with 12 testers for 14 days
   before production. Third party guides say an organisation account (The Saturn Labs, needs a
   D-U-N-S number) is exempt; Google's own help page does not say so either way. Identity checks can
   take days, so start now. Builds are uploaded through EAS with a Play service account key; the lead
   gives the steps once the account exists.
2. **Payments profile** in Play Console (Settings, Payments profile): legal name, address, tax IDs,
   bank account. Subscriptions cannot be sold without it.
3. **RevenueCat** (revenuecat.com, free to start): create the account and a project called ECHO.
   The lead gives you the exact screens to click once it exists.
4. **OpenAI**: create a project called "ECHO voice", set a monthly budget with alerts at 50 and 80
   percent, and create a new API key in it. Rotate the key you pasted in chat on 2026-11-06.
5. **Upstash** (so the free allowance is enforced across the server, not per machine): open
   https://vercel.com/chiragtalwar-finzarccoms-projects/~/integrations/accept-terms/upstash and
   accept the terms. The lead does the rest.
6. **Approve the 1.0 voice server in production, with its secrets.** It is built and tested, and on
   8 November it passed a local check in production's exact setup (transcription, live words, pattern
   cards, reports, allowance). It is the version that receives pattern-card reports, which Google Play
   requires. The permission system refused both deploying it to production and writing its signing
   key into Vercel, so it waits for you. Reply "yes, deploy ECHO's voice server to production and
   store its secrets in Vercel". The lead then deploys it, checks it live, and later adds the new
   OpenAI and RevenueCat server keys the same way.

## Facts only you can supply

- The support email address to publish (it must be a real inbox you read).
- The company's legal name and postal address, and the governing law for the terms.
- A person and email for data requests in India (the grievance contact).
- The website address, if not a vercel.app address for now.
- Whether "ECHO: Voice Journal & Breathe" should be the store title.

## This week

- A lawyer's read of `site/privacy/` and `site/terms/` (`legal-review.md` lists the questions).
- A trademark search for ECHO in India and your launch countries.
- 25 real people from the audience for the closed test ("Early access"). At least 12 must stay
  opted in for 14 days in a row.
- An Apple developer account (US$99 a year) when you want iOS. The app also needs testing on an
  iPhone before it goes to the App Store.

## Never

- Paste keys or passwords in chat. When a key is needed, the lead gives a command that asks for it
  privately.
