# ECHO mobile architecture

## Product boundary

The checked-in `product-handoff/` directory is the source of truth for the locked experience: Landing, onboarding steps 1–8, and Home in Day and Night themes. Golden PNGs define visual acceptance; written specifications define behavior and state.

Echoes, Patterns, and You receive route shells and data contracts only until approved golden screens arrive. Their visual design must not be improvised.

## Client stack

- Expo managed workflow with React Native and TypeScript.
- Expo Router for typed, file-based navigation.
- React Native Reanimated for the specified transitions and reduced-motion variants.
- React Native Gesture Handler for the time dial and gesture-safe controls.
- Zustand for ephemeral UI/onboarding state.
- TanStack Query for authenticated remote operations and retry policy.
- Expo SQLite for local-first data.
- Expo SecureStore for device-held key material and session secrets.
- Platform cryptography module selected during scaffold validation for AES-256-GCM entry and audio encryption.
- Expo Notifications, LocalAuthentication, Audio, FileSystem, Sharing, Localization, and Network modules for device capabilities.
- Zod schemas shared at the network boundary.
- Jest/React Native Testing Library for behavior and Maestro for critical device flows.
- Deterministic screenshots at 393 x 852 plus the matrix in `product-handoff/specs/VISUAL_QA.md`.

React Native and Expo are selected because one implementation must ship to iOS and Android while preserving a single geometry and interaction model. Any module that cannot satisfy release requirements will be moved to a small Expo native module rather than splitting the product into two applications.

## Repository shape

```text
app/                       Expo Router routes
src/
  components/              locked reusable UI primitives
  features/
    onboarding/
    journal/
    reflection/
    reminders/
    privacy/
    backup/
    auth/
  design/                  imported tokens, typography, themes
  storage/                 database, migrations, encryption boundary
  services/                API, permissions, notifications, audio
  state/                   small client stores
  contracts/               Zod request/response schemas
  testing/                 fixtures and screenshot helpers
assets/                    production backgrounds, icons, fonts, overlays
docs/                      architecture, contracts, delivery and decisions
product-handoff/           immutable design handoff and golden references
```

## Runtime layers

1. **Presentation** renders locked components from tokens and contains no persistence logic.
2. **Feature controllers** coordinate navigation, permissions, drafts, timers, and user intent.
3. **Local domain layer** owns entries, reminders, onboarding progress, and derived rhythm data.
4. **Security boundary** encrypts journal text and audio before local persistence or network transfer.
5. **Sync boundary** moves ciphertext and metadata only after authentication and explicit backup consent.
6. **Backend boundary** handles identity, encrypted blob storage, sync cursors, deletion, and optional reflection orchestration.

## Local-first rules

- First launch, onboarding, writing, recording, search, reminders, and reading work without an account.
- Onboarding progress and drafts persist after every meaningful change.
- `JournalEntry` is the source of truth; rhythm is derived by local calendar date.
- Remote backup is opt-in and must never block local completion.
- Sync uses stable IDs, `updatedAt`, tombstones, idempotency keys, and a per-device cursor.
- Conflict policy for v1: newest encrypted revision wins while retaining the losing revision for recovery until compaction.

## Privacy and security

- Generate a random content-encryption key on device.
- Store key material in Keychain/Keystore through SecureStore; store encrypted payloads in SQLite/files.
- Encrypt each entry/audio object independently with authenticated encryption and unique nonces.
- Keep free text, audio, prompts answered by users, and reflection content out of logs, analytics, crash metadata, and notifications.
- Gate the app with biometrics only after the user enables it; preserve a documented recovery path.
- Send plaintext to an AI reflection provider only after explicit consent and a disclosure of provider, retention, training, and region.
- Redact request/response bodies in production networking and observability.

The final backup key-recovery model is a product/security decision. Cross-device restoration cannot be implemented safely until the owner chooses device-only keys, a recovery secret, or server-assisted key wrapping.

## Navigation

- Root gate resolves encryption readiness, biometric lock, onboarding completion, and the current tab.
- Onboarding is a resumable linear state machine with a conditional authentication sheet at Privacy.
- Completion commits the first entry before navigation to Home and cannot return to an incomplete state.
- The tab shell includes Today, Echoes, Patterns, and You; only Today receives locked visual implementation from the current handoff.

## Quality gates

- TypeScript strict mode and lint pass.
- Unit coverage for state machines, timers, encryption adapters, validation, and sync conflict rules.
- Device tests for onboarding resume, denied permissions, offline journaling, draft recovery, export, deletion, and biometric lock.
- Day/night golden comparisons at the required dimensions and accessibility modes.
- Release builds run on a physical iPhone and Android device before submission.
- Privacy inspection confirms no journal content in logs, analytics, notifications, crash reports, or network metadata.

