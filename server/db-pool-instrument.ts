import type pg from 'pg';

// ─── B-DB-POOL-GUARD P2 (#1239, 2026-11-05): measure the pool before any time limit is set ─────────────────
// Pre-audit r2 P2 + Langston's Step-2 conditions and his Step-4 changes. What it measures, per checkout:
//   WAIT = hand-over − request. Stamped at the REQUEST, inside our wrapper around `pool.connect`, because pg-pool
//          emits nothing when a request joins its queue (pg-pool 3.7.0 `index.js:188`/`:208`, the two
//          `this._pendingQueue.push(...)` sites) and its `acquire` event (`:289`) fires only at hand-over, after the wait.
//   HOLD = release − hand-over (pg-pool 3.7.0 `:338` `this.emit('release', err, client)`, unconditional).
//   OPEN = checkouts handed over and not yet released, at flush (Langston CHANGE 2): the minute line is otherwise
//          release-keyed, so ten connections pinned across a minute (the 2026-11-04 incident shape) would read as the
//          quietest line, and a leaked checkout (never released) has no hold at all. The database side cannot tell a
//          leaked checkout from a healthy idle one; only the client side knows it is checked out.
// ⚠️ WHY WRAPPING AFTER drizzle IS CONSTRUCTED WORKS (load-bearing, invisible): `drizzle()` is built in `db.ts`
// BEFORE this attaches, and it still sees the wrappers because drizzle 0.39.1 reaches the pool by DYNAMIC property
// lookup — `this.client.query` (`drizzle-orm/node-postgres/session.js:106`), `await this.client.connect()` (`:138`).
// If a drizzle upgrade ever binds those at construction, this instrument goes blind to almost all traffic and the
// stand-in-pool unit tests cannot catch it. `db.ts` therefore attaches BEFORE `drizzle()` (Langston, Step 4 r2),
// so the instrument does not depend on that lookup staying dynamic.
// ONE stamp per checkout (Langston C2): pg-pool 3.7.0's `query()` calls `this.connect(cb)` synchronously at
// `index.js:399` — `    this.connect((err, client) => {` —
// so a `pool.query` passes BOTH wrappers. The query wrapper captures the caller's stack with ITSELF as the cut and
// hands that holder to the connect wrapper (which then does not capture again); the stamp is taken once, in connect.
// Because each wrapper cuts at itself, no wrapper frame is ever in a captured stack, so nothing is filtered by name
// (the bundle renames on collision — `pg` and `pg2` both appear in it — so a name filter could fail silently).
// LABEL (Langston C1, C3): the stack is CAPTURED on every checkout (V8 formats it lazily) and FORMATTED only when the
// label is used: a new minute max (wait or hold) or a hold over 1 s (CHANGE 1). The label is the first TWO frames
// outside node_modules, node internals and these two pool modules (callee<caller), so the six xStock
// `boundedTransaction` callers are told apart. No frame resolves ⇒ `query` or `connect`.
// CARRIER (Langston C3 on r1): one line a minute per pool to console.error ⇒ `error.log`, 14 daily files kept.
// Counts are in FIXED buckets so they SUM across minutes and restarts; `open`, `total`, `idle` and `waiting` are
// INSTANTANEOUS gauges read at flush and do NOT sum across lines. NO DATABASE WRITES.
// Staging runs ONE esbuild bundle (`dist/index.js`, not minified, no source map — measured 2026-11-05), so an app
// frame reads `fn@index.js:<line>`; a bundle line resolves against `dist/index.js` at the deployed `dist/BUILD_SHA`.

export const WAIT_BUCKETS_MS = [100, 1_000, 5_000, 10_000] as const;
export const HOLD_BUCKETS_MS = [1_000, 5_000, 10_000, 20_000, 25_000] as const;
const SLOW_HOLD_MS = HOLD_BUCKETS_MS[0];
const SITES_IN_LINE = 5;
const STACK_LIMIT = 30;
const SELF = /(^|\/)db-pool-(instrument|guards)\.(ts|js|mjs)$/;

const META = Symbol('dtPoolCheckout');
interface Holder { stack?: string }
interface CheckoutMeta { requestAt: number; handedAt: number; viaQuery: boolean; holder: Holder }
type Stamped = { [META]?: CheckoutMeta };

function capture(cut: (...args: never[]) => unknown): Holder {
  const holder: Holder = {};
  const prevLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = STACK_LIMIT;
  Error.captureStackTrace(holder, cut);
  Error.stackTraceLimit = prevLimit;
  return holder;
}

/** First two app frames as `fn@file:line<fn@file:line` (callee<caller), or null. Exported for the test. */
export function siteFromStack(stack: string | undefined): string | null {
  if (!stack) return null;
  const frames: string[] = [];
  for (const raw of stack.split('\n').slice(1)) {
    const m = raw.match(/^\s*at (?:async )?(?:(.+?) \()?(?:file:\/\/)?((?:[A-Za-z]:)?[^():]+):(\d+):\d+\)?\s*$/);
    if (!m) continue;
    const fn = (m[1] ?? '').replace(/^(Object|Module)\./, '').replace(/\s+/g, '_');
    const file = m[2].replace(/\\/g, '/');
    if (file.includes('node_modules') || file.startsWith('node:') || !file.includes('/') || SELF.test(file)) continue;
    const base = `${file.slice(file.lastIndexOf('/') + 1)}:${m[3]}`;
    frames.push(fn && fn !== '<anonymous>' ? `${fn}@${base}` : base);
    if (frames.length === 2) break;
  }
  return frames.length ? frames.join('<') : null;
}

