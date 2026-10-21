# Native core implementation notes

Scope: dependencies, app configuration, `src/storage`, `src/services`, state
integration and the minimum route wiring needed to exercise them. No visual,
background, font or control file was changed.

## Dependencies

Installed with `npx expo install` (Expo 57 compatible):
`expo-sqlite`, `expo-secure-store`, `expo-audio`, `expo-notifications`,
`expo-local-authentication`, `expo-crypto`, plus `expo-asset` (required peer of
`expo-audio`) and `expo-file-system` for encrypted audio objects.

`@noble/ciphers` was added with `npm install` because the Expo APIs do not
expose AES-GCM. It is a maintained, audited implementation used together with
`expo-crypto` for random bytes and SHA-256.

## Encryption and key material

- One 256-bit content key is generated on device and stored through
  `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; it is never
  exported and never leaves the device. Cross-device recovery remains an open
  product decision (`docs/DECISIONS_REQUIRED.md`).
- Every payload is encrypted with AES-256-GCM and a fresh 96-bit nonce
  (`src/storage/encryption.ts`). A SHA-256 content hash is stored for future
  conflict detection only.
- Journal bodies, moods, reflections and audio are encrypted before they reach
  SQLite or the filesystem. Nothing falls back to plaintext persistence: when
  encryption is unavailable the store reports an error state and keeps content
  in session memory instead.

## Storage and migrations

- `src/storage/database.ts` opens `echo.db`, sets WAL, and applies forward-only
  migrations tracked by `PRAGMA user_version`
  (`src/storage/migrations.ts`, currently version 1). A database newer than the
  app raises `SchemaTooNewError` instead of being downgraded.
- Tables: `onboarding_state`, `journal_entries`, `journal_drafts`,
  `recording_sessions`. Only ciphertext plus non-sensitive metadata is stored.
- A row whose ciphertext fails authentication is preserved and surfaced as
  `contentState: 'unavailable'` rather than being dropped.
- `src/storage/database.web.ts` provides a platform variant so web preview
  builds (which have no Keychain and cannot bundle the SQLite wasm worker) fall
  back to session memory through the same repository interfaces.

## Recording, recovery and interruption

- `src/services/voice.ts` records through `expo-audio` into the document
  directory, writes a ledger row before recording starts, and encrypts the
  finished file before returning its path.
- If the OS ends the session (call, media-services reset, process kill) the
  partial file stays on disk and the ledger row is marked `pending-encryption`.
  The next launch encrypts it and reattaches it as the current draft
  (`voiceCapture.recoverInterrupted()`, invoked from `app/_layout.tsx`).
- If encryption is unavailable the plaintext file is never referenced by
  journal persistence; the UI reports that the recording is held for recovery.

## Permissions and schedules

- Microphone permission is requested only when the user selects Speak.
- Notification permission is requested only after the user sets a rhythm; the
  reminder is scheduled as a repeating daily local notification and cancelled
  when the toggle is turned off. Notification copy is static and journal-free.
- Biometric availability and authentication are real adapters
  (`expo-local-authentication`); a device without enrolled biometrics reports
  `none` and the lock degrades gracefully.

## Backend boundary

- `src/services/api.ts` implements the `docs/API_CONTRACT.md` envelope against
  `EXPO_PUBLIC_API_BASE_URL` (a public endpoint, never a provider secret) with
  typed transport, timeout, idempotency-key and contract error handling.
- `src/services/transcription.ts` decrypts a recording to a cache file for one
  authenticated multipart `POST /v1/transcriptions` upload and deletes it in a
  `finally` block. No token is issued in this build, so the call reports
  `unauthenticated` rather than pretending to succeed.

## Assumptions

1. Transcription is not listed in the API contract, so the client targets
   `POST /v1/transcriptions` on the same authenticated contract and error
   envelope.
2. The handoff locks screen copy but not notification body text, so the
   reminder uses fixed journal-free copy (`REMINDER_NOTIFICATION`).
3. Onboarding selections are non-content state; they are stored as plaintext
   JSON in the local database. Journal content, audio and reflections are
   always encrypted.
4. Web preview builds are not a shipping target and therefore use session
   memory instead of an encrypted store.
