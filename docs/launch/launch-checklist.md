# Launch checklist: Google Play, step by step

From no Play account to ECHO in production. **Who:** Owner is Chirag; Lead is Claude as product lead
(D-012); agents are the Practices, Plus and Server agents in `docs/PRODUCT_V1.md`. Facts the owner
supplies are `{{like_this}}`; the full list is at the end.

Play rules quoted here were checked in Play Console Help on 8 November 2026. A personal developer
account created after 13 November 2023 must run a closed test with **at least 12 testers opted in for
the 14 days in a row before applying for production**. Build that time into every date.

## 0. Before anything is uploaded

| # | Step | Who | Needs |
|---|---|---|---|
| 0.1 | Create the Google Play developer account (personal or organisation) and pay the registration fee. Complete identity verification, and device verification if Play asks for it. An organisation account also needs a D-U-N-S number and is not subject to the 12 tester rule. | Owner | Government ID, a payment card, a Google account dedicated to publishing, an Android phone |
| 0.2 | Set up the payments profile (Play Console, Settings, Payments profile), with tax details and a bank account, so ECHO can sell a subscription. | Owner | Legal name, address, tax IDs, bank account |
| 0.3 | Supply the owner's facts: support email, company legal name, postal address, governing law, effective date, India grievance contact, website domain. | Owner | Decisions |
| 0.4 | Legal review of the privacy policy and terms (`legal-review.md` lists what to check). | Owner, with counsel | The two pages and `legal-review.md` |
| 0.5 | Confirm the plates' commercial use terms and the ECHO name and trademark search (`product-handoff/licensing/ASSET_LICENSING.md`). | Owner | Generation records; a trademark search in India and the target countries |
| 0.6 | Clear the launch blocker in `docs/SPEC_CONFLICTS.md` ("Before public launch"). At minimum before the closed test: a dedicated OpenAI project with a hard monthly spend cap. Before production: all three items there. | Server agent, Lead; Owner for the OpenAI account | OpenAI organisation access |
| 0.7 | RevenueCat project: app for `com.thesaturnlabs.echo`, a Google Cloud service account with Play permissions so RevenueCat can check purchases, and real time developer notifications. Entitlement `plus`; offering `default` with packages yearly and monthly. | Owner creates accounts; Lead configures | RevenueCat account, Google Cloud project, Play Console admin access |
| 0.8 | Fill every placeholder in `site/` (`grep -rn "{{" site/` returns nothing, except `{{play_testing_url}}` until step 3.3), deploy the site, and check `/privacy/`, `/terms/`, `/support/` and a missing page load over HTTPS. | Lead | The owner's facts, a domain, hosting |
| 0.9 | Build the release AAB in EAS (D-011): package `com.thesaturnlabs.echo`, a new `versionCode` for every upload, Play App Signing enrolled on first upload. | Lead | EAS project `@chiragtalwar123/echo` |
| 0.10 | Check the release build's merged manifest: only the permissions ECHO uses (microphone, notifications, biometrics, billing, internet, and what the libraries need); no `AD_ID`; no foreground service, exact alarm, full screen intent or media permissions unless a declaration is planned. | Lead | The AAB, `bundletool` or `aapt` |

## 1. Create the app

| # | Step | Who | Needs |
|---|---|---|---|
| 1.1 | Play Console, Create app: name **ECHO: Voice Journal & Breathe**, default language English, App, **Free** (Plus is an in app subscription), accept the declarations. | Owner | `play-listing.md` |
| 1.2 | Store settings: category **Health & Fitness**, up to 5 tags, contact email {{support_email}}, website {{site_url}}. | Owner or Lead | `play-listing.md` |
| 1.3 | Main store listing: title, short description, full description, icon, feature graphic, at least 2 phone screenshots (aim for 8), alt text for each. | Lead prepares, Owner pastes | `play-listing.md`, `store-graphics.md`, screenshots from the release build |

## 2. App content (Policy, App content)

Do these in this order: Play needs the first three before Target audience.

| # | Declaration | Answer | Source |
|---|---|---|---|
| 2.1 | Privacy policy | {{site_url}}/privacy/ | `site/privacy/` |
| 2.2 | Ads | No ads | `package.json` |
| 2.3 | App access | Some functionality is restricted; paste the instructions | `target-audience.md` |
| 2.4 | Content rating | Run the IARC questionnaire | `content-rating.md` |
| 2.5 | Target audience and content | 18 and over only; Restrict Minor Access on | `target-audience.md` |
| 2.6 | Data safety | As written | `data-safety.md` |
| 2.7 | Health apps | Stress management and Sleep management | `health-apps-declaration.md` |
| 2.8 | Advertising ID | No (after step 0.10 confirms no `AD_ID`) | Manifest |
| 2.9 | Financial features | My app doesn't provide any financial features | |
| 2.10 | Government apps, news apps, and any other declaration Play lists | No | |
| 2.11 | AI generated content | No separate declaration was found; meet the policy in the app | `ai-content-policy.md` |

