# Go to market: from early access to US$10,000 MRR

The target is in `docs/PRODUCT_V1.md`: US$10,000 a month of recurring revenue, measured in RevenueCat.
This plan shows the arithmetic, the channels that reach ECHO's audience, the first 30 days from launch
day, and posts ready to use. Every number below is either a price from the brief or a **planning
assumption, marked as one**. None is a measured result or an industry benchmark: replace each
assumption with ECHO's own numbers as soon as Play Console and RevenueCat have them.

No claim in any post may go beyond the brief: no user counts, ratings, testimonials or press, and no
study other than the 2023 Stanford study of cyclic sighing (Balban et al., Cell Reports Medicine).

## 1. The arithmetic

### Prices (from the brief)

| Plan | US | India |
|---|---|---|
| Yearly, 7 days free first | US$49.99 | ₹1,999 |
| Monthly | US$8.99 | ₹299 |

Other countries pay Play's conversion from US dollars. Google Play keeps 15 percent of subscription
payments, so US$10,000 of MRR is about US$8,500 before tax. RevenueCat's MRR counts a yearly plan as a
twelfth of its price each month.

### Assumptions

| # | Assumption | Value | Why this value |
|---|---|---|---|
| A1 | Rupees to the dollar | 88 | For planning only; check on the day |
| A2 | Payers on yearly vs monthly | 70 / 30 | Yearly is preselected and carries the trial |
| A3 | Payers in India vs priced like the US | 50 / 50 | India first, then everywhere |
| A4 | Monthly plan cancellations | 10 percent a month | Planning figure |
| A5 | Yearly plan cancellations in the first year | none (renewal comes at month 12) | How yearly plans work |
| A6 | Installs that finish onboarding | 70 percent | Planning figure |
| A7 | Installs that start a trial | 6 percent | Paywall after onboarding, in Patterns, Breathe and when free minutes run out |
| A8 | Trials that become paid | 40 percent | Planning figure |
| A9 | Installs that buy monthly without a trial | 0.6 percent | Planning figure |
| A10 | Installs that become paying, A7 x A8 + A9 | **3 percent** | Shown also at 2 and 5 percent below |

### What one payer is worth each month

| | Yearly | Monthly | Blended at A2 |
|---|---|---|---|
| US priced | US$4.17 | US$8.99 | US$5.61 |
| India priced (A1) | US$1.89 | US$3.40 | US$2.34 |
| Mix at A3 | | | **US$3.98** |

### Paying subscribers needed for US$10,000 MRR

| Mix | Payers |
|---|---|
| All US priced | 1,782 |
| All India priced | 4,265 |
| Half and half (A3) | **2,513** |

India first is the right market for the audience and the hardest for revenue: an Indian payer is worth
about two fifths of a US payer. The plan therefore wins India for reach and word of mouth, and makes sure
the English speaking markets outside India hear about ECHO too.

### How many new payers and installs, and how fast

With N new payers a month, A2 to A5 give MRR after m months of:

- after 6 months: 21.43 x N, so **467 new payers a month**;
- after 12 months: 38.78 x N, so **258 new payers a month**.

| Reach US$10,000 MRR in | Install to paid 2% | 3% (A10) | 5% |
|---|---|---|---|
| 12 months | 12,893 installs a month (430 a day) | **8,595 a month (287 a day)** | 5,157 a month (172 a day) |
| 6 months | 23,332 a month (778 a day) | 15,554 a month (518 a day) | 9,333 a month (311 a day) |

The levers, in order of what ECHO controls: **install to paid** (onboarding that lands, a first echo on
day one, a practice that helps on a bad day, the paywall at the right moments), **monthly to yearly mix**,
**installs** (channels below), and **the share outside India**.

### The funnel to watch, and where

There is no analytics SDK, by design, so the funnel comes from the stores:

| Stage | Where it is measured |
|---|---|
| Store visitors, installs, conversion by source | Play Console, Acquisition reports (UTM tagged links show by campaign) |
| Retained installers | Play Console |
| Trials started, trial to paid, MRR, churn, refunds | RevenueCat |
| Onboarding finished, first entry, day 7 return | Not measured in 1.0 (no analytics). Proxy: trial starts and Play's retained installers. If the owner wants these, they need a counts only decision first (the brief allows counts only). |

Tag every link: `{{site_url}}/?ref=instagram` style links stay on the site, and the store link carries
`&referrer=utm_source%3Dinstagram%26utm_campaign%3Dlaunch` so Play Console can split installs by source.

## 2. Channels that reach this audience

The audience (`docs/PRODUCT_V1.md`): 22 to 45, English speaking, India first, Android first; people who
journal, meditate, read Joe Dispenza, Tara Brach, Gabor Maté or Huberman, and are tired of apps that
chat at them or keep their words where they can't see them.

