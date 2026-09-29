/**
 * B-SIZING-DEC-RESTORE increment 3 — P1: KYLE'S PAPER-RESET-3000, RUN ONCE.
 *
 * Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §13.2 P1 (what), §16.4 (how; Langston's
 * ruling at 66da5e666) and §16.5 (as built). One shared paper pot is reset to $3,000; every open paper position is
 * closed and labelled `close_reason = 'reset'` (a resting maker order that never filled is dropped as `never_filled`,
 * #1100); the max-position % goes to 5 (≈ $145.50 a trade, 20 slots); the Paper Trading dashboard counts from the
 * reset; nothing is deleted.
 *
 * HOW: this script drives the app's OWN authenticated API for everything that lives inside the running app (the
 * price cache, the canonical close, the engine stop/start, the guardrail save, the balance the app sizes from), and
 * calls the ledger's single writers directly for the two database-only steps (the re-anchor, the dashboard epoch).
 * No in-process reset route exists — a reset endpoint left behind would be a re-runnable destructive affordance.
 *
 * RUNS: on staging, once, by CC-C, on Kyle's go, immediately after the window's deploy (2a + 2b + 3):
 *   set -a && . ./.env && set +a && DT_API_TOKEN=<crew login token> npx tsx server/scripts/paper-reset-3000.ts
 * ⛔ The token comes from the server-held crew login (B-CREDENTIALS-PRIVATE-REPO OBJ-1) at run time. It is never
 *    typed into this file, never committed, never printed. The reset's own guardrail write therefore signs as the
 *    CREW LOGIN's user id, not Kyle's — it must not be read later as his edit (§16.4 D).
 *
 * ORDER, and it stops at the FIRST failure (no retry). Every refusal and every crash names the step AND the state it
 * leaves (engine stopped? anchor written?):
 *   (0) preconditions — the window's three migrations in the db:migrate ledger, 2b's floor and 3's band rows at the
 *       objects, no earlier PAPER-RESET-3000 anchor (A1), the engine running, the paper KILL SWITCH NOT TRIPPED, no
 *       open closed_trades row without a position
 *   (1) the READ-ONLY pre-check — every open paper position is closable (priced, or a pending maker)
 *   (2) POST /active-engine/stop { reason: 'reset' } — the engine blocks new trades FIRST, then flattens (race-free,
 *       §16.4 B1). REFUSES unless the stop's own flatten report is clean (ran, no throw, no failure, nothing left open,
 *       nothing deleted by the orphan cleanup), nothing is open, no open closed_trades row remains, and no close since
 *       the stop began carries 'manual_stop' or 'engine_stop_cleanup'
 *   (3) executeReanchor → $3,000, measurement_override, a note citing PAPER-RESET-3000 — engine re-checked STOPPED first
 *   (4) PUT /guardrails-v2 { maxPositionPercentPct: 5 } — REFUSE to start unless the app reads back 5 (§16.4 D)
 *   (5) the dashboard epoch = the moment the stop RETURNED (so a position opened in the last instant before the stop
 *       counts as pre-reset, not post-); the previous epoch row is printed first
 *   (6) POST /active-engine/start { mode: 'continue' } — NEVER 'new' (it hard-resets the tables). Engine re-checked
 *       STOPPED first, so a start somebody else made in steps 3-5 is caught rather than reported as ours.
 *   (7) the read-back, FROM THE APP: its portfolio summary (starting balance 3,000.00 and a session that began at our
 *       start), the kill switch still clear, and THE LIVE BAND MONITOR'S OWN VERDICT at the start (the `[PaperSizeBand]`
 *       line the start hook logs — it resolves its inputs the way it will on every close); plus the anchor, the 'reset'
 *       closes and NOTHING DELETED (the paper rows opened before the run, counted at step 0 and again now)
 * ⚠️ RESUME POINT (A1): re-runnable up to and including the flatten; NOT after step 3 — the re-anchor mints a version,
 *    and step 0 refuses on its note. A run that stops after step 2 leaves the engine stopped; finishing it is a manual
 *    operator step (§16.5), never a re-run.
 * ⚠️ A closed_trades row is WRITTEN AT OPEN and UPDATED at close on the engine's path, so the flatten adds no row;
 *    "nothing deleted" is the pre-run population counted twice. Two operator routes (close-trade/:id,
 *    force-clear-stranded) do insert at close — this run calls neither, and one called by hand mid-run would show here.
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { executeReanchor, getAnchorState } from '../services/portfolio-anchor-service.js';
import { evaluatePaperSizeBand } from '../services/paper-size-band.js';
import { storage } from '../storage.js';

const TARGET_BALANCE = 3000;
const TARGET_P = 5;
const TARGET_SLOTS = 20;
const RESET_TAG = 'PAPER-RESET-3000';
// The window's three increments (2a, 2b, 3), as the db:migrate ledger names them.
const MIGRATIONS = [
  '2026-09-29-b-sizing-inc2a-retire-max-open-positions.sql',
  '2026-09-29-b-sizing-inc2b-position-pct-floor.sql',
  '2026-09-29-b-sizing-inc3-paper-size-band.sql',
] as const;
// A close that lands between the stop request and the engine blocking new work is legitimate; these may appear.
const REASONS_ALLOWED_AT_STOP = new Set(['reset', 'never_filled', 'stop_hit', 'target_hit', 'trailing_stop_hit', 'max_holding_period', 'guardrail']);
const API = (process.env.DT_API_BASE || 'http://localhost:5000/api').replace(/\/$/, '');
const TOKEN = process.env.DT_API_TOKEN || '';
const RUN_ID = `paper-reset-3000-${new Date().toISOString()}`;
// PM2 splits the app's streams: console.log → out.log, console.warn/error → error.log. The band monitor's IN/LOW/HIGH
// lines are console.log and its UNREADABLE line is console.error, so both files are read.
const APP_LOG_DIR = process.env.DT_APP_LOG_DIR || '/var/log/dawntrader';
const APP_LOGS = ['out.log', 'error.log'].map((f) => join(APP_LOG_DIR, f));

// What the run has done so far, so every exit — a refusal or a crash — says what state it leaves.
const state = { step: '0', stopRequested: false, engineStopped: false, anchorWritten: false, pSet: false, epochSet: false, started: false };
const log = (msg: string) => console.log(`[${RESET_TAG}][${state.step}] ${msg}`);

function stateLine(): string {
  if (!state.stopRequested) return 'Nothing was changed: the engine was not asked to stop.';
  const parts = [
    state.engineStopped ? 'the paper engine is STOPPED' : 'the stop was requested and its outcome is NOT confirmed — read GET /active-engine/status and the open positions before anything else',
    state.anchorWritten ? `the $${TARGET_BALANCE} anchor IS written (this run cannot be repeated — A1)` : 'the anchor is NOT written',
    state.pSet ? `max position % IS ${TARGET_P}` : 'max position % is NOT changed',
    state.epochSet ? 'the dashboard epoch IS set' : 'the dashboard epoch is NOT set',
    state.started ? 'the engine WAS restarted' : 'the engine was NOT restarted',
  ];
  return `State left: ${parts.join('; ')}. Finishing is a manual operator step (PRE_AUDIT §16.5), not a re-run.`;
}

function refuse(why: string): never {
  console.error(`[${RESET_TAG}][${state.step}] REFUSED — ${why}`);
  console.error(`[${RESET_TAG}][${state.step}] ${stateLine()}`);
  process.exit(1);
}

async function api(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

async function rows<T = any>(q: ReturnType<typeof sql>): Promise<T[]> {
  const r: any = await db.execute(q);
  return (r?.rows ?? r) as T[];
}
async function count(q: ReturnType<typeof sql>): Promise<number> {
  return Number((await rows<{ n: number }>(q))[0]?.n);
}

async function engineRunning(): Promise<boolean> {
  const s = await api('GET', '/active-engine/status');
  if (s.status !== 200 || typeof s.json?.isRunning !== 'boolean') refuse(`the engine status could not be read (HTTP ${s.status})`);
  return s.json.isRunning;
}

/** The band's three rows at the global key — three distinct names, each a finite positive number, or a refusal. */
async function readBand(): Promise<{ low: number; high: number; target: number }> {
  const r = await rows<{ constant_name: string; v: string }>(sql`
    SELECT constant_name, value #>> '{}' AS v FROM module_constants
     WHERE module_name = 'paper_size_band' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
       AND constant_name IN ('low', 'high', 'target')`);
  const m = new Map(r.map((x) => [x.constant_name, Number(x.v)]));
  const band = { low: m.get('low'), high: m.get('high'), target: m.get('target') };
  const ok = m.size === 3 && [band.low, band.high, band.target].every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)
    && (band.low as number) < (band.high as number);
  if (!ok) refuse(`the paper_size_band rows are not three finite values with low < high (read: ${JSON.stringify(Object.fromEntries(m))})`);
  return band as { low: number; high: number; target: number };
}

