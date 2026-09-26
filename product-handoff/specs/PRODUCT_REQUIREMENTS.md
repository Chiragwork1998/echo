# Product requirements

## Product promise

ECHO is a private seven-minute daily reflection ritual. It helps a user notice what is present, express it in writing or voice and return later to recurring emotional patterns. It is wellness software, not therapy, diagnosis or emergency care.

## Roles

- **Journal owner** — only user role in v1.
- **Anonymous local user** — can finish onboarding and journal without an account.
- **Authenticated owner** — may enable encrypted private backup and cross-device restore.
- No public profiles, social following, moderators or shared journals in v1.

## Authentication

- Sign in with Apple.
- Sign in with Google.
- Email magic link.
- Authentication is deferred until private backup is enabled or the user chooses Sign in from You.
- Local-only use must remain available.

## Core features

- Eight-step personalized onboarding.
- Day, Night or automatic theme.
- Seven-minute text or voice journal.
- Autosaved encrypted local drafts.
- Optional AI reflection after an entry, with explicit privacy disclosure.
- Mood/emotional arrival selection.
- Daily reminder scheduling.
- Biometric journal lock.
- Optional encrypted private backup.
- Home prompt, rhythm/streak, recent/continued entry.
- Echoes: searchable private entry archive.
- Patterns: opt-in personal trend summaries, never diagnosis.
- You: preferences, theme, reminder, privacy, export, deletion and support.

## Permissions

| Permission | When requested | Required? | Denial behavior |
|---|---|---:|---|
| Notifications | User enables Gentle reminder | No | Save chosen time; show Enable in Settings action |
| Microphone | User selects Speak | No | Keep Write available; explain Settings path |
| Biometrics | User enables Lock with Face ID/biometric | No | Offer device passcode or disable lock |
| Files/share sheet | User exports entries | No | Retry/export later |
| Camera | Never in v1 | No | Not requested |
| Location | Never in v1 | No | Not requested |
| Contacts | Never in v1 | No | Not requested |
| Health data | Never in v1 | No | Not requested |

## Notifications

- Local reminder at selected time.
- Body copy must never reveal journal content.
- Default copy: “A small space is waiting for you.”
- Quiet-hours and timezone changes must be respected.

## Data and privacy

- Journal text/audio encrypted at rest.
- No content in analytics, crash logs, push payloads or support logs.
- Local-only mode works offline.
- Remote backup is opt-in.
- AI inference must disclose provider, retention and whether data trains models; default recommendation is no training and transient processing.
- Export: JSON + Markdown + original audio.
- Delete account: immediate local deletion and remote deletion within the published SLA.

## Search, sharing, analytics, support

- Search: local full-text search across entry title/body and date.
- Sharing: off by default; explicit export/share sheet only.
- Analytics: screen/interaction events without free text, prompt answers or audio.
- Support: in-app email/link; never attach entries automatically.
- Moderation: not applicable without public content. Provide crisis-resource copy for high-risk self-harm language only after legal/product review.

## Localization and markets

- v1 copy: English.
- Architecture must support localization and right-to-left layouts.
- Hindi can follow without changing scene geometry; allow text reflow.
- Currency is relevant only if subscription is added.
- Proposed age rating: 12+; final rating requires store/legal review.

## Example data

See `data/example-content.json`.

