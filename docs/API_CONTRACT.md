# ECHO backend contract v1

Base path: `/v1`. JSON uses ISO-8601 UTC timestamps and UUIDs. Every mutating request accepts `Idempotency-Key`. Error bodies use `{ "code": string, "message": string, "retryable": boolean, "requestId": string }` and never contain journal content.

## Public operations

- `GET /health` — service and dependency status without sensitive details.
- `GET /configuration` — supported client versions, reflection availability, policy document versions, and feature flags.

## Authentication

The client authenticates with Apple, Google, or email magic link. The backend verifies provider assertions and issues short-lived access plus rotating refresh credentials.

- `POST /auth/exchange`
- `POST /auth/magic-link/request`
- `POST /auth/magic-link/verify`
- `POST /auth/refresh`
- `POST /auth/logout`

## Account

- `GET /me`
- `PATCH /me` — display name, locale, timezone only.
- `POST /me/devices` — registers a device public key and app metadata.
- `DELETE /me/devices/{deviceId}`
- `POST /me/export` — starts a user-requested export job.
- `GET /me/export/{jobId}`
- `DELETE /me` — revokes sessions and schedules remote deletion under the published SLA.

## Encrypted backup

The service stores opaque ciphertext. The envelope contains metadata required for sync; entry content and audio remain encrypted.

### Sync item

```json
{
  "id": "uuid",
  "kind": "entry|reflection|audio|profile|settings",
  "revision": 4,
  "updatedAt": "2026-09-26T00:00:00Z",
  "deletedAt": null,
  "ciphertext": "base64",
  "nonce": "base64",
  "algorithm": "A256GCM",
  "contentHash": "base64"
}
```

- `POST /sync/push` — accepts a bounded batch and returns accepted revisions plus conflicts.
- `GET /sync/pull?cursor=...&limit=...` — returns changed items, tombstones, and the next cursor.
- `POST /sync/ack` — records the device cursor for retention/compaction.
- `POST /backup/recovery-envelope` — stores the chosen encrypted key-recovery envelope after that product decision is approved.
- `GET /backup/recovery-envelope`

Push and pull must be idempotent. The server rejects revision regression and applies per-account/device limits.

## Reflection

- `POST /reflections` — requires current consent/policy version and an entry-scoped plaintext payload over TLS; returns a job ID.
- `GET /reflections/{jobId}` — pending, complete, failed, or expired.
- `DELETE /reflections/{jobId}` — deletes provider-side retained material where supported.

The reflection service must enforce configured provider, region, retention, training policy, redaction, timeout, abuse limits, and audit events. It returns wellness reflection language and must not diagnose or claim clinical authority.

## Operational requirements

- PostgreSQL for accounts, devices, cursors, tombstones, consent versions, and job metadata.
- Private object storage for encrypted audio and large ciphertext objects.
- No request-body logging on sync/reflection routes.
- Structured logs contain request ID, route, latency, result, byte counts, and opaque identifiers only.
- Auth, sync, export, reflection, and deletion have separate rate limits.
- Automated backups, restore drills, deletion verification, key rotation, and incident procedures are required before production.
- Contract schemas must be published as OpenAPI and used to generate client types or validated against the shared Zod fixtures.

