# Vercel backend deployment

Production API: https://echo-server-rho.vercel.app

The Vercel project is `tem-9732/echo-server`. CLI and MCP logins may belong to
different accounts; preserve this explicit project scope when deploying.

`api/index.ts` adapts Fastify to a Vercel Node function without opening a
listening socket. It shares initialization and the PostgreSQL pool across warm
invocations. `vercel.json` forwards requests to this handler. `src/server.ts`
remains the local standalone entrypoint. The empty `public/` directory is
required by Vercel's no-framework build mode.

Production uses the verified Supabase transaction pooler on port 6543, rather
than the project's IPv6-only direct address. The handler enforces certificate
verification using Supabase's public CA, bundled from:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
This certificate is public, not a credential; it expires in April 2031.

Required production environment variables: `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_AUTH_API_KEY`, `SARVAM_VOICE_API`, and optionally `LOG_LEVEL`.
Keep their values in Vercel secrets, never source control or deployment uploads.
The function timeout is 180 seconds to accommodate transcription jobs.
Vercel's request-body size limit still applies to audio uploads; the backend's
25 MiB parser limit does not override that platform limit.

Production aliases are public so phones can call the API. Preview and
deployment-specific URLs retain Vercel authentication protection. Account and
transcription routes still require a valid Supabase access token.

Deploy from this directory using `vercel deploy --prod --scope tem-9732`.
Run typecheck, lint, tests, build, and OpenAPI checks first. Do not run database
migrations automatically as part of deployment.

Verify without Vercel cookies or bypass tokens:

- `/v1/health`: HTTP 200, database `ok`.
- `/v1/configuration`: HTTP 200.
- `/v1/me` without a bearer token: HTTP 401.

Mobile configuration: `EXPO_PUBLIC_API_BASE_URL=https://echo-server-rho.vercel.app`.
Restart Expo after changing this public environment variable. Authentication
still runs directly through Supabase; deployment does not change email
templates, SMTP configuration, or Google redirect settings.
