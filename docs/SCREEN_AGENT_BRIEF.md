# Screen agent brief

You own one screen of ECHO. The bar is a thing of beauty: your screen should be indistinguishable from its golden at a glance, then feel better than a still image can.

## Read first

1. `AGENTS.md`
2. `product-handoff/specs/SCREEN_SPECS.md`, your section
3. `product-handoff/specs/INTERACTIONS_AND_STATES.md` and `RESPONSIVE_ACCESSIBILITY.md`
4. `docs/OWNER_DECISIONS.md` and `docs/SPEC_CONFLICTS.md`, which override the handoff
5. `src/features/onboarding/screens/LandingScreen.tsx`, the reference screen
6. Your goldens: open `product-handoff/golden/day/` and `night/` and look at them closely

## Budget

Finish in about 15 minutes of work, with about 400 lines of non-test code. Make the screen beautiful, then stop. Do not chase sub-point precision after the overlay stops showing ghosting, and do not build for tablets: the lead handles those in the final pass.

## Files

You may edit only:

- your screen file: `src/features/onboarding/screens/<Name>Screen.tsx` or `src/features/home/screens/HomeScreen.tsx`
- a new folder for that screen's private parts: `src/features/onboarding/<screen>/` or `src/features/home/today/`
- tests beside those files

**Do not edit** `src/components/`, `src/design/`, `src/content/`, `src/state/`, `app/`, `assets/`, `scripts/`, or `package.json`. These are shared with agents working in parallel. If you need a change there, stop and put it in your final report under **Lead requests**, with the exact change and why.

`product-handoff/` is immutable.

## Rules

- Text comes from `copy` in `src/content/copy.ts`, or `goldenCopy` if it is not in the deck. Never retype a string.
- Use shared components first: `ScreenShell`, `OnboardingHeader`, `OnboardingHeading`, `PrimaryCTA`, `GlassCard`, `EchoText`, `TrackedText`, `ChoiceMarker`, `ToggleRow`, `SoftScrim`, `Icon`.
- Night is the default theme and the first impression (D-001), so perfect Night first, then confirm Day.
- Controls that sit on scenery go in `ScreenShell`'s `plateOverlay` prop and are positioned with `usePlatePoint` from `@/design/usePlatePoint`, so they stay on their rock or river bend on every phone.
- Android and iOS space letters differently. Use `TrackedText` for short, widely tracked words, not `letterSpacing`.
- Colours, spacing, radii, and motion come from `tokens`. A number measured from a golden goes in a named constant at the top of the file.
- Never hardcode a font. Use `EchoText`.
- Tests use `render` from `@/testing/render`, and `render` and `fireEvent` must be awaited. See `src/components/PrimaryCTA.test.tsx`. Mock `expo-haptics` as in `src/features/onboarding/landing/BeginButton.test.tsx`.
- Selection must show through shape as well as colour, with a 44 pt minimum target and correct accessibility role, label, and state.
- Honour Reduce Motion through Reanimated's `ReduceMotion.System`, and use `useReduceMotion` from `@/design/useReduceMotion` for looping animation.
- No journal content in logs. No `console.log` left behind.
- Do not invent anything absent from the goldens and specs.

## Practical notes

- `src/features/onboarding/screens/IntentScreen.tsx` and `src/features/onboarding/intent/` are the best example of a finished screen, including plate pinning and the large-text fallback.
- The harness renders only 393 x 852, with insets of 59 and 34, and cannot set text scale. For other sizes, cover the layout logic in Jest: drive `useWindowDimensions` with `Dimensions.set({ window, screen })`.
- When a golden cannot be matched by a token, use a named constant measured from the golden and mention it in your report.
- To measure from a golden, normalise the screen crop in `scripts/visual/crops.json` to 786 x 1704, the harness's scale. Threshold detection gives sub-point positions.
- `noUncheckedIndexedAccess` is on, so indexed access returns `T | undefined`.
- Large text (125% or more) and landscape scroll automatically through `ScreenShell`. Scenery controls need a list fallback then, because the portrait photograph no longer fits. Intent shows how.
- If a disabled CTA needs a hint and the copy deck has none, reuse the screen's subtitle.

## Salvage

`origin/yash/echo` holds an earlier attempt. It is untrusted. You may read a file for ideas, using `git show origin/yash/echo:<path>`, but rewrite against our tokens and components. Do not copy files wholesale.

Worth reading: `src/components/` for `TimeDial`, `MoodStone`, `ThreeChoiceScreen`, `ChoiceMarker`, and onboarding screens `intent`, `horizon`, `voice`, `rhythm`, `arrival`. For First Echo and Home, read commit `de4b5f6`, because later versions on that branch are off-spec. Ignore the Avatar companion, `JournalShelf`, `JournalSessionScreen`, and `editorCanvas`.

## Your loop

```bash
npm run agent:setup                                  # once, in a fresh worktree
npm run visual -- --screen <id> --theme day          # build, render, compare
npm run visual -- --screen <id> --skip-build         # faster when only comparing again
```

Read images with your file-reading tool. Then **open `.artifacts/visual/<theme>-<id>.png` and look at it.** It has four panels: Golden, Ours, Overlay, Diff. Fix what you see and repeat until Overlay shows no ghosting on any UI element. Check both Day and Night.

The mismatch percentage will not reach zero, because the photography differs slightly. Do not chase the number. Judge alignment, type size, weight, colour, and glass by eye. Bounds should be within 2 pt, baselines within 3 pt.

Each visual run takes the shared lock, so runs from different agents queue automatically. Do not start the emulator or a dev server: this Mac has 16 GB of RAM and is already swapping.

## Done means

1. `npm run check` passes.
2. Day and Night comparisons look right to you, and you viewed them.
3. Behaviour tests cover validation, selection, and navigation.
4. Every state in the spec for your screen exists: disabled, loading, error, and denied permission where they apply.
5. You report changed files, assumptions, Lead requests, and anything you could not verify on a real device.

Commit to your worktree branch with a clear message. Do not push and do not merge. The lead reviews and merges.

## Rhythm in Night

There is no Night Rhythm golden. Match the Day golden's geometry, and take the night look, including the dark glass dial, from `docs/reference/night-rhythm-style-reference.png`. The Overlay panel will show a Day plate behind your Night screen: compare UI position only.

## Screen ids

`landing` is done, and its BEGIN button is an owner-approved redesign, so it intentionally differs from the golden. Assign from: `intent`, `horizon`, `voice`, `rhythm`, `privacy`, `arrival`, `first-echo`, `completion`, `home`.