interface Minute {
  checkouts: number;
  viaQuery: number;
  wait: number[];
  hold: number[];
  maxWaitMs: number;
  maxWaitSite: string;
  maxHoldMs: number;
  maxHoldSite: string;
  siteMaxHold: Map<string, number>;
}
const freshMinute = (): Minute => ({
  checkouts: 0, viaQuery: 0, wait: WAIT_BUCKETS_MS.map(() => 0), hold: HOLD_BUCKETS_MS.map(() => 0),
  maxWaitMs: 0, maxWaitSite: '-', maxHoldMs: 0, maxHoldSite: '-', siteMaxHold: new Map(),
});

export interface PoolInstrumentOptions {
  intervalMs?: number;
  log?: (line: string) => void;
  now?: () => number;
}

const instrumented = new WeakSet<object>();

/**
 * Wrap `pool.connect` / `pool.query` and listen for `release`. Idempotent. Returns `flush()` (writes and resets
 * the current minute; used by the timer and the test) and `stop()`. `stop()` clears the timer ONLY — the wrappers
 * and the `release` listener stay attached; it is not a detach (never called in production).
 */
export function attachPoolInstrument(pool: pg.Pool, label: string, opts: PoolInstrumentOptions = {}) {
  const log = opts.log ?? ((l: string) => console.error(l));
  const now = opts.now ?? (() => performance.now());
  if (instrumented.has(pool)) return { flush: () => {}, stop: () => {} };
  instrumented.add(pool);

  let minute = freshMinute();
  let open = 0; // NOT reset per minute: a gauge
  let pendingQueryHolder: Holder | null = null;
  const p = pool as unknown as {
    connect: (cb?: (err: Error | undefined, client?: unknown, done?: unknown) => void) => unknown;
    query: (...args: unknown[]) => unknown;
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  const origConnect = p.connect.bind(pool);
  const origQuery = p.query.bind(pool);

  p.query = function instrumentedQuery(...args: unknown[]) {
    pendingQueryHolder = capture(instrumentedQuery);
    try {
      return origQuery(...args);
    } finally {
      pendingQueryHolder = null;
    }
  };

  p.connect = function instrumentedConnect(cb?: (err: Error | undefined, client?: unknown, done?: unknown) => void) {
    const viaQuery = pendingQueryHolder !== null;
    const holder = pendingQueryHolder ?? capture(instrumentedConnect);
    pendingQueryHolder = null; // consumed by the query's own connect call only
    const requestAt = now();
    const stamp = (client: unknown) => {
      if (!client) return;
      (client as Stamped)[META] = { requestAt, handedAt: now(), viaQuery, holder };
      open += 1;
    };
    if (typeof cb === 'function') {
      return origConnect((err, client, done) => {
        if (!err) stamp(client);
        cb(err, client, done);
      });
    }
    return (origConnect() as Promise<unknown>).then((client) => {
      stamp(client);
      return client;
    });
  };

  const siteOf = (m: CheckoutMeta) => siteFromStack(m.holder.stack) ?? (m.viaQuery ? 'query' : 'connect');

  pool.on('release', (_err: Error | undefined, client: unknown) => {
    const m = (client as Stamped)[META];
    if (!m) return;
    (client as Stamped)[META] = undefined;
    open = Math.max(0, open - 1);
    const waitMs = m.handedAt - m.requestAt;
    const holdMs = now() - m.handedAt;
    minute.checkouts += 1;
    if (m.viaQuery) minute.viaQuery += 1;
    WAIT_BUCKETS_MS.forEach((b, i) => { if (waitMs > b) minute.wait[i] += 1; });
    HOLD_BUCKETS_MS.forEach((b, i) => { if (holdMs > b) minute.hold[i] += 1; });
    // Langston CHANGE 1: format the stack only when the label is USED.
    if (!(waitMs > minute.maxWaitMs || holdMs > minute.maxHoldMs || holdMs > SLOW_HOLD_MS)) return;
    const site = siteOf(m);
    if (waitMs > minute.maxWaitMs) { minute.maxWaitMs = waitMs; minute.maxWaitSite = site; }
    if (holdMs > minute.maxHoldMs) { minute.maxHoldMs = holdMs; minute.maxHoldSite = site; }
    if (holdMs > SLOW_HOLD_MS) minute.siteMaxHold.set(site, Math.max(minute.siteMaxHold.get(site) ?? 0, holdMs));
  });

  const flush = () => {
    const m = minute;
    minute = freshMinute();
    const sites = [...m.siteMaxHold.entries()].sort((a, b) => b[1] - a[1]).slice(0, SITES_IN_LINE)
      .map(([s, ms]) => `${s}=${Math.round(ms)}`).join('|') || '-';
    log(
      `[B-DB-POOL-GUARD][POOL_MINUTE_V1] pool=${label} checkouts=${m.checkouts} via_query=${m.viaQuery} ` +
        `via_connect=${m.checkouts - m.viaQuery} ` +
        WAIT_BUCKETS_MS.map((b, i) => `wait_gt_${b}ms=${m.wait[i]}`).join(' ') + ' ' +
        HOLD_BUCKETS_MS.map((b, i) => `hold_gt_${b}ms=${m.hold[i]}`).join(' ') + ' ' +
        `max_wait_ms=${Math.round(m.maxWaitMs)} max_wait_site=${m.maxWaitSite} ` +
        `max_hold_ms=${Math.round(m.maxHoldMs)} max_hold_site=${m.maxHoldSite} slow_hold_sites=${sites} ` +
        // instantaneous gauges at flush — they do NOT sum across lines
        `open=${open} total=${p.totalCount ?? '-'} idle=${p.idleCount ?? '-'} waiting=${p.waitingCount ?? '-'}`,
    );
  };
  const timer = setInterval(flush, opts.intervalMs ?? 60_000);
  timer.unref?.();
  return { flush, stop: () => clearInterval(timer) };
}
