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

// ─── B-DB-POOL-GUARD OBJ-1 (#1239, 2026-11-04): an ended connection must never crash the app ──────────
// When the database (or the network) ends a connection that is sitting IDLE in the pool, pg-pool removes
// it and calls `pool.emit('error', err, client)` (pg-pool 3.7.0 `index.js:51-62`, `makeIdleListener`).
// An 'error' event with no listener throws, so the whole process restarts. MEASURED: on 2026-11-04 an
// operator ended ten stuck connections at 18:16:23Z (`57P01 terminating connection due to administrator
// command` in staging error.log) and PM2 restarted the app at 18:16:28Z.
// The pool has ALREADY dropped the client by the time this fires and the next acquire opens a fresh one,
// so there is nothing to repair here: log one line with the code and the pool's counts, and count it.
// (The crew board's pool states the same rule with an empty listener, `crew-coordination.ts`; this one
// logs, so an ended connection is visible rather than swallowed.)
let poolIdleClientErrors = 0;
export function getPoolIdleClientErrorCount(): number {
  return poolIdleClientErrors;
}
pool.on('error', (err: Error & { code?: string }) => {
  poolIdleClientErrors += 1;
  console.error(
    `[B-DB-POOL-GUARD][POOL_IDLE_CLIENT_ERROR] code=${err?.code ?? 'none'} ` +
      `message=${err?.message ?? String(err)} total=${pool.totalCount} idle=${pool.idleCount} ` +
      `waiting=${pool.waitingCount} count=${poolIdleClientErrors}`,
  );
});

// ─── B-DB-POOL-GUARD OBJ-1b: …and neither may one that is CHECKED OUT ────────────────────────────────────
// pg-pool removes its own error listener from a client when it hands it out (`index.js` `_acquireClient`:
// `client.removeListener('error', idleListener)`) and restores it on release. pg's Client emits 'error' on
// any connection-level failure even while a query is running (`client.js` `_handleErrorEvent`: reject the
// queries, then `this.emit('error')`). `pool.query()` covers itself with a `once('error')` for its one query;
// a drizzle TRANSACTION holds the client from `pool.connect()` (`drizzle-orm/node-postgres/session.js:138`)
// with no listener at all. MEASURED on staging 2026-11-04 with pg 8.13.1: a pooled client checked out in a
// transaction and ended by the server (`25P04 terminating connection due to transaction timeout`) crashed
// the Node process with "Unhandled 'error' event", even with a pool 'error' listener; the same end on a
// client released back to the pool reached the pool listener and the process lived.
// So every client gets a permanent listener when it is created. It logs only while the client is checked
// out (the pool listener above already logs idle ones); the caller's query has already been rejected, and
// pg-pool discards the client on release because it is no longer queryable.
let poolCheckedOutClientErrors = 0;
export function getPoolCheckedOutClientErrorCount(): number {
  return poolCheckedOutClientErrors;
}
const CHECKED_OUT = Symbol('dtPoolCheckedOut');
type GuardedClient = { [CHECKED_OUT]?: boolean; on: (event: 'error', fn: (err: Error & { code?: string }) => void) => unknown };
pool.on('connect', (client) => {
  const c = client as unknown as GuardedClient;
  c.on('error', (err) => {
    if (!c[CHECKED_OUT]) return; // idle: the pool's own listener and the one above handle it
    poolCheckedOutClientErrors += 1;
    console.error(
      `[B-DB-POOL-GUARD][POOL_CHECKED_OUT_CLIENT_ERROR] code=${err?.code ?? 'none'} ` +
        `message=${err?.message ?? String(err)} total=${pool.totalCount} idle=${pool.idleCount} ` +
        `waiting=${pool.waitingCount} count=${poolCheckedOutClientErrors}`,
    );
  });
});
pool.on('acquire', (client) => {
  (client as unknown as GuardedClient)[CHECKED_OUT] = true;
});
pool.on('release', (_err, client) => {
  (client as unknown as GuardedClient)[CHECKED_OUT] = false;
});

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
