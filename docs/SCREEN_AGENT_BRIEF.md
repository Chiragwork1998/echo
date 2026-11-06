# Screen agent brief

You own one screen of ECHO. The bar is a thing of beauty: your screen should be indistinguishable from its golden at a glance, then feel better than a still image can.

## Read first

1. `AGENTS.md`
2. `product-handoff/specs/SCREEN_SPECS.md`, your section
3. `product-handoff/specs/INTERACTIONS_AND_STATES.md` and `RESPONSIVE_ACCESSIBILITY.md`
4. `docs/SPEC_CONFLICTS.md`, where the goldens override the written spec
5. `src/features/onboarding/screens/LandingScreen.tsx`, the reference screen
6. Your goldens: open `product-handoff/golden/day/` and `night/` and look at them closely

## Files

You may edit only:

- your screen file: `src/features/onboarding/screens/<Name>Screen.tsx` or `src/features/home/screens/HomeScreen.tsx`
- a new folder for that screen's private parts: `src/features/onboarding/<screen>/` or `src/features/home/today/`
- tests beside those files

**Do not edit** `src/components/`, `src/design/`, `src/content/`, `src/state/`, `app/`, `assets/`, `scripts/`, or `package.json`. These are shared with agents working in parallel. If you need a change there, stop and put it in your final report under **Lead requests**, with the exact change and why.

`product-handoff/` is immutable.

## Rules

- Text comes from `copy` in `src/content/copy.ts`, or `goldenCopy` if it is not in the deck. Never retype a string.
- Use shared components first: `ScreenShell`, `OnboardingHeader`, `PrimaryCTA`, `GlassCard`, `EchoText`, `ChoiceMarker`, `ToggleRow`, `Icon`.
- Colours, spacing, radii, and motion come from `tokens`. A number measured from a golden goes in a named constant at the top of the file.
- Never hardcode a font. Use `EchoText`.
- Selection must show through shape as well as colour, with a 44 pt minimum target and correct accessibility role, label, and state.
- Honour Reduce Motion through Reanimated's `ReduceMotion.System`.
- No journal content in logs. No `console.log` left behind.
- Do not invent anything absent from the goldens and specs.

## Salvage

`origin/yash/echo` holds an earlier attempt. It is untrusted. You may read a file for ideas, using `git show origin/yash/echo:<path>`, but rewrite against our tokens and components. Do not copy files wholesale.

Worth reading: `src/components/` for `TimeDial`, `MoodStone`, `ThreeChoiceScreen`, `ChoiceMarker`, and onboarding screens `intent`, `horizon`, `voice`, `rhythm`, `arrival`. For First Echo and Home, read commit `de4b5f6`, because later versions on that branch are off-spec. Ignore the Avatar companion, `JournalShelf`, `JournalSessionScreen`, and `editorCanvas`.

## Your loop

```bash
npm run agent:setup                                  # once, in a fresh worktree
npm run visual -- --screen <id> --theme day          # build, render, compare
npm run visual -- --screen <id> --skip-build         # faster when only comparing again
```

Then **open `.artifacts/visual/<theme>-<id>.png` and look at it.** It has four panels: Golden, Ours, Overlay, Diff. Fix what you see and repeat until Overlay shows no ghosting on any UI element. Check both Day and Night.

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

`landing` is done. Assign from: `intent`, `horizon`, `voice`, `rhythm`, `privacy`, `arrival`, `first-echo`, `completion`, `home`.
