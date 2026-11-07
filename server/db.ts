import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { attachPoolGuards, getPoolGuardCounts } from './db-pool-guards.js';
import { attachPoolInstrument } from './db-pool-instrument.js';

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

// ─── B-DB-POOL-GUARD P3 (#1239, increment 3, 2026-11-07): the server-side bounds, set from 56 h of P2 readings ───
// Readings and the value derivation: `B_DB_POOL_GUARD_PRE_AUDIT.md` "AMENDMENT inc 3" (Langston-approved).
// ⛔ INVARIANT — statement_timeout (25 s) < query_timeout (30 s), and it is the ORDER that matters: pg 8.13.1's
// `query_timeout` (client.js:542-564) errors the caller and drops the callback but sends NO cancel and does NOT
// destroy the connection, so before this commit the server ran an abandoned statement for up to its own 2 min
// default while the app had already given up — the 2026-11-04 stall (a connection handed back inside an open
// transaction, ten of them taking every slot; `xstock-bar-availability.ts`). With the server bound FIRST, the server
// cancels (SQLSTATE 57014), the error arrives on the connection the normal way, and ROLLBACK runs at once. Same
// ~20 % ratio as `xstock-db-snapshot.ts` (server 2,000 ms, client 2,500 ms). Lowering query_timeout toward 25 s
// would make the no-cancel path MORE reachable, so it stays at 30 s. Any per-transaction `SET LOCAL
// statement_timeout` (XSTOCK_TX_STATEMENT_TIMEOUT_MS, the Drift Dashboard's 4 s) must stay BELOW 25 s.
const POOL_STATEMENT_TIMEOUT_MS = 25_000;
const POOL_QUERY_TIMEOUT_MS = 30_000;
if (!(POOL_STATEMENT_TIMEOUT_MS < POOL_QUERY_TIMEOUT_MS)) {
  throw new Error('[DB_POOL_INIT] statement_timeout must be below query_timeout (B-DB-POOL-GUARD P3 invariant)');
}

const POOL_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  query_timeout: POOL_QUERY_TIMEOUT_MS,
  // P3: server-side statement bound (see the invariant above). Measured: hold > 25 s 30 times in 56 h, 28 of them
  // beside a logged 30 s client abandon; no write evidenced completing between 25 s and 30 s.
  statement_timeout: POOL_STATEMENT_TIMEOUT_MS,
  // P3: a connection idle INSIDE a transaction is ended by the server after 60 s (was 0 = never). Longest transaction
  // hold measured: 26.5 s.
  idle_in_transaction_session_timeout: 60_000,
  // P3: a caller waits at most 10 s for a free slot, then gets pg-pool's 'timeout exceeded when trying to connect'
  // (was: forever). Measured: max wait 1,167 ms; > 1 s twice in 6.2 M checkouts.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  max: 10,
  application_name: 'dawntrader_main',
} as const;

export const pool = new Pool(POOL_CONFIG);
// B-DB-POOL-GUARD P2: one line a minute measuring how long callers wait for a connection and how long they hold
// it, before any time limit is chosen (`server/db-pool-instrument.ts`; tag `[B-DB-POOL-GUARD][POOL_MINUTE_V2]`).
// Attached BEFORE drizzle() so the wrappers are in place whatever drizzle does with the pool's methods.
attachPoolInstrument(pool, POOL_CONFIG.application_name);
export const db = drizzle({ client: pool, schema });

// ─── B-DB-POOL-GUARD OBJ-1 / OBJ-1b (#1239, 2026-11-04): an ended connection never crashes the app ─────
// Both listeners (idle clients and checked-out clients) live in ONE module shared by every in-process pool;
// the mechanism and the staging measurements are in `server/db-pool-guards.ts`. OBJ-5 reads the counts.
attachPoolGuards(pool, POOL_CONFIG.application_name);
export function getPoolIdleClientErrorCount(): number {
  return getPoolGuardCounts(POOL_CONFIG.application_name).idleClientErrors;
}
export function getPoolCheckedOutClientErrorCount(): number {
  return getPoolGuardCounts(POOL_CONFIG.application_name).checkedOutClientErrors;
}

// Boot-time confirmation log so config landing is visible in PM2 logs without
// requiring a DB query. Per Langston Step 1 Q6 #1.
console.log(
  `[DB_POOL_INIT] application_name=${POOL_CONFIG.application_name} ` +
    `keepAlive=${POOL_CONFIG.keepAlive} ` +
    `keepAliveInitialDelayMillis=${POOL_CONFIG.keepAliveInitialDelayMillis} ` +
    `query_timeout=${POOL_CONFIG.query_timeout} ` +
    `statement_timeout=${POOL_CONFIG.statement_timeout} ` +
    `idle_in_transaction_session_timeout=${POOL_CONFIG.idle_in_transaction_session_timeout} ` +
    `connectionTimeoutMillis=${POOL_CONFIG.connectionTimeoutMillis} ` +
    `idleTimeoutMillis=${POOL_CONFIG.idleTimeoutMillis} ` +
    `max=${POOL_CONFIG.max}`
);
