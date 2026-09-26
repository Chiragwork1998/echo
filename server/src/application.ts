import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  LogController,
} from 'fastify';
import { parseFile } from 'music-metadata';

import {
  AuthenticationError,
  unavailableAuthProvider,
  type AuthProvider,
  type ProviderSession,
} from './auth.js';
import { createBearerAuthentication } from './auth-middleware.js';
import {
  publicConfiguration,
  REFRESH_SESSION_LIFETIME_SECONDS,
  TRANSCRIPTION_MAX_BYTES,
  TRANSCRIPTION_RATE_LIMIT_PER_HOUR,
} from './config.js';
import type {
  AccountRecord,
  AuthStore,
  DatabaseDependency,
} from './database.js';
import {
  AcceptedResponseSchema,
  AccountSchema,
  ConfigurationResponseSchema,
  CredentialResponseSchema,
  ErrorEnvelopeSchema,
  ExchangeRequestSchema,
  HealthResponseSchema,
  LogoutRequestSchema,
  LogoutResponseSchema,
  MagicLinkRequestSchema,
  MagicLinkVerifySchema,
  ProfilePatchSchema,
  RefreshRequestSchema,
  TranscriptionMultipartSchema,
  TranscriptionResponseSchema,
  type ErrorEnvelope,
  type ExchangeRequest,
  type LogoutRequest,
  type MagicLinkRequest,
  type MagicLinkVerifyRequest,
  type ProfilePatchRequest,
  type RefreshRequest,
} from './schemas.js';
import {
  AccountRateLimiter,
  IdempotencyConflictError,
  TranscriptionIdempotencyStore,
  TranscriptionProviderError,
  unavailableTranscriptionProvider,
  type TranscriptionProvider,
} from './transcription.js';
import { SERVICE_VERSION } from './version.js';

interface BuildAppOptions {
  database: DatabaseDependency;
  authProvider?: AuthProvider;
  authStore?: AuthStore;
  transcriptionProvider?: TranscriptionProvider;
  transcriptionRateLimiter?: AccountRateLimiter;
  transcriptionIdempotency?: TranscriptionIdempotencyStore;
  transcriptionMaxBytes?: number;
  logger?: Exclude<FastifyServerOptions['logger'], boolean | undefined> | false;
}

const unavailableAuthStore: AuthStore = {
  createSession: () => Promise.reject(new AuthenticationError()),
  rotateSession: () => Promise.reject(new AuthenticationError()),
  revokeSession: () => Promise.reject(new AuthenticationError()),
  findAccount: () => Promise.reject(new AuthenticationError()),
  updateAccount: () => Promise.reject(new AuthenticationError()),
};

function errorEnvelope(
  requestId: string,
  code: string,
  message: string,
  retryable: boolean,
): ErrorEnvelope {
  return { code, message, retryable, requestId };
}

