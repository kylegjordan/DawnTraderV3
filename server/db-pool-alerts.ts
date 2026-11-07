import fs from 'fs';
import { execFileSync } from 'child_process';
import pg from 'pg';
import { subscribePoolFlush, type PoolFlushRecord } from './db-pool-instrument';
import { subscribeCheckedOutClientErrors, getPoolGuardCounts } from './db-pool-guards';

// ─── B-DB-POOL-GUARD P4 — the OBJ-5 pages (#1239, increment 3b r2, Langston PROCEED 2026-11-07) ─────────────────────
// Plan: `B_DB_POOL_GUARD_PRE_AUDIT.md` "AMENDMENT inc 3b r2" and Langston's PROCEED on it (pid rule replaced; the
// merge-null fallback; the guard counts in the incident body). Five keys, one machine actor, never acked:
//   db-pool-wait:<label>                 LEVEL    — ≥ 3 waits > 1 s, or any wait > 5 s, in 5 min of COVERED time;
//                                                   clears itself after 10 min of covered time at zero.
//   db-pool-acquire-timeout:<label>      INCIDENT — pg-pool's acquire timeout; later ones merge into the open row;
//                                                   a person resolves it (10 quiet minutes must not erase the notice).
//   db-pool-idle-in-tx:<label>           LEVEL    — a backend idle in a transaction > 30 s, read every 25 s by a
//                                                   one-connection client OUTSIDE the pool; clears on 2 zero reads.
//   db-pool-idle-in-tx-ended:<label>     INCIDENT — the server ended an idle transaction (25P03 on a checked-out client,
//                                                   counted by CODE, one per incident); a person resolves it.
//   app-unplanned-restart:<restart_time> INCIDENT per value — the process restart count differs from the dt-deploy
//                                                   record; EVERY row of the family is resolved at the next deploy.
// Each family has a `:blind` key: an instrument that cannot see mints a row, never silence.
// ⚠️ LIMITS, stated: this module lives inside the process it watches, so it cannot report a crash the app never
// recovers from (crash loop, `pm2 stop`, failed boot — the liveness watch's), nor an event-loop stall (its own timers
// stall too). A checkout leaked OUTSIDE a transaction (before BEGIN, after COMMIT) is invisible to every key here; only
// the `open` gauge in the db-pool-wait body sees it.

export const ACTOR = 'db-pool-monitor';
export const EVIDENCE = '#1239';
const CATEGORY = 'health_check';
const MIN = 60_000;

export interface AlertDeps {
  addAlert: (o: { severity: 'info' | 'warning' | 'critical'; title: string; body: string; dedupe_key: string;
    metadata?: Record<string, unknown> }) => Promise<{ id: string } | null | undefined>;
  resolveByKey: (key: string) => Promise<string[]>;
  resolveByPrefix: (prefix: string, exclude: ReadonlySet<string>) => Promise<string[]>;
  /** The open (non-terminal) row for a key, or null. `fired_at` is set when the dispatcher PROMOTES the row (the 15-min
   *  `fireDue`), which precedes its push — it is promotion, not proof of delivery (Langston, inc 3b P4 Step 7). */
  openRow: (key: string) => { id: string; metadata?: Record<string, unknown> | null; fired_at?: string | null } | null;
  /** Every open (non-terminal) row whose key starts with `prefix` — the restart family's promotion check (C2). */
  openRowsByPrefix: (prefix: string) => Array<{ dedupe_key: string; fired_at?: string | null }>;
  /** mergeAlertMetadata: returns null on a missing-or-resolved row. */
  merge: (id: string, patch: (cur: Record<string, unknown>) => Record<string, unknown>) => Promise<unknown | null>;
}

// ═══ (a) LEVEL — callers waiting for a slot ═══════════════════════════════════════════════════════════════════════
export const WAIT_WINDOW_MS = 5 * MIN;
export const WAIT_CLEAR_MS = 10 * MIN;
export const WAIT_OVER_1S_FIRE_AT = 3;

