# ECHO delivery plan

## Ownership

### Chirag — frontend and product fidelity

- Validate each implementation against the golden screens.
- Own product decisions, copy approvals, assets, store accounts, and final acceptance.
- Implement or refine UI with the shared component system.

### Yash — backend

- Implement the API in `docs/API_CONTRACT.md`.
- Own database migrations, authentication verification, encrypted object storage, deletion jobs, rate limiting, and operational monitoring.
- Provide a local/staging environment plus seeded test identities.

### Codex — architecture and release gate

- Maintain architecture and contracts.
- Break implementation into bounded tasks and review every integration.
- Run visual, behavior, security, and release checks.
- Resolve frontend/backend contract mismatches before merge.

### DeepSeek worker — implementation

- Execute one bounded task at a time from an explicit brief.
- Work only within assigned files.
- Run the specified checks and report changed files, assumptions, and remaining failures.
- Never alter locked copy, tokens, golden files, or product behavior without an approved architecture decision.

## Workstreams

### 0. Foundation

- Scaffold Expo TypeScript application.
- Import verified handoff and production assets.
- Configure strict TypeScript, linting, formatting, environment validation, and CI.
- Establish preview scripts for iOS, Android, and deterministic screenshots.

Exit: clean development builds open on both simulators and display an asset/font test screen.

### 1. Visual system

- Theme provider, tokens, typography, safe-area shell, background focal cropping, overlays, and reduced transparency.
- Shared components listed in the handoff.
- Story/test routes for every component state.

Exit: component geometry matches the reference at 393 x 852.

### 2. Locked onboarding

- Landing and steps 1–8.
- Resumable state machine and validation.
- Motion, responsive layouts, accessibility, and keyboard behavior.
- Permission pre-prompts with denial paths.

Exit: complete Day/Night onboarding works offline and survives termination.

### 3. Journal core and Today

- Encrypted local text drafts and entries.
- Voice recording, encrypted file handling, and recovery.
- Seven-minute timer and completion commit.
- Today screen, derived rhythm, and recent/draft card.

Exit: a local-only user can complete the daily ritual repeatedly without network access.

### 4. Backend and sync

- Authentication adapters.
- Device registration and backup opt-in.
- Ciphertext sync, tombstones, restore, retry queue, and conflict handling.
- Export and account deletion.

Exit: staging backup/restore passes across two test devices and deletion is verifiable.

### 5. Reflection

- Consent and privacy disclosure.
- Provider abstraction, timeout/retry, safety response policy, and offline fallback.
- Encrypted reflection persistence.

Exit: journal saving never depends on AI availability.

### 6. Remaining tabs

- Functional route shells and data plumbing now.
- Pixel-locked UI after approved Echoes, Patterns, and You golden screens arrive.

### 7. Release

- Full visual matrix, accessibility, performance, memory, offline, and privacy checks.
- Store assets, privacy labels, data safety answers, usage strings, legal URLs, signing, and production builds.
- TestFlight and Play internal testing before staged production rollout.

## Integration cadence

- Contract changes land before dependent frontend/backend changes.
- Small pull requests, one feature or contract slice each.
- Frontend uses a typed mock adapter until Yash's staging endpoint passes the same contract tests.
- Twice-daily integration checkpoints: schema compatibility, current device build, blocking decisions.
- Main remains releasable; incomplete features stay behind local feature flags.

## Immediate sequence

1. Confirm repository hosting and invite Yash.
2. Scaffold the client and commit the verified handoff.
3. Yash implements session, sync-bootstrap, and health endpoints against the contract.
4. Build tokens/components while backend foundation proceeds.
5. Implement the locked screens in order and compare after each screen.
6. Integrate persistence, device capabilities, backup, and reflection.
7. Close owner inputs and run release gates.

