# ECHO website

Static HTML, one stylesheet and one small script. No framework, no build step, no third party
requests: fonts, icons and images are all served from this folder, and there are no cookies,
analytics or trackers, so no cookie banner is needed.

Built to `.claude/skills/landing-page-design/SKILL.md` with the brand exceptions in
`docs/DESIGN_QUALITY.md`. The page logic (intake answers, layout choice) is in
`docs/launch/site-brief.md`.

## Pages

| Path | File |
|---|---|
| `/` | `index.html` |
| `/privacy/` | `privacy/index.html` |
| `/terms/` | `terms/index.html` |
| `/support/` | `support/index.html` |
| any missing path | `404.html` (most static hosts serve it automatically) |

## Before it goes live

Replace every placeholder. A plain find and replace across this folder is enough:

| Placeholder | What goes there |
|---|---|
| `{{play_testing_url}}` | The Play closed test opt in link. Play Console shows it under the closed track’s testers; it usually has the form `https://play.google.com/apps/testing/com.thesaturnlabs.echo` |
| `{{site_url}}` | The site's address, with no trailing slash, such as `https://example.com` |
| `{{support_email}}` | The public support address |
| `{{company_legal_name}}` | The legal name of the company that publishes ECHO |
| `{{company_address}}` | Its postal address |
| `{{jurisdiction}}` | The governing law for the terms, such as "India" |
| `{{effective_date}}` | The date the privacy policy and terms take effect, written as words, such as "1 December 2026" |
| `{{grievance_officer_name}}` | The person who answers data questions for users in India |

`grep -rn "{{" site/` must return nothing before deploy. The privacy policy and terms are drafts for
the owner's legal review: see `docs/launch/legal-review.md`.

## Hosting

Any static host works. `vercel.json` sets clean URLs and these headers: a strict Content Security
Policy (only this site's own files may load), no referrer, no camera, microphone or location, and a
week of caching for `/assets`. The policy allows one inline script by its hash, the line in each page's
head that adds the `js` class. If that line changes, recompute the hash:

```sh
printf "%s" "document.documentElement.className += ' js';" | openssl dgst -sha256 -binary | openssl base64
```

## Assets

- `assets/fonts`: Cormorant Garamond (display headings and the wordmark) and Manrope (everything
  else), latin and latin extended subsets, SIL Open Font License. Licence files are beside them.
- `assets/icons/sprite.svg`: Phosphor Icons, light weight, MIT. Licence beside it.
- `assets/img`: crops of the app's production plates in `assets/backgrounds/`, full plate width, never
  upscaled, saved as WebP at 880 x 1100 for the 4:5 windows. `sky-loop.webm` and `sky-loop.mp4` are the
  top 4:5 of the approved Night loop (`assets/video/night-home-loop.mp4`, D-009), silent, 880 x 1100.
  The living sky plays only when the visitor has not asked for reduced motion or data saving, pauses
  off screen, and has a pause button.
- `assets/og.jpg`, `favicon-16.png`, `favicon-32.png`, `favicon.ico`: rendered from the sources in
  `docs/launch/store-graphics/`. `apple-touch-icon.png` is the app's interim icon at 180 px.

| Image | Plate | Band (y offset, height, in plate pixels) |
|---|---|---|
| `sky-poster.webp`, `sky-loop.*` | Night loop | top 1080 x 1350 of the video |
| `breathe.webp` | night `06-arrival` | 140, 1612 |
| `speak.webp` | night `07-first-echo` | 480, 1612 |
| `become.webp` | day `09-home` | 0, 1612 |
| `see.webp` | night `02-horizon` | 220, 1612 |
| `privacy.webp` | night `05-privacy` | 600, 1612 |
| `closing-wide.webp` | night `00-landing` | 560, 600 |
| `closing-tall.webp` | night `00-landing` | 0, 1900 |
| `lost-wide.webp` | night `05-privacy` | 560, 726 |
| `lost-tall.webp` | night `05-privacy` | 500, 2296 |

The plates were generated for ECHO. Before launch the owner confirms the image service's commercial
use terms, as `product-handoff/licensing/ASSET_LICENSING.md` asks.