export interface WaitVerdict {
  fire: boolean;
  clear: boolean;
  window: { fromWallMs: number; toWallMs: number; waitsOver1s: number; waitsOver5s: number; maxWaitMs: number; maxWaitSite: string };
}

/** PURE. `records` are flush records in arrival order; `nowWallMs` is the latest record's end. The window is the covered
 *  time ending now — records are selected by their own [start, end] interval, never counted. */
export function evaluateWaitLevel(records: PoolFlushRecord[], nowWallMs: number): WaitVerdict {
  const inWindow = records.filter((r) => r.endWallMs > nowWallMs - WAIT_WINDOW_MS);
  const w = {
    fromWallMs: inWindow.length ? Math.min(...inWindow.map((r) => r.startWallMs)) : nowWallMs,
    toWallMs: nowWallMs,
    waitsOver1s: inWindow.reduce((n, r) => n + r.waitsOver1s, 0),
    waitsOver5s: inWindow.reduce((n, r) => n + r.waitsOver5s, 0),
    maxWaitMs: inWindow.reduce((n, r) => Math.max(n, r.maxWaitMs), 0),
    maxWaitSite: inWindow.reduce((best, r) => (r.maxWaitMs >= best.ms ? { ms: r.maxWaitMs, site: r.maxWaitSite } : best), { ms: -1, site: '-' }).site,
  };
  const fire = w.waitsOver1s >= WAIT_OVER_1S_FIRE_AT || w.waitsOver5s >= 1;
  // Clear: the last 10 minutes are COVERED (the oldest record in them started at or before the cut) and all zero.
  const clearSpan = records.filter((r) => r.endWallMs > nowWallMs - WAIT_CLEAR_MS);
  const covered = clearSpan.length > 0 && Math.min(...clearSpan.map((r) => r.startWallMs)) <= nowWallMs - WAIT_CLEAR_MS;
  const quiet = clearSpan.every((r) => r.waitsOver1s === 0 && r.waitsOver5s === 0);
  return { fire, clear: !fire && covered && quiet, window: w };
}

function waitBody(label: string, v: WaitVerdict, r: PoolFlushRecord): string {
  const iso = (ms: number) => new Date(ms).toISOString();
  return `Callers are waiting for a database connection on pool ${label}. In the covered window ${iso(v.window.fromWallMs)} → `
    + `${iso(v.window.toWallMs)}: ${v.window.waitsOver1s} waits over 1 s, ${v.window.waitsOver5s} over 5 s, longest `
    + `${v.window.maxWaitMs} ms (${v.window.maxWaitSite}). At the latest flush: open=${r.open} total=${r.total} `
    + `idle=${r.idle} waiting=${r.waiting} (a high 'open' with few waits is a PIN, many short waits a FLAP). Counts are per `
    + `process and restart at a restart. Clears itself after 10 minutes of covered time with no wait over 1 s, and not before the `
    + `dispatcher has promoted this row; later windows fold into the metadata (fires, last_at, the running worst). B-DB-POOL-GUARD OBJ-5(a).`;
}

// ═══ (b) LEVEL — a backend idle inside a transaction, sampled from outside the pool ════════════════════════════════
export const IDLE_IN_TX_BOUND_S = 30;          // above the 26.5 s longest measured hold, below the server's 60 s kill
export const IDLE_IN_TX_POLL_MS = 25_000;      // ≤ kill − bound (60 − 30), so every leak in [30 s, 60 s) is sampled
export const IDLE_IN_TX_SQL =
  `select count(*)::int as n, coalesce(max(extract(epoch from now() - state_change)), 0)::float8 as max_s
     from pg_stat_activity
    where application_name = $1
      and state in ('idle in transaction', 'idle in transaction (aborted)')
      and now() - state_change > make_interval(secs => $2)`;

export interface IdleRead { ok: true; n: number; maxS: number }
export interface IdleFail { ok: false; error: string }

