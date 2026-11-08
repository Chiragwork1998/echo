# Store graphics

What Google Play needs, what is ready, and what still has to be captured. Specifications are from the
Play Console Help article on preview assets (checked 8 November 2026). Everything is in the same hand as
the site and the app: ECHO's plates, Night navy `#13263A`, the letterspaced Cormorant Garamond wordmark,
Manrope for any small text, no gradients, no badges, no device frames.

## Ready

| Asset | File | Spec | Status |
|---|---|---|---|
| App icon | `store-graphics/icon-512.png` | 512 x 512, 32 bit PNG, under 1 MB | Ready. The app's interim icon (the wordmark on Night navy, `assets/app/icon.png`), until the owner decides the final icon (`docs/DECISIONS_REQUIRED.md`). |
| Feature graphic | `store-graphics/feature-graphic-1024x500.png` | 1024 x 500, 24 bit PNG with no alpha | Ready. Night Landing plate, the wordmark and "Breathe, speak, and see yourself clearly." Source: `store-graphics/feature-graphic.html`. |
| Social image for the site | `site/assets/og.jpg` | 1200 x 630 | Ready. Source: `store-graphics/og-image.html`. |
| Favicons | `site/favicon-16.png`, `site/favicon-32.png`, `site/favicon.ico` | | Ready. The E of the wordmark with its hairline. Source: `store-graphics/favicon.html`. |

Feature graphic alt text (Play asks for alt text on every graphic, 140 characters at most):

```
The ECHO wordmark over a moonlit Himalayan sky and a lit monastery, with the line: breathe, speak, and see yourself clearly.
```

Rules kept on the feature graphic: no "free", "new", "best", ranking, price or call to action; no store
badges; key content in the middle, clear of the edges; not a pure white, black or dark gray background.

## Phone screenshots

Play needs at least 2 screenshots and takes up to 8 per device type; it recommends at least 4 for apps,
portrait 9:16, 1080 x 1920 or more (JPEG or 24 bit PNG, no alpha, longer side at most twice the
shorter). These must show the real app.

**Captured 8 November 2026** from the 1.0.0 release build on the emulator, with invented entries only,
the status bar in demo mode (9:41) and then trimmed: `store-graphics/screenshots/01` to `08`, 1080 x
2160 JPEG (exactly 2:1; the phone's own 1080 x 2400 is taller than Play allows). Shot 8 is Echoes for
now: the ECHO Plus paywall cannot be shown until RevenueCat is set up, and is captured then.

| File | Shot |
|---|---|
| `01-today-night.jpg` | 1, Today at night |
| `02-breathe-feelings.jpg` | 2, What are you feeling? |
| `03-practice-breathe-out.jpg` | 3, a practice |
| `04-daily-echo-words.jpg` | 4, the daily echo |
| `05-morning-day.jpg` | 5, a morning |
| `06-pattern-card.jpg` | 6, a pattern card |
| `07-privacy-you.jpg` | 7, privacy in You |
| `08-echoes.jpg` | Echoes, in place of 8 until the paywall can be captured |

Alt text for `08-echoes.jpg`: `Echoes keeps every entry by month, searchable by word, with morning entries marked.`

Shot list, in this order (the first three matter most, because Play shows them first):

| # | Screen | What it must show | Alt text (140 characters at most) |
|---|---|---|---|
| 1 | Today at night | The living Night plate, "Where are you, really?", Begin, Breathe first and Write instead | ECHO's evening screen: a moonlit valley, the question where are you really, and a way to begin. |
| 2 | Breathe, "What are you feeling?" | The feelings list on the plate | Breathe asks what you are feeling and offers a short practice for each feeling. |
| 3 | A practice in progress | The dimmed screen with the tide line and one word, such as "Breathe out" | A breathing practice in progress: the screen dims, a soft line rises and falls, one word guides you. |
| 4 | The daily echo | Words appearing over the mountains, with invented example words | Speaking the daily echo: your words appear over the mountains as you talk. |
| 5 | A morning | Today in the day plate with "Who will you be today?" | A morning in ECHO: who will you be today, over a sunlit valley. |
| 6 | A pattern card | One card with invented quotes and its credited idea | A pattern card names what keeps returning, quoting your own entries, with an idea credited to its author. |
| 7 | Privacy in You | The voice and data rows, Delete all data, Export | Privacy controls in ECHO: choose what leaves your phone, export everything, or delete it all. |
| 8 | ECHO Plus | The paywall with the trial line from the store | ECHO Plus: every practice at any length, unlimited voice into words, every pattern card reading. |

Rules for every screenshot:

- **No real journal content, ever.** Use a test phone with invented entries written for the
  screenshots, such as "I keep saying yes to things before I've thought about them." Never a real
  person's words, and nothing from the owner's own journal.
- No device frame, and no hands. A clean status bar: full battery and signal, no notifications.
- Captions are optional. If used, set them in Cormorant Garamond on the plate, one short line, taking
  well under a fifth of the image, with no claims and no call to action.
- Capture in Night (the default) except shot 5.

## Optional

- **Tablet screenshots** (at least 4 for tablets and Chromebooks) only if ECHO should be promoted on
  large screens. Not needed for 1.0.
- **Preview video**: a public or unlisted YouTube video with ads off, real app footage in the first 10
  seconds; only the first 30 seconds autoplay. A natural one is 20 to 30 seconds of the living sky,
  a Settle practice and words appearing as someone speaks invented text. Not needed for 1.0.

## Licences

- Plates and the Night loop were made for ECHO with an image generation service, and no stock
  photography is used. `product-handoff/licensing/ASSET_LICENSING.md` asks the owner to keep the
  generation records and confirm the service's commercial use terms before launch. **Owner action:**
  confirm before the listing goes live.
- Cormorant Garamond and Manrope are under the SIL Open Font License, which allows their use in images
  and on websites.

## Regenerating

Serve the repository root (for example `python3 -m http.server 8766` from the repository root), open
each source page at its exact size in a browser driven by Playwright, screenshot it, and flatten to RGB
(Play rejects alpha in the feature graphic): `ffmpeg -i in.png -pix_fmt rgb24 out.png`.

| Source | Size | Output |
|---|---|---|
| `store-graphics/feature-graphic.html` | 1024 x 500 | `store-graphics/feature-graphic-1024x500.png` |
| `store-graphics/og-image.html` | 1200 x 630 | `site/assets/og.jpg` |
| `store-graphics/favicon.html#32`, `#16` | 32 x 32, 16 x 16 | `site/favicon-32.png`, `site/favicon-16.png` |
