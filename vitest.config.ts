import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      // P19-B2 follow-up (2026-06-13): external-macro-feed.ts (CoinGecko crypto-macro
      // feed) throws at MODULE LOAD if COINGECKO_API_TIER is unset (intentional
      // no-silent-fallback hardening, CLAUDE.md §11). Any test importing a module
      // that transitively imports it would throw at import time. Supply it here so
      // EVERY run — CI, the C:\dev bench, and local — has it deterministically, with
      // no reliance on the CI workflow env or a manual bench export. 'demo' tier + no
      // key = unauthenticated demo endpoint (tests do not hit the real API). This also
      // makes the inline `process.env.COINGECKO_API_TIER='demo'` workarounds in 3 unit
      // tests redundant (left in place; harmless).
      COINGECKO_API_TIER: 'demo',
      COINGECKO_API_KEY: '',
    },
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
