import type pg from 'pg';

// ─── B-DB-POOL-GUARD P2 (#1239, 2026-11-05): measure the pool before any time limit is set ─────────────────
// Pre-audit r2 P2 + Langston's three Step-2 conditions. What it measures, per checkout of a connection:
//   WAIT = hand-over − request. Stamped at the REQUEST, inside our wrapper around `pool.connect`, because pg-pool
//          emits nothing when a request joins its queue (`index.js:188/:208`) and its `acquire` event fires only
//          at hand-over, after the wait.
//   HOLD = release − hand-over (pg-pool's `release` event).
// ONE stamp per checkout (Langston C2): pg-pool's `query()` calls `this.connect(...)` (`index.js:399`), so a
// `pool.query` goes through BOTH wrappers; the query wrapper only sets a flag that the connect wrapper reads, and
// the stamp is taken once, in connect.
// LABEL (Langston C1, C3): the call stack is CAPTURED on every checkout (cheap: V8 formats it lazily) and only
// FORMATTED when the checkout is slow (wait over 100 ms or hold over 1 s) or beats the minute's running max. The
// label is the first TWO frames outside node_modules, node internals and these two pool modules, so the six
// xStock `boundedTransaction` callers are told apart (callee<caller). drizzle's transaction reaches
// `pool.connect` with no intervening await (`session.js:138`), and `db.execute` reaches `pool.query` the same way,
// so the caller is on the stack for both paths. No frame resolves ⇒ `query` or `connect`.
// CARRIER (Langston C3 on r1): one line a minute per pool to console.error ⇒ `error.log`, 14 daily files kept.
// Counts are in FIXED buckets so lines SUM across minutes and across restarts; a restart loses one minute.
// NO DATABASE WRITES: the instrument must not take the slot it measures.
// NOT MEASURED HERE: a checkout that is never released (a leak) has no hold; OBJ-5's idle-in-transaction page
// covers that case.

export const WAIT_BUCKETS_MS = [100, 1_000, 5_000, 10_000] as const;
export const HOLD_BUCKETS_MS = [1_000, 5_000, 10_000, 20_000, 25_000] as const;
const SLOW_WAIT_MS = WAIT_BUCKETS_MS[0];
const SLOW_HOLD_MS = HOLD_BUCKETS_MS[0];
const SITES_IN_LINE = 5;
const STACK_LIMIT = 30;
const SELF = /(^|\/)db-pool-(instrument|guards)\.(ts|js|mjs)$/;

const META = Symbol('dtPoolCheckout');
interface Holder { stack?: string }
interface CheckoutMeta { requestAt: number; handedAt: number; viaQuery: boolean; holder: Holder }
type Stamped = { [META]?: CheckoutMeta };

// Staging runs ONE esbuild bundle (`dist/index.js`, not minified, no source map — measured 2026-11-05), so every
// app frame is `index.js:<line>`: the FILE cannot exclude these wrappers there, and the FUNCTION NAME (which the
// bundle keeps) is what makes a label readable. A bundle line resolves against `dist/index.js` at the deployed
// sha (`dist/BUILD_SHA`).
const SELF_FNS = /^(instrumentedQuery|instrumentedConnect)$/;

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
    if (SELF_FNS.test(fn)) continue;
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
 * the current minute; used by the timer and the test) and `stop()`.
 */
export function attachPoolInstrument(pool: pg.Pool, label: string, opts: PoolInstrumentOptions = {}) {
  const log = opts.log ?? ((l: string) => console.error(l));
  const now = opts.now ?? (() => performance.now());
  if (instrumented.has(pool)) return { flush: () => {}, stop: () => {} };
  instrumented.add(pool);

  let minute = freshMinute();
  let inQuery = false;
  const p = pool as unknown as {
    connect: (cb?: (err: Error | undefined, client?: unknown, done?: unknown) => void) => unknown;
    query: (...args: unknown[]) => unknown;
  };
  const origConnect = p.connect.bind(pool);
  const origQuery = p.query.bind(pool);

  p.query = function instrumentedQuery(...args: unknown[]) {
    inQuery = true;
    try {
      return origQuery(...args);
    } finally {
      inQuery = false;
    }
  };

  p.connect = function instrumentedConnect(cb?: (err: Error | undefined, client?: unknown, done?: unknown) => void) {
    const viaQuery = inQuery;
    inQuery = false; // the flag covers only the query's own connect call
    const holder: Holder = {};
    const prevLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = STACK_LIMIT;
    Error.captureStackTrace(holder, instrumentedConnect);
    Error.stackTraceLimit = prevLimit;
    const requestAt = now();
    const stamp = (client: unknown) => {
      if (client) (client as Stamped)[META] = { requestAt, handedAt: now(), viaQuery, holder };
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
    const waitMs = m.handedAt - m.requestAt;
    const holdMs = now() - m.handedAt;
    minute.checkouts += 1;
    if (m.viaQuery) minute.viaQuery += 1;
    WAIT_BUCKETS_MS.forEach((b, i) => { if (waitMs > b) minute.wait[i] += 1; });
    HOLD_BUCKETS_MS.forEach((b, i) => { if (holdMs > b) minute.hold[i] += 1; });
    const slowWait = waitMs > SLOW_WAIT_MS || waitMs > minute.maxWaitMs;
    const slowHold = holdMs > SLOW_HOLD_MS || holdMs > minute.maxHoldMs;
    if (!slowWait && !slowHold) return; // fast path: the stack is never formatted
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
        `max_hold_ms=${Math.round(m.maxHoldMs)} max_hold_site=${m.maxHoldSite} slow_hold_sites=${sites}`,
    );
  };
  const timer = setInterval(flush, opts.intervalMs ?? 60_000);
  timer.unref?.();
  return { flush, stop: () => clearInterval(timer) };
}
