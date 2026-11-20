// B-DB-APP-TLS T-P2: the side-effect half of the boot check. `server/index.ts` imports this module FIRST, so ESM
// evaluation order runs it before any module that builds a pool (`server/db.ts` is reached transitively by the
// imports after it). It reads the environment the process was started with (PM2 passes `--env-file=.env`, so
// DATABASE_URL is present before any module runs). The logic and its reasons: `db-tls-boot-check.ts`.
// ⚠️ Kept OUT of `server/db.ts` on purpose: every unit test imports db.ts against a plain local test database
// (vitest.config.ts, CI's service container has no TLS), and a check there would need a test bypass — which is the
// fallback this check exists to forbid.
import { assertDatabaseTransport } from './db-tls-boot-check.js';

const { host } = assertDatabaseTransport(process.env.DATABASE_URL, process.env);
console.log(`[DB_TLS_BOOT_CHECK] passed: verified TLS with a pinned root to host=${host}`);
