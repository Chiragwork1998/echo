# Data contract

How screens use ECHO's private data core. Everything here works offline.

```ts
import { useDraft, useVoiceRecorder, useReflection, useHomeSummary } from '@/features/journal';
import { useOnboarding, completeOnboarding } from '@/state/onboarding';
```

## What the root gate guarantees

`app/_layout.tsx` mounts no screen until encryption, onboarding, and the biometric lock are resolved. By the time your screen renders:

- `useOnboarding` holds the user's saved choices. In the rare case the sealed record will not open, it holds defaults with the lock on, and nothing is saved until a later launch can read that record. Screens need no handling for this, and `completeOnboarding()` still resolves true.
- The route is correct: completed users are on `/home`, others are on the step they left.
- Unsaved work survives a re-lock. The lock covers the navigator and does not unmount it.

**So screens never handle key loss, biometrics, or hydration.** The gate owns those screens.

The current onboarding step is tracked from the route. Do not set it yourself. `update()` keeps its existing shape and now also saves, encrypted.

## Rules for every call

- Nothing throws. Async calls return `{ ok: true, value }` or `{ ok: false, error }`.
- `error` is `{ code, retryable }` and never holds text. Show your own message from `code`.
- Never log entry content, moods, or prompt answers, and do not put them in analytics or a notification.
- Never call `console`.
- On the First Echo `TextInput`, set `autoComplete="off"`, `importantForAutofill="no"`, and `textContentType="none"`. Autofill and suggestion stores are outside encryption.

| `error.code`   | Meaning                                                 | What to do                       |
| -------------- | ------------------------------------------------------- | -------------------------------- |
| `write_failed` | Nothing was saved. The text is still in memory.         | Inline error, keep text, retry   |
| `read_failed`  | Could not read. Nothing changed.                        | Inline error, offer retry        |
| `not_ready`    | Storage is not open.                                    | Inline error, offer retry        |
| `audio_failed` | Audio could not be processed.                           | Offer Write instead              |
| `unreadable`   | This object failed decryption. It is corrupt or altered. | Say it can't be opened, no retry |
| `empty`        | Nothing to commit.                                      | Keep Reflect disabled            |
| `not_draft`    | It is already committed.                                | Treat as done                    |
| `not_found`    | It was deleted.                                         | Leave the screen                 |
| `unavailable`  | Not available here, such as recording on web.           | Offer Write                      |

## First Echo

```ts
const draft = useDraft({
  seed: {
    mode: 'text',
    promptId: 'first-echo',
    promptText: copy.firstEcho.title,
    moodBefore: useOnboarding.getState().mood,
  },
});
const voice = useVoiceRecorder(draft);
```

`useDraft()` resumes the newest draft that can be read, or starts a new one. A draft that fails decryption is skipped and never deleted. `seed` applies only to a new draft. Pass `{ draftId }` to open a specific draft. If that one fails decryption, `status` is `error`.

**`DraftController`**

| Field                       | Type                                      | Use                                                                 |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| `status`                    | `'loading' \| 'ready' \| 'error'`         | Keep the input disabled until `ready`. `update` is ignored before it |
| `content`                   | `EntryContent`                            | `content.body` is the input's value                                  |
| `audio`                     | `EntryAudio \| null`                      | The saved recording                                                  |
| `saveState`                 | `'idle' \| 'saving' \| 'saved' \| 'error'` | `saved`: “Saved on this device”. `error`: see below                  |
| `commitState`               | `'idle' \| 'committing' \| 'error'`       | Put `committing` on the CTA's `loading`                              |
| `error`                     | `JournalError \| null`                    | The latest failure                                                   |
| `resumed`                   | `boolean`                                 | This draft already existed                                           |
| `canReflect`                | `boolean`                                 | Enables Reflect: 10 non-space characters or 3 seconds of audio       |
| `hasContent`                | `boolean`                                 | True means Back asks Keep draft / Discard / Stay                     |
| `update(patch)`             | `void`                                    | On every change. Autosaves, encrypted                                |
| `flush()`                   | `Promise<JournalResult<void>>`            | Keep draft: await, then leave. `ok` means every change so far is on disk. On failure, stay and show the error |
| `commit(patch?)`            | `Promise<JournalResult<Entry>>`           | Reflect                                                              |
| `discard()`                 | `Promise<JournalResult<void>>`            | Discard. Removes text and audio                                      |
| `reload()`                  | `Promise<void>`                           | Retry after `status: 'error'`                                        |

**Reflect.** Navigate only after it is durable:

```ts
const result = await draft.commit({ durationSeconds: elapsed });
if (result.ok) router.navigate(nextPath('first-echo') as never);
```

On failure do not navigate. The draft is intact, in memory and on disk, and `commit` can simply be called again.

