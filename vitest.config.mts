import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    env: { LOG_LEVEL: 'error', NODE_ENV: 'test' },
    testTimeout: 15000,
  },
});
