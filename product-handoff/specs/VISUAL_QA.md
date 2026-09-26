# Pixel-accuracy and visual regression

## Golden process

1. Render at 393 × 852 logical points using fixed example data.
2. Freeze time at 9:41 and animations at their resting frame.
3. Mask the real OS status/home-indicator regions and any presentation-only device frame in the reference.
4. Compare component bounds and baselines before raw pixel comparison.
5. Fail if a component bound differs by >2 pt, a type baseline by >3 pt or a color delta exceeds ΔE 3 in non-photographic UI.
6. Photography may differ only by platform image decoding/crop ≤1%; UI geometry may not drift.

## Required screenshot matrix

- Day and Night × all 10 screens.
- Compact 360 × 780, reference 393 × 852, large 430 × 932.
- English normal type and 200% accessible layout.
- Permission allowed/denied; offline; loading; reflection error.

## Manual checks

- No text crosses bright mountain/cloud regions without adequate local scrim.
- CTA remains reachable with one hand and above the keyboard.
- Every interactive element has a 44 pt target.
- Theme switch changes atmosphere, never geometry.
- No journal content appears in logs, notifications or analytics inspectors.

