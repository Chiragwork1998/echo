# ECHO backend

Typed Fastify foundation for the ECHO v1 API. The service runs directly with
Node.js and uses Supabase PostgreSQL through a server-side connection pool.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- A Supabase project and its Session pooler connection URI
- Docker with Docker Compose only if an isolated local PostgreSQL instance is
  needed

## First-time setup

Run these commands from `server/`:

```sh
npm ci
cp .env.example .env
npm run migrate
```

Before running the migration, replace the `DATABASE_URL` placeholder in `.env`
with the Session pooler URI from **Supabase Dashboard → Connect**. URL-encode
special characters in the database password. The values in `.env.example` are
placeholders only; use secret-managed configuration in deployment.

Set `SUPABASE_URL` to the project API URL and `SUPABASE_AUTH_API_KEY` to the
project's publishable key. Never use the service-role or secret key as the auth
API key, and never expose `DATABASE_URL` to a client application.

## Supabase PostgreSQL

Supabase is used as a hosted PostgreSQL provider. Fastify remains the only
public API boundary; this foundation does not expose a Supabase key or connect
mobile clients directly to Supabase.

For a deployed service, set `DATABASE_URL` to the server-side connection string
from **Supabase Dashboard → Connect**. Prefer the session pooler for a
long-running Fastify process, and include `sslmode=require`. Keep the database
password in the deployment platform's secret manager, never in source control.

Example shape only:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?sslmode=require
```

Run the same committed migrations against Supabase by supplying its connection
string only for that command:

```sh
DATABASE_URL='postgresql://...?...sslmode=require' npm run migrate
```

On PowerShell:

```powershell
$env:DATABASE_URL='postgresql://...?...sslmode=require'
npm run migrate
```

Supabase Auth, Storage, and its public Data API are outside issue #1. Fastify is
the only public API boundary.

## Run the API

Development with reload:

```sh
npm run dev
```

Production-style build and run:

```sh
npm run build
npm start
```

The local API listens on `http://127.0.0.1:3000` by default.

## Deploy to Vercel

Create a dedicated Vercel project for this API with `server/` as its Root
Directory and **Fastify** as the framework preset. Vercel detects
`src/server.ts` as the Fastify entrypoint and deploys the application as one
Node.js 22 Function with Fluid compute.

Configure these encrypted environment variables for Production and Preview:

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_AUTH_API_KEY
OPENAI_API_KEY
LOG_LEVEL=info
```

Use the Supabase Session pooler URI for `DATABASE_URL`. Do not configure `PORT`
on Vercel; the platform supplies it. The database pool is intentionally capped
at three connections per autoscaled function instance.

Run `npm run migrate` as a separate, controlled release step before deploying
code that depends on a new schema. Do not add migrations to the Vercel build
command: concurrent preview builds must not mutate the shared database.

`OPENAI_API_KEY` is a backend-only secret used by `POST /v1/transcriptions`.
Configure it directly in the deployment platform's encrypted secret manager.
It is intentionally absent from `.env.example`, client configuration, logs,
screenshots, and API responses.

The transcription endpoint accepts one `audio` multipart field up to 25 MB in
m4a, mp4, wav, webm, or MPEG format. It requires authentication and an
`Idempotency-Key`, applies a per-account rate limit, sends the temporary file to
`gpt-4o-transcribe`, and removes the temporary file before completing the
request. Audio and transcript content are excluded from application logs.

After deployment, configure `/v1/health` as the uptime probe and verify that it
returns HTTP 200 with `dependencies.database` set to `ok`.

## Database migrations

This service uses `node-pg-migrate` with ordered SQL files in `migrations/`.
`DATABASE_URL` is loaded from the environment by the migration CLI.

```sh
npm run migrate
npm run migrate:down
```

`migrate:down` changes the configured database and is destructive. Use it only
against a disposable database after reviewing the migration being reverted.

## Optional isolated PostgreSQL

Issue #1 includes Docker Compose for contributors who need an isolated local
PostgreSQL instance. It is not required when working directly against a safe
Supabase development project.

```sh
docker compose up -d postgres
```

Use the local URL from `docker-compose.yml` as `DATABASE_URL`, run
`npm run migrate`, and stop it with:

```sh
docker compose down
```

Add `-v` only when you intentionally want to delete the local database volume.

## Quality checks

The issue acceptance commands are:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run openapi:check
```

The optional migration integration tests use a separate `TEST_DATABASE_URL`,
wrap all inserted fixtures in transactions, and roll them back. Never point
`TEST_DATABASE_URL` at production. If it is absent, those tests are skipped
while service and contract tests still run.

Regenerate the committed OpenAPI snapshot after an intentional contract change:

```sh
npm run openapi:generate
npm run openapi:check
```

## Public routes

- `GET /v1/health`
- `GET /v1/configuration`
- `POST /v1/auth/exchange`
- `POST /v1/auth/magic-link/request`
- `POST /v1/auth/magic-link/verify`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/me`
- `PATCH /v1/me`

Every response includes a server-generated `x-request-id`. Errors use the
standard `{ code, message, retryable, requestId }` envelope. Request bodies are
not logged, and credential-bearing headers are redacted.
