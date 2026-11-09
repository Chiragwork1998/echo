# ECHO voice API

Turns a spoken journal entry into text. It holds no state about what people say: audio and text exist
only in memory for the length of the request, and nothing about their content is logged. What it does
keep is counts: how much of an allowance each install has used, and how much the whole server has
spent today (see "Who is asking, and what it may spend").

`POST /api/transcribe`, multipart form with `file` and an optional `style`, and an install token (below).

`style` is `exact` (the default, and what anything unknown means) or `tidy` (D-008). Exact returns the
transcript as OpenAI's transcription heard it: every word, filler, and self-correction, with only the
punctuation the model gives. It makes no chat model call. The one exception is Hindi: the app's serif
has no Devanagari, so an exact transcript that contains it goes through one script-only step that
writes Hindi in Roman script as people text it in Hinglish, and changes nothing else. A guard checks
the result (the same words in the same order, every non-Hindi word untouched, no Devanagari left) and
the untouched transcript is returned if it fails. The choice is one constant, `HINDI_SCRIPT` in
`src/pipeline.ts`. Tidy is the polish: fillers, false starts and self-corrections removed.

Returns `{ text, raw, polished, romanised, style, languages, seconds }`. If a second step fails, `text`
is the unchanged transcript, so a person's words are never lost to it.

`POST /api/refine`, JSON `{ text, style }`, with the same token: the same rules for words that were
heard live and never went through `/api/transcribe`. Exact text with no Devanagari comes back as it
is, with no model call.

`POST /api/live-session`, no body, with the same token: mints a short-lived OpenAI client secret for a
realtime transcription session (`gpt-live-transcribe`, 24 kHz PCM, no voice detection) and returns
`{ url, secret, expiresAt, sampleRate, update }`. The phone connects to `url` straight away with the
subprotocols `realtime` and `openai-insecure-api-key.<secret>`, sends `update` as its first message,
and streams the take to OpenAI. The OpenAI key never leaves this server, and no audio or words pass
through it. The secret is valid for 60 seconds to open a connection and the session carries on after
that. Optional: `ECHO_LIVE_DELAY` (`minimal`, `low`, `medium`, `high`, `xhigh`; default `low`). OpenAI
treats `/v1/realtime` as 30 days of abuse-monitoring retention, which the app's consent says.

Production: https://echo-voice-roan.vercel.app, in the `chiragtalwar-finzarccoms-projects` Vercel team. Run locally with `npm run dev`.

A request is limited twice over: Vercel rejects bodies over 4.5 MB, and OpenAI rejects files over 25 MB.
An Android `.aac` becomes FLAC in `src/audio.ts` before OpenAI sees it, about 46 KB a second, because
OpenAI refused fragmented MP4 unpredictably: 1 second, 5.5 seconds and anything past about 6.3 minutes. FLAC
is lossless, goes through pipes, and was taken at every length tried from 1 to 429 seconds. A clip under two
seconds gets quiet added at its end, because OpenAI refuses sound of under about a second. A piece of five
minutes takes 9 to 12 seconds end to end, so `maxDuration` is not the limit.
The app cuts a long take into pieces and sends them up to three at a time: a live take is a 24 kHz WAV, cut
at its quietest moments into pieces of about 4 MB (83 seconds), and a hidden take on Android is an ADTS
`.aac`, cut between frames into pieces of 20 to 320 seconds that overlap by five seconds, whose words the
app joins. Each piece is an ordinary request to `/api/transcribe`, and counts as one against the limit of 120
per ten minutes per install: an hour of `.aac` is 13, an hour of WAV is 44. A piece that comes back with no
speech is sent a second time by the app before it counts as silence, so a silent piece costs two.

ffmpeg is held to limits in `src/audio.ts`, because it runs for as long as a request lets it: a conversion is
killed after 30 seconds (`503`, code `too_slow`, retryable), no more than four run at once on an instance (a fifth
gets `503`, code `busy`, retryable), and one that writes more than 25 MiB, which OpenAI would refuse anyway, is
stopped (`422`, `unsupported_audio`). A five minute piece converts in about a second. The limits are the
constants in `LIMITS`.

`/api/refine` takes up to 100,000 characters, which is an hour and a half of speech at a fast 200 words a
minute. An hour is about 70,000.

Every failure has one shape: `{ error, code, retryable }`, where `error` names it and `code` repeats it for
builds made before `error` existed. Some add fields, as below.