export async function buildApp({
  database,
  authProvider = unavailableAuthProvider,
  authStore = unavailableAuthStore,
  transcriptionProvider = unavailableTranscriptionProvider,
  transcriptionRateLimiter = new AccountRateLimiter(
    TRANSCRIPTION_RATE_LIMIT_PER_HOUR,
    60 * 60 * 1000,
  ),
  transcriptionIdempotency = new TranscriptionIdempotencyStore(),
  transcriptionMaxBytes = TRANSCRIPTION_MAX_BYTES,
  logger = false,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = fastify({
    ajv: { customOptions: { removeAdditional: false } },
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    logger,
  });
  app.decorateRequest('authenticatedAccount', null);
  const authenticate = createBearerAuthentication(authProvider, authStore);

  await app.register(multipart, {
    limits: { files: 1, fields: 0, parts: 1, fileSize: transcriptionMaxBytes },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ECHO API',
        version: SERVICE_VERSION,
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  app.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    const requestBytes = Number(request.headers['content-length'] ?? 0);
    const responseBytes = Number(reply.getHeader('content-length') ?? 0);

    request.log.info({
      event: 'request.completed',
      requestId: request.id,
      route: request.routeOptions.url ?? 'unmatched',
      latencyMs: reply.elapsedTime,
      result: reply.statusCode,
      requestBytes: Number.isFinite(requestBytes) ? requestBytes : 0,
      responseBytes: Number.isFinite(responseBytes) ? responseBytes : 0,
    });
  });

  app.addHook('onClose', async () => {
    await database.close();
  });

  app.setNotFoundHandler(async (request, reply) => {
    await reply
      .status(404)
      .send(
        errorEnvelope(
          request.id,
          'NOT_FOUND',
          'The requested route was not found.',
          false,
        ),
      );
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AuthenticationError) {
      await reply
        .status(401)
        .send(
          errorEnvelope(
            request.id,
            'INVALID_CREDENTIALS',
            'Authentication failed.',
            false,
          ),
        );
      return;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'validation' in error &&
      error.validation !== undefined
    ) {
      await reply
        .status(400)
        .send(
          errorEnvelope(
            request.id,
            'VALIDATION_ERROR',
            'The request is invalid.',
            false,
          ),
        );
      return;
    }

    request.log.error({
      event: 'request.failed',
      requestId: request.id,
      route: request.routeOptions.url ?? 'unmatched',
    });
    await reply
      .status(500)
      .send(
        errorEnvelope(
          request.id,
          'INTERNAL_ERROR',
          'An unexpected error occurred.',
          true,
        ),
      );
  });

  app.get(
    '/v1/health',
    {
      schema: {
        operationId: 'getHealth',
        tags: ['Public'],
        response: {
          200: HealthResponseSchema,
          503: HealthResponseSchema,
          500: ErrorEnvelopeSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        await database.checkHealth();
        return {
          status: 'ok' as const,
          version: SERVICE_VERSION,
          dependencies: { database: 'ok' as const },
        };
      } catch {
        return reply.status(503).send({
          status: 'degraded' as const,
          version: SERVICE_VERSION,
          dependencies: { database: 'unavailable' as const },
        });
      }
    },
  );

  app.get(
    '/v1/configuration',
    {
      schema: {
        operationId: 'getConfiguration',
        tags: ['Public'],
        response: {
          200: ConfigurationResponseSchema,
          500: ErrorEnvelopeSchema,
        },
      },
    },
    () => publicConfiguration,
  );

  function credentialResponse(
    session: ProviderSession,
    account: AccountRecord,
  ) {
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      tokenType: 'Bearer' as const,
      account,
    };
  }

  function credentialHash(credential: string): Buffer {
    return createHash('sha256').update(credential, 'utf8').digest();
  }

  function refreshSessionExpiry(): Date {
    return new Date(Date.now() + REFRESH_SESSION_LIFETIME_SECONDS * 1000);
  }

  app.post<{ Body: ExchangeRequest }>(
    '/v1/auth/exchange',
    {
      schema: {
        operationId: 'exchangeProviderCredential',
        tags: ['Authentication'],
        body: ExchangeRequestSchema,
        response: {
          200: CredentialResponseSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          500: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await authProvider.exchange(
        request.body.provider,
        request.body.assertion,
      );
      const account = await authStore.createSession(
        session.identity,
        credentialHash(session.refreshToken),
        refreshSessionExpiry(),
      );
      void reply.header('cache-control', 'no-store');
      return credentialResponse(session, account);
    },
  );

  app.post<{ Body: MagicLinkRequest }>(
    '/v1/auth/magic-link/request',
    {
      schema: {
        operationId: 'requestMagicLink',
        tags: ['Authentication'],
        body: MagicLinkRequestSchema,
        response: {
          202: AcceptedResponseSchema,
          400: ErrorEnvelopeSchema,
          500: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        await authProvider.requestMagicLink(request.body.email);
      } catch {
        // Always return the same result so account existence cannot be inferred.
      }
      return reply.status(202).send({ accepted: true as const });
    },
  );

  app.post<{ Body: MagicLinkVerifyRequest }>(
    '/v1/auth/magic-link/verify',
    {
      schema: {
        operationId: 'verifyMagicLink',
        tags: ['Authentication'],
        body: MagicLinkVerifySchema,
        response: {
          200: CredentialResponseSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          500: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await authProvider.verifyMagicLink(request.body);
      const account = await authStore.createSession(
        session.identity,
        credentialHash(session.refreshToken),
        refreshSessionExpiry(),
      );
      void reply.header('cache-control', 'no-store');
      return credentialResponse(session, account);
    },
  );

  app.post<{ Body: RefreshRequest }>(
    '/v1/auth/refresh',
    {
      schema: {
        operationId: 'refreshCredentials',
        tags: ['Authentication'],
        body: RefreshRequestSchema,
        response: {
          200: CredentialResponseSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          500: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await authProvider.refresh(request.body.refreshToken);
      const account = await authStore.rotateSession(
        session.identity,
        credentialHash(request.body.refreshToken),
        credentialHash(session.refreshToken),
        refreshSessionExpiry(),
      );
      if (!account) throw new AuthenticationError();
      void reply.header('cache-control', 'no-store');
      return credentialResponse(session, account);
    },
  );

  app.post<{ Body: LogoutRequest }>(
    '/v1/auth/logout',
    {
      preHandler: authenticate,
      schema: {
        operationId: 'logout',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        body: LogoutRequestSchema,
        response: {
          200: LogoutResponseSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          500: ErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const authenticated = request.authenticatedAccount;
      if (!authenticated) throw new AuthenticationError();
      const revoked = await authStore.revokeSession(
        authenticated.account.id,
        credentialHash(request.body.refreshToken),
      );
      if (!revoked) throw new AuthenticationError();
      await authProvider.logout(authenticated.accessToken);
      return { loggedOut: true as const };
    },
  );

  const supportedAudioTypes = new Set([
    'audio/mp4',
    'video/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'video/webm',
    'audio/mpeg',
  ]);
  const supportedAudioExtensions = new Set([
    '.m4a',
    '.mp4',
    '.wav',
    '.webm',
    '.mpeg',
    '.mp3',
  ]);

  app.post(
    '/v1/transcriptions',
    {
      preHandler: authenticate,
      // Multipart streams are validated explicitly below. This compiler keeps
      // the binary request contract in OpenAPI without asking AJV to consume it.
      validatorCompiler: () => () => true,
      schema: {
        operationId: 'createTranscription',
        tags: ['Transcription'],
        security: [{ bearerAuth: [] }],
        consumes: ['multipart/form-data'],
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: {
            'idempotency-key': {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        body: TranscriptionMultipartSchema,
        response: {
          200: TranscriptionResponseSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          409: ErrorEnvelopeSchema,
          413: ErrorEnvelopeSchema,
          415: ErrorEnvelopeSchema,
          422: ErrorEnvelopeSchema,
          429: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const authenticated = request.authenticatedAccount;
      if (!authenticated) throw new AuthenticationError();
      const idempotencyKey = request.headers['idempotency-key'];
      if (
        typeof idempotencyKey !== 'string' ||
        idempotencyKey.length === 0 ||
        idempotencyKey.length > 200
      )
        return reply
          .status(400)
          .send(
            errorEnvelope(
              request.id,
              'VALIDATION_ERROR',
              'A valid Idempotency-Key header is required.',
              false,
            ),
          );

      let temporaryDirectory: string | undefined;
      try {
        const part = await request.file({
          limits: {
            files: 1,
            fields: 0,
            parts: 1,
            fileSize: transcriptionMaxBytes,
          },
        });
        if (!part || part.fieldname !== 'audio')
          return await reply
            .status(422)
            .send(
              errorEnvelope(
                request.id,
                'UNUSABLE_AUDIO',
                'A usable audio file is required.',
                false,
              ),
            );
        const extension = extname(part.filename).toLowerCase();
        if (
          !supportedAudioTypes.has(part.mimetype.toLowerCase()) ||
          !supportedAudioExtensions.has(extension)
        )
          return await reply
            .status(415)
            .send(
              errorEnvelope(
                request.id,
                'UNSUPPORTED_AUDIO_FORMAT',
                'The audio format is not supported.',
                false,
              ),
            );

        temporaryDirectory = await mkdtemp(join(tmpdir(), 'echo-audio-'));
        const temporaryPath = join(temporaryDirectory, `upload${extension}`);
        await pipeline(
          part.file,
          createWriteStream(temporaryPath, { mode: 0o600 }),
        );
        if (part.file.truncated)
          return await reply
            .status(413)
            .send(
              errorEnvelope(
                request.id,
                'AUDIO_TOO_LARGE',
                'The audio file exceeds the 25 MB limit.',
                false,
              ),
            );

        let durationSeconds: number;
        try {
          const metadata = await parseFile(temporaryPath, { duration: true });
          const duration = metadata.format.duration;
          if (
            typeof duration !== 'number' ||
            !Number.isFinite(duration) ||
            duration <= 0
          )
            throw new Error('Missing duration');
          durationSeconds = duration;
        } catch {
          return await reply
            .status(422)
            .send(
              errorEnvelope(
                request.id,
                'UNUSABLE_AUDIO',
                'A usable audio file is required.',
                false,
              ),
            );
        }

        const requestHash = createHash('sha256')
          .update(await readFile(temporaryPath))
          .digest('hex');
        try {
          const result = await transcriptionIdempotency.run(
            authenticated.account.id,
            idempotencyKey,
            requestHash,
            async () => {
              if (!transcriptionRateLimiter.consume(authenticated.account.id))
                throw new TranscriptionProviderError('rate_limited');
              const transcription =
                await transcriptionProvider.transcribe(temporaryPath);
              return { ...transcription, durationSeconds };
            },
          );
          void reply.header('cache-control', 'no-store');
          return result;
        } catch (error: unknown) {
          if (error instanceof IdempotencyConflictError)
            return await reply
              .status(409)
              .send(
                errorEnvelope(
                  request.id,
                  'IDEMPOTENCY_CONFLICT',
                  'The idempotency key was already used for another request.',
                  false,
                ),
              );
          if (error instanceof TranscriptionProviderError) {
            const status =
              error.kind === 'unusable'
                ? 422
                : error.kind === 'rate_limited'
                  ? 429
                  : 503;
            const code =
              error.kind === 'unusable'
                ? 'UNUSABLE_AUDIO'
                : error.kind === 'rate_limited'
                  ? 'TRANSCRIPTION_RATE_LIMITED'
                  : 'TRANSCRIPTION_UNAVAILABLE';
            const message =
              error.kind === 'unusable'
                ? 'The audio could not be transcribed.'
                : error.kind === 'rate_limited'
                  ? 'The transcription rate limit was reached.'
                  : 'Transcription is temporarily unavailable.';
            return await reply
              .status(status)
              .send(
                errorEnvelope(
                  request.id,
                  code,
                  message,
                  error.kind !== 'unusable',
                ),
              );
          }
          throw error;
        }
      } catch (error: unknown) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'FST_REQ_FILE_TOO_LARGE'
        )
          return await reply
            .status(413)
            .send(
              errorEnvelope(
                request.id,
                'AUDIO_TOO_LARGE',
                'The audio file exceeds the 25 MB limit.',
                false,
              ),
            );
        throw error;
      } finally {
        if (temporaryDirectory)
          await rm(temporaryDirectory, { recursive: true, force: true });
      }
    },
  );

  app.get(
    '/v1/me',
    {
      preHandler: authenticate,
      schema: {
        operationId: 'getMe',
        tags: ['Account'],
        security: [{ bearerAuth: [] }],
        response: {
          200: AccountSchema,
          401: ErrorEnvelopeSchema,
          500: ErrorEnvelopeSchema,
        },
      },
    },
    (request) => {
      if (!request.authenticatedAccount) throw new AuthenticationError();
      return request.authenticatedAccount.account;
    },
  );

  app.patch<{ Body: ProfilePatchRequest }>(
    '/v1/me',
    {
      preHandler: authenticate,
      schema: {
        operationId: 'updateMe',
        tags: ['Account'],
        security: [{ bearerAuth: [] }],
        body: ProfilePatchSchema,
        response: {
          200: AccountSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          500: ErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      if (!request.authenticatedAccount) throw new AuthenticationError();
      return authStore.updateAccount(
        request.authenticatedAccount.account.id,
        request.body,
      );
    },
  );

  return app;
}
