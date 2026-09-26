import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/application.js';

describe('OpenAPI contract', () => {
  it('publishes only the implemented public operations', async () => {
    const app = await buildApp({
      database: {
        checkHealth: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      },
    });
    await app.ready();

    const document = app.swagger();

    expect(Object.keys(document.paths ?? {}).sort()).toEqual([
      '/v1/auth/exchange',
      '/v1/auth/logout',
      '/v1/auth/magic-link/request',
      '/v1/auth/magic-link/verify',
      '/v1/auth/refresh',
      '/v1/configuration',
      '/v1/health',
      '/v1/me',
    ]);
    expect(document.paths?.['/v1/health']?.get?.operationId).toBe('getHealth');
    expect(document.paths?.['/v1/configuration']?.get?.operationId).toBe(
      'getConfiguration',
    );
    await app.close();
  });
});
