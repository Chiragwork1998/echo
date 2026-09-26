# Suggested data model

## UserProfile

`id`, `createdAt`, `displayName?`, `theme(day|night|automatic)`, `locale`, `timezone`, `onboardingCompletedAt?`, `onboardingState`.

## OnboardingState

`currentStep(0–8)`, `intent?`, `horizon?`, `mode?`, `mood?`, `updatedAt`.

## PrivacySettings

`biometricLockEnabled`, `privateBackupEnabled`, `analyticsEnabled`, `aiReflectionEnabled`, `lastExportAt?`.

## Reminder

`enabled`, `localTime`, `preset?`, `timezonePolicy(device|fixed)`, `notificationPermission`.

## JournalEntry

`id`, `createdAt`, `updatedAt`, `promptId`, `promptTextSnapshot`, `mode(text|voice)`, `encryptedBody?`, `encryptedAudioPath?`, `durationSeconds`, `moodBefore?`, `reflection?`, `syncState(local|pending|synced|error)`, `deletedAt?`.

## Reflection

`entryId`, `status(pending|complete|error|offline)`, `encryptedText?`, `modelMetadata?`, `createdAt`.

## RhythmDay

Computed locally from completed entries by local calendar day. Do not store an easily corrupted streak counter as the source of truth.

## Security

- Generate a per-user content-encryption key.
- Store local key material in Keychain/Keystore.
- Encrypt entry body and audio before persistence/backup.
- Never use reversible obfuscation as encryption.
- Do not send plaintext content to analytics or crash services.