**States**

| State                     | What to show                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `status: 'loading'`       | Input disabled. Usually one frame                                                            |
| `status: 'error'`         | Inline message, `reload()`. Do not offer editing                                             |
| `saveState: 'error'`      | Non-blocking inline note. The text is safe in memory, and saving retries on the next change  |
| `commitState: 'error'`    | Inline message, Reflect stays enabled for retry                                              |
| `resumed` with `audio.recovered` | Rescued after a crash. The recording may be cut short                                 |
| `status: 'ready'` with `error.code: 'audio_failed'` | A recording from an earlier session is gone: the OS cleared it before it could be encrypted. Say so inline. Writing carries on, and the next save clears it. It appears on the first draft opened after the launch that found it, which may not be the draft it came from |

Saving happens by itself: every 600 ms while typing, on leaving the screen, and when the app backgrounds.

**`VoiceRecorder`**

| Field                       | Type                                                      | Use                                         |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| `available`                 | `boolean`                                                 | false on web. Offer Write                   |
| `state`                     | `'idle' \| 'starting' \| 'recording' \| 'saving' \| 'error'` |                                             |
| `elapsedSeconds`            | `number`                                                  | Updates four times a second                 |
| `error`                     | `VoiceErrorCode \| null`                                  |                                             |
| `start()`                   | `Promise<VoiceErrorCode \| null>`                         | null means recording has started            |
| `stop()`                    | `Promise<JournalResult<EntryAudio>>`                      | Encrypts and deletes the plaintext          |
| `cancel()`                  | `Promise<void>`                                           | Throws the recording away                   |

| `VoiceErrorCode`      | What to do                                                                      |
| --------------------- | ------------------------------------------------------------------------------- |
| `permission_required` | Show the in-app explanation, call `requestMicrophonePermission()` from `@/services/permissions`, then `start()` again |
| `unavailable`         | Offer Write                                                                     |
| `start_failed`        | Inline message, offer Write                                                     |
| `save_failed`         | Say the recording is kept for now. The next launch encrypts it, unless the OS clears its cache first, which the next draft reports. Offer Write |

- `start()` never shows the OS prompt. Only `requestMicrophonePermission()` does.
- Call `await voice.stop()` before `draft.commit()`, and keep Reflect disabled while `state` is `recording` or `saving`.
- Text and audio live on the same draft, so switching Write and Speak loses nothing.
- Recording again replaces the previous recording. Warn first if `draft.audio` is set.
- Backgrounding stops and encrypts on its own. Leaving the screen rescues the recording.

## Voice to words

D-005, D-006 and D-008: ECHO is voice first, and a spoken take becomes text, in the person's exact words unless they turned on Tidy my words. `src/services/transcription.ts` uploads a sealed recording to the voice server, and never throws.

```ts
const result = await transcribeEntryAudio(draftId, { signal });
// { ok: true, value: { text, polished, languages, seconds } }
// { ok: false, error: { code, retryable } }
```

The request carries `style`: `exact` (the default: every filler and self-correction stays, and the only second step is writing Hindi in Roman script) or `tidy` (`usePreferences().tidyWords`). A recording longer than the server takes is sent in pieces, up to three at a time, and joined in the order it was spoken. A WAV, which is what a live take is, is cut at its quietest moments into pieces of about 4 MB. An Android `.aac`, which is a hidden take (ADTS), is cut between frames into pieces of at most five minutes of sound, because the voice server refuses an `.aac` of more than about 380 seconds (378 were taken and 381 were not, however small the file, though the same audio sent as an `.m4a` was taken at ten minutes), and one of under about five and a half; an end shorter than 20 seconds is sent with the piece before it. Quiet moments cannot be found in AAC without decoding it, so its pieces overlap by about three seconds, and the words of the overlap are matched and kept once (`src/services/joinWords.ts`). With no confident match of at least three words they are joined with a space and nothing is dropped. Every piece is asked for in the style chosen before the first one. A piece that comes back with no speech is asked for a second time, because an empty answer is also how a missed piece looks; only a second empty answer means silence, and a take of silence throughout is `no_speech`. A WAV is read to the end of the file, not to the size its header declares, because the stream writes its samples and then its header and a crash between the two leaves a header that lags the file. If any piece fails, the take fails with that piece's code, none of its words are delivered, and Try again sends the whole take afresh; the sealed recording is untouched either way. An iOS `.m4a` cannot be cut: see `docs/SPEC_CONFLICTS.md`.