/** PURE. Two consecutive zero reads clear; one read ≥ 1 fires. */
export function nextIdleState(prevZeroRun: number, read: IdleRead | IdleFail): { fire: boolean; clear: boolean; zeroRun: number; blind: boolean } {
  if (!read.ok) return { fire: false, clear: false, zeroRun: 0, blind: true };
  if (read.n >= 1) return { fire: true, clear: false, zeroRun: 0, blind: false };
  const zeroRun = prevZeroRun + 1;
  return { fire: false, clear: zeroRun >= 2, zeroRun, blind: false };
}

/** PURE. A well-formed row is exactly one row with a non-negative integer `n` and a finite `max_s`. */
export function parseIdleRow(rows: unknown): IdleRead | IdleFail {
  if (!Array.isArray(rows) || rows.length !== 1) return { ok: false, error: `expected 1 row, got ${Array.isArray(rows) ? rows.length : typeof rows}` };
  const r = rows[0] as { n?: unknown; max_s?: unknown };
  const n = Number(r.n); const maxS = Number(r.max_s);
  if (!Number.isInteger(n) || n < 0 || !Number.isFinite(maxS)) return { ok: false, error: `malformed row n=${String(r.n)} max_s=${String(r.max_s)}` };
  return { ok: true, n, maxS };
}

// ═══ (c) INCIDENT per value — an unplanned restart ═══════════════════════════════════════════════════════════════
export const RESTART_PREFIX = 'app-unplanned-restart:';
export const RESTART_BLIND_KEY = `${RESTART_PREFIX}blind`;

export interface RestartInputs {
  liveRestartTime: string | undefined;           // process.env.restart_time (PM2 sets it at spawn)
  recordText: string | null;                     // /home/deploy/dawntrader-deploy.record, null when missing
  lock: { exists: boolean; pid: number | null; holder: string | null; since: string | null; sha: string | null };
  pidAlive: (pid: number) => boolean;
  liveDeployProcess: boolean;                    // any running dt-deploy on the box
  repoHead: string | null;                       // git rev-parse HEAD of the app checkout
}

export type RestartVerdict =
  | { kind: 'suppress'; why: string }
  | { kind: 'blind'; why: string }
  | { kind: 'match'; live: number }
  | { kind: 'mismatch'; live: number; record: number; direction: 'HIGHER' | 'LOWER'; recordSha: string | null; repoHead: string | null };

function lastField(text: string, field: string): string | null {
  const lines = text.split('\n').filter((l) => l.startsWith(`${field}=`));
  return lines.length ? lines[lines.length - 1].slice(field.length + 1).trim() : null;
}

/** PURE. The comparator, the deploy-in-progress suppression (a LIVE pid, or a live dt-deploy process when the pid is
 *  absent or unreadable — never a clock), and every silent input routed to blind. */
export function evaluateRestart(i: RestartInputs): RestartVerdict {
  if (i.lock.exists) {
    if (i.lock.pid !== null && i.pidAlive(i.lock.pid)) return { kind: 'suppress', why: `deploy in progress (lock pid ${i.lock.pid} alive)` };
    if (i.lock.pid === null && i.liveDeployProcess) return { kind: 'suppress', why: 'deploy in progress (lock pid unreadable, a dt-deploy process is running)' };
    if (i.lock.pid === null) {
      return { kind: 'blind', why: `a deploy lock exists with no readable pid and no dt-deploy is running (holder=${i.lock.holder ?? '?'} sha=${i.lock.sha ?? '?'} since=${i.lock.since ?? '?'}) — a stranded lock` };
    }
    // a lock whose pid is dead does NOT suppress (SIGKILL skips the trap)
  }
  const liveN = Number(i.liveRestartTime);
  if (i.liveRestartTime === undefined || !/^\d+$/.test(String(i.liveRestartTime)) || !Number.isFinite(liveN)) {
    return { kind: 'blind', why: `live restart_time unreadable (${String(i.liveRestartTime)})` };
  }
  if (i.recordText === null) return { kind: 'blind', why: 'the dt-deploy record is missing' };
  const recRaw = lastField(i.recordText, 'restart_time');
  if (recRaw === null || !/^\d+$/.test(recRaw)) return { kind: 'blind', why: `the record's restart_time is not a number (${String(recRaw)})` };
  const recN = Number(recRaw);
  if (liveN === recN) return { kind: 'match', live: liveN };
  return { kind: 'mismatch', live: liveN, record: recN, direction: liveN > recN ? 'HIGHER' : 'LOWER',
    recordSha: lastField(i.recordText, 'sha'), repoHead: i.repoHead };
}

