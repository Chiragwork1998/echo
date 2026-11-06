# Spec conflicts and rulings

Where the handoff disagrees with itself, the golden flow screens win. Each ruling below is the lead's
call so the build can proceed. **Owner review** marks the ones Chirag should confirm.

## Rulings

| ID | Conflict | Ruling |
|---|---|---|
| C-01 | The handoff and plate README prefer New York and SF Pro on iOS. The goldens are set in Cormorant Garamond: New York at the token size wraps the Intent title onto two lines. `echo-wordmark.svg` also names Cormorant. | Bundle Cormorant Garamond and Inter on iOS and Android. Display tokens scale 1.1× because they were sized for New York. |
| C-02 | The spec gives progress segments of 18 × 3 pt with a 4 pt gap (172 pt total), which collides with the centred wordmark. | Use the golden: about 10.5 × 3 pt, 96 pt total, plus the `1/8` count. |
| C-03 | The spec places the header at safe top + 12 pt. The goldens place it about 5 pt above the safe top. | Use the golden. Implemented once in `ScreenShell`. |
| C-04 | Rule 6 says the CTA is always 345 pt wide. Landing's golden shows 316 pt. | Use the golden width on Landing only. The button's styling is now an owner decision: `docs/OWNER_DECISIONS.md`, D-002. |
| C-05 | The handoff requires `ReadabilityScrim`. The later plate README says plates are fully graded and forbids runtime overlays. | No global scrim, grain, or overlay. If text needs help on a screen, use a local treatment. |
| C-06 | Production plates sit 8–60 pt higher than the goldens place them, putting titles on clouds. | Plates are repositioned at build time from `scripts/plate-placement.json`, and existing sky tapers into the gap. Home plates also bake in the goldens' depth of field below the scenery. **Owner review** |
| C-07 | The button token is 16 pt and the CTA height is 56 pt. Goldens show labels matching the `label` token (13 pt, 2.4 tracking) and 52–54 pt height. | CTAs use the `label` token. Height stays 56 pt: a non-negotiable rule and a better tap target. |
| C-08 | The CTA maximum width is 345 pt in the handoff and 382 pt in the responsive spec. | 345 pt at reference width, up to 382 pt on larger phones. |
| C-09 | Rule 8 says Day and Night share one layout, but Day Home and Night Home are different compositions. Both Homes also show text missing from the copy deck. | Build both compositions as drawn. The plate README confirms this is deliberate. Extra text lives in `src/content/goldenCopy.ts`. **Owner review** |
| C-11 | `ChoiceMarker` is specified at 22 pt, but Intent's golden shows 17 pt rings growing to a 27 pt gold ring, and Horizon shows smaller ones. | Markers on scenery follow their golden and stay private to each screen. `ChoiceMarker` serves list layouts. |
| C-12 | The subtitle token is 16 pt Regular. Goldens show about 14 pt, and lighter. | `OnboardingHeading` sets subtitles at 14.1 pt in Inter Light. |
| C-13 | `ToggleRow` is specified at 60 pt minimum height with a 52 × 30 track. Goldens show 49 pt with a 44 × 25 track. | Follow the golden. 49 pt still exceeds the 44 pt touch minimum. |
| C-10 | The manifest gives each screen a focal point. The plate README says always centre. | Plates are centred. `scripts/plate-placement.json` replaces focal points. |

## Damaged or missing files

- **No usable Night Rhythm golden exists.** `product-handoff/golden/night/04-rhythm.png` is truncated to the header, and the night flow sheet skips step 4 entirely. The harness compares Night Rhythm against the Day golden for geometry. Night styling, including the dark glass dial, comes from `docs/reference/night-rhythm-style-reference.png`, a low-resolution tile from an older concept sheet. **Owner action: supply the final Night Rhythm golden.**
- **Five handoff plates are truncated:** day `06-arrival`, day `09-home`, night `02-horizon`, night `05-privacy`, night `09-home`. The app does not use them. `CHECKSUMS.sha256` passes because it was generated from the damaged files.
- **Handoff night plates are tinted day images**, which the plate README forbids. The app uses the 1290 × 2796 masters from `ECHO-Production-Backgrounds-Complete-20.zip` instead, and identical masters are on `origin/yash/echo`.

## Plate differences to review

- **Arrival:** the production plates' stones are smaller and placed differently from the golden, and differ between Day and Night. In Night, the Light stone sits at the left edge. Labels are pinned to the real stones. A regenerated plate could restore the golden's composition. **Owner review**
- **Voice:** the golden shows a stacked-stone cairn with prayer flags at the lower left. The production `03-voice` plates do not have it. **Owner review**

## Known visual difference

Production plates are richer and more saturated than the plates inside the goldens, and small details differ because they were regenerated (the Night Landing moon sits about 13 pt further left). The harness mismatch percentage therefore never reaches zero. Judge the four-panel image by eye.

## Open technical limits

- **An iOS hidden take cannot be split, and past about 14 minutes it gets no words.** iOS records `.m4a` (`src/features/journal/recorderDriver.ts`), and MPEG-4 cannot be cut between frames the way Android's ADTS `.aac` can, which the app now sends in overlapping pieces. An `.m4a` goes to the voice server whole, so it is limited by what one request may carry, 4.4 MB, which is about 14 minutes at 40 kbps (a ten minute `.m4a` was taken in 15 seconds). A longer one is refused before anything is sent as `too_long`. The recording stays sealed and nothing is lost, but the person gets no words from it. Live takes (WAV) are split on both platforms and are not affected. Options when the owner decides: record iOS hidden takes in a format that can be cut (PCM in a WAV or CAF, split by size, or ADTS if the recorder can write it), record in segments, or add an MP4 splitter. **Owner action.**

## Before public launch

**Launch blocker. The voice server can be spent by anyone who opens the app.** `EXPO_PUBLIC_VOICE_TOKEN` is read by the app, so it ships inside the bundle. Anyone who unpacks the app can take it and call all four routes with it: `/api/transcribe`, `/api/refine`, `/api/live-session` and `/api/patterns`. `/api/live-session` hands out a realtime session secret that is billed to ECHO's OpenAI account, and `/api/patterns` and tidy `/api/refine` are model calls on arbitrary text. The only things standing in the way are the limits below, and none of them is a defence against someone who means it:

- The rate limit and the count of wrong tokens are held in memory, per Vercel instance. A second instance counts for itself, and an instance that restarts forgets. They stop casual abuse and nothing else.
- The token is shared by every install, so one install cannot be told from another, and one cannot be turned off without turning off all of them.
- ffmpeg is bounded (30 seconds, four at once per instance, 25 MiB of output), `/api/refine` takes at most 100,000 characters, and each route has a body limit. These cap what one request can cost, not how many are made.

Before the app is public, all three of these must be done:

1. **Prove the app is the app.** App Attest on iOS and Play Integrity on Android, or a per-install token the server issues after that check, so a token taken from one phone is useless on another and a bad install can be revoked alone.
2. **Rate limits that hold across instances.** Vercel Firewall rate limits on `/api/*`, keyed by IP and by install, with the in-memory limits kept as a second layer.
3. **A dedicated OpenAI project with a spend cap.** ECHO's voice server should use its own project and key, with a monthly hard limit and usage alerts, so that the worst case is a known number and cannot reach any other use of the account.

Public launch is blocked until all three are done. **Owner action.**
