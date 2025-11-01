import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    threads: false,
    maxConcurrency: 1,
    testTimeout: Number(process.env.VITEST_TIMEOUT ?? 20000),
    include: ['tests/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});