function restartBody(v: Extract<RestartVerdict, { kind: 'mismatch' }>): string {
  if (v.direction === 'LOWER') {
    return `The app's restart count (${v.live}) is LOWER than the last dt-deploy record (${v.record}). HYPOTHESIS: the `
      + `process list was resurrected after a host reboot (PM2 counters restart). Not verified by this check. `
      + `Clears at the next dt-deploy. B-DB-POOL-GUARD OBJ-5(c).`;
  }
  const shaNote = v.recordSha && v.repoHead && v.recordSha !== v.repoHead
    ? ` The record's sha (${v.recordSha}) differs from the checkout's HEAD (${v.repoHead}), so this is EITHER an aborted deploy (restarted, never recorded) OR a crash — both hypotheses stand.`
    : ` The checkout's HEAD matches the record's sha (${v.recordSha ?? '?'}), so an aborted deploy is unlikely: most likely a crash-restart.`;
  return `The app restarted ${v.live - v.record} time(s) since the last dt-deploy (restart count ${v.live}, record ${v.record}).`
    + `${shaNote} A restart by hand outside dt-deploy also pages (intended). Clears at the next dt-deploy. B-DB-POOL-GUARD OBJ-5(c).`;
}

// ═══ the incident helper: mint, or merge into the open row; a merge that finds no open row MINTS (Langston cond. 1) ═
export async function raiseIncident(deps: AlertDeps, key: string, severity: 'warning' | 'critical', title: string, body: string,
  add: number, nowIso: string): Promise<'minted' | 'merged'> {
  const open = deps.openRow(key);
  if (open) {
    const merged = await deps.merge(open.id, (cur) => ({ ...cur, count: Number(cur.count ?? 1) + add, last_at: nowIso }));
    if (merged !== null) return 'merged';
  }
  await deps.addAlert({ severity, title, body, dedupe_key: key, metadata: { source: 'db-pool-alerts', count: add, first_at: nowIso, last_at: nowIso } });
  return 'minted';
}

// ═══ runtime ════════════════════════════════════════════════════════════════════════════════════════════════════
export interface MonitorOptions {
  label: string;
  deps: AlertDeps;
  flushIntervalMs?: number;
  /** Read the record / lock / env / process table for (c). */
  restartInputs?: () => RestartInputs;
  /** Run the (b) sample; returns the parsed read. */
  idleRead?: () => Promise<IdleRead | IdleFail>;
  log?: (l: string) => void;
}

