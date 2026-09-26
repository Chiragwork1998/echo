# Screen specifications

All coordinates are for a 393 × 852 pt viewport. Use safe areas; values may shift by the device safe inset while preserving relative geometry.

## Shared shell

- Background: full-bleed, `cover`, focal point from manifest.
- Readability scrim: top and bottom gradients, never an opaque full-screen wash.
- Horizontal content inset: 24 pt.
- Header top: safe top + 12 pt; 44 pt minimum height.
- Wordmark: centered unless Home composition explicitly places it.
- Onboarding progress: right aligned, eight segments, 18 × 3 pt, 4 pt gap; active cream, inactive 28% cream.
- Primary CTA: x 24, width `viewport - 48`, max 345, height 56, bottom safe + 20–28.
- Back target: 44 × 44 pt even when glyph is 22 pt.

## 00 Landing

- Entry: first launch or explicit Replay onboarding.
- Hero copy centered in upper 24–31%.
- CTA pinned near bottom, secondary ritual caption below.
- Begin → Step 1. No scroll. No permissions.

## 01 Intent — “What brought you here?”

- Four single-select points connected by a decorative dotted trail.
- Default visual example: Understand myself selected. Real first load may have none selected.
- CTA disabled until selection; Begin with this → Step 2.
- Stored: `onboarding.intent`.

## 02 Horizon — “Which horizon needs your attention?”

- Three single-select choices: Behind me, Where I am, Ahead of me.
- Default visual example: Where I am.
- Start here → Step 3.
- Stored: `onboarding.horizon`.

## 03 Voice — “How should ECHO meet you?”

- Three choices: Guide me, Give me space, Let me speak.
- Choice alters future session default: guided prompts, blank writing, or voice recorder.
- Walk this way → Step 4.
- Stored: `onboarding.mode`.

## 04 Rhythm — “When can we meet you?”

- Circular 24-hour dial; drag handle snaps to 5-minute increments.
- Time text is tappable and opens native time picker for accessibility.
- Presets: Morning 08:00, Evening 18:30, Before sleep 21:30.
- Gentle reminder toggle. Ask notification permission only after Set my rhythm.
- Stored: `reminder.time`, `reminder.enabled`, `reminder.preset`.

## 05 Privacy — “Leave no trace.”

- Lock with Face ID/biometric toggle.
- Keep a private backup toggle.
- Protect my journal performs biometric capability check; if backup is enabled and user is anonymous, present authentication sheet before Step 6.
- Encryption caption is informational, not tappable.

## 06 Arrival — “Arrive as you are.”

- Five single-select stones: Light, Steady, Unsettled, Heavy, Numb.
- Ripple/glow indicates selection. Haptic: light impact.
- Skip → Step 7 with null mood. That’s close → Step 7.
- Stored: first entry `moodBefore`.

## 07 First Echo — “What are you carrying that no one can see?”

- Large writing surface; placeholder disappears on input.
- Write/Speak segmented control. Switching preserves the other mode’s draft.
- Timer begins on first typed character or recording start; it does not force-stop at zero.
- Reflect is disabled until 10 non-space characters or 3 seconds of audio.
- Keyboard: field scrolls internally; segmented control and CTA remain above keyboard using animated inset.
- Back with non-empty draft asks Keep draft / Discard / Stay.

## 08 Completion — “You made space for yourself.”

- Shows reflection result card. If AI reflection is unavailable, show a private saved-entry success card instead.
- Enter your space → Home.
- Back navigation disabled; system back returns Home after completion is committed.

## 09 Home

- Day: Valley Morning. Night: Living Landscape.
- Primary action begins today’s seven-minute session.
- Rhythm shows seven days; filled cairns/dots represent completed days.
- Recent/continue card opens the entry or draft.
- Tabs: Today, Echoes, Patterns, You.
- Home scrolls vertically only when content exceeds safe height; bottom tab bar remains sticky.

