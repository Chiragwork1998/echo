import { createHash, randomUUID } from 'node:crypto';

import swagger from '@fastify/swagger';
import fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  LogController,
} from 'fastify';

import {
  AuthenticationError,
  unavailableAuthProvider,
  type AuthProvider,
  type ProviderSession,
} from './auth.js';
import { createBearerAuthentication } from './auth-middleware.js';
import { publicConfiguration } from './config.js';
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
  type ErrorEnvelope,
  type ExchangeRequest,
  type LogoutRequest,
  type MagicLinkRequest,
  type MagicLinkVerifyRequest,
  type ProfilePatchRequest,
  type RefreshRequest,
} from './schemas.js';
import { SERVICE_VERSION } from './version.js';

interface BuildAppOptions {
  database: DatabaseDependency;
  authProvider?: AuthProvider;
  authStore?: AuthStore;
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

  function expiry(expiresIn: number): Date {
    return new Date(Date.now() + expiresIn * 1000);
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
        expiry(session.expiresIn),
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
        expiry(session.expiresIn),
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
        expiry(session.expiresIn),
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
