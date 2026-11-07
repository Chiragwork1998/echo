# Design quality

The owner's bar: every screen is a thing of beauty, and nothing looks like AI slop. This file is how
that bar is met on screens that have no golden (Breathe, Become, ECHO Plus, Echoes, Patterns, You).
Screens with a golden follow the golden.

## Where the design skill applies

The owner asked for `.claude/skills/landing-page-design/SKILL.md` (elayadesign, MIT) to be used wherever
it helps.

- **Website and landing pages:** follow the skill completely, Part A and Part B, with two brand
  exceptions that the handoff locks: display headings and the wordmark are set in Cormorant Garamond
  (the handoff forbids a geometric display face for emotional copy), and the base surface may be ECHO's
  Night navy `#13263A` with the approved plates as hero imagery. Body and interface text use Manrope,
  never Inter, on the web. No italics on the site.
- **The app:** ECHO's tokens, type (Cormorant Garamond for emotional display, Inter for utility),
  plates and components stay, because the skill itself defers to the owner's explicit rules. Everything
  else in the skill applies: content realism and the banned filler words (B8), every state (B9), motion
  (B7, translated below), the nested radius formula (B3), no one sided borders (B4), sentence case, no
  hyphens or dashes inside copy, no orphaned last words.

## Never in the app

- Decorative glyphs or emoji in the interface: no ✦, ✧, ★, sparkles, moons drawn in text.
- A glowing orb or pulsing circle in the middle of the screen. The plate is the visual.
- Gradient text, purple or teal "AI" gradients, neon glows, drop shadows on glass.
- A glass card around every single row. Group related rows in one surface with hairline dividers.
- An uppercase, letterspaced eyebrow above every block. One per screen at most, and only where the
  goldens use one.
- Centred body text longer than two lines. Body text is left aligned.
- Generic icon, title and subtitle grids. Icons only where the goldens use them.
- Words about AI in the interface: "AI powered", "magic", "insights", "smart". Say what happens: "ECHO
  reads your entries".
- Filler words: revolutionize, supercharge, cutting edge, effortless, seamless, unlock, elevate,
  empower, journey, holistic, game changer, transformative, dive into, take it to the next level,
  harness, world class. No exclamation marks. No cute interjections.
- Invented facts: no user counts, ratings, testimonials or study claims that are not real and cited.

## Always in the app

- One primary action per screen, at the 56 pt CTA geometry where a CTA is used.
- Spacing, colours, radii and type sizes from `src/design/tokens.ts`. Nothing invented.
- Motion that decelerates into place: `Easing.bezier(0.22, 1, 0.36, 1)`, 300 to 600 ms for movement, at
  least 200 ms for fades. Animate transform and opacity only. Reduce Motion replaces movement with a
  plain fade.
- Loading states shaped like what is coming, never a bare spinner. Empty states that are composed and
  say what to do. Errors inline, saying what failed and what to do next.
- Accessibility: labels and roles on every control, 200 percent text without clipping, screen reader
  announcements for anything that changes without a tap.
- Copy in ECHO's voice: calm, plain, second person, short sentences, no therapy jargon, no promises.

## How a screen is judged

1. Render it at 393 × 852 in the web harness (`npm run visual`, or Playwright against `npx expo start
   --web`) in Night and Day, and at 360 and 430 wide.
2. Put it beside the Home and onboarding goldens in `product-handoff/golden/`. It must look like the
   same hand made it: same type, same restraint, same light.
3. Read every line of copy aloud. Cut anything that sounds like an app trying to sound wise.
4. Look for the "Never" list above. One hit fails the screen.
