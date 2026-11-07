# Site brief: how the landing page was decided

The record of `.claude/skills/landing-page-design/SKILL.md` applied to ECHO's site: Part A's intake
answered from `docs/PRODUCT_V1.md`, the skill's output format, the layout choice, and the quick
checklist as judged on the built pages (8 November 2026). Brand exceptions from
`docs/DESIGN_QUALITY.md`: Cormorant Garamond for display headings and the wordmark, Manrope for the
rest, Night navy `#13263A` as the base surface, and the approved plates as imagery. No italics.

## A1. Intake

| Question | Answer | Source or assumption |
|---|---|---|
| The one primary action | **Get early access on Android**: open the Play closed test link `{{play_testing_url}}` | The lead's brief |
| The offer | ECHO before public launch, on Google Play: Breathe, the seven minute echo, mornings and pattern cards. Free to start; ECHO Plus optional, yearly with 7 days free | `docs/PRODUCT_V1.md` |
| What counts as a conversion | A click on the early access link, then an opt in on Play. The site has no analytics, so it is counted in Play Console (testers opted in, later installs by source) | Assumption: no site analytics, by the product's own privacy stance |
| ICP | People 22 to 45 who do inner work or want to: they journal, meditate, read Dispenza, Brach, Maté or Huberman. English speaking, India first, Android first | `docs/PRODUCT_V1.md`, Who it is for |
| Their problem | The same thoughts running the same day again; a body that is loud; wanting to become who they are trying to be, a few minutes a day, privately | The brief, in their words |
| Top three objections | 1. Where do my private words go, and will an AI read or train on them? 2. Another app that chats at me, sells me content, or that I will drop in a week. 3. Is this therapy-lite pseudoscience that will label me? | Assumption from the brief's "tired of apps that..." |
| Traffic source | Social at first: Instagram, X, LinkedIn, Reddit, the owner's network; later Play search | Assumption; `gtm-plan.md` |
| What visitors know | Little: one post or one friend's message. The page has to explain before it asks | Assumption |
| Proof available | No testimonials, users or ratings yet. Real proof: the 2023 Stanford study of cyclic sighing (Balban et al.), the credited ideas (with "not endorsed"), and checkable privacy facts | The brief; the lead's rules |
| Screens and media | Goldens contain device chrome and some superseded UI, so they are not used as screenshots. The plates and the owner approved Night loop (D-009) are used, with the app's own lines set over them | Judgement |
| Guarantees and terms | Free plan with no card; 7 day free trial on yearly with a reminder two days before; cancel anytime in Google Play; recordings never held hostage; export or delete everything | `docs/PRODUCT_V1.md`, ECHO Plus |
| Voice | Calm, plain, second person, short sentences, no therapy jargon, no promises, no AI words | `docs/DESIGN_QUALITY.md` |
| Design direction | Minimal editorial over ECHO's plates | The brand |
| Mobile priority | Yes. Android first audience arriving from social, on phones | Assumption |

## Output format

### 1. Page outline

1. Floating nav: wordmark, Practice, Privacy, Plans, Support, Get early access
2. Hero: headline, subheadline, primary CTA, privacy proof row, the living sky with the app's evening question
3. Problem to solution: "The same thoughts, running the same day again." and what ECHO is not
4. Benefits, as the practice: Breathe (the ten feelings and practices, with the Stanford study beside it), Speak, Become, See (with the credited ideas beside it)
5. Proof: "Ideas you may already know, credited by name." (16 credits, "credited, not endorsed")
6. Tagline reveal: "Breathe, speak, and see yourself clearly."
7. How it works: three steps, 3 minutes, 7 minutes, after 5 reflections
8. Privacy: what stays, what leaves only when you agree, what is never collected, what the server keeps
9. Plans and risk reversal: Free and ECHO Plus, then three promises
10. FAQ: twelve questions
11. Final CTA, identical to the hero's, over the Landing plate: "Meet the hidden parts of you."
12. Footer: privacy policy, terms, support, the wellness statement

### 2. Hero copy

- **Headline:** Notice what keeps running your life.
- **Subheadline:** ECHO is a private daily practice for the mind. Settle your body when it is loud, speak
  what is true, and become who you are trying to be.
- **CTA:** Get early access on Android (beside it: "Free to start")
- **Proof line:** Encrypted on your phone · No account · No ads or analytics

The headline is the audience's own sentence from the brief ("Help me notice what keeps running my life"),
so a visitor recognises themselves before they read a feature.

### 3. Benefits

- **Breathe for what you feel:** ten short practices chosen by feeling; help for panic, anxiety and hurt
  is never behind a paywall. Proof beside it: the 2023 Stanford study of cyclic sighing.
- **Say it the way it comes:** seven minutes out loud, exact words kept; English, Hindi or both.
- **Begin the day as who you mean to be:** a morning question, Arrive, and your own words played back.
- **See what keeps returning:** after five reflections, cards that quote your entries word for word.
  Proof beside it: the credited ideas.
- **Keep it to yourself:** encrypted on the phone, no account, voice and entries leave only after you
  agree, nothing kept on ECHO's server.

### 4. How it works

1. **Breathe, 3 minutes.** Say what you are feeling and close your eyes.
2. **Speak, 7 minutes.** Answer one question out loud, or write.
3. **See, after 5 reflections.** Read your echoes back, and ask what keeps returning.

