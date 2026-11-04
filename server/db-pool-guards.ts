import type pg from 'pg';

// ─── B-DB-POOL-GUARD OBJ-1 / OBJ-1b (#1239, 2026-11-04): an ended connection must never crash the process ───
// ONE home for the guard, so every in-process pg Pool gets the same two listeners (Langston, OBJ-1 ruling: there
// are three in-process pools — the app pool `server/db.ts`, the crew board's `crew-coordination.ts`, which states
// the rule with its own empty listener, and the weekend prewarm `scripts/b-new-34b-prewarm-snapshot.ts`).
//
// (1) IDLE clients. When the database or the network ends a connection sitting idle in the pool, pg-pool removes
//     it and calls `pool.emit('error', err, client)` (pg-pool 3.7.0 `index.js:51-62`, `makeIdleListener`). An
//     'error' event with no listener throws. MEASURED: an operator ended ten stuck connections at 2026-11-04
//     18:16:23Z (`57P01`) and PM2 restarted the app at 18:16:28Z.
// (2) CHECKED-OUT clients. pg-pool removes its error listener from a client it hands out (`_acquireClient`,
//     `client.removeListener('error', idleListener)`) and restores it on release; pg's Client emits 'error' on a
//     connection failure even mid-query (`client.js` `_handleErrorEvent`). `pool.query()` covers itself with a
//     `once('error')`, but a client from `pool.connect()` — every drizzle transaction
//     (`drizzle-orm/node-postgres/session.js:138`) — has none. MEASURED on staging 2026-11-04, pg 8.13.1: a held
//     transaction ended by the server (`25P04`) crashed the process ("Unhandled 'error' event", exit 1); with
//     listener (2), exit 0 and the next query ran on a fresh connection.
// In both cases the pool already discards the dead client (on removal, or on release because it is no longer
// queryable), so the listeners only LOG and COUNT. Volume is bounded by OBJ-5's per-window alert, not here.

export interface PoolGuardCounts {
  idleClientErrors: number;
  checkedOutClientErrors: number;
}

const counts = new Map<string, PoolGuardCounts>();
const guarded = new WeakSet<object>();
const CHECKED_OUT = Symbol('dtPoolCheckedOut');
type GuardedClient = {
  [CHECKED_OUT]?: boolean;
  on: (event: 'error', fn: (err: Error & { code?: string }) => void) => unknown;
};

function line(tag: string, label: string, pool: pg.Pool, err: Error & { code?: string }, count: number): string {
  return (
    `[B-DB-POOL-GUARD][${tag}] pool=${label} code=${err?.code ?? 'none'} message=${err?.message || String(err)} ` +
    `total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount} count=${count}`
  );
}

/** Attach both listeners to `pool` once. Safe to call again on the same pool (no second set is added). */
export function attachPoolGuards(pool: pg.Pool, label: string): void {
  if (guarded.has(pool)) return;
  guarded.add(pool);
  const c: PoolGuardCounts = counts.get(label) ?? { idleClientErrors: 0, checkedOutClientErrors: 0 };
  counts.set(label, c);

  pool.on('error', (err: Error & { code?: string }) => {
    c.idleClientErrors += 1;
    console.error(line('POOL_IDLE_CLIENT_ERROR', label, pool, err, c.idleClientErrors));
  });
  pool.on('connect', (client) => {
    const gc = client as unknown as GuardedClient;
    gc.on('error', (err) => {
      if (!gc[CHECKED_OUT]) return; // idle: the pool listener above owns it
      c.checkedOutClientErrors += 1;
      console.error(line('POOL_CHECKED_OUT_CLIENT_ERROR', label, pool, err, c.checkedOutClientErrors));
    });
  });
  pool.on('acquire', (client) => {
    (client as unknown as GuardedClient)[CHECKED_OUT] = true;
  });
  pool.on('release', (_err, client) => {
    (client as unknown as GuardedClient)[CHECKED_OUT] = false;
  });
}

/** Process-lifetime counts for one pool label (zeroed by a restart; OBJ-5 alerts on occurrences per window). */
export function getPoolGuardCounts(label: string): PoolGuardCounts {
  return { ...(counts.get(label) ?? { idleClientErrors: 0, checkedOutClientErrors: 0 }) };
}