## Who is asking, and what it may spend

### Install tokens

The shared app token (`ECHO_VOICE_TOKEN`) ships inside the app, so on its own it proves nothing. It is
used for one thing: `POST /api/install` with `{ installId }` and the `x-echo-voice-token` header returns
`{ token, expiresAt }`, an install token for that install (`src/token.ts`). The token is
`ei1.<payload>.<signature>`: the install id, when it was issued and when it ends (30 days), signed with
HMAC-SHA256 under `ECHO_INSTALL_SECRET`. The server keeps no list of tokens. Every other route takes it in
the `x-echo-install-token` header and knows the install from it. A token that was not signed here is
refused `401 install_invalid` and counted as a wrong guess; an expired one is refused the same way, so the
app asks for a new one, and is not counted. `/api/install` is limited per address: 20 in ten minutes on
each instance, and 60 an hour across all of them (an IPv6 address counts as its /64).

To replace the secret without turning every phone away, set the new one as `ECHO_INSTALL_SECRET` and the
old one as `ECHO_INSTALL_SECRET_PREVIOUS` for 30 days. Both must be at least 32 characters.

Proving that the app is the app (Play Integrity, App Attest through `@expo/app-integrity`) is not built.
`src/attest.ts` is where it goes: `/api/install` already passes an optional `attestation` to it, a token
issued after a proof carries `a: 1`, and `ECHO_REQUIRE_ATTESTATION=1` will refuse installs that bring none.
Until then anyone with the shared token can make installs, at the rate above, each with its own free
allowance. The day's ceilings are what bound that.

### Builds with only the shared token

The owner's test build (v3) predates install tokens. A request with the shared token and no install token
is served while `ECHO_LEGACY_TOKEN` is anything but `deny` (the default is to allow), under the day's
ceilings and the per-address rate limits, with no per-install allowance. With `deny` it is refused
`401 install_required`. An install token that fails is never rescued by also sending the shared token.

### Allowances

From `docs/PRODUCT_V1.md`, in `ALLOWANCES` in `src/meter.ts`. Months and days are UTC.

| | Free | ECHO Plus |
|---|---|---|
| Voice into words (`/api/transcribe`) | 60 minutes a month | 20 hours a month |
| Pattern readings | The first, ever (5 tries a month) | 30 a month (60 tries) |
| Live words (`/api/live-session`) | None | 300 sessions a month |
| Tidy | None: the words come back exact | 1,500 a month, then exact |
| Hindi in Roman script on `/api/refine` | 300 a month, then as heard | 3,000 a month |
| Today's echo (`/api/reflect`) | 60 a month | 900 a month |
| Setting out (`/api/format`) | No allowance of its own: the day's ceiling | The same |

Seconds are measured from the file (`src/measure.ts`), never from anything the phone says: WAV by its
samples, counted to the end of the file whatever its header claims; ADTS frame by frame, the way ffmpeg
reads it, junk and a cut-off last frame included; MP4 (`.m4a`) by its time-to-sample table. A file that
cannot be measured, including `.mp3` and `.webm`, is refused `415 unsupported_audio`. The fixtures in
`src/fixtures` are synthetic (macOS `say`), and the tests check the count against ffmpeg's own decode.

Everything a request will cost is reserved before anything is sent to OpenAI. One that does not fit is
refused `402 { error: 'allowance_used', feature, plan, resetsAt }` and spends nothing: `feature` is `voice`,
`patterns`, `live-words` or `reflect`, and `resetsAt` is the next month's first moment, or null when waiting will not
help (live words on the free plan, or the free reading once it is used). A request that was let in and could
not be served (OpenAI refused it, the converter was full) gives back what it took. Silence is not given
back: OpenAI heard it. A reading that makes no cards gives the reading back but keeps the try, and a
reflection that is not written (support, `422 unusable`, a failure) is given back while its calls still count.
`GET /api/allowance` returns `{ plan, voice: { usedSeconds, limitSeconds, resetsAt } }`, which the app reads
before sending a long take in pieces, so a take that will not fit is kept whole rather than half spent.

### Who has Plus

