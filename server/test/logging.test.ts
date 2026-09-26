import { expect, it, vi } from 'vitest';

import { buildApp } from '../src/application.js';
import { createLoggerOptions } from '../src/logger.js';

it('logs operational metadata without request bodies or credentials', async () => {
  const logLines: string[] = [];
  const app = await buildApp({
    database: {
      checkHealth: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    },
    logger: {
      ...createLoggerOptions('info'),
      stream: {
        write(message) {
          logLines.push(message);
        },
      },
    },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/v1/not-a-route',
    headers: {
      authorization: 'Bearer must-not-appear',
      cookie: 'session=must-not-appear',
    },
    payload: {
      journalText: 'private journal content must not appear',
    },
  });
  await app.close();

  const output = logLines.join('');
  expect(response.statusCode).toBe(404);
  expect(output).toContain('request.completed');
  expect(output).toContain('requestId');
  expect(output).toContain('latencyMs');
  expect(output).not.toContain('must-not-appear');
  expect(output).not.toContain('private journal content');
  expect(output).not.toContain('journalText');
});
