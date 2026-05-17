import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// ─── B-NEW-40 (2026-05-17): pg pool hardening ──────────────────────────────
// Closes the root cause of recurring TEC_STALE_FAIL_CLOSED incidents (2026-05-15
// 17:13 UTC and 2026-05-16 11:14 UTC) plus the broader silent-TCP-death failure
// mode that existed pre-B79.TEC but was absorbed quietly by the old await-based
// resolveTECConfig pattern. See B_NEW_40_SCOPE.md and B_NEW_40_PRE_AUDIT.md.
//
// Layer-by-layer rationale:
//
// - `keepAlive: true` + `keepAliveInitialDelayMillis: 10_000`
//     Enables SO_KEEPALIVE on every pool socket. After 10s of socket idle, the
//     OS starts sending TCP keepalive probes. If the underlying network path
//     has gone silently dead (NAT timeout, intermediate router drop without
//     RST), probes go unanswered and pg-pool surfaces the dead socket as an
//     error event — in-flight queries reject with a connection error, the
//     pool removes the client, no silent retry. This is the upstream cause-
//     layer fix.
//
// - `query_timeout: 30_000`
//     pg-client-side abort on any individual query running >30s. Catches any
//     other hang source we haven't identified, including the case where the
//     query was sent before keepalive detected the dead socket. 30s ceiling
//     is well above any legitimate single-query duration in the codebase
//     (audited per B_NEW_40_PRE_AUDIT.md §2.3 — partition-exporter chunks at
//     1000 rows, drift-dashboard uses its own 4s SET LOCAL statement_timeout,
//     replay-ablation chunks at 5000, archive writers are pre-chunked, B74
//     partition CREATE TABLEs are sub-second).
//
// - `idleTimeoutMillis: 30_000`
//     Extends idle window from pg-pool default 10s to 30s. Purely
//     connection-churn tuning — lower churn (each new connection costs TCP +
//     TLS + auth round-trip) at the cost of more time for an idle socket to
//     have its NAT/firewall state dropped. Resilience against dead-socket-
//     reuse is provided by `keepAlive` (above), NOT by this setting. Audited
//     per Langston Step 2 Q4: longer idle window is fine because keepalive
//     carries the resilience load.
//
// - `max: 10`
//     Matches pg-pool default. Made explicit for operator visibility — when
//     `pg_stat_activity` shows queue waits, future operators can see the
//     ceiling without consulting pg-pool internals. If staging soak shows
//     pool saturation under hot load (23 importing modules + signal pipeline
//     + archive writers + xstock scanner concurrent), raise to 15 or 20;
//     do NOT lower idleTimeoutMillis (keepalive already covers dead-socket
//     concerns).
//
// - `application_name: 'dawntrader_main'`
//     Tags this connection class in `pg_stat_activity` and Supabase's project
//     dashboard. Future operators investigating slow queries / connection
//     leaks / pool exhaustion can filter by this name to isolate the trading
//     app from any admin/migration tooling sharing the database.
//
// Central Clock alignment: pool config is kernel/library layer. No new
// recurring schedules introduced. No Central Clock interaction. (See
// B_NEW_40_PRE_AUDIT.md §2.6 for the per-component audit.)

const POOL_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  query_timeout: 30_000,
  idleTimeoutMillis: 30_000,
  max: 10,
  application_name: 'dawntrader_main',
} as const;

export const pool = new Pool(POOL_CONFIG);
export const db = drizzle({ client: pool, schema });

// Boot-time confirmation log so config landing is visible in PM2 logs without
// requiring a DB query. Per Langston Step 1 Q6 #1.
console.log(
  `[DB_POOL_INIT] application_name=${POOL_CONFIG.application_name} ` +
    `keepAlive=${POOL_CONFIG.keepAlive} ` +
    `keepAliveInitialDelayMillis=${POOL_CONFIG.keepAliveInitialDelayMillis} ` +
    `query_timeout=${POOL_CONFIG.query_timeout} ` +
    `idleTimeoutMillis=${POOL_CONFIG.idleTimeoutMillis} ` +
    `max=${POOL_CONFIG.max}`
);