/** Byte offsets of the app's log files now, so a later read sees only what was written after this instant. */
function logOffsets(): Map<string, number> {
  return new Map(APP_LOGS.map((f) => { try { return [f, statSync(f).size] as [string, number]; } catch { return [f, -1] as [string, number]; } }));
}
/** What the app has logged since `offsets` (a file that rotated — now shorter — is read from its start). */
function logTextSince(offsets: Map<string, number>): string {
  let out = '';
  for (const [f, from] of offsets) {
    if (from < 0) continue;
    try {
      const size = statSync(f).size;
      const start = size < from ? 0 : from;
      if (size <= start) continue;
      const fd = openSync(f, 'r');
      try {
        const buf = Buffer.alloc(Math.min(size - start, 8 * 1024 * 1024));
        readSync(fd, buf, 0, buf.length, start);
        out += buf.toString('utf8');
      } finally { closeSync(fd); }
    } catch { /* unreadable: the caller reports "no verdict line" */ }
  }
  return out;
}

/** The paper kill switch, as the app reads it (Langston condition 2: a reset must not finish with trading latched shut). */
async function killSwitchTripped(): Promise<boolean> {
  const g = await api('GET', '/guardrails-v2?mode=paper');
  if (g.status !== 200 || typeof g.json?.data?.killSwitchTripped !== 'boolean') refuse(`the paper kill switch could not be read (HTTP ${g.status})`);
  return g.json.data.killSwitchTripped;
}

