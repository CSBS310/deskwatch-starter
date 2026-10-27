import { defineConfig } from 'vitest/config';

// Pin the time zone so date tests behave the same on every laptop and in CI.
process.env.TZ = 'America/Los_Angeles';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        branches: 70,
      },
    },
  },
});
