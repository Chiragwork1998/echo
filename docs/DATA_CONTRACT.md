# Data contract

How screens use ECHO's private data core. Everything here works offline.

```ts
import { useDraft, useVoiceRecorder, useReflection, useHomeSummary } from '@/features/journal';
import { useOnboarding, completeOnboarding } from '@/state/onboarding';
```

## What the root gate guarantees

`app/_layout.tsx` mounts no screen until encryption, onboarding, and the biometric lock are resolved. By the time your screen renders:

- `useOnboarding` holds the user's saved choices.
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

`useDraft()` resumes the newest draft, or starts a new one. `seed` applies only to a new draft. Pass `{ draftId }` to open a specific draft.

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
| `flush()`                   | `Promise<JournalResult<void>>`            | Keep draft: await, then leave                                        |
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
| `save_failed`         | Say the recording is kept. It is recovered on the next launch. Offer Write      |

- `start()` never shows the OS prompt. Only `requestMicrophonePermission()` does.
- Call `await voice.stop()` before `draft.commit()`, and keep Reflect disabled while `state` is `recording` or `saving`.
- Text and audio live on the same draft, so switching Write and Speak loses nothing.
- Recording again replaces the previous recording. Warn first if `draft.audio` is set.
- Backgrounding stops and encrypts on its own. Leaving the screen rescues the recording.

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
- If `readable` is false, the row failed decryption. Show that it can't be opened, and never hide it.
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

## Device checks

Native behaviour cannot be proved in Jest. Each of these needs a real device.

**Encryption**

1. Fresh install: write, commit, kill, relaunch. The entry reads back.
2. Pull `echo.db` with `run-as`. No text or mood is readable with `strings`.
3. Clear only the key (uninstall with backup restore on Android, or a new device). The key-loss screen appears, and no key is created until Start over.

**Recording**

4. Record 30 seconds and stop. Check `cache/Audio` is empty and `files/echo/audio` holds one `.enc`. The recording plays.
5. Confirm `recorder.uri` is inside `cache/Audio`. The sweep only looks there and in `cache/ExpoAudio`.
6. Force stop mid-recording, then relaunch. A draft appears, and on Android the `.aac` plays up to the cut.
7. Background mid-recording. The plaintext is gone within a few seconds.
8. Deny the microphone, then allow it through Settings.

**Biometric lock**

9. Enable, then kill and relaunch. The prompt shows before any content.
10. Remove all fingerprints with a PIN set. The PIN opens the app.
11. Remove the PIN as well. Turn off lock appears and works.
12. Cancel the prompt. It must not re-prompt in a loop.
13. Open the passcode screen and take over 30 seconds. It must not re-lock in a loop.

**Privacy cover**

14. Open recents with an entry on screen, lock on. The thumbnail is blank on both platforms. On Android this is `FLAG_SECURE`, so screenshots and screen recording are blocked too.
15. Same with the lock off. iOS shows the cover. **On Android this is best effort**: the thumbnail races the cover, and a screenshot works.
16. On Android with the lock on, rotate, change the system theme, and split the screen, then open recents. The thumbnail is still blank.
17. Background and return. The cover lifts and nothing was lost.

**Other**

18. Schedule a reminder two minutes ahead with the app killed. The body is exactly the fixed line.
19. Change timezone with the reminder set. It stays at the local time.
20. Export to Files and to an email app. The zip opens with `entries.json`, `entries.md`, and `audio/`. On Android, check `cache/echo-temp` three ways. Stay in the app: empty a minute later. Background the app inside that minute and return after it: empty on return, and not before. Background it, then force stop: empty after the next launch.
21. Delete all. The app returns to Landing, and `files/echo` is gone.
22. Change the timezone, and confirm past days in the week strip do not move.
