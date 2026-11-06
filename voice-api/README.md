# ECHO voice API

Turns a spoken journal entry into text. It holds no state: audio and text exist only in memory for
the length of the request, and nothing about their content is logged.

`POST /api/transcribe`, multipart form with `file`, and the `x-echo-voice-token` header.

Returns `{ text, raw, polished, languages, seconds }`. If cleanup fails, `text` is the unpolished
transcript and `polished` is false, so a person's words are never lost to a cleanup failure.

Production: https://echo-voice-roan.vercel.app, in the `chiragtalwar-finzarccoms-projects` Vercel team. Run locally with `npm run dev`.

Environment: `OPENAI_API_KEY`, `ECHO_VOICE_TOKEN`. Optional: `ECHO_TRANSCRIBE_MODEL`,
`ECHO_POLISH_MODEL`.

Vercel rejects request bodies over 4.5 MB. At the app's 40 kbps that is about 14 minutes.

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
