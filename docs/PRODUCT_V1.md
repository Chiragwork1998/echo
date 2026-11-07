# ECHO 1.0 product brief

Owner: Claude, as product lead under D-012 (`docs/OWNER_DECISIONS.md`). This file is the source of truth
for what ECHO 1.0 is. Agents build to it. A change to it is a product decision and is made here first.

## Who it is for

People who already do inner work, or want to: they journal, meditate, read Joe Dispenza, Tara Brach,
Gabor Maté or Huberman, and know the feeling of the same thoughts running the same day again. Mostly
22 to 45, English speaking, India first and then everywhere, Android first. They are tired of apps that
chat at them, sell them content libraries, or keep their private words somewhere they cannot see.

What they want, in their words: "Help me notice what keeps running my life, settle my body when it is
loud, and become who I am trying to be. A few minutes a day. Privately."

## The promise

ECHO is a private daily practice for the mind: breathe, speak, and see yourself clearly.

## The daily practice

Four verbs. Each one is short, beautiful, and works offline except where words must be made from voice
or read by a model.

### 1. Breathe (new)

Settle the body first. Short, exhale-led breathing is the best supported way to calm down quickly
(Balban et al., Cell Reports Medicine, 2023: five minutes a day of cyclic sighing improved mood more
than mindfulness meditation). Dispenza opens every practice with breath and body for the same reason.

Practices, in this order:

| Name | Line shown | Pattern | Default | Free or Plus |
|---|---|---|---|---|
| Sigh | Two breaths in through the nose, one long breath out. The quickest way down. | in 2 s, in again 1 s, out 6 s | 1 min | Free at 1 and 3 min |
| Steady | In for five, out for five. Slow and even. | in 5.5 s, out 5.5 s | 3 min | Plus |
| Box | In, hold, out, hold. Four counts each, for before something hard. | 4, 4, 4, 4 s | 2 min | Plus |
| Sleep | In for four, hold for seven, out for eight. For the end of the day. | 4, 7, 8 s | 3 min | Plus |

Lengths: 1, 3, 5 and 10 minutes.

The experience:

- Full screen on the person's own plate (Night loop or Day still). Nothing else on screen but one
  word. The sky itself breathes: the scrim lifts a little on the in breath and settles on the out
  breath. No glowing orb in the middle of the screen, no ring, no counter.
- The word: "Breathe in", "In again" (Sigh only), "Hold", "Breathe out" for the first two rounds, then
  just "In", "Again", "Hold", "Out".
- A soft haptic tick at each change of phase. The screen stays awake. A tap shows a quiet "End".
- Reduce Motion: no movement, the word changes and the scrim changes opacity only. Screen readers hear
  each phase once, politely.
- When it ends: "Begin your echo" (straight into today's journal, the bridge from body to words),
  "One more minute", and "Done".
- Entry points: Today ("Breathe first", beside or under "Write instead"), and practice suggestions on
  pattern cards that are about breath.

### 2. Speak (exists)

The seven minute daily echo. Voice first, exact words, hidden or live words, the book, the living sky,
encrypted on the phone. This is the core and it is verified. Change it only where this brief says.

### 3. Become (new, mornings)

Joe Dispenza's daily structure, in ECHO's own words: decide in the morning who you will be, rehearse it
until you can feel it, and notice at night where the old self ran the day. Nothing here quotes his books
or names him in the product's copy, except the existing credited lens on pattern cards.

- Mornings are 4:00 to 11:59, local time.
- Today's question in the morning is "Who will you be today?" in place of "Where are you, really?".
  Begin works exactly as it does in the evening and saves the entry with `promptId: 'become'`.
- Before the morning session an optional one minute Steady breath ("Arrive first"), skippable with a tap,
  free.
- After Reflect on a morning entry, before Completion, the Rehearse moment (about 60 seconds, free):
  the person's own words come back over the sky one phrase at a time (at most the first 240
  characters, whole sentences). Then "Now feel it, as if it is already true." stays while the sky
  breathes at the Steady pace for 30 seconds. Then "Go and live it." and Completion carries on. A tap
  shows "Skip". Reduce Motion: phrases fade, nothing moves.
- In the evening, when a morning intention exists, Today may show it quietly under the question, for
  example "This morning: calm, honest, unhurried". Only if it looks right by eye. Drop it if it
  clutters Today.

### 4. See (exists, polish)

Patterns: plain counts worked out on the phone, and pattern cards read by a model through the credited
lenses in `voice-api/src/lenses.ts` (Dispenza, Porges, Dana, Siegel, Pennebaker, Neff, Schwartz, Maté,
Brach, Levine). Unlocks after 5 reflections (locked copy). Cards never appear after a session (D-008).

