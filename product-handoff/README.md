# ECHO — Production Design Handoff

This package is the implementation contract for the ECHO journaling app onboarding and first Home experience.

## What is locked

- Two complete golden-reference flows: Day and Night.
- Landing → 8 onboarding steps → Home.
- Reference viewport: **393 × 852 pt** (iPhone 15 Pro class).
- Day and Night use the same components, copy, navigation and stored data.
- Day Home is **Valley Morning**. Night Home is **Living Landscape**.
- The PNGs in `golden/` are the visual acceptance references. Do not redraw or reinterpret their composition.

## Start here

1. Read `HANDOFF_TO_CODING_AGENT.md`.
2. Import `design/tokens.json` or `design/tokens.ts`.
3. Build the shared components listed in `specs/COMPONENTS.md`.
4. Implement screens in the order in `specs/SCREEN_SPECS.md`.
5. Wire behavior from `specs/INTERACTIONS_AND_STATES.md`.
6. Use clean photography from `assets/backgrounds/day/`; Night uses the matching file in `assets/backgrounds/night/` plus the overlay assets.
7. Validate at 393 × 852 pt against `golden/day/` and `golden/night/`.

## Package map

- `flows/` — full Day and Night product-flow PNGs.
- `golden/day/`, `golden/night/` — full-resolution screen references.
- `assets/backgrounds/` — clean, UI-free scenic plates.
- `assets/icons/` — editable stroke SVGs.
- `assets/overlays/` — reusable grain, moon/stars and gradient scrims.
- `design/` — colors, typography, spacing, radii, shadows and motion tokens.
- `specs/` — product, screen, behavior, state, responsive, accessibility and QA requirements.
- `data/` — example content and machine-readable screen manifest.
- `prompts/` — regeneration guidance for scenic assets.
- `licensing/` — asset and font licensing notes.
- `OWNER_INPUTS.md` — launch decisions that require the product owner.

## Critical implementation rule

Do not ship a flattened screenshot as the UI. Build native/code components over the supplied clean backgrounds. The device frame and status bar in several golden images are presentation chrome only; use the real platform safe areas and system bars.

