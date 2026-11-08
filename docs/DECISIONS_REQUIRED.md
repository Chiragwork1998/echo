# Decisions required

Development of the locked onboarding and Today experience can begin. These decisions gate the stated full product or store submission.

## Product design gates

- Approved golden screens and behavior specifications for Echoes.
- Approved golden screens and behavior specifications for Patterns.
- Approved golden screens and behavior specifications for You.
- The words of the name on the book, which are working copy until the owner records them: ECHO asks
  "Whose book is this?" once, inside the book, after an entry is kept (never in onboarding), with "Your
  name goes on the cover. It stays on this phone.", the field "Your name", and "Write it" and "Not
  now". You has the row "Name on your book" ("Not written" when there is none), its sheet, "Remove my
  name", and the question "Take your name off the book?" with "It comes off the cover and the page. You
  can write it again at any time." (`src/features/book/bookCopy.ts`, `src/features/you/youCopy.ts`).
- Final app icon and store marketing artwork.
  - An interim icon is in use until the owner decides: the locked ECHO wordmark on Night navy `#13263A` (`assets/app/`, regenerate with `node scripts/generate-app-icon.mjs`).

## Security and backend gates

- Cloud provider, production region, and operational owner.
- Cross-device encryption recovery model: recovery secret, device transfer, or server-assisted key wrapping.
- AI reflection provider, processing region, retention, training policy, safety behavior, and consent copy.
- Final authentication providers and their developer-console configuration.
- Remote deletion SLA and backup retention policy.

## Commercial and legal gates

- Free, paid, trial, or subscription model and store products.
- Trademark/store-name clearance for ECHO.
- Privacy policy, terms, support URL, and support email.
- Launch countries, final age rating, and wellness/crisis language review.
- Analytics and crash-reporting choices, including approved redaction configuration.

## Release identity gates

- iOS bundle identifier, Apple Team ID, certificates, and App Store Connect access.
- Android application ID, signing ownership, and Play Console access.
- Public website/domain and production API hostname.

