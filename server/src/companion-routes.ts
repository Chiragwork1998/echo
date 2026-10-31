import { Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  COMPANION_AVATARS,
  CompanionProviderError,
  type CompanionInput,
  type CompanionProvider,
} from './companion.js';
import { ErrorEnvelopeSchema } from './schemas.js';
import { AccountRateLimiter } from './transcription.js';

const LOCAL_ORIGINS = ['http://localhost:8091', 'http://127.0.0.1:8091'];
const BodySchema = Type.Object(
  {
    avatarId: Type.Union(COMPANION_AVATARS.map((id) => Type.Literal(id))),
    messages: Type.Array(
      Type.Object(
        {
          role: Type.Union([Type.Literal('user'), Type.Literal('assistant')]),
          content: Type.String({ minLength: 1, maxLength: 1200 }),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 12 },
    ),
  },
  { additionalProperties: false },
);

type Authenticate = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;
export interface CompanionRouteOptions {
  provider: CompanionProvider;
  authenticate: Authenticate;
  localGuest?: boolean;
  allowedOrigins?: readonly string[];
  rateLimiter?: AccountRateLimiter;
}

function isLoopback(request: FastifyRequest): boolean {
  const address = request.raw.socket.remoteAddress;
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  );
}

function error(
  request: FastifyRequest,
  code: string,
  message: string,
  retryable = false,
) {
  return { code, message, retryable, requestId: request.id };
}

/** Only explicitly sent chat reaches the provider. No journal or conversation is stored here. */
export function registerCompanionRoutes(
  app: FastifyInstance,
  {
    provider,
    authenticate,
    localGuest = false,
    allowedOrigins = [],
    rateLimiter = new AccountRateLimiter(30, 60 * 60 * 1000),
  }: CompanionRouteOptions,
): void {
  const origins = new Set([...LOCAL_ORIGINS, ...allowedOrigins]);
  const allowLocalGuest = (request: FastifyRequest): boolean =>
    localGuest &&
    isLoopback(request) &&
    (!request.headers.origin || LOCAL_ORIGINS.includes(request.headers.origin));
  const cors = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    void reply.header('cache-control', 'no-store');
    const origin = request.headers.origin;
    if (origin) {
      if (!origins.has(origin)) {
        await reply
          .status(403)
          .send(
            error(request, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.'),
          );
        return;
      }
      void reply
        .header('access-control-allow-origin', origin)
        .header('vary', 'Origin');
    }
  };

  app.options(
    '/v1/companion/:operation',
    {
      schema: { hide: true },
      onRequest: cors,
    },
    (request, reply) => {
      if (
        request.params &&
        !['status', 'reply'].includes(
          (request.params as { operation: string }).operation,
        )
      )
        return reply.status(404).send();
      return reply
        .header('access-control-allow-methods', 'GET, POST, OPTIONS')
        .header('access-control-allow-headers', 'Content-Type, Authorization')
        .header('access-control-max-age', '600')
        .status(204)
        .send();
    },
  );

  app.get(
    '/v1/companion/status',
    {
      onRequest: cors,
      schema: {
        operationId: 'getCompanionStatus',
        tags: ['Companion'],
        response: {
          200: Type.Object({
            available: Type.Boolean(),
            model: Type.String(),
            requiresSignIn: Type.Boolean(),
          }),
          403: ErrorEnvelopeSchema,
        },
      },
    },
    (request) => ({
      available: provider.available,
      model: provider.model,
      requiresSignIn: !allowLocalGuest(request),
    }),
  );

  app.post<{ Body: CompanionInput }>(
    '/v1/companion/reply',
    {
      bodyLimit: 65_536,
      onRequest: cors,
      preHandler: async (request, reply) => {
        // An invalid supplied token never falls back to guest mode.
        if (request.headers.authorization || !allowLocalGuest(request))
          await authenticate(request, reply);
      },
      schema: {
        operationId: 'createCompanionReply',
        tags: ['Companion'],
        security: [{ bearerAuth: [] }],
        body: BodySchema,
        response: {
          200: Type.Object({ reply: Type.String(), model: Type.String() }),
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          429: ErrorEnvelopeSchema,
          502: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
          504: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const { messages } = request.body;
      if (
        messages.at(-1)?.role !== 'user' ||
        messages.some((item) => !item.content.trim()) ||
        messages.reduce((sum, item) => sum + item.content.length, 0) > 6000
      ) {
        return reply
          .status(400)
          .send(
            error(
              request,
              'VALIDATION_ERROR',
              'Send a message of up to 1200 characters with a short conversation.',
            ),
          );
      }
      if (!provider.available)
        return reply
          .status(503)
          .send(
            error(
              request,
              'COMPANION_UNAVAILABLE',
              'Your companion is not available right now.',
              true,
            ),
          );
      const accountId = request.authenticatedAccount?.account.id;
      const rateKey = accountId ? `account:${accountId}` : 'local-guest';
      if (!rateLimiter.consume(rateKey))
        return reply
          .header('retry-after', '3600')
          .status(429)
          .send(
            error(
              request,
              'COMPANION_RATE_LIMIT',
              'Please give your companion a little time before sending more.',
              true,
            ),
          );
      try {
        const text = await provider.reply(request.body);
        return { reply: text, model: provider.model };
      } catch (caught) {
        const kind =
          caught instanceof CompanionProviderError ? caught.kind : 'provider';
        const status =
          kind === 'rate_limit'
            ? 429
            : kind === 'unavailable'
              ? 503
              : kind === 'timeout'
                ? 504
                : 502;
        return reply
          .status(status)
          .send(
            error(
              request,
              kind === 'rate_limit'
                ? 'COMPANION_RATE_LIMIT'
                : kind === 'timeout'
                  ? 'COMPANION_TIMEOUT'
                  : kind === 'unavailable'
                    ? 'COMPANION_UNAVAILABLE'
                    : 'COMPANION_FAILED',
              'Your companion could not reply. Your message is still on your device; please try again.',
              true,
            ),
          );
      }
    },
  );
}