export function startDbPoolAlerts(opts: MonitorOptions): { stop: () => void; onFlush: (r: PoolFlushRecord) => Promise<void> } {
  const { label, deps } = opts;
  const log = opts.log ?? ((l: string) => console.error(l));
  const waitKey = `db-pool-wait:${label}`;
  const waitBlindKey = 'db-pool-wait:blind';
  const acqKey = `db-pool-acquire-timeout:${label}`;
  const idleKey = `db-pool-idle-in-tx:${label}`;
  const idleBlindKey = 'db-pool-idle-in-tx:blind';
  const endedKey = `db-pool-idle-in-tx-ended:${label}`;
  const flushEvery = opts.flushIntervalMs ?? MIN;
  const timers: NodeJS.Timeout[] = [];
  const safe = (what: string, p: Promise<unknown>) => p.catch((e) => log(`[B-DB-POOL-GUARD][ALERTS] ${what} failed: ${(e as Error)?.message ?? e}`));
  let records: PoolFlushRecord[] = [];
  let lastFlushAt = Date.now();
  let idleZeroRun = 0;
  // Which of our level keys are open, read ONCE here and then kept in step with our own mints and resolves, so the
  // 25 s and 60 s loops do not re-read the alert file each pass. (A row resolved by a person meanwhile only costs one
  // no-op resolve; a row we think closed is re-minted by addAlert's own dedupe if it is in fact open.)
  const known = new Set<string>();
  for (const k of [waitKey, waitBlindKey, idleKey, idleBlindKey, RESTART_BLIND_KEY]) if (deps.openRow(k)) known.add(k);
  const pending = new Set<string>();
  const mint = (what: string, o: Parameters<AlertDeps['addAlert']>[0]) => { pending.delete(o.dedupe_key); known.add(o.dedupe_key); return safe(what, deps.addAlert(o)); };
  // DEFERRED CLEAR (inc 3b P4 Step-7 fold, Langston-ruled). A new row is 'scheduled' and only the dispatcher's 15-minute
  // fireDue promotes and pushes it, so a self-clearing row resolved before the next tick was never sent (measured:
  // ffb9952e, 79857f58, fired_at null). A self-clearing key therefore does NOT resolve until its row carries fired_at;
  // until then the key stays in `known` and the clear is retried each pass. fired_at is PROMOTION, not delivery: a
  // promotion whose push failed is not re-tried (that residual is on the alert-protocol issue, not here).
  const clear = async (what: string, key: string) => {
    const row = deps.openRow(key);
    if (row && !row.fired_at) {
      if (!pending.has(key)) { pending.add(key); log(`[B-DB-POOL-GUARD][ALERTS] ${key}: condition clear, resolve deferred until the dispatcher promotes the row`); }
      return;
    }
    pending.delete(key); known.delete(key);
    await safe(what, deps.resolveByKey(key));
  };
  // A LEVEL re-firing into its still-open row folds into that row's metadata (fires, last_at, the running worst): the
  // row is a latch until promoted, and without this a page sent up to 15 minutes later would describe only the first
  // sighting (Langston condition 2, the raiseIncident shape). The body stays as minted and says so.
  const raiseLevel = async (what: string, o: Parameters<AlertDeps['addAlert']>[0], fold: (cur: Record<string, unknown>) => Record<string, unknown>) => {
    const nowIso = new Date().toISOString();
    const open = known.has(o.dedupe_key) ? deps.openRow(o.dedupe_key) : null;
    if (open) {
      pending.delete(o.dedupe_key);
      const merged = await safe(what, deps.merge(open.id, (cur) => ({ ...fold(cur), fires: Number(cur.fires ?? 1) + 1, last_at: nowIso })));
      if (merged !== null && merged !== undefined) return;
    }
    await mint(what, { ...o, metadata: { ...(o.metadata ?? {}), fires: 1, first_at: nowIso, last_at: nowIso } });
  };
  const maxOf = (a: unknown, b: number) => Math.max(Number(a ?? 0) || 0, b);


  // (a) + the acquire-timeout incident, on every flush
  const onFlush = async (r: PoolFlushRecord) => {
    lastFlushAt = Date.now();
    if (known.has(waitBlindKey)) await clear('resolve wait blind', waitBlindKey);
    records.push(r);
    records = records.filter((x) => x.endWallMs > r.endWallMs - WAIT_CLEAR_MS - flushEvery);
    const v = evaluateWaitLevel(records, r.endWallMs);
    if (v.fire) await raiseLevel('mint wait', { severity: 'warning', title: `Database connection waits on ${label}`,
      body: waitBody(label, v, r), dedupe_key: waitKey, metadata: { source: 'db-pool-alerts', ...v.window, open: r.open, waiting: r.waiting } },
      (cur) => ({ ...cur, waitsOver1s: maxOf(cur.waitsOver1s, v.window.waitsOver1s), waitsOver5s: maxOf(cur.waitsOver5s, v.window.waitsOver5s),
        maxWaitMs: maxOf(cur.maxWaitMs, v.window.maxWaitMs),
        maxWaitSite: v.window.maxWaitMs > Number(cur.maxWaitMs ?? -1) ? v.window.maxWaitSite : cur.maxWaitSite,
        fromWallMs: v.window.fromWallMs, toWallMs: v.window.toWallMs, open: r.open, waiting: r.waiting }));
    else if (v.clear && known.has(waitKey)) await clear('resolve wait', waitKey);
    if (r.acquireTimeouts > 0) {
      await safe('acquire-timeout incident', raiseIncident(deps, acqKey, 'warning', `Database connection acquire timed out on ${label}`,
        `${r.acquireTimeouts} caller(s) gave up after waiting the pool's connectionTimeoutMillis for a free connection `
        + `(pg-pool's bare 'timeout exceeded when trying to connect', no error code). At the flush: open=${r.open} `
        + `waiting=${r.waiting}. A person resolves this row; it does not clear itself. B-DB-POOL-GUARD OBJ-5(a).`,
        r.acquireTimeouts, new Date(r.endWallMs).toISOString()));
    }
  };
  const unsubFlush = subscribePoolFlush(label, (r) => { void onFlush(r); });

  // (a) blind — no flush for 3 intervals (a cleared timer, a detached instrument, a throwing flush; NOT a loop stall)
  timers.push(setInterval(() => {
    // Unguarded mint, like the other two blind keys: addAlert's own dedupe holds the open row, and a row a person
    // resolved while still blind re-mints on the next pass (a `known` guard here silenced it for the process life).
    if (Date.now() - lastFlushAt > 3 * flushEvery) {
      void mint('mint wait blind', { severity: 'warning', title: `Pool wait monitor is blind on ${label}`,
        body: `No pool flush record for over ${Math.round((3 * flushEvery) / 1000)} s, so the connection-wait page cannot fire. `
          + `It reaches a stopped instrument timer or a detached subscriber, NOT an event-loop stall. B-DB-POOL-GUARD OBJ-5(a).`,
        dedupe_key: waitBlindKey });
    }
  }, flushEvery));

  // (b) idle in transaction, every 25 s
  const unsubGuard = subscribeCheckedOutClientErrors(label, (err) => {
    if (err?.code !== '25P03') return; // the code=none follow-on of the same end is NOT an incident (Langston: no 2:1)
    const c = getPoolGuardCounts(label);
    void safe('25P03 incident', raiseIncident(deps, endedKey, 'warning', `Database ended an idle transaction on ${label}`,
      `The server ended a ${label} connection left idle inside a transaction past idle_in_transaction_session_timeout `
      + `(SQLSTATE 25P03). The app survived (OBJ-1b guard). Guard totals this process: checkedOutClientErrors=`
      + `${c.checkedOutClientErrors}, idleClientErrors=${c.idleClientErrors} — the totals count each end TWICE (25P03, then `
      + `a code=none 'Connection terminated unexpectedly'), so they run at ~2x this row's count. A person resolves this row. `
      + `B-DB-POOL-GUARD OBJ-5(b).`, 1, new Date().toISOString()));
  });
  if (opts.idleRead) {
    const idleRead = opts.idleRead;
    timers.push(setInterval(() => {
      void (async () => {
        const read = await idleRead().catch((e) => ({ ok: false as const, error: (e as Error)?.message ?? String(e) }));
        const s = nextIdleState(idleZeroRun, read);
        idleZeroRun = s.zeroRun;
        if (s.blind) {
          await mint('mint idle blind', { severity: 'warning', title: `Idle-transaction monitor is blind on ${label}`,
            body: `The monitor could not read pg_stat_activity: ${(read as IdleFail).error}. B-DB-POOL-GUARD OBJ-5(b).`, dedupe_key: idleBlindKey });
          return;
        }
        if (known.has(idleBlindKey)) await clear('resolve idle blind', idleBlindKey);
        const ok = read as IdleRead;
        if (s.fire) await raiseLevel('mint idle', { severity: 'warning', title: `Idle transaction held open on ${label}`,
          body: `${ok.n} ${label} backend(s) idle inside a transaction for over ${IDLE_IN_TX_BOUND_S} s (longest ${Math.round(ok.maxS)} s, as first seen). `
            + `The server ends them at 60 s. Clears after two consecutive clean reads (${IDLE_IN_TX_POLL_MS / 1000} s apart), and not before the `
            + `dispatcher has promoted this row; later sightings fold into the metadata (fires, last_at, max n, max_s). B-DB-POOL-GUARD OBJ-5(b).`,
          dedupe_key: idleKey, metadata: { source: 'db-pool-alerts', n: ok.n, max_s: ok.maxS } },
          (cur) => ({ ...cur, n: maxOf(cur.n, ok.n), max_s: maxOf(cur.max_s, ok.maxS) }));
        else if (s.clear && known.has(idleKey)) await clear('resolve idle', idleKey);
      })();
    }, IDLE_IN_TX_POLL_MS));
  }

  // (c) unplanned restart: the boot read (60 s) is the FIRE path; the 5-minute poll is the CLEAR-edge poll
  if (opts.restartInputs) {
    const restartInputs = opts.restartInputs;
    const check = async () => {
      let v: RestartVerdict;
      try { v = evaluateRestart(restartInputs()); } catch (e) { v = { kind: 'blind', why: `read failed: ${(e as Error)?.message ?? e}` }; }
      if (v.kind === 'suppress') return;
      if (v.kind === 'blind') {
        await mint('mint restart blind', { severity: 'warning', title: 'Unplanned-restart check is blind',
          body: `The restart check cannot decide: ${v.why}. B-DB-POOL-GUARD OBJ-5(c).`, dedupe_key: RESTART_BLIND_KEY });
        return;
      }
      if (known.has(RESTART_BLIND_KEY)) await clear('resolve restart blind', RESTART_BLIND_KEY);
      if (v.kind === 'match') {
        // C2 (Langston, Step 4 on the fold): a crash then a quick dt-deploy is the likeliest sequence, and the family
        // clear must not erase a row the dispatcher has not promoted yet. Unpromoted rows are excluded; `match` holds
        // after the deploy, so the 5-minute poll retries until each is promoted.
        const unpromoted = deps.openRowsByPrefix(RESTART_PREFIX).filter((row) => row.dedupe_key !== RESTART_BLIND_KEY && !row.fired_at).map((row) => row.dedupe_key);
        if (unpromoted.length) log(`[B-DB-POOL-GUARD][ALERTS] restart family clear deferred for unpromoted row(s): ${unpromoted.join(', ')}`);
        await safe('resolve restart family', deps.resolveByPrefix(RESTART_PREFIX, new Set([RESTART_BLIND_KEY, ...unpromoted])));
        return;
      }
      await safe('mint restart', deps.addAlert({ severity: 'critical',
        title: v.direction === 'HIGHER' ? `The app restarted outside dt-deploy (restart ${v.live})` : `The app's restart count fell (restart ${v.live})`,
        body: restartBody(v), dedupe_key: `${RESTART_PREFIX}${v.live}`,
        metadata: { source: 'db-pool-alerts', live: v.live, record: v.record, direction: v.direction, record_sha: v.recordSha, repo_head: v.repoHead } }));
    };
    timers.push(setTimeout(() => { void check(); }, MIN)); // in `timers` so stop() clears it (clearInterval clears a Timeout too)
    timers.push(setInterval(() => { void check(); }, 5 * MIN));
  }

  for (const t of timers) t.unref?.();
  return { stop: () => { timers.forEach(clearInterval); unsubFlush(); unsubGuard(); }, onFlush };
}