| `error.code`        | Meaning                                                      | What the person sees                         |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| `consent_required`  | Not asked yet, or Keep my voice only. **Nothing was sent**   | The consent sheet, or nothing                |
| `not_configured`    | No address or token, a non-HTTPS remote address, or 503      | Unavailable, recording is safe, Write instead |
| `unauthorized`      | 401: the token was not accepted                              | Unavailable, recording is safe, Write instead |
| `offline`           | The phone itself reports no connection. Said only when true  | Recording is safe, Try again                 |
| `unexpected`        | The request could not be built or sent, and the phone does not say it is offline | Something went wrong, recording is safe, Try again |
| `timeout`           | No reply within 100 s                                        | Recording is safe, Try again                 |
| `too_long`          | 413, an `.m4a` past about 4.4 MB, or an `.aac` whose frames cannot be followed. A WAV and an ADTS `.aac` are split instead | Recording is safe, Write instead |
| `no_speech`         | 422: nothing was heard                                       | Recording is safe, Try again                 |
| `unsupported`       | 415, or 422 `unsupported_audio` | Recording is safe, Try again                 |
| `rate_limited`, `server`, `invalid_response` | 429, 5xx, or a reply that is not the contract | Recording is safe, Try again       |
| `audio_unavailable` | The sealed recording would not open                          | Recording is safe, Try again                 |

- The service reads the person's choice itself (`voiceStatus` in `@/state/preferences`), so no caller can upload without consent. A choice made under an older `VOICE_POLICY_VERSION` counts as unset.
- It opens the recording with `openEntryAudio` and calls `release()` on every path. The decrypted copy is written a frame at a time, so a one-hour take needs a few megabytes of memory to open, not the whole take.
- One rule decides where anything may be sent to ECHO's server (`voiceOrigin` in `src/services/voiceApi.ts`): the address must be https, an origin and nothing more (no user, path or query). Plain http is allowed only for `127.0.0.1` and `localhost`, and only in a development build. Transcription, refining, live words and Pattern Cards all use it.
- Nothing is logged: not the audio, not the words, not the address. The voice server's own log line is the route, the status, the byte count and the time, and nothing about the content: not the words, not the language, not whether the words were tidied or written in Roman script (`logRoute` in `voice-api/src/guard.ts`).
- `content.transcribedAudioId` names the recording whose words are already in `body`. A draft whose `audio.id` is something else has a recording with no words yet, and a reopened session offers to turn it into words.
- The words join `body` after a paragraph break and are saved at once. A take is let go of, and its kept copy released, only once its words are saved: if the save fails, the take stays in the queue with its words in hand, the kept copy is not released, and Try again saves them again without asking for them a second time and without adding them twice. A session that closes mid-request still delivers them into the stored draft, read and written back with no other write to that draft between (`updateDraft` in `src/features/journal/api.ts`; every save to one draft goes through one queue). If a reopened session's older copy of the page is then saved over the words, the draft does not claim to have them and the recording is there for Try again. If the words fail after the session has closed, the decrypted copies kept for earlier takes are released; a sealed recording is never touched.
- The draft keeps one recording. A new recording replaces the sealed one, so a take that is still waiting for its words keeps a decrypted copy until it is done. If that copy could not be made, the take cannot be retried, and the session says so.

## Live words

D-007 and D-008. Words are hidden by default: a spoken session shows the photograph and one breathing light, the take is recorded to a file as before, and it is sent after it ends. Nothing opens a socket.

`usePreferences().wordsShown` turns on live words, and the first time it is turned on the person agrees to a separate note (`voiceConsent.live`, in the same record and under the same `VOICE_POLICY_VERSION`, see `liveAllowed`): the voice streams to OpenAI as it is spoken, which OpenAI may keep for up to 30 days. Only the daily echo streams.

Session fields for a page to draw: `wordsShown`, `liveText` (words heard live and not yet in the draft), `bodyVisible` (false while speaking with words hidden), `wordsLabel` and `toggleWords` for the quiet row, `quietLine` (`…listening` only when words are shown, or the calm note that live words stopped), `consentOpen` with `consentKind` (`voice` or `live`, for `VoiceConsentSheet`), and `touchSky()` for a touch on the scenery.

How a live take works:

- `POST /api/live-session` on the voice server returns a secret that lives for a minute and opens one transcription session. The OpenAI key never reaches the phone, and no audio passes through ECHO's server.
- The microphone is expo-audio's `useAudioStream` (24 kHz, mono, int16, resampled if the device gives another rate). It also writes the take as a WAV to `cache/Audio/<ledger id>.wav` with `startFileRecordingAsync`, so the recording is sealed and swept like any other. Only one of the file recorder and the stream owns the microphone for a take.
- `src/services/liveTake.ts` sends the audio, finds pauses with simple voice detection and commits each turn, and orders turns by commit with completions matched by `item_id`.
- The phone streams only to OpenAI (`liveAddress` in `src/services/liveTranscription.ts`): `wss`, host `api.openai.com` exactly, a path that starts `/v1/realtime`, no user or port. The server names the address, and the phone does not take its word for it. This Mac's loopback over `ws` is allowed in a development build only. `openLiveSocket` checks `liveAllowed` itself before it asks the server for anything, so no caller can stream without the separate agreement.
- A take is whole only when every commit it sent has come back as a turn and every turn has its final words. Commits sent are counted against the ones acknowledged, so a short last phrase with no event yet is waited for. If that is not so within 10 seconds of Stop, the take fails and the sealed recording is sent, rather than partial words being taken for the whole. A take that ends in silence with nothing said is not a failure: it has no words, and the recording is what is used.
- Any `error` event from the server fails the take at once, closes the connection and does not reconnect; the recording is sent instead. So does a connection that has been fed four minutes of audio (about 15 MB) without the server saying anything, which is how a dead network looks, since the platform socket queues what it is given and says nothing. Only the words are given up on: the recording is made by something else and carries on.
- When the take stops, the words go through the same rules as any other take (`refineWords`: exact words are kept, Devanagari is written in Roman script, tidy polishes), and join `body`.
- If the connection cannot open, drops at any moment, the server reports an error, a turn fails, the last words do not arrive, or the connection goes quiet, recording carries on, the person is told calmly, and the whole sealed recording is sent after it ends as usual. Any doubt about the words ends this way. A hidden take never uses any of this.

## Completion

```ts
const latest = useLatestEntry();                  // AsyncData<EntrySummary | null>
const reflection = useReflection(latest.data?.id ?? null);
```

The entry is already durable when this screen appears. If the app dies here, it reopens here, and `useLatestEntry` still has the entry.

| `reflection.outcome.status` | What to show                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `pending`                   | “Listening for what returned…”                                                          |
| `offline`                   | The private saved-entry card. **This is what ships today**, since no provider is chosen |
| `complete`                  | `outcome.text`                                                                          |
| `error`                     | “Your words are saved. The reflection can wait.” Try again calls `reflection.retry()`   |

**Enter your space.** Do not navigate. The root layout moves to `/home` once this is durable:

```ts
const saved = await completeOnboarding();
if (!saved) showInlineError();
```

## Home

```ts
const { status, rhythm, recent, continueDraft, error, refresh } = useHomeSummary();
```

`status` is `'loading' | 'ready' | 'error'`. `rhythm` always holds seven days, so it can render at once. Everything refreshes itself after changes and on return to the foreground.

| Golden element                   | Source                                                         |
| -------------------------------- | -------------------------------------------------------------- |
| Night: MON to SUN cairns         | `rhythm.week[i]`: `{ day, weekday, completed, isToday }`       |
| Night: “4 reflections”           | `rhythm.weekReflections`                                       |
| Day: “4 day rhythm”              | `rhythm.currentStreak`                                         |
| From your path                   | `recent`. null shows “Your first echo will appear here.”       |
| “Yesterday”                      | `dayDistance(recent.localDay, rhythm.today)`, then your label  |
| “6 min”                          | `recent.durationSeconds`                                       |
| Continue an echo                 | `continueDraft`. null hides the card                           |
| “2 min left”                     | `continueDraft.minutesLeft`                                    |

- `title` falls back to the body's first line. A voice-only entry has an empty title and preview, so choose your own display.
- `recent` and `continueDraft` are the newest rows that open, so neither is ever unreadable. An unreadable row is not deleted, and stays in `useEntries()`.
- In `useEntries()`, if `readable` is false, the row failed decryption. Show that it can't be opened, and never hide it.
- `recent` or `continueDraft` can be null while `status` is `error`. Keep the scenic layout and show an inline retry using `refresh()`.

## Other screens

| Screen   | Call                                                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rhythm   | After Set my rhythm: `requestNotificationPermission()` from `@/services/permissions`, then `scheduleReminder(time)` from `@/services/reminders`. It returns `{ ok: true }`, or `{ ok: false, code }` where code is `permission_required`, `invalid_time`, or `failed`. On `permission_required` keep the time and show Enable in Settings: `openAppSettings()` |
| Privacy  | `verifyLockAvailable()` from `@/services/biometric`. On `{ ok: true }` call `update({ privacy })`. On `no_credentials` the lock cannot be enabled. It proves the user can pass before turning on                  |
| Arrival  | `update({ mood })`. It becomes `moodBefore` through First Echo's seed                                                                                                                                             |

## Also available

For Echoes and You, once their designs arrive.

