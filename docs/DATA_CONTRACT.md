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

The request carries `style`: `exact` (the default: every filler and self-correction stays, and the only second step is writing Hindi in Roman script) or `tidy` (`usePreferences().tidyWords`). A recording longer than the server takes is sent in pieces, up to three at a time, and joined in the order it was spoken. A WAV, which is what a live take is, is cut at its quietest moments into pieces of about 4 MB. An Android `.aac`, which is a hidden take (ADTS), is cut between frames into pieces of at most five minutes of sound, because the voice server refuses an `.aac` of more than about 380 seconds (378 were taken and 381 were not, however small the file, though the same audio sent as an `.m4a` was taken at ten minutes), and one of under about five and a half; an end shorter than 20 seconds is sent with the piece before it. Quiet moments cannot be found in AAC without decoding it, so its pieces overlap by about three seconds, and the words of the overlap are matched and kept once (`src/services/joinWords.ts`). With no confident match of at least three words they are joined with a space and nothing is dropped. Every piece is asked for in the style chosen before the first one. If any piece fails, the take fails with that piece's code, none of its words are delivered, and Try again sends the whole take afresh; the sealed recording is untouched either way. An iOS `.m4a` cannot be cut: see `docs/SPEC_CONFLICTS.md`.

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
| `unsupported`       | 415, or 422 `unsupported_audio` (which the server also gives an `.aac` outside about 5.5 to 380 seconds; the app cuts to stay inside) | Recording is safe, Try again                 |
| `rate_limited`, `server`, `invalid_response` | 429, 5xx, or a reply that is not the contract | Recording is safe, Try again       |
| `audio_unavailable` | The sealed recording would not open                          | Recording is safe, Try again                 |

- The service reads the person's choice itself (`voiceStatus` in `@/state/preferences`), so no caller can upload without consent. A choice made under an older `VOICE_POLICY_VERSION` counts as unset.
- It opens the recording with `openEntryAudio` and calls `release()` on every path.
- Only `127.0.0.1` and `localhost` may use plain http. Any other address must be https.
- Nothing is logged: not the audio, not the words, not the address.
- `content.transcribedAudioId` names the recording whose words are already in `body`. A draft whose `audio.id` is something else has a recording with no words yet, and a reopened session offers to turn it into words.
- The words join `body` after a paragraph break and are saved at once. A session that closes mid-request still delivers them into the stored draft.
- The draft keeps one recording. A new recording replaces the sealed one, so a take that is still waiting for its words keeps a decrypted copy until it is done. If that copy could not be made, the take cannot be retried, and the session says so.

## Live words

D-007 and D-008. Words are hidden by default: a spoken session shows the photograph and one breathing light, the take is recorded to a file as before, and it is sent after it ends. Nothing opens a socket.

`usePreferences().wordsShown` turns on live words, and the first time it is turned on the person agrees to a separate note (`voiceConsent.live`, in the same record and under the same `VOICE_POLICY_VERSION`, see `liveAllowed`): the voice streams to OpenAI as it is spoken, which OpenAI may keep for up to 30 days. Only the daily echo streams.

Session fields for a page to draw: `wordsShown`, `liveText` (words heard live and not yet in the draft), `bodyVisible` (false while speaking with words hidden), `wordsLabel` and `toggleWords` for the quiet row, `quietLine` (`…listening` only when words are shown, or the calm note that live words stopped), `consentOpen` with `consentKind` (`voice` or `live`, for `VoiceConsentSheet`), and `touchSky()` for a touch on the scenery.

How a live take works:

- `POST /api/live-session` on the voice server returns a secret that lives for a minute and opens one transcription session. The OpenAI key never reaches the phone, and no audio passes through ECHO's server.
- The microphone is expo-audio's `useAudioStream` (24 kHz, mono, int16, resampled if the device gives another rate). It also writes the take as a WAV to `cache/Audio/<ledger id>.wav` with `startFileRecordingAsync`, so the recording is sealed and swept like any other. Only one of the file recorder and the stream owns the microphone for a take.
- `src/services/liveTake.ts` sends the audio, finds pauses with simple voice detection and commits each turn, and orders turns by commit with completions matched by `item_id`.
- When the take stops, the words go through the same rules as any other take (`refineWords`: exact words are kept, Devanagari is written in Roman script, tidy polishes), and join `body`.
- If the connection cannot open, drops at any moment, or a turn fails, recording carries on, the person is told calmly, and the sealed recording is sent after it ends as usual. A hidden take never uses any of this.

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
| `usePreferences` / `useTheme().setPreference` | Theme, persisted. Night by default                                         |

`AsyncData<T>` is `{ status, data, error, refresh }`. Its `status` is `loading` only before the first result.

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

**Plaintext does touch disk in three places.** All three are in the OS cache, outside device backups.

- Recording: until `stop()` finishes. If that fails, until the next launch encrypts it, or the draft is discarded.
- Playback: until `release()`, or the next launch.
- Export: on iOS, until the share completes. On Android, for at least a minute after the share sheet closes, because the receiving app may still be reading. Android pauses timers in the background and nothing runs while the app is away, so if ECHO leaves the foreground inside that minute, the zip stays until the app next returns to the foreground or launches. That can be days. This is a limit of the platform, and the app cannot shorten it.

Every launch removes leftover export and playback files, whatever else happens. Leftover recordings wait for the key, so they can be rescued.

**Deleted content does not leave the disk at once in every case.** It leaves the database and its write-ahead log when a delete or discard finishes, and if that step fails, on the next launch. A draft's earlier revisions stay in the log as ciphertext until that draft is committed, discarded, or deleted, or until the next launch, because emptying the log on every autosave would be too slow.

**A sudden power loss can cost a recording.** Text cannot be lost once a save or commit reports ok: SQLite syncs it to disk first. Audio has no such guarantee, because `expo-file-system` offers no fsync on either platform. When `stop()` resolves, the `.enc` may still be in the OS cache with its plaintext already deleted. An app crash does not touch it, but if the phone loses power in the next few seconds, that recording can be gone. `openEntryAudio` then fails, and the entry itself is intact. Closing this needs a native change.

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