An install has Plus if RevenueCat says its `plus` entitlement is active (`GET /v1/subscribers/{installId}`
with `REVENUECAT_SECRET_KEY`; the app uses the install id as RevenueCat's app user id), or if its id is in
`ECHO_PLUS_INSTALLS` (comma separated, for the owner). Answers are kept for ten minutes, and before a free
install is refused a cached answer is checked again, so someone who has just subscribed is served. With no
RevenueCat key everyone has Plus, as the app treats everyone today, and the day's ceilings do the limiting.
When RevenueCat cannot be reached the answer is free, never unlimited, and it is not asked again from that
instance for 30 seconds.

### The day's ceilings

`ECHO_DAILY_AUDIO_SECONDS` (default 36,000: ten hours) and `ECHO_DAILY_MODEL_CALLS` (default 3,000) cap a
UTC day for the whole server, whoever is asking. Model calls are reserved at the most a request can make
(two for a transcription, a reading, a setting out or a reflection) and settled at what it made. A live session cannot be measured
here, so it counts as five minutes of audio against the day (`LIVE_GUARD_MS`). Past a ceiling every request
is refused `503 { error: 'busy', retryAfter }`, with a `retry-after` header, until the next UTC day. Set them
from what the OpenAI project's spend cap allows: they are the brake, the spend cap is the wall.

### Where the counts live

`src/store.ts`: `QuotaStore`, kept in Upstash Redis through its REST API when `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` (or the Vercel Marketplace's `KV_REST_API_URL` and `KV_REST_API_TOKEN`) are set,
and in memory otherwise. Memory holds only for one instance until it restarts, so production without
Upstash has no real allowance or ceiling: the log says `{"store":"memory","durable":false}` on Vercel when
that happens. Each spend is one transaction that adds every amount, and one that would go over a limit takes
it back at once, so requests racing for the last of an allowance can both be refused but can never both be
let past it. When the store cannot be reached, requests are refused as `503 busy` rather than counted as
nothing. Keys hold hashed install ids, periods and feature names, never content.

### Reporting a card

`POST /api/report`, JSON `{ reason, lens, model, appVersion }` and an install token (or the shared token
while legacy is allowed), for Google Play's rule that a person can report what a model wrote. `reason` is
`harmful`, `wrong`, `upsetting` or `other`; `lens` is a lens id from `src/lenses.ts` (each card now carries
it as `lens.id`) or null; `model` and `appVersion` are labels of at most 64 characters from
`[A-Za-z0-9._+-]`, with no spaces, so no words can travel in them (`1.0.0+42`, not `1.0.0 (42)`). Any
other field, such as `text`, refuses the whole report with 400. It is counted by UTC day, reason and lens,
logged in one line of those labels, and limited to 10 in ten minutes per instance and 30 a day per install.

### Logs

One line per request: the route, the status, the size and the time, and for an install its tag (the first
12 hex characters of a SHA-256 of its id, `src/token.ts`), its plan, and which allowance refused it. Never
words, audio, quotes, tokens or install ids. `/api/format` and `/api/reflect` write the same line whatever
the answer was: whether a text was set out, or whether support was the answer, is never in it.

### Environment

Required: `OPENAI_API_KEY`, `ECHO_VOICE_TOKEN`, `ECHO_INSTALL_SECRET`. For counts that hold: Upstash, as
above. Optional: `REVENUECAT_SECRET_KEY`, `ECHO_PLUS_INSTALLS`, `ECHO_LEGACY_TOKEN`,
`ECHO_DAILY_AUDIO_SECONDS`, `ECHO_DAILY_MODEL_CALLS`, `ECHO_INSTALL_SECRET_PREVIOUS`,
`ECHO_REQUIRE_ATTESTATION`, `ECHO_TRANSCRIBE_MODEL`, `ECHO_POLISH_MODEL`, `ECHO_PATTERNS_MODEL`,
`ECHO_REFLECT_MODEL`, `ECHO_LIVE_DELAY`. Locally, `npm run dev` signs install tokens with a secret made for the run unless
`ECHO_INSTALL_SECRET_FILE` names one. What is still needed before public launch is in "Before public
launch" in `docs/SPEC_CONFLICTS.md`.

## Pattern Cards

`POST /api/patterns`, JSON `{ entries: [{ date: 'YYYY-MM-DD', text }] }`, with an install token. At least
5 entries, and the newest 30 are read, up to 6,000 characters each. Holds nothing: entries exist in memory
for the length of the request, and the log line holds sizes and timing only.

Returns `{ status: 'cards', cards, entriesRead }`, `{ status: 'none', entriesRead }`, or
`{ status: 'support' }`. `support` means language about suicide or self-harm was found: no cards are
made and the app shows its care message. That screen runs on the server before anything is sent to
OpenAI, and before any allowance is looked at, so care is never refused. The model is asked to flag it too.

Every quote on a card is checked against the entry it names, and a card needs verified quotes from
two different entries. Cards that diagnose, label or promise a cure are dropped. The ideas the cards
borrow from are in `src/lenses.ts`, paraphrased, with the author credited by name.

Uses the OpenAI Responses API with `store: false` and strict JSON output. Optional:
`ECHO_PATTERNS_MODEL` (default `gpt-6.1-sol`).

## Setting out an entry

`POST /api/format`, JSON `{ text }` of 1 to 100,000 characters, with an install token (or the shared token
while legacy is allowed). Sets out an entry's words, written or spoken: paragraphs, punctuation and capitals,
and nothing else (D-017). Returns `{ text, formatted }`. When `formatted` is false, `text` is the request's
text exactly as it came, not even trimmed: it had fewer than three words, or the model's version changed a
word twice. When it is true, `text` is the set-out version, and differs from what was sent.

The model is `ECHO_POLISH_MODEL` (default `gpt-6.1-terra`), at temperature 0 with no reasoning, told it may
change punctuation, capitals and whitespace (a paragraph is a blank line) and nothing else. Its version is
kept only if it holds the same words in the same order as the text sent, and brings in no mark but ordinary
punctuation that the text did not already hold: no markdown, bullets or emoji. The words are those of
`words` in `src/format.ts`: NFC; curly quotes and apostrophes made straight; lower case; every character that
is not a letter (with its marks), a digit, or an apostrophe or hyphen inside a word becomes a space; then
split on whitespace. So "can not" and "cannot" differ, as do "gonna" and "going to", "3" and "three", and
"well known" and "well-known", while "Don’t" and "don't" are the same. A version that fails is asked for
once more, and a second failure returns the text unchanged. `words` and `sameWords` are exported so that
the app mirrors them exactly: its journal refuses to store a version whose words differ from the entry's.

Setting out has no allowance of its own: two model calls are reserved against the day's ceiling and settled
at what was made. Failures: `400 bad_request` (no text, a blank one, or more than 100,000 characters), `401`
as elsewhere, `503 busy` past the day's ceiling, and `502 upstream` when OpenAI fails, `retryable` unless
OpenAI refused the request itself. Both tries share 100 of the function's 120 seconds, and a second starts
only if there is as long left as the first took, so a very long entry may get one try. Holds nothing, and
uses the Responses API with `store: false`.

## Today's echo

`POST /api/reflect`, JSON `{ text }` of 1 to 20,000 characters (the app sends an entry's first 20,000), with
an install token. Writes a short reflection of one entry back to the person who wrote it (D-017). Returns
`{ kind: 'reflection', text }`, one or two sentences of at most 220 characters, or `{ kind: 'support' }`
when the entry suggests the person may be in danger: no reflection is written, and the app offers support
instead. Holds nothing.

The screen in `src/safety.ts` runs first, before any allowance is looked at and before anything is sent to
OpenAI, so care is never refused and costs nothing. Then the model, `ECHO_REFLECT_MODEL` (default the
patterns model, `gpt-6.1-sol`), answers in strict JSON `{ kind, text }` and is asked to flag danger too. Its
instructions are `INSTRUCTIONS` in `src/reflect.ts`, which give the Completion golden as the register and
tell the model never to reuse it. What it writes is checked there before anyone sees it: the length and the
two sentences; no question mark; none of the words a pattern card may not use (`src/patterns.ts`), even as
an echo; no "I", "AI" or "as an"; no link, email or phone number; no Devanagari (the app's serif has none),
markdown or emoji; no advice, whether a sentence that opens with an instruction or a phrase such as "it
might help"; and no platitude, prediction or therapy-speak unless it echoes the entry's own words. A
reflection that itself speaks of self-harm becomes support. One that fails is asked for once more, and then
the answer is `422 unusable`, which is not worth trying again.

A reflection is taken from the month's allowance, reserved with two model calls before OpenAI is asked, and
counts once it is written. Failures: `400 bad_request`, `401`, `402 allowance_used` with `feature:
'reflect'`, `422 unusable`, `503 busy`, and `502 upstream` when OpenAI fails, `retryable` unless OpenAI
refused the request itself. Uses the Responses API with `store: false`.