| Call                                         | Returns                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `useEntries()`                               | `AsyncData<EntrySummary[]>`, newest first                                   |
| `useEntry(id)`                               | `AsyncData<Entry \| null>`                                                  |
| `useEntrySearch(query)`                      | `{ status: 'idle' \| 'searching' \| 'ready' \| 'error', results, unreadable, error }` |
| `deleteEntry(id)`                            | `JournalResult<void>`. Audio goes too, and a tombstone stays                |
| `openEntryAudio(id)`                         | `JournalResult<{ uri, release() }>`. Call `release()` when playback ends    |
| `exportJournal()` in `@/services/exportJournal` | `{ ok: true, exported, unreadable }` or `{ ok: false, code }`            |
| `deleteAllLocal()` in `@/services/deleteAllLocal` | `{ ok: true }` or `{ ok: false, code: 'delete_incomplete' }`. Confirm first. The app returns to Landing by itself |
| `<RestoreRow />` from `@/features/backup/RestoreRow` | Restore from a backup, whole: one row for Your data, and its own sheet. See below |
| `usePreferences` / `useTheme().setPreference` | Theme, persisted. Night by default                                         |

`AsyncData<T>` is `{ status, data, error, refresh }`. Its `status` is `loading` only before the first result.

## Restore from a backup

ECHO keeps the journal only on the phone, and Android's backup is off, so the export is the way a journal moves to a new phone. `RestoreRow` reads it back. It is one `Row`, so it sits in You's Your data `Section` beside Export, and everything after the tap happens in its own sheet: the system document picker (`expo-document-picker`), a preview, the restore with its progress, and the result. The sheet is hidden while the journal is locked and comes back after unlock with nothing lost, and nothing starts while it is locked.

`openBackup(uri)` in `@/services/importJournal` takes the picker's copy, reads it on the phone, and returns `{ ok: true, backup: { summary, restore(onProgress), release() } }` or `{ ok: false, code }`. Nothing is written until `restore()`.

- **What it reads.** `echo-export.zip` as `exportJournal` writes it: stored entries only (`src/services/zipReader.ts`), `entries.json` with `formatVersion` 2 (or 1, from an earlier build), `audio/<id><extension>`. `entries.json` is checked against its zip checksum and then strictly with zod: every field present with its type, no unknown field, a known mood, real dates and days, a kept entry with its day and a draft with none, unique ids, and each recording named for its own entry.
- **What it refuses**, with nothing written and a plain message for each code: `not_backup`, `repacked` (another app compressed it or put it in a folder), `unsafe` (a name that is absolute, has a drive, a backslash, a control character, or a `.`, `..` or empty segment), `too_large`, `too_many`, `newer` (a higher `formatVersion`: "This backup is from a newer version of ECHO. Update ECHO, then try again."), `damaged`, `empty`, `unreadable`, `not_ready`.
- **Limits** (`LIMITS`): the file up to 4 GiB, the zip32 limit export also stops at; 20,000 entries; two files an entry plus two; `entries.json` up to 64 MiB and the zip's table of contents up to 8 MiB, the only two parts read whole. Recordings are copied out 1 MiB at a time.
- **How it writes.** One entry at a time, inside the runtime's write queue. An id already on the phone is skipped and never touched, and a tombstone counts: an entry deleted here stays deleted. Each entry is sealed and proved as every entry is, its recording is copied to the temporary folder, checked against the zip's checksum, sealed in frames with `sealAudioFile` exactly as a recording is, and the plaintext copy deleted. The entry, its audio row and its reflection go in one transaction, so a stop at any point leaves each entry whole or absent; a sealed file whose row never landed is removed, or swept at the next launch. The same file restored again adds only what is missing.
- **What it keeps.** Id, status (drafts come back as drafts), created and committed times, local day, title, body, mode, mood, prompt id and text, length, recording and reflection. `updatedAt` becomes the entry's own time. The export does not carry which recording a draft's words came from, so a restored draft with a recording may offer to turn it into words again.
- **A recording's own length.** Format 2 carries it as `audioDurationSeconds`, beside the session's `durationSeconds`, and it comes back exactly. Where the backup cannot say (format 1, or `null` for a take rescued after a crash), the restored copy is measured without decoding it, as transcription measures a take: a `.wav` from its format and size, an `.aac` (ADTS) frame by frame. Only a file that cannot be measured, such as an iOS `.m4a` in a format 1 backup, takes the session's length, as every restore did before.
- **A recording the backup does not hold whole** (missing, empty, or failing its checksum) restores its entry without it, and the result counts it.
- **The result.** `{ ok: true, entries, drafts, existing, deleted, withoutAudio }`, or `{ ok: false, code: 'stopped' | 'not_ready', done, total, ...counts }`. Lists, Patterns and Home refresh once, at the end.