### 5. FAQ

Twelve questions on the page (and in FAQ schema): therapy; who can read the journal; what leaves the
phone and OpenAI training; what happens in a practice; offline; languages; free vs Plus; trial and
cancelling; export and delete; where the ideas come from; early access and iPhone; who ECHO is for.

### 6. SEO and AEO

- **Index** the landing page, privacy, terms and support: evergreen pages whose intent matches the
  promise. **Noindex** the 404.
- Title: "ECHO: a private daily practice for the mind". Meta description: "Breathe for what you are
  feeling, speak for seven minutes, and see what keeps returning in your own words. Encrypted on your
  phone. Early access on Android."
- FAQ in plain question and answer form, with FAQPage schema that matches the visible text word for word
  (checked by script). Sitemap and robots with `{{site_url}}`.

### 7. Layout: **B, long form story**

Chosen because visitors arrive cold from social posts, ECHO is a new kind of practice (breathing by
feeling, a spoken journal, reflections that quote you), and the main objections, privacy and "is this
pseudoscience", have to be answered with specifics before anyone joins a test. A classic hero with
sections (A) would not carry that argument; a minimal page (C) suits only warm traffic.

## What is deliberately not on the page

- **Testimonials or social proof from users.** None exist yet, and none may be invented. When testers
  agree in writing, add this block after the credits section of `site/index.html`:

  ```html
  <section class="section" aria-labelledby="testers-title">
    <div class="container reveal">
      <h2 class="heading-4" id="testers-title">From early testers</h2>
      <figure class="stack-100">
        <blockquote class="body-7">“{{tester_quote_1}}”</blockquote>
        <figcaption class="caption-2 quiet">{{tester_name_1}}, early access tester</figcaption>
      </figure>
    </div>
  </section>
  ```
- **A form.** The only action is an outbound link, so there is no email field to validate and no
  personal data collected by the site.
- **A cookie banner.** The site sets no cookies and loads nothing from any third party.

## Quick checklist, judged on the built pages

Screenshots: `/private/tmp/claude-501/-Users-chirag-EchoLive/0dde44ea-28e7-46a9-b992-30a783b88d97/scratchpad/launch/`
(each page at 390 and 1440 wide, first screen and full page, plus the interactive states). An automated
audit (hyphens, banned words, text styles, scales, curves) passed with no problems on every page.

**Strategy**

- [x] One offer, one audience, one primary action: early access for people who do inner work.
- [x] No competing CTAs above the fold: the nav button is the same action.
- [x] Specific numbers: 3 minutes, 7 minutes, 5 reflections, 60 minutes a month, 30 entries, 30 days.
- [x] Risk reversal: free plan, no card, 7 day trial with a reminder, cancel in Google Play, recordings never held hostage.
- [x] Proof next to its claim: the Stanford study beside Breathe; the credits beside See; privacy facts beside the CTA.
- [x] Layout chosen deliberately: B.

**Visual**

- [x] Approved typefaces under the brand exception: Cormorant Garamond (display, wordmark) and Manrope; no italics; nothing above 600.
- [x] No hyphens in copy, no orphans: audited; `text-wrap: balance` on headings, `pretty` on text. Proper names that contain a hyphen were rewritten or left out (the site credits Maxwell Maltz without the book's hyphenated title).
- [x] Every font size on the Tailwind scale (audited).
- [x] Every text element on a named style (audited; Body 7, 18/28 regular, added for lead paragraphs as the skill allows).
- [x] Every spacing value from the table (audited; no `calc()` sums).
- [x] Nested radii follow the formula: the sky's pause button sits 16 px into a 24 px window, so 8 px.
- [x] No one sided card borders (dividers are hairlines between rows), no background gradients (scrims are flat).
- [x] Hero heading and subheading capped at 680 px, line break after "keeps" on wide screens.
- [x] Icons from Phosphor only (light weight, MIT).
- [x] Every transition on cubic-bezier(0.22, 1, 0.36, 1); reveals use IntersectionObserver; the tagline's scroll listener is throttled with requestAnimationFrame and runs only while it is on screen.
- [x] Tagline reveal present, two lines, words light one at a time (checked mid scroll: 1 of 6 lit); reduced motion shows it lit at once.
- [x] No invented prices, stats or testimonials: prices are the brief's; the only study is the brief's; placeholders are marked.
- [x] Checked at 390 px: no horizontal overflow on any page; the primary action is in the first screen.

**Content and ship**

- [x] Real copy in ECHO's voice; no banned words (audited).
- [x] States: hover, active (scale 0.98), focus ring (checked by keyboard), loading (each window shows a tiny copy of its own plate until the image arrives; the sky shows its poster until the video plays), empty and error (not applicable: the site has no lists, data or forms; the video falling back to its still is its error state).
- [ ] No dead links: every link works except `{{play_testing_url}}`, which is a dead link until the owner's closed test exists. Current page: on the landing page the nav marks the section in view; Privacy and Support are marked in the nav; Terms is marked in the legal tabs at the top of the page (it is not a nav item); the 404 is not a destination, so nothing is marked.
- [x] 404, legal links, favicon, meta tags, alt text. Form validation: not applicable, no forms.
