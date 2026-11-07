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
//     transaction ended by the server crashed the process ("Unhandled 'error' event", exit 1); with listener (2),
//     exit 0 and the next query ran on a fresh connection. (That run is the integration evidence; this repo's unit
//     tests stub the emitters, so a pg / pg-pool version bump that changes this wiring is NOT caught by CI.)
//     WHAT THE EVENT CARRIES (Langston, Step 4): with a query IN FLIGHT the server's FATAL (e.g. `25P04`) goes to
//     that query's rejection, and the 'error' event that follows is pg's own `Connection terminated unexpectedly`
//     with NO code (`client.js:130-149`), so the line logs `code=none` and cannot tell a timeout from a lost network
//     link — the CALLER's rejection carries the code. With no query in flight (e.g. `25P03` idle-in-transaction) the
//     event itself carries the code.
// In both cases the pool already discards the dead client (on removal, or on release because it is no longer
// queryable), so the listeners only LOG and COUNT. Volume is bounded by OBJ-5's per-window alert, not here.
// POPULATIONS (Langston): `checkedOutClientErrors` counts connection errors on checked-out clients, INCLUDING plain
// `pool.query()` ones that were already safe, so it is not a count of crashes prevented. Until OBJ-5 reads the
// counts, the LOG LINE is the carrier. Since B-DB-POOL-GUARD P4 the counts' reader is the `25P03` incident body in
// `server/db-pool-alerts.ts` (`getPoolGuardCounts`), which states the 2:1 relation of the totals to incidents.

export interface PoolGuardCounts {
  idleClientErrors: number;
  checkedOutClientErrors: number;
}

const counts = new Map<string, PoolGuardCounts>();
// B-DB-POOL-GUARD P4 (OBJ-5, increment 3b r2): subscribers to a CHECKED-OUT client's connection error, per pool label.
// The alert module reads the `25P03` arm here (idle-in-transaction ended by the server, deterministic, one per
// incident) and puts the counts above into the incident body — the counters' reader (Langston C6).
type CheckedOutErrorListener = (err: Error & { code?: string }) => void;
const checkedOutListeners = new Map<string, Set<CheckedOutErrorListener>>();
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
  if (!checkedOutListeners.has(label)) checkedOutListeners.set(label, new Set());

  pool.on('error', (err: Error & { code?: string }) => {
    c.idleClientErrors += 1;
    console.error(line('POOL_IDLE_CLIENT_ERROR', label, pool, err, c.idleClientErrors));
  });
  pool.on('connect', (client) => {
    const gc = client as unknown as GuardedClient;
    gc.on('error', (err) => {
      // Langston C2: always LOG (a wrong flag must never mean silence); COUNT only while checked out. An IDLE error
      // therefore writes TWO lines — this one (checkedOut=false) and the pool listener's POOL_IDLE_CLIENT_ERROR — in
      // an order that is NOT fixed (pg-pool registers its listener before ours on a new client and after ours once
      // the client has been released once). Anything counting lines must count one tag, not both (OBJ-5).
      const checkedOut = !!gc[CHECKED_OUT];
      if (checkedOut) {
        c.checkedOutClientErrors += 1;
        console.error(`${line('POOL_CLIENT_ERROR', label, pool, err, c.checkedOutClientErrors)} checkedOut=true`);
        for (const fn of checkedOutListeners.get(label) ?? []) {
          try { fn(err); } catch (e) { console.error(`[B-DB-POOL-GUARD][GUARD_LISTENER_THREW] pool=${label} ${(e as Error)?.message ?? e}`); }
        }
      } else {
        // no count field here: on this path the checked-out counter did not move
        console.error(
          `[B-DB-POOL-GUARD][POOL_CLIENT_ERROR] pool=${label} code=${err?.code ?? 'none'} message=${err?.message || String(err)} ` +
            `total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount} checkedOut=false`,
        );
      }
    });
  });
  pool.on('acquire', (client) => {
    (client as unknown as GuardedClient)[CHECKED_OUT] = true;
  });
  pool.on('release', (_err, client) => {
    (client as unknown as GuardedClient)[CHECKED_OUT] = false;
  });
}

/** Subscribe to checked-out client connection errors on one guarded pool. THROWS when `label` was never guarded (the
 *  same rule as `subscribePoolFlush`: a subscription that can never fire must fail loudly). Returns an unsubscribe. */
export function subscribeCheckedOutClientErrors(label: string, fn: CheckedOutErrorListener): () => void {
  const set = checkedOutListeners.get(label);
  if (!set) throw new Error(`subscribeCheckedOutClientErrors: pool '${label}' is not guarded (attachPoolGuards was never called for it)`);
  set.add(fn);
  return () => { set.delete(fn); };
}

/** Process-lifetime counts for one pool label (zeroed by a restart; OBJ-5 alerts on occurrences per window). */
export function getPoolGuardCounts(label: string): PoolGuardCounts {
  return { ...(counts.get(label) ?? { idleClientErrors: 0, checkedOutClientErrors: 0 }) };
}