| Channel | Why it fits | How ECHO shows up | Cost |
|---|---|---|---|
| The owner's own network | The first 25 testers need trust, not reach | Personal messages, WhatsApp, friends who journal or meditate | Time |
| Instagram (Reels, carousels) | The plates and the living sky are made for it; wellness and journaling creators in India live here | Short Reels of one practice ("When you feel panicky: Ground"), the sky with a question, plain privacy explainers | Time; later, creators |
| Creators in breathwork, journaling and mindfulness, India first | Borrowed trust with the exact audience | Gift ECHO Plus, ask for an honest look, require a clear paid or gifted disclosure under ASCI rules in India and FTC rules in the US | Plus codes; a fee only if measured |
| Reddit communities | People asking how to journal, breathe or stop the same loop | Value first posts, the maker named, only where the rules allow self promotion (see section 4) | Time |
| X | Builders, privacy minded readers, indie app people | Build in public: the privacy design, the practices, what testers said | Time |
| LinkedIn | India's 22 to 45 professionals; burnout and focus are live topics | The founder's own story and the privacy design | Time |
| Play search | People who search for a journal or a breathing app | `play-listing.md`; ratings once live | None |
| Product Hunt, at production launch | Early adopters and press scouts | One launch day post, the maker answering every comment | Time |
| Offline in India | Yoga and meditation studios, journaling circles, colleges' wellness groups | A small card with the sky and a QR code to the site | Printing |
| Paid (Google App campaigns, Meta), only later | Scale once the funnel is known | Start only when A7 and A8 are measured, with a weekly cap set by the owner | Budget set by the owner |

What not to do: no paid tester services, no review swaps, no bought followers, no claims that a
practice treats anything, no posting the same text across many communities.

## 3. The first 30 days

**Day 1 is the day early access opens**: the closed test is approved, the site is live with the real
link, and `{{play_testing_url}}` works. Production cannot start before day 15 (12 testers for 14 days),
and Google's review of the production application takes its own time, so the public launch falls in
the last ten days of this plan.

| Days | Goal | Actions | Owner of the action | Measure |
|---|---|---|---|---|
| 1 | Open the doors | Site live; announce early access on X, LinkedIn, Instagram (posts below); message 50 people from the owner's network who journal or meditate | Owner, Lead | Opt ins on the closed track |
| 2 to 5 | 25 testers opted in | r/AndroidClosedTesting and similar, within their rules; two Reels; reply to everyone the same day | Owner | 25 opted in by day 5 |
| 6 to 7 | First fixes | Read every email; ship a fix build on the closed track; post what changed | Lead | Crash free sessions in Android vitals |
| 8 to 14 | Keep testers, learn | A short email to testers on day 8 and day 12 asking one question each ("What did you open ECHO for?", "What nearly made you stop?"); a Reel a day about one feeling and its practice; ask testers, in writing, whether a line from them may be quoted | Owner, Lead | 12 or more still opted in on day 14; written replies |
| 15 | Apply for production | Answer Play's questions from the notes (`launch-checklist.md`, step 4) | Owner | Application sent |
| 15 to 20 | Get the launch ready | Final screenshots; Product Hunt draft; list 20 creators in India and 10 outside; Reddit posts written per community rules; site button text ready to switch | Lead, Owner | Assets done |
| Launch day (when Google approves, aimed at day 21 to 28) | Go public | Staged rollout to 20 percent; switch the site to the store link; posts on every channel; Product Hunt; email testers to say thank you and that they can now leave a review | Owner, Lead | Store conversion rate; installs by source |
| Launch +1 to day 30 | Learn the real funnel | Rollout to 100 percent if vitals are calm; answer every review; first trial conversions arrive 7 days after launch; decide whether a small paid test is worth it | Owner, Lead | Install to trial, trial to paid (RevenueCat); replace A6 to A10 with real numbers |

Thirty day goals: 25 testers, production access applied for by day 15, production live by day 30 if
Google allows, and the first measured install to trial and trial to paid rates.

## 4. Posts, ready to use

Rules for every post: name ECHO plainly, say you made it, no claims beyond the brief, no hyphens or
dashes, no exclamation marks, no AI words. Replace `{{play_testing_url}}` with the closed test link
until production, then with the store link.

### Instagram

**Reel, "What are you feeling?"** (15 to 25 seconds: the living sky, then the feelings list, then a
practice screen dimming).

Caption:

```
What are you feeling?

Anxious: three minutes of long breaths out.
Panicky: slow breaths, and your feet find the floor.
Hurting: a hand on your heart, and three kind sentences.

ECHO is a private daily practice for the mind. Breathe for what you feel, speak for seven minutes, and see what keeps returning, in your own words. Your journal stays encrypted on your phone. No account.

Early access on Android, link in bio.

#journaling #breathwork #mentalwellness #selfcare #voicejournal
```

**Carousel, "What stays, and what leaves"** (6 slides, Cormorant on the plates):

1. What stays, and what leaves.
2. Your entries and recordings are encrypted on your phone.
3. Your voice leaves only after you agree, to become words.
4. OpenAI doesn't train on it.
5. No account. No ads. No analytics.
6. ECHO. Early access on Android. Link in bio.