**The plaintext.** The person's own file is only ever read. ECHO works on a copy of its own (`pickBackupFile` in `src/features/backup`): on iOS the one the system makes in ECHO's `tmp` when the picker asks for a copy, and on Android one `expo-file-system` makes in `cache/echo-temp` on a background thread, because `expo-document-picker` copies on the main thread and a large backup still arriving from Google Drive would freeze the app. `openBackup` moves that copy at once into `cache/echo-temp/restore-<uuid>/`, and `release()` deletes it: at Not now, when a restore ends however it ends, when a file is refused, and when the row leaves the screen with only a preview open. Each recording's copy in the same folder lives only while it is sealed. Every launch clears `cache/echo-temp`, so a copy a killed app left there goes at the next launch. On iOS, a copy the app was killed before moving waits in `tmp` for the system to clear it.

`importJournal.web.ts` answers `unavailable`: web has no storage.

## Tests and the visual harness

Jest and web have no native storage. Journal calls return `not_ready` under Jest unless you install the in-memory journal, which behaves like the real one:

```ts
import { createMemoryJournal, setJournal } from '@/features/journal';

beforeEach(() => setJournal(createMemoryJournal({ entries: [] })));
afterEach(() => setJournal(null));
```

In `npm run visual` the gate is bypassed and everything is held in memory. No web build ever persists journal content.

| Fixture      | The journal holds                                                                 |
| ------------ | --------------------------------------------------------------------------------- |
| `home`       | The Home goldens: Thursday, Monday to Thursday done, recent entry, draft          |
| `completion` | A saved entry with the golden reflection, so `useReflection` returns `complete`   |
| any other    | Empty                                                                             |

## What is encrypted

Sealed with AES-256-GCM, each object bound to its kind and id: entry title, body, mood, prompt, mode, and duration; audio and its details; reflections; every onboarding choice, including the reminder time and lock setting.

Readable without the key: ids, timestamps, status, the local day of each entry, and the theme. These say when someone wrote, never what.

### Sealed audio

A live take is a 24 kHz mono WAV, about 2.9 MB a minute (double if the device gives 48 kHz), so a one-hour take is about 175 MB. Audio is therefore sealed in **frames of 4 MiB of plaintext, each its own AES-256-GCM object**, and sealing, checking, and opening hold a few frames at a time however long the take is. Measured in Jest with the collector forced at every AES and file call, the buffers alive at once peaked at 28 MiB for a 175 MB take and for a 700 MB one. Nothing about the key changes: it is the vault's content key, and no other key material exists.

`<audio id>.enc` in `files/echo/audio`:

| Offset | Size | Field                                                                                         |
| ------ | ---- | --------------------------------------------------------------------------------------------- |
| 0      | 1    | Format version. `2` is framed. `1` is the earlier format: one envelope for the whole file    |
| 1      | 4    | Frame size in bytes, big endian. `00 40 00 00` for 4 MiB. A header asking for over 16 MiB is refused unread |
| 5      | ...  | Frames in order. Each is nonce (12) + ciphertext + tag (16), 28 bytes longer than its plaintext |

Every frame but the last holds exactly the frame size. The last holds 1 to frame-size bytes, and there is no empty frame. The number of frames and the plaintext length come from the file's length, so nothing else is stored.

- **Nonce.** Every frame is encrypted by its own call, which draws a fresh random 96-bit nonce. No two frames of any file share one, and a frame count in the tens of thousands per key is far inside AES-GCM's limits.
- **AAD.** `echo/v2 NUL audio NUL <audio id> NUL`, then the frame size (u32 BE), the frame's index (u32 BE), and one byte, 1 for the last frame. The id is the file's identity, so a frame cannot move to another file or kind. The index stops reordering, repeating, and dropping from the middle. The last-frame byte means a file cut at a frame boundary ends in a frame that was not sealed as the last one, so it fails to open. Appended bytes or frames fail the same way. The frame size is in the header, which no tag covers alone, so it is in every AAD too.
- **One id, one sealing.** As with every object here, the id is the only binding to a particular write. `sealRecording` takes a new id for every sealing, including a re-recording and a sweep rescue, so frames of an older take under a recycled id cannot exist.
- **Opening** of a framed file is all or nothing. Frames are decrypted into the destination in order and the copy is returned only after the last one has opened. Any failure removes the partial copy, and the error is `unreadable`, carrying nothing from the file.
- **The earlier format** (version byte `1`, one envelope) still opens and is never rewritten. It is the one case that reads a whole file at once, because a single GCM object cannot be checked in pieces. Nothing writes it any more. A recording in it needs memory in proportion to its length to open, as it always did.

How a recording becomes sealed, and what a stop at each step leaves. The plaintext is `cache/Audio/<ledger id>.<ext>`; it is deleted only at step 5.

