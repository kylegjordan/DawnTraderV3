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
// `boundedTransaction` callers are told apart.
// ⚠️ THE QUERY PATH HAS NO APP FRAME (Step 7, measured 2026-11-05: 95 of 95 minutes labelled the fallback `query`):
// drizzle runs a query from `QueryPromise.then` (`drizzle-orm/query-promise.js`), which the `await` machinery calls
// in a microtask, so the awaiting application frame is genuinely gone; no stack can recover it. Transactions keep
// their frames (`session.js:138`, `await this.client.connect()`). So the label ORDER is: stack → statement
// FINGERPRINT → `query`/`connect` (Langston, Step 9). A `sql:` label is a STATEMENT FAMILY, NOT A CALL SITE — many
// callers collapse into one key; `sql:select:closed_trades=8115` is every select on that table, not one site.
// FINGERPRINT SAFETY (Langston CHANGE 1): the repo inlines values into SQL text through `sql.raw(...)` in places, so
// the label is safe by construction, not by trusting the caller: only the TEXT of `args[0]` is read (never `args[1]`,
// the parameters), only the STRING REFERENCE is kept (not the config object), and at label time only a verb from a
// closed set and a table name matching `[A-Za-z0-9_]{1,40}` are emitted — `sql:<verb>[:<table>]`, else `sql:other`.
// That closed charset is also the bound on the number of distinct keys.
// The two label kinds rank SEPARATELY in the minute line (CHANGE 2): `slow_hold_sites` = top 3 code labels,
// `slow_hold_sql` = top 3 statement families, so fingerprints cannot push the labels that name code out of the line.
// CARRIER (Langston C3 on r1): one line a minute per pool to console.error ⇒ `error.log`, 14 daily files kept.
// Tag `[B-DB-POOL-GUARD][POOL_MINUTE_V2]` since the split into `slow_hold_sites` + `slow_hold_sql` (V1, 2026-11-05
// 04:36Z → the next deploy, had one shared `slow_hold_sites` top-5 where the query path always read `query`).
// Counts are in FIXED buckets so they SUM across minutes and restarts; `open`, `total`, `idle` and `waiting` are
// INSTANTANEOUS gauges read at flush and do NOT sum across lines. NO DATABASE WRITES.
// Staging runs ONE esbuild bundle (`dist/index.js`, not minified, no source map — measured 2026-11-05), so an app
// frame reads `fn@index.js:<line>`; a bundle line resolves against `dist/index.js` at the deployed `dist/BUILD_SHA`.

export const WAIT_BUCKETS_MS = [100, 1_000, 5_000, 10_000] as const;
export const HOLD_BUCKETS_MS = [1_000, 5_000, 10_000, 20_000, 25_000] as const;
const SLOW_HOLD_MS = HOLD_BUCKETS_MS[0];
const SITES_PER_KIND = 3;
const STACK_LIMIT = 30;
const SELF = /(^|\/)db-pool-(instrument|guards)\.(ts|js|mjs)$/;

const META = Symbol('dtPoolCheckout');
interface Holder { stack?: string; sqlText?: string }
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

const SQL_VERBS = new Set(['select', 'insert', 'update', 'delete', 'with', 'begin', 'commit', 'rollback', 'set', 'create',
  'alter', 'drop', 'truncate', 'copy', 'show', 'explain', 'values', 'call', 'do', 'lock', 'refresh', 'vacuum', 'analyze',
  'savepoint', 'release', 'prepare', 'execute', 'deallocate', 'listen', 'notify', 'discard', 'reset']);

/** The SQL text of a `pool.query` first argument — string or `{ text }` config — never the parameters. Exported for the test. */
export function sqlTextOf(arg0: unknown): string | undefined {
  if (typeof arg0 === 'string') return arg0;
  const t = (arg0 as { text?: unknown } | null | undefined)?.text;
  return typeof t === 'string' ? t : undefined;
}

/** `sql:<verb>[:<table>]` from a closed vocabulary, or `sql:other`. Never emits anything outside `[a-z0-9_:]`. Exported for the test. */
export function fingerprintSql(text: string | undefined): string | null {
  if (typeof text !== 'string') return null;
  const head = text.slice(0, 2_000);
  const verb = head.match(/^\s*([A-Za-z]+)/)?.[1]?.toLowerCase();
  if (!verb || !SQL_VERBS.has(verb)) return 'sql:other';
  const kw = verb === 'insert' ? 'into' : verb === 'update' ? 'update' : 'from';
  const m = head.match(new RegExp(`\\b${kw}\\s+(?:"?[A-Za-z0-9_]+"?\\.)?"?([A-Za-z0-9_]{1,40})"?(?![A-Za-z0-9_])`, 'i'));
  return m ? `sql:${verb}:${m[1].toLowerCase()}` : `sql:${verb}`;
}

/** Label order (Langston, Step 9): stack → statement fingerprint → `query`/`connect`. Exported for the test. */
export function labelFor(stackSite: string | null, sqlText: string | undefined, viaQuery: boolean): string {
  return stackSite ?? fingerprintSql(sqlText) ?? (viaQuery ? 'query' : 'connect');
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
  acquireTimeouts: number;
}
const freshMinute = (): Minute => ({
  checkouts: 0, viaQuery: 0, wait: WAIT_BUCKETS_MS.map(() => 0), hold: HOLD_BUCKETS_MS.map(() => 0),
  maxWaitMs: 0, maxWaitSite: '-', maxHoldMs: 0, maxHoldSite: '-', siteMaxHold: new Map(), acquireTimeouts: 0,
});