## 3. Internal test, then early access (closed test)

| # | Step | Who | Needs |
|---|---|---|---|
| 3.1 | Internal testing: create the track, add up to 100 internal testers by email, upload the AAB, roll out. | Lead | AAB, tester emails |
| 3.2 | Subscriptions (Monetize, Products, Subscriptions), possible once a build with billing is uploaded: product `echo_plus`; base plans `yearly` (auto renewing, 1 year) and `monthly`; an offer on yearly with a 7 day free trial for new customers; prices US$49.99 and US$8.99, India ₹1,999 and ₹299, other countries from Play's conversion; activate. Add license testers (Settings, License testing). | Owner or Lead | Payments profile (0.2), `docs/PRODUCT_V1.md` |
| 3.3 | Walk the release build on a phone: onboarding, speak with Allow and Keep my voice only, each free practice, a Plus practice reaching the paywall, start the trial as a license tester, restore, cancel in Play, the trial reminder, pattern cards and Report this card, export, Delete everything, the lock, a reminder firing, offline. Read Play's pre launch report. | Lead | Internal track build, license tester account |
| 3.4 | Closed testing: create the track ("Early access"), choose countries, add testers by Google Group or email list, upload the build, release notes from `play-listing.md`, roll out, wait for review. | Owner | Testers list, release notes |
| 3.5 | Copy the track's opt in link into the site as `{{play_testing_url}}`, deploy, and check the button. | Lead | The link from 3.4 |
| 3.6 | Recruit testers: at least 12 must stay opted in for 14 days in a row; aim for 25 to cover drop outs. Real people from the audience, never paid tester services. | Owner | `gtm-plan.md`, days 1 to 14 |
| 3.7 | During the test: read every email, ship fixes as new builds on the closed track, keep notes of what changed and why. These notes answer the production questions. | Lead, Owner | Support inbox |

## 4. Production access

| # | Step | Who | Needs |
|---|---|---|---|
| 4.1 | After 14 days with 12 or more opted in testers: Dashboard, Apply for production. | Owner | The notes from 3.7 |
| 4.2 | Answer Play's questions honestly. About the closed test: how easy it was to recruit testers, whether they used every feature, how their use compared with expected production use, a summary of feedback and how it was collected. About the app: audience, value, expected installs in the first year. About readiness: what changed after the test and how readiness was judged. | Owner, Lead drafts | Drafts below |
| 4.3 | Wait for Google's review. | | |

Draft answers to adapt (replace the brackets with what really happened; do not invent numbers):

- *Audience:* adults who journal, meditate or are trying to, starting in India, English speaking,
  Android.
- *Value:* a private daily practice: breathing practices chosen by feeling, a seven minute spoken
  journal kept encrypted on the phone, and reflections on what keeps returning, with no account, ads or
  analytics.
- *Testing:* [how testers were found], [how many stayed], [what they used], [what they reported and
  through which channel], [what changed as a result].

## 5. Production release

| # | Step | Who | Needs |
|---|---|---|---|
| 5.1 | Production track: choose countries (India first, then the rest of the English speaking list the owner approves), upload the build, release notes, staged rollout (for example 20 percent, then 50, then 100 over a week). | Owner | Approved production access |
| 5.2 | Watch Android vitals (Google's own crash and ANR data in Play Console) and reviews daily for the first two weeks; answer every review calmly and specifically. | Lead, Owner | |
| 5.3 | Switch the site's button text from early access when production is live: "Get ECHO on Google Play", linking to the store listing. | Lead | Store URL |
| 5.4 | Start the public launch plan. | Owner, Lead | `gtm-plan.md` |

## Every placeholder the owner fills

| Placeholder | Where |
|---|---|
| `{{play_testing_url}}` | Site buttons (step 3.5) |
| `{{site_url}}` | Site canonical and social tags, robots, sitemap; listing contact; Data safety |
| `{{support_email}}` | Site, privacy policy, terms, listing, IARC |
| `{{company_legal_name}}` | Privacy policy, terms, site footer |
| `{{company_address}}` | Privacy policy, terms |
| `{{jurisdiction}}` | Terms |
| `{{effective_date}}` | Privacy policy, terms |
| `{{grievance_officer_name}}` | Privacy policy (India) |
| `{{review_access}}` | App access instructions for reviewers (`target-audience.md`) |
| `{{founder_name}}`, `{{founder_story}}` | Launch posts (`gtm-plan.md`) |
| `{{tester_quote_1}}`, `{{tester_name_1}}` | Only if testers agree in writing to be quoted (`gtm-plan.md`) |
