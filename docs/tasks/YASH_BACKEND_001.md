# Yash task 001 — backend foundation

## Objective

Create the production backend skeleton without implementing journal-content processing yet. The result must provide a typed, testable service that follows `docs/API_CONTRACT.md` and can run locally on macOS.

## Git workflow

```bash
git clone https://github.com/Chiragwork1998/echo.git
cd echo
git switch -c backend/foundation
```

Keep all backend code inside `server/`. Do not change `product-handoff/`, mobile application files, design tokens, or locked copy.

## Stack

- Node.js 22 or newer LTS-compatible runtime.
- TypeScript in strict mode.
- Fastify.
- PostgreSQL with a migration tool chosen and documented by Yash.
- TypeBox or Zod schemas connected to generated OpenAPI.
- Vitest for service and contract tests.
- Docker Compose for local PostgreSQL only; the API itself must also run directly with npm.

## Deliverables

1. `server/package.json`, strict TypeScript configuration, lint/format scripts, and `.env.example` with placeholders only.
2. Application factory separated from the process entry point so tests do not bind a real port.
3. `GET /v1/health` returning service status, version, and dependency status without secrets.
4. `GET /v1/configuration` returning:
   - minimum supported client version;
   - current privacy/terms version placeholders;
   - `reflectionAvailable: false`;
   - feature flags for backup and reflection.
5. Standard error envelope from `docs/API_CONTRACT.md`, including a generated request ID.
6. Request-body logging disabled. Headers that may contain credentials must be redacted.
7. OpenAPI JSON generation and a committed contract snapshot.
8. PostgreSQL connection health check plus an initial migration framework.
9. Tests for both routes, invalid routes, error envelopes, and database-unavailable health behavior.
10. `server/README.md` with exact setup, migration, test, and run commands.

## Acceptance commands

From `server/`:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run openapi:check
```

## Pull request

Push `backend/foundation` and open a pull request into `main`. Include test output, architectural choices, and anything blocking the next task. Do not merge it; Codex will review the contract and security boundary first.

