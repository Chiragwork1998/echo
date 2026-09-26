import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reporter: ['text', 'json-summary'],
    },
    environment: 'node',
    fileParallelism: false,
    restoreMocks: true,
    testTimeout: 30_000,
  },
});