async function main() {
  log(`run id ${RUN_ID}; API ${API}`);
  if (!TOKEN) refuse('DT_API_TOKEN is not set (the crew login token, B-CREDENTIALS-PRIVATE-REPO OBJ-1)');

  // ── (0) preconditions ────────────────────────────────────────────────────────────────────────────────────────
  // The migration ledger for all three increments. 2a is checked ONLY here: its database half drops the retired
  // open-slots column, whose name the legacy-deletion fence bans from source (rightly — a reference that keeps the name
  // alive is how a dead mechanism comes back). 2b and 3 are ALSO checked at their objects.
  const migrated = new Set((await rows<{ name: string }>(sql`
    SELECT name FROM _migrations WHERE name IN (${MIGRATIONS[0]}, ${MIGRATIONS[1]}, ${MIGRATIONS[2]})`)).map((r) => r.name));
  const notMigrated = MIGRATIONS.filter((m) => !migrated.has(m));
  if (notMigrated.length) refuse(`not in the migration ledger: ${notMigrated.join(', ')} — the window's deploy has not run here`);
  const floor = (await rows<{ def: string }>(sql`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'guardrails_v2_max_position_percent_pct_range'`))[0];
  if (!floor?.def || !/>=\s*\(?1\)?/.test(floor.def)) refuse(`increment 2b's position-% floor is not in place (reads: ${floor?.def ?? 'absent'})`);
  const band = await readBand();
  if (await count(sql`SELECT count(*)::int AS n FROM portfolio_anchor_events WHERE mode = 'paper' AND note LIKE ${'%' + RESET_TAG + '%'}`) > 0) {
    refuse(`a ${RESET_TAG} anchor already exists — this reset has run past step 3; it is NOT re-runnable (A1)`);
  }
  if (!(await engineRunning())) {
    refuse('the paper engine is not running. If an earlier run of this script stopped it, read that run\'s log: the flatten is done and finishing is a manual operator step (PRE_AUDIT §16.5), not a re-run.');
  }
  if (await killSwitchTripped()) {
    refuse('the paper KILL SWITCH IS TRIPPED — a reset would finish with every read-back green and nothing trading. Clear it (or decide not to) first.');
  }
  const anchorBefore = await getAnchorState('paper');
  if (!anchorBefore) refuse('no paper anchor state');
  // An open closed_trades row with no position is a stale row: the stop's reconciler would book it, and the engine's
  // close path finds a trade's row by SYMBOL, so a stale row can later catch a real close. None may exist going in.
  const staleBefore = await count(sql`
    SELECT count(*)::int AS n FROM closed_trades c WHERE c.mode = 'paper' AND c.closed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM active_open_positions p WHERE p.symbol = c.symbol)`);
  if (staleBefore > 0) refuse(`${staleBefore} open paper trade row(s) have no position — clear them before the reset, or the stop would book them`);
  // The "nothing deleted" population: every paper row opened before this run began. Counted again at step 7.
  const runStart = new Date();
  const rowsBefore = await count(sql`SELECT count(*)::int AS n FROM closed_trades WHERE mode = 'paper' AND opened_at < ${runStart}`);
  log(`ok — ledger has 2a/2b/3; floor ${floor.def}; band $${band.low}-$${band.high} (target $${band.target}); engine running; kill switch clear; anchor v${anchorBefore.anchorVersion} $${anchorBefore.balance}; 0 stale rows; paper rows opened before ${runStart.toISOString()}: ${rowsBefore}`);

  // ── (1) the read-only pre-check ───────────────────────────────────────────────────────────────────────────────
  state.step = '1';
  const pre = await api('GET', '/active-engine/flatten-precheck');
  if (pre.status !== 200 || !pre.json?.ok || !Array.isArray(pre.json.positions)) refuse(`pre-check failed (HTTP ${pre.status}: ${pre.json?.error ?? 'no body'})`);
  const positions = pre.json.positions as Array<{ symbol: string; state: string; closable: boolean }>;
  const notClosable = positions.filter((p) => !p.closable);
  if (notClosable.length > 0) refuse(`no observed price for ${notClosable.map((p) => p.symbol).join(', ')} — the flatten would leave them open`);
  const n = positions.length;
  const pending = positions.filter((p) => p.state === 'pending').length;
  log(`ok — ${n} open paper position(s): ${n - pending} priced, ${pending} pending maker(s) (dropped as never_filled)`);

  // ── (2) stop, flattening under close_reason 'reset' ───────────────────────────────────────────────────────────
  state.step = '2';
  const resetInstant = new Date();
  state.stopRequested = true;
  let stop: { status: number; json: any };
  try {
    stop = await api('POST', '/active-engine/stop', { reason: 'reset' });
  } catch (err) {
    refuse(`the stop request failed in transit (${err instanceof Error ? err.message : err}) — the server may still be completing it`);
  }
  const stopReturnedAt = new Date();
  if (stop.status !== 200 || !stop.json?.success) refuse(`stop failed (HTTP ${stop.status}: ${stop.json?.error ?? 'no body'})`);
  if (await engineRunning()) refuse('the stop returned success but the engine still reports running');
  state.engineStopped = true;
  const f = stop.json.flatten;
  log(`stop returned in ${stopReturnedAt.getTime() - resetInstant.getTime()} ms; flatten report: ${JSON.stringify(f)}`);
  if (stop.json.idempotent || !f) refuse('the stop ran no flatten (it took the already-stopped path) — nothing was closed as reset');
  if (!f.ran || f.threw || f.failedCount > 0 || f.leftOpen?.length > 0 || f.orphansDeleted?.length > 0) {
    refuse(`the stop's flatten was not clean (ran=${f.ran} threw=${f.threw} failed=${f.failedCount} leftOpen=[${f.leftOpen}] deletedByCleanup=[${f.orphansDeleted}])`);
  }
  const stillOpen = await storage.getActiveOpenPositions('paper');
  if (stillOpen.length > 0) refuse(`${stillOpen.length} position(s) still open (${stillOpen.map((p) => p.symbol).join(', ')})`);
  const staleAfter = await count(sql`SELECT count(*)::int AS n FROM closed_trades WHERE mode = 'paper' AND closed_at IS NULL`);
  if (staleAfter > 0) refuse(`${staleAfter} paper trade row(s) are still open with no position after the stop`);
  const byReason: Record<string, number> = Object.fromEntries((await rows<{ reason: string; n: number }>(sql`
    SELECT coalesce(close_reason, '(null)') AS reason, count(*)::int AS n FROM closed_trades
     WHERE mode = 'paper' AND closed_at >= ${resetInstant} GROUP BY 1 ORDER BY 1`)).map((r) => [r.reason, Number(r.n)]));
  log(`closes since the stop began, by reason: ${JSON.stringify(byReason)}`);
  const unexpected = Object.keys(byReason).filter((r) => !REASONS_ALLOWED_AT_STOP.has(r));
  if (unexpected.length) refuse(`close reason(s) ${unexpected.join(', ')} since the stop began — 'manual_stop' means the reset label did not plumb; 'engine_stop_cleanup' means a row was booked by the reconciler, not closed by the flatten`);
  if ((byReason['guardrail'] ?? 0) > 0) {
    console.warn(`[${RESET_TAG}][2] ⚠️⚠️ WARNING — ${byReason['guardrail']} close(s) since the stop began carry 'guardrail': THE KILL SWITCH FLATTENED DURING THE RESET. Allowed here (the positions are closed either way); step 7 refuses to report success unless the switch reads clear.`);
  }
  const resetCount = byReason['reset'] ?? 0;
  if (n - pending > 0 && resetCount === 0) refuse(`the pre-check saw ${n - pending} priced position(s) and no close carries 'reset'`);
  if (resetCount + (byReason['never_filled'] ?? 0) !== n) log(`NOTE — pre-check counted ${n}; the flatten closed ${resetCount} as reset and dropped ${byReason['never_filled'] ?? 0}: the engine ran between the two (reported, not refused)`);
  log(`ok — engine stopped; ${resetCount} closed as 'reset'; nothing open; no stale rows`);

  // ── (3) the re-anchor ────────────────────────────────────────────────────────────────────────────────────────
  state.step = '3';
  if (await engineRunning()) refuse('the engine is RUNNING again before the re-anchor — somebody started it; nothing re-anchored');
  const { anchorVersion } = await executeReanchor({
    mode: 'paper',
    newBalance: TARGET_BALANCE,
    reason: 'measurement_override',
    note: `Kyle-directed ${RESET_TAG} (2026-09-29, as corrected): one shared paper pot reset to $3,000 for ~20 trades at `
      + `~$140-150; every open paper position closed as 'reset' by the engine stop; nothing deleted. Prior anchored balance `
      + `$${Number(anchorBefore.balance).toFixed(2)} (v${anchorBefore.anchorVersion}). Run ${RUN_ID}. Plan: B-SIZING-DEC-RESTORE PRE_AUDIT §13.2 P1 + §16.4.`,
  });
  state.anchorWritten = true;
  if (anchorVersion !== anchorBefore.anchorVersion + 1) refuse(`anchor version ${anchorVersion}, expected ${anchorBefore.anchorVersion + 1}`);
  log(`ok — paper anchor v${anchorVersion} = $${TARGET_BALANCE}`);

  // ── (4) p = 5, through the governed path, read back FROM THE APP before any start ─────────────────────────────
  state.step = '4';
  const put = await api('PUT', '/guardrails-v2?mode=paper', { maxPositionPercentPct: TARGET_P });
  if (put.status !== 200) refuse(`guardrails save failed (HTTP ${put.status}: ${put.json?.detail ?? put.json?.error ?? 'no body'})`);
  state.pSet = true;
  const g = await api('GET', '/guardrails-v2?mode=paper');
  const p = parseFloat(String(g.json?.data?.maxPositionPercentPct));
  const e = parseFloat(String(g.json?.data?.maxTotalExposurePct));
  if (g.status !== 200 || p !== TARGET_P) refuse(`the app reads max position % as ${g.json?.data?.maxPositionPercentPct}, not ${TARGET_P} — NOT starting (it would size at the old %)`);
  if (g.json?.derivedSlots !== TARGET_SLOTS) refuse(`the app derives ${g.json?.derivedSlots} slots at p=${p}, not ${TARGET_SLOTS}`);
  log(`ok — the app reads max position % ${p}, exposure ${e}%, ${g.json.derivedSlots} slots`);

  // ── (5) the dashboard epoch = the moment the stop returned ────────────────────────────────────────────────────
  state.step = '5';
  // The write REPLACES the prior epoch's updated_by note (its only record in the database), so print it first.
  const priorEpoch = (await rows<{ v: string; by: string }>(sql`
    SELECT value #>> '{}' AS v, updated_by AS by FROM module_constants
     WHERE module_name = 'scoreboard' AND constant_name = 'epoch_started_at' LIMIT 1`))[0];
  log(`prior epoch ${priorEpoch?.v ?? '(none)'} — updated_by: ${priorEpoch?.by ?? '(none)'}`);
  const epoch = await storage.setScoreboardEpoch(stopReturnedAt, RUN_ID);
  state.epochSet = true;
  if (epoch.epochStartedAt.getTime() !== stopReturnedAt.getTime() || epoch.updatedBy !== RUN_ID) {
    refuse(`epoch read back ${epoch.epochStartedAt.toISOString()} by ${epoch.updatedBy}`);
  }
  log(`ok — dashboard epoch ${epoch.epochStartedAt.toISOString()} (updated_by ${RUN_ID})`);

  // ── (6) start, continuing ────────────────────────────────────────────────────────────────────────────────────
  state.step = '6';
  if (await engineRunning()) refuse('the engine is RUNNING already — somebody started it during the reset, at whatever size was set then');
  const logsBeforeStart = logOffsets();
  const startRequestedAt = new Date();
  const start = await api('POST', '/active-engine/start', { mode: 'continue' });
  if (start.status !== 200 || !start.json?.success) refuse(`start failed (HTTP ${start.status}: ${start.json?.error ?? 'no body'})`);
  if (!(await engineRunning())) refuse('the start returned success but the engine does not report running');
  state.started = true;
  log('ok — engine started (continue)');

  // ── (7) the read-back, from the app ──────────────────────────────────────────────────────────────────────────
  state.step = '7';
  const sum = await api('GET', '/active-engine/portfolio-summary?mode=paper');
  const startingBalance = Number(sum.json?.startingBalance);
  const appBalance = Number(sum.json?.cashBalance);
  const sessionStart = sum.json?.sessionStart ? new Date(sum.json.sessionStart) : null;
  const anchorAfter = await getAnchorState('paper');
  const rowsAfter = await count(sql`SELECT count(*)::int AS n FROM closed_trades WHERE mode = 'paper' AND opened_at < ${runStart}`);
  const resetAfter = await count(sql`
    SELECT count(*)::int AS n FROM closed_trades WHERE mode = 'paper' AND close_reason = 'reset' AND closed_at >= ${resetInstant}`);
  const killSwitchAfter = await killSwitchTripped();
  // THE LIVE BAND MONITOR'S OWN VERDICT (Langston's nit, taken): the start hook runs `checkPaperSizeBand` inside the app
  // — resolving its inputs exactly as it will on every close — and logs one `[PaperSizeBand][<VERDICT>] trigger=engine_start`
  // line. That line is what is asserted. It is fire-and-forget after the start, so it is waited for (up to 60 s).
  let bandLine: string | null = null;
  for (let waited = 0; waited <= 60_000 && !bandLine; waited += 2_000) {
    const m = logTextSince(logsBeforeStart).match(/\[PaperSizeBand\]\[(IN|LOW|HIGH|UNREADABLE)\] trigger=engine_start[^\n]*/);
    if (m) bandLine = m[0];
    else await new Promise((r) => setTimeout(r, 2_000));
  }
  // The formula at the app's balance, reported beside it (a stated cross-check, not the assertion).
  const buf = Number((await rows<{ v: string }>(sql`
    SELECT value #>> '{}' AS v FROM module_constants
     WHERE module_name = 'active_sizing' AND constant_name = 'max_position_buffer_factor'
       AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*' LIMIT 1`))[0]?.v);
  const verdict = evaluatePaperSizeBand({ balance: appBalance, e, p, buffer: buf }, band);
  const readBack = {
    runId: RUN_ID,
    stopRequestedAt: resetInstant.toISOString(),
    epoch: epoch.epochStartedAt.toISOString(),
    preCheck: { open: n, pending },
    closesSinceStop: byReason,
    appPortfolioSummary: { httpStatus: sum.status, startingBalance, cashBalance: appBalance, sessionStart: sessionStart?.toISOString() ?? null },
    anchor: { before: anchorBefore.anchorVersion, after: anchorAfter?.anchorVersion, balance: anchorAfter?.balance },
    maxPositionPct: p,
    maxTotalExposurePct: e,
    derivedSlots: g.json.derivedSlots,
    rowsOpenedBeforeRun: { atStep0: rowsBefore, now: rowsAfter },
    resetCloses: { atStep2: resetCount, now: resetAfter },
    killSwitchTripped: killSwitchAfter,
    band,
    bandMonitorLine: bandLine,
    bandFormulaCrossCheck: { status: verdict.status, size: Number.isFinite(verdict.size) ? Number(verdict.size.toFixed(2)) : null },
  };
  console.log(`[${RESET_TAG}][7] READ-BACK ${JSON.stringify(readBack)}`);
  const problems: string[] = [];
  if (sum.status !== 200) problems.push(`the app's portfolio summary did not load (HTTP ${sum.status})`);
  if (Math.abs(startingBalance - TARGET_BALANCE) > 0.005) problems.push(`the app's starting balance reads ${startingBalance}, not ${TARGET_BALANCE}`);
  if (!sessionStart || sessionStart.getTime() < startRequestedAt.getTime()) problems.push(`the app's session began ${sessionStart?.toISOString() ?? 'never'}, before our start — its balance adds P&L from before the reset`);
  if (anchorAfter?.anchorVersion !== anchorVersion) problems.push('the anchor version moved after step 3');
  if (rowsAfter !== rowsBefore) problems.push(`paper rows opened before the run: ${rowsBefore} at step 0, ${rowsAfter} now — rows were deleted, or a close route that inserts at close ran mid-reset`);
  if (resetAfter !== resetCount) problems.push(`'reset' closes moved from ${resetCount} to ${resetAfter} after the stop`);
  if (killSwitchAfter) problems.push('the paper KILL SWITCH IS TRIPPED — the engine is running but will not trade');
  if (!bandLine) problems.push(`no band-monitor verdict line (trigger=engine_start) in ${APP_LOGS.join(' / ')} within 60 s of the start`);
  else if (!bandLine.startsWith('[PaperSizeBand][IN]')) problems.push(`the live band monitor says: ${bandLine}`);
  if (verdict.status !== 'in') problems.push(`the band formula at the app's balance says ${verdict.status} ($${verdict.size})`);
  if (problems.length) {
    console.error(`[${RESET_TAG}][7] READ-BACK MISMATCH — ${problems.join('; ')}. The reset ran and the engine is running; report this, do not re-run.`);
    process.exit(2);
  }
  log('ok — every read-back matches. PAPER-RESET-3000 complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`[${RESET_TAG}][${state.step}] CRASHED — ${err instanceof Error ? err.message : err}`);
  console.error(`[${RESET_TAG}][${state.step}] ${stateLine()}`);
  process.exit(1);
});
