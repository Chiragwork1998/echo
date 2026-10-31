import type { FastifyServerOptions } from 'fastify';

type LoggerOptions = Exclude<
  FastifyServerOptions['logger'],
  boolean | undefined
>;

export function createLoggerOptions(level: string): LoggerOptions {
  return {
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.proxy-authorization',
        'req.headers.x-api-key',
        'res.headers.set-cookie',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req(request) {
        return {
          id: request.id,
          method: request.method,
          url: request.url,
        };
      },
      res(response) {
        return {
          statusCode: response.statusCode,
        };
      },
    },
  };
}
