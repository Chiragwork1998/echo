# Interactions, states and transitions

## Navigation and motion

- Forward onboarding: 650 ms cross-dissolve; current scenic plate scales 1.00 → 1.025 while next enters at 0.985 → 1.00.
- Back: reverse direction; restore previous selection and scroll position.
- Selection: 320 ms spring, scale 0.96 → 1.00, warm rim glow fades in.
- Button press: 180 ms, scale to 0.985 and shadow reduces 20%.
- Theme change: 900 ms background crossfade; controls interpolate colors over 320 ms.
- Reduced Motion: opacity-only transition ≤180 ms; no scale/parallax.

## Loading

- Background load: show dominant-color placeholder and subtle 1.5% grain; never blank white.
- Reflection generation: keep completion composition; card shows “Listening for what returned…” and a slow 1.2 s breathing indicator.
- Backup/auth network activity: inline spinner in CTA; prevent double submit.

## Empty

- No entries: Home recent section reads “Your first echo will appear here.”
- No patterns: “Patterns become visible after 5 reflections.”
- Search empty: “Nothing returned for that search.”

## Error

- Recoverable inline message; do not replace full scenic screen.
- Reflection error: “Your words are saved. The reflection can wait.” Actions: Try again / Continue.
- Backup error: continue local-only, show retry in You.
- Audio error: preserve recording when possible; offer Write instead.

## Offline

- Entire onboarding and text/voice capture work offline.
- Show a small non-blocking “Saved on this device” state.
- Queue backup/reflection only with explicit consent; retry on connectivity.

## Disabled

- Opacity 42%, no shadow/glow, accessibility hint explains requirement.
- CTA enablement must not rely on color alone; accessibility state is announced.

## Success

- Save: gentle haptic + 180 ms check transition.
- Onboarding completion: medium haptic once; never confetti.
- Reminder scheduled: confirmation toast “We’ll meet you at 9:30 PM.”

## Permissions

- Always show an in-app explanation before the OS prompt.
- Never request multiple permissions together.
- Denial is non-blocking; show Settings deep link only after denial.

## Authentication and backup variants

- Anonymous + backup off: continue immediately.
- Anonymous + backup on: authentication sheet.
- Authenticated + backup on: provision keys, show loading, continue.
- Authenticated but offline: continue local-only and mark backup pending.

## Theme behavior

- Options: Day, Night, Automatic.
- Automatic default: follow system appearance. Optional “Natural rhythm” setting may use local time 06:00–18:59 for Day and 19:00–05:59 for Night without location permission.
- Never change theme in the middle of an active writing session; defer until the session closes.