Bio: `A private daily practice for the mind. Early access on Android:` then the link.

### X

A thread (each post is under 280 characters):

```
1/ I made ECHO: a private daily practice for the mind. Breathe for what you feel, speak for seven minutes, and see what keeps returning, in your own words. Android early access is open. {{site_url}}

2/ Breathe starts with one question: what are you feeling? Ten short practices, each a breath and one move for the mind. Eyes closed, led by sound. Help for panic, anxiety and hurt is free.

3/ Speak: seven minutes over a living mountain sky. ECHO keeps your exact words, ums included, and only tidies them if you ask. English, Hindi, or both.

4/ See: after five reflections, ECHO can name what keeps returning. Every quote is checked word for word against what you said. A reflection, never a diagnosis.

5/ Privacy, plainly: your journal is encrypted on your phone. No account. No ads, no analytics. Your voice and entries leave only after you agree, and OpenAI doesn't train on them.

6/ I'm looking for 20 early testers on Android who journal, meditate, or want to. Join, and tell me what's missing: {{play_testing_url}}
```

### LinkedIn

```
For {{founder_story}}, I kept noticing the same thoughts running the same day again. So I built ECHO.

ECHO is a private daily practice for the mind, for Android:

Breathe. It asks what you are feeling and gives you a short practice for it. Anxious, panicky, hurting, angry, overwhelmed, can't sleep. Eyes closed, led by sound. Help for panic, anxiety and hurt is free.

Speak. Seven minutes, out loud, over a living mountain sky. Your exact words are kept. English, Hindi, or both.

See. After five reflections, ECHO can name what keeps returning, quoting your own entries, with the ideas it draws on credited by name.

What I cared about most is where your words go. Your journal is encrypted on your phone. There is no account, no ads and no analytics. Your voice and entries leave the phone only after you agree, and OpenAI does not train on them.

ECHO is in early access on Google Play. If you journal or meditate, or want to, I would be grateful for 14 days of honest feedback: {{play_testing_url}}

{{founder_name}}
```

### Reddit

Before posting anywhere: read the community's rules and pinned posts on the day (they change, and
could not be checked from here). Post only where self promotion is allowed, or in the thread the rules
point to. Say you are the maker in the first line. Stay and answer every comment. One community a day;
never the same text twice.

**r/AndroidClosedTesting** (a community for exactly this), title and body:

```
[Closed test] ECHO, a private voice journal with breathing practices. Looking for 14 days of testers, and happy to test yours
```

```
I'm the developer. ECHO is a private daily practice: breathe for what you are feeling (ten short practices, led by sound), speak or write for seven minutes, and after five entries see what keeps returning in your own words.

What testing involves: install from the closed test, use it when it suits you over 14 days, and tell me what breaks or confuses you.

Privacy: your journal is encrypted on your phone, there's no account, no ads and no analytics. Voice only leaves the phone if you allow it.

Join here: {{play_testing_url}}

If you have a closed test running, reply with the link and I'll join and give real feedback.
```

**r/SideProject** (a build story, where showing your project is the point of the community):

```
I built a voice journal that keeps your words on your phone, with breathing practices for what you're feeling
```

```
I'm the maker. ECHO is an Android app: breathe for what you feel, speak for seven minutes, and after five entries it can name what keeps returning, quoting your own words.

The decisions I'd like feedback on:
1. No account at all. A random install id is the only identity, so the free minutes and the subscription work without sign in.
2. Entries and audio are encrypted on the phone. Voice goes out to be transcribed only after a consent that names the provider.
3. No analytics SDK. I measure from the store and the subscription dashboard only.
4. Breathing practices chosen by feeling, not technique: "anxious", "panicky", "can't sleep".

Early access: {{play_testing_url}}. What would make you trust an app like this, or not?
```

**r/Journaling, r/selfimprovement, r/Meditation and similar:** most of these limit or forbid self
promotion. Unless the rules clearly allow it, post no link. Take part as a member, and where a thread
asks how to journal when it's hard, answer the question itself; mention ECHO only if asked. A post that
fits where discussion posts are welcome:

```
Do you journal out loud? I've found that saying it, rather than writing it, gets past the part of me that edits. Seven minutes, no rereading until later. Has anyone else tried speaking instead of writing, and what made it stick or not?
```

**r/androidapps:** if the rules allow developer posts, title it as they ask (for example with a
developer tag), lead with what ECHO does and that you are the maker, and stay for the comments.

## 5. After day 30

- Replace every assumption in section 1 with measured values, and recompute the installs a month
  needed.
- If install to trial is below A7, work on the paywall moments and the first day before buying any
  traffic.
- If Indian payers dominate, test a stronger push into the English speaking markets outside India
  (creators there, US and UK posting times).
- With testers' written permission, quote them on the site using `{{tester_quote_1}}` and
  `{{tester_name_1}}` (`docs/launch/site-brief.md` shows where). Never edit a quote, never invent one.