// ─── B-DB-POOL-GUARD P4 (OBJ-5(a), increment 3b r2): the per-flush record the alert module reads ───────────────
// Handed to subscribers at every flush, so the alerts read the SAME counts as the minute line, with no second timer and
// no log parsing. `startWallMs`/`endWallMs` are WALL-CLOCK (the instrument's own `now` is `performance.now()`), so the
// alert window is built from COVERED time, never from a line count (Langston (3): the emit offset drifts). The counts
// are a per-process accumulator: a restart starts a fresh one.
export interface PoolFlushRecord {
  label: string;
  startWallMs: number;
  endWallMs: number;
  checkouts: number;
  waitsOver1s: number;
  waitsOver5s: number;
  acquireTimeouts: number;
  maxWaitMs: number;
  maxWaitSite: string;
  open: number;
  total: number | null;
  idle: number | null;
  waiting: number | null;
}
type FlushListener = (r: PoolFlushRecord) => void;
const flushListeners = new Map<string, Set<FlushListener>>();

/** pg-pool 3.7.0's acquire-timeout rejection (`index.js:205`): a bare `Error`, no `code`, so it is matched by its EXACT
 *  message. Exported for the fence. */
export const ACQUIRE_TIMEOUT_MESSAGE = 'timeout exceeded when trying to connect';
export function isAcquireTimeout(err: unknown): boolean {
  return err instanceof Error && err.message === ACQUIRE_TIMEOUT_MESSAGE;
}

/** Subscribe to one instrumented pool's flush record. THROWS when `label` was never instrumented (Langston C5: the
 *  re-attach path returns a no-op, so a subscriber passed there would never fire and nobody would know). Returns an
 *  unsubscribe function. */
export function subscribePoolFlush(label: string, fn: FlushListener): () => void {
  const set = flushListeners.get(label);
  if (!set) throw new Error(`subscribePoolFlush: pool '${label}' is not instrumented (attachPoolInstrument was never called for it)`);
  set.add(fn);
  return () => { set.delete(fn); };
}

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
  if (!flushListeners.has(label)) flushListeners.set(label, new Set());
  let lastFlushWallMs = Date.now();

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
    pendingQueryHolder.sqlText = sqlTextOf(args[0]); // the string reference only — never args[1], never the config object
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
        else if (isAcquireTimeout(err)) minute.acquireTimeouts += 1;
        cb(err, client, done);
      });
    }
    return (origConnect() as Promise<unknown>).then((client) => {
      stamp(client);
      return client;
    }, (err: unknown) => {
      if (isAcquireTimeout(err)) minute.acquireTimeouts += 1;
      throw err;
    });
  };

  const siteOf = (m: CheckoutMeta) => labelFor(siteFromStack(m.holder.stack), m.holder.sqlText, m.viaQuery);

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
    const top = (keep: (s: string) => boolean) => [...m.siteMaxHold.entries()].filter(([s]) => keep(s))
      .sort((a, b) => b[1] - a[1]).slice(0, SITES_PER_KIND).map(([s, ms]) => `${s}=${Math.round(ms)}`).join('|') || '-';
    const sites = top((s) => !s.startsWith('sql:'));
    const sqlSites = top((s) => s.startsWith('sql:'));
    log(
      `[B-DB-POOL-GUARD][POOL_MINUTE_V2] pool=${label} checkouts=${m.checkouts} via_query=${m.viaQuery} ` +
        `via_connect=${m.checkouts - m.viaQuery} ` +
        WAIT_BUCKETS_MS.map((b, i) => `wait_gt_${b}ms=${m.wait[i]}`).join(' ') + ' ' +
        HOLD_BUCKETS_MS.map((b, i) => `hold_gt_${b}ms=${m.hold[i]}`).join(' ') + ' ' +
        `max_wait_ms=${Math.round(m.maxWaitMs)} max_wait_site=${m.maxWaitSite} ` +
        `max_hold_ms=${Math.round(m.maxHoldMs)} max_hold_site=${m.maxHoldSite} slow_hold_sites=${sites} slow_hold_sql=${sqlSites} ` +
        // instantaneous gauges at flush — they do NOT sum across lines
        `open=${open} total=${p.totalCount ?? '-'} idle=${p.idleCount ?? '-'} waiting=${p.waitingCount ?? '-'} ` +
        `acquire_timeouts=${m.acquireTimeouts}`,
    );
    const endWallMs = Date.now();
    const record: PoolFlushRecord = {
      label, startWallMs: lastFlushWallMs, endWallMs, checkouts: m.checkouts,
      waitsOver1s: m.wait[WAIT_BUCKETS_MS.indexOf(1_000)], waitsOver5s: m.wait[WAIT_BUCKETS_MS.indexOf(5_000)],
      acquireTimeouts: m.acquireTimeouts, maxWaitMs: Math.round(m.maxWaitMs), maxWaitSite: m.maxWaitSite,
      open, total: p.totalCount ?? null, idle: p.idleCount ?? null, waiting: p.waitingCount ?? null,
    };
    lastFlushWallMs = endWallMs;
    for (const fn of flushListeners.get(label) ?? []) {
      // A throwing subscriber must not end the minute line or the other subscribers; the alert module's own blind
      // key notices a subscriber that stops receiving.
      try { fn(record); } catch (err) { console.error(`[B-DB-POOL-GUARD][FLUSH_LISTENER_THREW] pool=${label} ${(err as Error)?.message ?? err}`); }
    }
  };
  const timer = setInterval(flush, opts.intervalMs ?? 60_000);
  timer.unref?.();
  return { flush, stop: () => clearInterval(timer) };
}