1. Frames are written to `<id>.enc.tmp`. Stop here: a half `.tmp`, the plaintext untouched. The launch sweep removes the `.tmp` (no row names it) and seals the plaintext again.
2. Every frame of the `.tmp` is read back from disk, authenticated, and compared byte for byte with the same range of the plaintext. Stop here: the same.
3. `<id>.enc.tmp` is renamed to `<id>.enc`. A file with that name is therefore always whole and verified. Stop here: a complete `.enc` that no row names. The sweep removes it as an orphan and seals the plaintext again.
4. The audio row, the draft, and the ledger's `sealed_at` are committed in one transaction. Stop before: as step 3. Stop after: a sealed take with its row, and the plaintext still present.
5. The plaintext is deleted. Stop before: the sweep sees `sealed_at` and deletes it without making a second draft.

At step 4 a transaction that throws may still have committed, if it was the answer that was lost. Then the row names the `.enc` and the ledger says sealed, so the save is treated as the success it was and the `.enc` stays. The `.enc` is removed only when the database is known not to name it; if that cannot be told, it stays, and with no row to name it the next launch removes it while the plaintext is untouched. Removing a file a row names would leave the sweep to delete the plaintext too, and nothing of the recording would be left.

The `.tmp`, the `.enc`, and the plaintext are never all missing, so a stop at any step loses nothing. A failure at any step other than a stop (a full disk, a fault in the crypto layer) takes the same path and reports an error, with the plaintext kept and the `.tmp` removed. The sweep also removes any `.tmp` or `.enc` that no row names before it seals a stranded take again, so a half file from a killed run never competes for room with the new one.

Playback and transcription open the same way, into `cache/echo-temp/<uuid><ext>` (the folder every launch clears), and `release()` removes the copy. A copy that fails to open, or is stopped half way, is removed, or is left for the launch sweep.

Export is the exception to bounded memory. `exportJournal` builds a zip that needs each file's whole bytes first, so it holds one recording at a time in memory, at about the recording's length, plus a frame.

**Plaintext does touch disk in four places.** All four are in the OS cache, outside device backups.

- Recording: until `stop()` finishes. If that fails, until the next launch encrypts it, or the draft is discarded. The consent says a recording is encrypted "when saved" for this reason, and not that it stays encrypted.
- Playback and transcription: until `release()`, or the next launch. Written a frame at a time, and only handed out once every frame has opened.
- Export: on iOS, until the share completes. On Android, for at least a minute after the share sheet closes, because the receiving app may still be reading. Android pauses timers in the background and nothing runs while the app is away, so if ECHO leaves the foreground inside that minute, the zip stays until the app next returns to the foreground or launches. That can be days. This is a limit of the platform, and the app cannot shorten it.
- Restore: the picked backup, from the pick until the restore ends, Not now, or a refusal, and each recording copied out of it while it is sealed. A preview left open behind the lock keeps it until a decision is made or the app next launches.

Every launch removes leftover export, restore and playback files, whatever else happens. Leftover recordings wait for the key, so they can be rescued.

**Deleted content does not leave the disk at once in every case.** It leaves the database and its write-ahead log when a delete or discard finishes, and if that step fails, on the next launch. A draft's earlier revisions stay in the log as ciphertext until that draft is committed, discarded, or deleted, or until the next launch, because emptying the log on every autosave would be too slow.

**A sudden power loss can cost a recording.** Text cannot be lost once a save or commit reports ok: SQLite syncs it to disk first. Audio has no such guarantee, because `expo-file-system` offers no fsync on either platform. When `stop()` resolves, the `.enc` may still be in the OS cache with its plaintext already deleted. An app crash does not touch it, but if the phone loses power in the next few seconds, that recording can be gone. Framing does not change this: the rename and the frames can still be in the cache, and a file that came back short or empty fails to open. `openEntryAudio` then fails, and the entry itself is intact. Closing this needs a native change.

**Turn off lock appears only when the device has no passcode or biometrics left.** No failed prompt earns it. If the OS prompt stays broken, the journal stays shut and intact, and Unlock keeps retrying.

## Device checks

Native behaviour cannot be proved in Jest. Each of these needs a real device.

**Encryption**

1. Fresh install: write, commit, kill, relaunch. The entry reads back.
2. Pull `echo.db` with `run-as`. No text or mood is readable with `strings`.
3. Clear only the key (uninstall with backup restore on Android, or a new device). The key-loss screen appears, and no key is created until Start over.
4. Delete an entry, then pull `echo.db-wal` with `run-as`. It is 0 bytes. Do the same after Discard.

**Recording**

