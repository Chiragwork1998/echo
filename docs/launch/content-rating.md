# Content rating (IARC questionnaire)

For Play Console, Policy, App content, Content ratings. The questionnaire is run by the International
Age Rating Coalition; Play shows each country's rating from the answers. The exact wording and order of
the questions change from time to time and were not available outside Play Console when this was
written, so the answers are grouped by topic. Answer each question as it appears using the facts here.
Answer honestly: a rating that does not match the app can get it removed, and any later change to
content or features that affects an answer needs a new questionnaire.

The rating describes what is in the app. It is separate from who the app is for: ECHO targets adults
18 and over in Target audience and content (`target-audience.md`), whatever rating IARC gives.

## Setup

| Field | Answer |
|---|---|
| Email for IARC | {{support_email}} |
| Category | The general apps category: not Game, not social or communication, not reference, news or educational, and not a content store or streaming service. Its label in Play Console has changed over the years and could not be checked from outside Play Console, so pick the one that matches that description. |

## Answers by topic

| Topic | Answer | Why |
|---|---|---|
| Violence, blood, gore | **No** | None in the app. |
| Fear or horror | **No** | Calm landscapes, no frightening content. |
| Sexuality, nudity, sexual references | **No** | None. |
| Language: profanity, crude humor | **No** | ECHO's own words contain none. A person's journal is private to them and never shown to anyone else (see User content below). |
| Controlled substances: drugs, alcohol, tobacco | **No** | None depicted or referenced. "Ride the wave" is a breathing practice for "a craving or an urge" and names no substance. |
| Gambling, simulated gambling, loot boxes, contests | **No** | None. |
| Discrimination, hate | **No** | None. |
| Suicide and self harm references (if asked) | **Only to point to help.** | If a person's own entries contain such language, ECHO makes no pattern cards and shows free helplines and the advice to call a local emergency number (`src/features/patterns/supportResources.ts`). Nothing depicts or encourages self harm. Describe it this way if the questionnaire asks. |
| User generated content shared with other users | **No** | Entries stay on the person's phone. There is no sharing, community, chat or profile in 1.0. |
| Users can interact or communicate with each other | **No** | No messaging or social features. |
| Shares the user's location with other users | **No** | No location at all. |
| Digital purchases | **Yes** | ECHO Plus, an auto renewing subscription through Google Play Billing. |
| Unrestricted internet access, a web browser or search engine | **No** | ECHO opens only fixed links: its privacy, terms and support pages, Find a Helpline, the person's email app and the phone dialler for helplines. |
| Generative AI content (if asked) | **Yes, text only, private.** | Pattern cards are written by a model from the person's own entries and seen only by them, with in app reporting (`ai-content-policy.md`). Speech to text and Tidy my words also use models. No images or video are generated. The practices' calm voice is synthetic, made once and bundled with the app, the same for everyone; nothing is voiced for a particular person. |
| Is the app primarily news or educational | **No** | |

## What to expect

With every content answer "No" and Digital purchases "Yes", we expect the lowest age rating in each
system, shown with an in app purchases notice. That is a guess, not a promise: IARC decides. Keep the
certificate it emails to {{support_email}}.

## Answer again if

- sharing, a community, chat or any feature where people see each other's content is added;
- ads are added;
- any generated content becomes visible to anyone other than its owner;
- a practice or card starts to reference substances, violence or sexual content.
