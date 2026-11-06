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
