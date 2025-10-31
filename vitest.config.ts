import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    threads: false,
    maxConcurrency: 1,
    testTimeout: Number(process.env.VITEST_TIMEOUT ?? 20000),
  },
});

