# ECHO voice API

Turns a spoken journal entry into text. It holds no state: audio and text exist only in memory for
the length of the request, and nothing about their content is logged.

`POST /api/transcribe`, multipart form with `file` and an optional `style`, and the `x-echo-voice-token` header.

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

`POST /api/refine`, JSON `{ text, style }`, with the same header: the same rules for words that were
heard live and never went through `/api/transcribe`. Exact text with no Devanagari comes back as it
is, with no model call.

`POST /api/live-session`, no body, with the same header: mints a short-lived OpenAI client secret for a
realtime transcription session (`gpt-live-transcribe`, 24 kHz PCM, no voice detection) and returns
`{ url, secret, expiresAt, sampleRate, update }`. The phone connects to `url` straight away with the
subprotocols `realtime` and `openai-insecure-api-key.<secret>`, sends `update` as its first message,
and streams the take to OpenAI. The OpenAI key never leaves this server, and no audio or words pass
through it. The secret is valid for 60 seconds to open a connection and the session carries on after
that. Optional: `ECHO_LIVE_DELAY` (`minimal`, `low`, `medium`, `high`, `xhigh`; default `low`). OpenAI
treats `/v1/realtime` as 30 days of abuse-monitoring retention, which the app's consent says.

Production: https://echo-voice-roan.vercel.app, in the `chiragtalwar-finzarccoms-projects` Vercel team. Run locally with `npm run dev`.

Environment: `OPENAI_API_KEY`, `ECHO_VOICE_TOKEN`. Optional: `ECHO_TRANSCRIBE_MODEL`,
`ECHO_POLISH_MODEL`.

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
per ten minutes per address: an hour of `.aac` is 13, an hour of WAV is 44.

`ECHO_VOICE_TOKEN` ships inside the app, so it stops casual abuse only. Before public launch this
needs App Attest and Play Integrity, or per-account auth, plus an OpenAI spend limit.

## Pattern Cards

`POST /api/patterns`, JSON `{ entries: [{ date: 'YYYY-MM-DD', text }] }`, with the same
`x-echo-voice-token` header. At least 5 entries, and the newest 30 are read, up to 6,000 characters
each. Holds nothing: entries exist in memory for the length of the request, and the log line holds
sizes and timing only.

Returns `{ status: 'cards', cards, entriesRead }`, `{ status: 'none', entriesRead }`, or
`{ status: 'support' }`. `support` means language about suicide or self-harm was found: no cards are
made and the app shows its care message. That screen runs on the server before anything is sent to
OpenAI, and the model is asked to flag it too.

Every quote on a card is checked against the entry it names, and a card needs verified quotes from
two different entries. Cards that diagnose, label or promise a cure are dropped. The ideas the cards
borrow from are in `src/lenses.ts`, paraphrased, with the author credited by name.

Uses the OpenAI Responses API with `store: false` and strict JSON output. Optional:
`ECHO_PATTERNS_MODEL` (default `gpt-6.1-sol`).