// ═══ production wiring (called once from server/index.ts) ══════════════════════════════════════════════════════
const RECORD_PATH = process.env.DT_DEPLOY_RECORD_PATH || '/home/deploy/dawntrader-deploy.record';
const LOCK_DIR = process.env.DT_DEPLOY_LOCK_DIR || '/home/deploy/dawntrader-deploy.lock';
const APP_DIR = process.env.DT_APP_DIR || '/home/deploy/dawntrader';

function readOrNull(p: string): string | null { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }

export function productionRestartInputs(): RestartInputs {
  const exists = fs.existsSync(LOCK_DIR);
  const pidRaw = exists ? readOrNull(`${LOCK_DIR}/pid`) : null;
  const pidN = pidRaw !== null && /^\s*\d+\s*$/.test(pidRaw) ? Number(pidRaw.trim()) : null;
  let liveDeployProcess = false;
  try {
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      const cmd = readOrNull(`/proc/${d}/cmdline`);
      if (cmd && cmd.includes('dt-deploy')) { liveDeployProcess = true; break; }
    }
  } catch { /* no /proc: leave false; a lock with no pid then reads blind, never silent */ }
  let repoHead: string | null = null;
  try { repoHead = execFileSync('git', ['-C', APP_DIR, 'rev-parse', 'HEAD'], { timeout: 5_000, encoding: 'utf8' }).trim(); } catch { repoHead = null; }
  return {
    liveRestartTime: process.env.restart_time,
    recordText: readOrNull(RECORD_PATH),
    lock: { exists, pid: pidN, holder: exists ? readOrNull(`${LOCK_DIR}/holder`)?.trim() ?? null : null,
      since: exists ? readOrNull(`${LOCK_DIR}/since`)?.trim() ?? null : null, sha: exists ? readOrNull(`${LOCK_DIR}/sha`)?.trim() ?? null : null },
    pidAlive: (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException)?.code === 'EPERM'; } },
    liveDeployProcess,
    repoHead,
  };
}