5. Record 30 seconds and stop. Check `cache/Audio` is empty and `files/echo/audio` holds one `.enc`. The recording plays.
6. Confirm `recorder.uri` is inside `cache/Audio`. The sweep only looks there and in `cache/ExpoAudio`.
7. Force stop mid-recording, then relaunch. A draft appears, and on Android the `.aac` plays up to the cut.
8. Background mid-recording. The plaintext is gone within a few seconds.
9. Deny the microphone, then allow it through Settings.
10. With a recording waiting after `save_failed`, clear the app's cache in Settings and relaunch. The next draft opened shows `audio_failed` once, and nothing else changes.

**Biometric lock**

11. Enable, then kill and relaunch. The prompt shows before any content.
12. Remove all fingerprints with a PIN set. The PIN opens the app.
13. Remove the PIN as well. Turn off lock appears and works.
14. Cancel the prompt. It must not re-prompt in a loop.
15. Open the passcode screen and take over 30 seconds. It must not re-lock in a loop.
16. On Android, leave the prompt up until it times out, three times. It waits for a tap each time, and Turn off lock never appears.
17. Background the app, set the clock back an hour, and return. It locks.
18. Return after more than 30 seconds, watching closely. No content shows between the cover lifting and the lock.

**Privacy cover**

19. Open recents with an entry on screen, lock on. The thumbnail shows no content on either platform. On Android this is `FLAG_SECURE`, so screenshots and screen recording are blocked too.
20. Same with the lock off. iOS shows the cover. **On Android this is best effort**: the thumbnail races the cover, and a screenshot works.
21. On Android with the lock on, rotate, change the system theme, and split the screen, then open recents. The thumbnail is still blank.
22. Background and return. The cover lifts and nothing was lost.

**Other**

23. Schedule a reminder two minutes ahead with the app killed. The body is exactly the fixed line.
24. Change timezone with the reminder set. It stays at the local time.
25. Export to Files and to an email app. The zip opens with `entries.json`, `entries.md`, and `audio/`. On Android, check `cache/echo-temp` three ways. Stay in the app: empty a minute later. Background the app inside that minute and return after it: empty on return, and not before. Background it, then force stop: empty after the next launch.
26. Delete all. The app returns to Landing, and `files/echo` is gone.
27. Change the timezone, and confirm past days in the week strip do not move.

**Long takes**

28. Record a live take of 10 minutes or more with words hidden, and stop. Pull `files/echo/audio` with `run-as`. There is one `.enc` and no `.tmp`. `xxd -l 8` of it starts `02 00 40 00 00`, and its length is `5 + wav length + 28 * ceil(wav length / 4194304)`. `strings` finds nothing readable in it.
29. Play it from the start, then seek near the end. It plays to the end. Then check `cache/echo-temp` is empty after playback stops, after leaving the page mid-playback, and after backgrounding.
30. Let it go to words. The words match what was said, and `cache/echo-temp` is empty afterwards. Do this once with the phone in airplane mode too: the take stays, the temp copy is released, and Try again works.
31. With a 30-minute or longer take, watch the app's memory in Android Studio's profiler (or Xcode's memory gauge) while it stops, seals, plays, and goes to words. It should not climb with the length of the take. A take from an earlier build, in the single-envelope format, still plays.
32. Force stop during the seal of a long take (the moment after Stop), relaunch, and the draft appears with the whole take. `files/echo/audio` holds one `.enc`, with no `.tmp`, and `cache/Audio` is empty.

**Restore from a backup**

33. Export on one phone, share the zip to Drive or Files, and on a second phone, after onboarding, restore it from You. The preview gives the count and the first and last days. Restore, and every entry is in Echoes with its date, Home's week strip marks its days, Patterns counts it, and each recording plays. Pull `echo.db` and `files/echo/audio` with `run-as`: `strings` finds none of the words.
34. After it finishes, and again after Not now and after a refused file, `cache/echo-temp` is empty, nothing is in `cache/DocumentPicker`, and on iOS nothing is in ECHO's `tmp/<bundle id>-Inbox`. The backup in Drive or Files is still there, unchanged.
35. Restore the same file again: nothing is added, and the result says they were already on this phone.
36. Restore a backup of a few hundred megabytes of recordings and force stop mid-way. Relaunch: the entries there each open whole, with their recording, `files/echo/audio` holds one `.enc` per audio row and no `.tmp`, and `cache/echo-temp` is empty. Restore the same file again, and the rest arrive.
37. With the lock on, choose a file and stay in the picker for more than 30 seconds. On return the lock shows first, and the preview appears only after unlocking.
38. Pick a file from Google Drive and from a USB or SD card provider, and a zip that is not an export. The first two open, and the third is refused with its message. With a backup of a few hundred megabytes on Drive that is not on the phone yet, the row says Reading your backup while it arrives, and ECHO never stops responding.
