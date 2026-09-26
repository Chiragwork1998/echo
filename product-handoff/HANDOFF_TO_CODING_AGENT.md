# Coding-agent master instruction

Build ECHO as a production-quality mobile journaling app from this package. Treat the PNGs under `golden/` as immutable visual specifications and the written specs as the behavioral specification.

## Non-negotiable visual rules

1. Reference canvas is 393 × 852 logical points. Render and compare at this size first.
2. Use New York / Cormorant Garamond for emotional display copy and SF Pro / Inter for utility copy. Never substitute a geometric display face.
3. Use the supplied background plate for each screen with `cover`; obey its focal point from `data/screen-manifest.json`.
4. Use exact values from `design/tokens.json`. Do not invent spacing, colors, radii or shadows.
5. ECHO wordmark is letterspaced text/SVG, not a generic logo image.
6. Primary CTA is always 56 pt high, 345 pt maximum width, 28 pt radius and 24 pt horizontal inset.
7. Glass surfaces must retain backdrop blur, subtle white border and controlled dark scrim. Never use opaque black cards.
8. Day and Night share layout and component geometry. Theme changes color, photography grade, scrim and glow only.
9. Use real safe areas and native keyboard. Do not bake device chrome into the application.
10. Do not add decorative effects, gradients, icons, text or interactions that are absent from this handoff.

## Recommended stack

- React Native + Expo Router + TypeScript, or native SwiftUI/Kotlin with equivalent geometry.
- State: Zustand/Redux Toolkit or native observable state.
- Local data: encrypted SQLite; Keychain/Keystore for secrets.
- Optional sync: authenticated encrypted backend; keep local-first behavior.
- Audio: platform recorder; ask permission only when Speak is selected.
- Notifications: local scheduling; ask permission only after the user enables Gentle reminder.
- Biometrics: LocalAuthentication/LAContext after the user enables Face ID/biometric lock.

## Acceptance criteria

- All screen transitions and controls follow `specs/INTERACTIONS_AND_STATES.md`.
- All loading/empty/error/offline/disabled/success/permission states exist.
- Onboarding resumes after app termination at the last completed step.
- An offline user can complete onboarding and journal locally.
- Voice, notifications and biometrics degrade gracefully when unavailable.
- No journal content appears in analytics, logs, crash reports or notification bodies.
- At 393 × 852, component boxes must be within 2 pt of the spec; typography baselines within 3 pt.
- At 360–430 pt widths, no clipping or overlap occurs.
- Reduced Motion, VoiceOver/TalkBack and 200% text-size fallback layout work.

## Build order

1. Tokens, fonts, theme provider and safe-area shell.
2. Background image component, scrims, wordmark and progress header.
3. CTA, glass card, choice marker, segmented control, toggle row and tab bar.
4. Landing and onboarding steps 1–8.
5. Home Day and Night.
6. Persistence, permissions, authentication gate for backup, offline handling.
7. Accessibility and responsive layouts.
8. Golden screenshot tests and interaction tests.

Do not begin Echoes, Patterns or You visual design beyond functional placeholders until their final golden screens are approved. Their tab destinations and data contracts are defined, but their visual compositions are not pixel-locked in this package.