/** The (b) reader: ONE connection outside the app pool, server bound below client bound below connect bound. */
export function productionIdleReader(watchedLabel: string): () => Promise<IdleRead | IdleFail> {
  let client: pg.Client | null = null;
  const fresh = async () => {
    const c = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      application_name: 'dawntrader_pool_monitor',
      connectionTimeoutMillis: 3_000,
      statement_timeout: 2_000,
      query_timeout: 2_500,
    });
    c.on('error', () => { client = null; }); // an ended monitor connection is replaced on the next read
    await c.connect();
    return c;
  };
  return async () => {
    try {
      if (!client) client = await fresh();
      const res = await client.query(IDLE_IN_TX_SQL, [watchedLabel, IDLE_IN_TX_BOUND_S]);
      return parseIdleRow(res.rows);
    } catch (e) {
      const c = client; client = null;
      c?.end().catch(() => {});
      return { ok: false, error: (e as Error)?.message ?? String(e) };
    }
  };
}

export async function startProductionDbPoolAlerts(label: string): Promise<void> {
  const sa = await import('./services/system-alerts');
  const deps: AlertDeps = {
    addAlert: (o) => sa.addAlert({ triggers_at: new Date(), category: CATEGORY, severity: o.severity, title: o.title, body: o.body,
      dedupe_key: o.dedupe_key, metadata: o.metadata }),
    resolveByKey: (key) => sa.resolveAlertsByDedupeKey(key, ACTOR, EVIDENCE, 'engine'),
    resolveByPrefix: (prefix, exclude) => sa.resolveAlertsByDedupePrefix(prefix, ACTOR, EVIDENCE, 'engine', exclude),
    openRow: (key) => sa.readAllAlerts().find((a) => a.dedupe_key === key && a.state !== 'resolved') ?? null,
    openRowsByPrefix: (prefix) => sa.readAllAlerts().filter((a) => typeof a.dedupe_key === 'string' && a.dedupe_key.startsWith(prefix) && a.state !== 'resolved')
      .map((a) => ({ dedupe_key: a.dedupe_key as string, fired_at: a.fired_at })),
    merge: (id, patch) => sa.mergeAlertMetadata(id, patch),
  };
  // Not under PM2 (local dev, tests): the restart arm has no restart count to read, so it is not started at all,
  // stated once — rather than paging blind on every laptop boot.
  const underPm2 = process.env.pm_id !== undefined;
  if (!underPm2) console.log('[B-DB-POOL-GUARD][ALERTS] not under PM2 — the unplanned-restart check is not started');
  startDbPoolAlerts({
    label, deps,
    restartInputs: underPm2 ? productionRestartInputs : undefined,
    idleRead: productionIdleReader(label),
  });
  console.log(`[B-DB-POOL-GUARD][ALERTS] started for pool=${label} (wait, acquire-timeout, idle-in-tx every ${IDLE_IN_TX_POLL_MS / 1000}s, 25P03, restart=${underPm2})`);
}