1.0 adds:
- "Report this card" on every card (Google Play's AI content policy requires in-app reporting). It
  sends only the reason, the lens id and the model, never the card's text or quotes.
- A breath practice on a card links to Breathe.
- The design pass in `docs/DESIGN_QUALITY.md` (remove the sparkles and the stacked uppercase labels).

### Echoes and You (exist, polish)

- Echoes: an entry shows its first words as its title when it has no title of its own, not the prompt
  repeated down the list. A morning entry is marked quietly.
- You: grouped into a few calm sections instead of a glass card per row. Adds ECHO Plus, Support,
  "If you are struggling" (the existing support panel), Privacy, Terms, and the app version.

## ECHO Plus (new)

One subscription. Prices live in the store and change without a build. Never write a price into the app.

| | Free | ECHO Plus |
|---|---|---|
| Writing | Unlimited | Unlimited |
| Voice into words | 60 minutes a month | Unlimited, fair use 20 hours a month |
| Recording your voice | Always, and always kept | Always |
| Live words, Tidy my words | | Yes |
| Pattern cards | First reading free | Every reading |
| Breathe | Sigh, 1 and 3 minutes | Every practice and length |
| Become, Echoes, search, export, lock, reminders | Yes | Yes |

When the free minutes run out mid month the recording is still kept, safe and encrypted, exactly as it
is offline today ("Your recording is safe. It hasn't become words yet."). It can become words later with
Plus or next month. Nothing the person said is ever lost or held hostage.

Store setup (lead decision, configured in Play Console and RevenueCat, not in code):

- One subscription `echo_plus` with base plans `yearly` (with a 7 day free trial offer) and `monthly`.
- RevenueCat entitlement `plus`, offering `default` with packages yearly and monthly.
- Prices: US$49.99 a year and US$8.99 a month. India ₹1,999 a year and ₹299 a month. Other countries
  use Play's conversion from US dollars.

Where the paywall appears:

1. Once, after onboarding's Completion, before Home. Dismissible with "Not now".
2. Patterns, on "Read my patterns" after the first free reading.
3. Breathe, on a Plus practice or length.
4. A spoken entry, when the free minutes are used up (inside the "recording is safe" note).
5. You, on the ECHO Plus row.

Paywall copy (working copy, the lead's):

- Heading: "ECHO Plus"
- Lead: "The whole practice, with nothing held back."
- Pattern cards: "ECHO reads your entries and names what keeps returning, in your own words."
- Unlimited voice: "Speak for as long as you need. Free includes 60 minutes a month."
- Every breath: "Steady, Box and Sleep, at any length."
- Live words and Tidy: "Watch your words arrive as you speak, or have them tidied."
- Plans come from the store. Yearly is selected and shows its trial: "7 days free, then {price} a
  year". Monthly: "{price} a month".
- Button: "Start 7 days free" when a trial applies, otherwise "Continue".
- Fine print: "Cancel anytime in Google Play. You won't be charged until the trial ends, and ECHO will
  remind you two days before."
- Links: "Restore purchases", "Terms", "Privacy". Close: "Not now".
- Two days before a trial ends, a local reminder: "Your ECHO Plus trial ends in 2 days." It names no
  journal content.

## Trust and safety

- Journal words and audio are encrypted on the phone. Nothing is kept on ECHO's server.
- Voice and pattern readings go to OpenAI only after consent that names OpenAI (exists). OpenAI does
  not train on them.
- Crisis support (`src/features/patterns/SupportPanel.tsx`, `supportResources.ts`) is reachable from
  You at all times, and the server's safety check stays.
- Not therapy, diagnosis or advice, said plainly where readings appear (exists).
- Each phone gets a random install id (`src/services/install.ts`). It names no one, is not derived from
  the device, holds no content, and survives "Delete everything" so that purchases and the free
  allowance stay attached. The privacy policy says so.

## Not in 1.0

Accounts and sign in, cloud sync, iOS in the store (the code stays cross platform, and iOS ships once an
Apple developer account exists and the app has been tested on an iPhone), widgets, sharing, community,
a content library, any companion or chatbot.

## Launch

- Android first. Play closed testing ("Early access") as soon as the Play account exists, then
  production when Play allows: a personal account created after November 2023 needs 12 testers opted in
  for 14 days first.
- A landing page with the early access link, privacy policy, terms and support, built to
  `.claude/skills/landing-page-design/SKILL.md`.
- Store listing, data safety, content rating and health declaration answers in `docs/launch/`.

## Measures

- North star: people who practise on at least three days a week.
- Funnel: install, onboarding finished, first entry, day 7 return, trial started, paid.
- Revenue: MRR from RevenueCat. The target is US$10,000 a month.
- Analytics never carry journal words, prompt answers or audio. Counts only.

## Who owns what (agents)

| Area | Owns | Notes |
|---|---|---|
| Practices | `src/features/breathe/**`, `app/home/breathe.tsx`, Become (morning question, Arrive first, Rehearse), Today entry points | Gate with `useRequirePlus` from `@/services/plus` only |
| Plus | `src/services/plus/**`, `app/plus.tsx`, RevenueCat, the paywall, You's ECHO Plus row, Patterns gate, post onboarding paywall, trial reminder | Uses `getInstallId` from `@/services/install` as the RevenueCat app user id |
| Server and identity | `voice-api/**`, `src/services/install.ts`, the voice client headers and error mapping, the "free minutes used" note | Per install tokens, quotas, entitlement, spend guard |
| Launch kit | `site/**`, `docs/launch/**` | No app code |
| Design pass (later) | Echoes, Patterns, You presentation | After Practices and Plus merge |

A file another area owns may be touched only as little as the change needs, and every such touch is
named in the report.
