/**
 * B-SIZING-DEC-RESTORE increment 3 — P1: KYLE'S PAPER-RESET-3000, RUN ONCE.
 *
 * Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §13.2 P1 (what), §16.4 (how; Langston's
 * ruling at 66da5e666) and §16.5 (as built). One shared paper pot is reset to the balance given on the command line
 * (Kyle 2026-10-06: the real Kraken balance, $820 — replacing the $3,000 of 09-29); every open paper position is
 * closed and labelled `close_reason = 'reset'` (a resting maker order that never filled is dropped as `never_filled`,
 * #1100); the Paper Trading dashboard counts from the reset; nothing is deleted.
 * ⛔ THE SCRIPT WRITES NO SETTING (Kyle 2026-10-06: "it should be a database field that we can update"). The max-position %
 *    (5 ⇒ 20 slots) and the paper daily-loss kill switch (15%) are set on the Guardrails screen BEFORE the run; step 4
 *    only prints what the app reads, so the operator sees them beside the balance. No amount is written into this file.
 *
 * HOW: this script drives the app's OWN authenticated API for everything that lives inside the running app (the
 * price cache, the canonical close, the engine stop/start, the balance the app sizes from), and calls the ledger's
 * single writers directly for the two database-only steps (the re-anchor, the dashboard epoch). No in-process reset
 * route exists — a reset endpoint left behind would be a re-runnable destructive affordance.
 *
 * RUNS: on staging, once, by CC-C, on Kyle's go, immediately after the window's deploy (increments 2a-2e and 3):
 *   set -a && . ./.env && set +a && DT_API_TOKEN=<crew login token> npx tsx server/scripts/paper-reset-3000.ts \
 *     --balance 820 --expect-position-pct 5 --expect-kill-pct 15
 * ⛔ The token comes from the server-held crew login (B-CREDENTIALS-PRIVATE-REPO OBJ-1) at run time. It is never
 *    typed into this file, never committed, never printed.
 * ⛔ All three flags are REQUIRED and have no default: a missing or non-positive value is a refusal before anything changes.
 *    The two `--expect-*` values are what the operator set on the Guardrails screen; the script only CHECKS them against
 *    what the app reads (step 0 and step 7), so a forgotten setting or a 0.5-for-5 slip stops the reset (Langston r6 C2).
 *
 * ORDER, and it stops at the FIRST failure (no retry). Every refusal and every crash names the step AND the state it
 * leaves (engine stopped? anchor written?):
 *   (0) preconditions — the window's two migrations in the db:migrate ledger, increment 1's position-% range at the
 *       object, no earlier PAPER-RESET-3000 anchor (A1), the engine running, the paper KILL SWITCH NOT TRIPPED, the max
 *       position % and the kill switch the app reads EQUAL the operator's --expect-* values, no
 *       open closed_trades row without a position
 *   (1) the READ-ONLY pre-check — every open paper position is closable (priced, or a pending maker)
 *   (2) POST /active-engine/stop { reason: 'reset' } — the engine blocks new trades FIRST, then flattens (race-free,
 *       §16.4 B1). REFUSES unless the stop's own flatten report is clean (ran, no throw, no failure, nothing left open,
 *       nothing deleted by the orphan cleanup), nothing is open, no open closed_trades row remains, and no close since
 *       the stop began carries 'manual_stop' or 'engine_stop_cleanup'
 *   (3) executeReanchor → the --balance amount, measurement_override, a note citing PAPER-RESET-3000 — engine re-checked
 *       STOPPED first
 *   (4) PRINT the settings the app reads (max position %, exposure, derived slots, kill switch) — no write, no refusal:
 *       they are the operator's, set on the Guardrails screen before the run (Kyle 2026-10-06)
 *   (5) the dashboard epoch = the moment the stop RETURNED (so a position opened in the last instant before the stop
 *       counts as pre-reset, not post-); the previous epoch row is printed first
 *   (6) POST /active-engine/start { mode: 'continue' } — NEVER 'new' (it hard-resets the tables). Engine re-checked
 *       STOPPED first, so a start somebody else made in steps 3-5 is caught rather than reported as ours.
 *   (7) the read-back, FROM THE APP: its portfolio summary (the starting balance is PRINTED for the operator's own look —
 *       Kyle 2026-10-06 — and a session that began at our start), the kill switch still clear, the two settings still
 *       equal to the --expect-* values; plus the anchor, the
 *       'reset' closes and NOTHING DELETED (the paper rows opened before the run, counted at step 0 and again now)
 * ⚠️ RESUME POINT (A1): re-runnable up to and including the flatten; NOT after step 3 — the re-anchor mints a version,
 *    and step 0 refuses on its note. A run that stops after step 2 leaves the engine stopped; finishing it is a manual
 *    operator step (§16.5), never a re-run.
 * ⚠️ A closed_trades row is WRITTEN AT OPEN and UPDATED at close on the engine's path, so the flatten adds no row;
 *    "nothing deleted" is the pre-run population counted twice. Two operator routes (close-trade/:id,
 *    force-clear-stranded) do insert at close — this run calls neither, and one called by hand mid-run would show here.
 * ★ THE KILL SWITCH AFTER A RESET (B-LOSS-WINDOW-OPERATOR-CLOSES, #1154): every close booked before step 3's re-anchor —
 *    the reset's own and any earlier one — is outside the kill switch's window, which starts no earlier than the last
 *    operator re-anchor. No 24-hour hold. (Before that batch the 'reset' closes stayed out ONLY because the start opened
 *    a new session, and a restart without one (#585) brought them back.)
 */
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { executeReanchor, getAnchorState } from '../services/portfolio-anchor-service.js';
import { storage } from '../storage.js';

// ⚠️ The tag keeps its 09-29 name although the amount changed: step 0's A1 check and the engine's 'reset' close reason both
// match this exact string, and renaming it would let a run of the old name pass A1.
const RESET_TAG = 'PAPER-RESET-3000';
// The two migrations the reset depends on, as the db:migrate ledger names them: increment 1's position-% range and
// 2a's retired slot column. (2b's floor migration was WITHDRAWN before deploy — increment 2e, PRE_AUDIT §20.4; 3's size
// band was REMOVED before deploy — Kyle 2026-10-06, DELETED_COMPONENTS_LOG.)
const MIGRATIONS = [
  '2026-09-29-b-sizing-p5-guardrail-pct-range.sql',
  '2026-09-29-b-sizing-inc2a-retire-max-open-positions.sql',
] as const;
// A close that lands between the stop request and the engine blocking new work is legitimate; these may appear.
const REASONS_ALLOWED_AT_STOP = new Set(['reset', 'never_filled', 'stop_hit', 'target_hit', 'trailing_stop_hit', 'max_holding_period', 'guardrail']);
const API = (process.env.DT_API_BASE || 'http://localhost:5000/api').replace(/\/$/, '');
const TOKEN = process.env.DT_API_TOKEN || '';
const RUN_ID = `paper-reset-3000-${new Date().toISOString()}`;

/** A positive number from `<flag> <value>` — required, no default (Kyle 2026-10-06: no amount lives in the code). */
export function parsePositiveArg(argv: readonly string[], flag: string): number | null {
  const i = argv.indexOf(flag);
  if (i < 0 || i + 1 >= argv.length) return null;
  const v = Number(argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}
// The reset balance, and the two settings the OPERATOR says they set on the Guardrails screen (Langston r6 condition 2:
// the script writes neither, so it checks both against what the app reads — at step 0, before anything changes, and
// again at step 7). A forgotten setting would otherwise restart trading at the old % with every check green, and a
// 0.5-for-5 slip has no other detector (#1155).
const BALANCE = parsePositiveArg(process.argv, '--balance');
const EXPECT_POSITION_PCT = parsePositiveArg(process.argv, '--expect-position-pct');
const EXPECT_KILL_PCT = parsePositiveArg(process.argv, '--expect-kill-pct');

/** The two settings as the app reads them, and whether they match what the operator said they set. */
async function settingsMismatch(expectP: number, expectKill: number): Promise<string | null> {
  const g = await api('GET', '/guardrails-v2?mode=paper');
  if (g.status !== 200) return `the guardrails could not be read (HTTP ${g.status})`;
  const p = parseFloat(String(g.json?.data?.maxPositionPercentPct));
  const k = parseFloat(String(g.json?.data?.dailyLossKillSwitchPct));
  const bad: string[] = [];
  if (!(Math.abs(p - expectP) < 1e-9)) bad.push(`max position % reads ${g.json?.data?.maxPositionPercentPct}, expected ${expectP}`);
  if (!(Math.abs(k - expectKill) < 1e-9)) bad.push(`the kill switch reads ${g.json?.data?.dailyLossKillSwitchPct}%, expected ${expectKill}%`);
  return bad.length ? `${bad.join('; ')} — set them on the Guardrails screen (or correct the expectation)` : null;
}

// What the run has done so far, so every exit — a refusal or a crash — says what state it leaves.
const state = { step: '0', stopRequested: false, engineStopped: false, anchorWritten: false, epochSet: false, started: false };
const log = (msg: string) => console.log(`[${RESET_TAG}][${state.step}] ${msg}`);

function stateLine(): string {
  if (!state.stopRequested) return 'Nothing was changed: the engine was not asked to stop.';
  const parts = [
    state.engineStopped ? 'the paper engine is STOPPED' : 'the stop was requested and its outcome is NOT confirmed — read GET /active-engine/status and the open positions before anything else',
    state.anchorWritten ? `the $${BALANCE} anchor IS written (this run cannot be repeated — A1)` : 'the anchor is NOT written',
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

// GET and POST only: the script writes no setting (r6), so a PUT here would be a write nobody reviewed (Langston r7 nit).
async function api(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: any }> {
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

/** The paper kill switch, as the app reads it (Langston condition 2: a reset must not finish with trading latched shut). */
async function killSwitchTripped(): Promise<boolean> {
  const g = await api('GET', '/guardrails-v2?mode=paper');
  if (g.status !== 200 || typeof g.json?.data?.killSwitchTripped !== 'boolean') refuse(`the paper kill switch could not be read (HTTP ${g.status})`);
  return g.json.data.killSwitchTripped;
}

async function main() {
  log(`run id ${RUN_ID}; API ${API}`);
  if (!TOKEN) refuse('DT_API_TOKEN is not set (the crew login token, B-CREDENTIALS-PRIVATE-REPO OBJ-1)');
  if (BALANCE === null) refuse('--balance <amount> is required (a positive number; Kyle 2026-10-06: $820, the real Kraken balance)');
  if (EXPECT_POSITION_PCT === null || EXPECT_KILL_PCT === null) {
    refuse('--expect-position-pct <p> and --expect-kill-pct <k> are required: the values you set on the Guardrails screen (Kyle 2026-10-06: 5 and 15)');
  }
  const balance: number = BALANCE;
  const expectP: number = EXPECT_POSITION_PCT;
  const expectKill: number = EXPECT_KILL_PCT;

  // ── (0) preconditions ────────────────────────────────────────────────────────────────────────────────────────
  // The migration ledger for both increments. 2a is checked ONLY here: its database half drops the retired
  // open-slots column, whose name the legacy-deletion fence bans from source (rightly — a reference that keeps the name
  // alive is how a dead mechanism comes back). Increment 1's range is ALSO checked at its object.
  const migrated = new Set((await rows<{ name: string }>(sql`
    SELECT name FROM _migrations WHERE name IN (${MIGRATIONS[0]}, ${MIGRATIONS[1]})`)).map((r) => r.name));
  const notMigrated = MIGRATIONS.filter((m) => !migrated.has(m));
  if (notMigrated.length) refuse(`not in the migration ledger: ${notMigrated.join(', ')} — the window's deploy has not run here`);
  const floor = (await rows<{ def: string }>(sql`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'guardrails_v2_max_position_percent_pct_range'`))[0];
  if (!floor?.def || !/max_position_percent_pct\s*>\s*\(?0\b/.test(floor.def) || !/<=\s*\(?100\b/.test(floor.def)) {
    refuse(`increment 1's position-% range (0 < p <= 100) is not in place (reads: ${floor?.def ?? 'absent'})`);
  }
  if (await count(sql`SELECT count(*)::int AS n FROM portfolio_anchor_events WHERE mode = 'paper' AND note LIKE ${'%' + RESET_TAG + '%'}`) > 0) {
    refuse(`a ${RESET_TAG} anchor already exists — this reset has run past step 3; it is NOT re-runnable (A1)`);
  }
  if (!(await engineRunning())) {
    refuse('the paper engine is not running. If an earlier run of this script stopped it, read that run\'s log: the flatten is done and finishing is a manual operator step (PRE_AUDIT §16.5), not a re-run.');
  }
  if (await killSwitchTripped()) {
    refuse('the paper KILL SWITCH IS TRIPPED — a reset would finish with every read-back green and nothing trading. Clear it (or decide not to) first.');
  }
  const settingsBefore = await settingsMismatch(expectP, expectKill);
  if (settingsBefore) refuse(settingsBefore);
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
  log(`ok — ledger has 1/2a; range ${floor.def}; engine running; kill switch clear; anchor v${anchorBefore.anchorVersion} $${anchorBefore.balance}; 0 stale rows; paper rows opened before ${runStart.toISOString()}: ${rowsBefore}; reset balance $${balance}`);

  // ── (1) the read-only pre-check ───────────────────────────────────────────────────────────────────────────────
  state.step = '1';
  const pre = await api('GET', '/active-engine/flatten-precheck');
  if (pre.status !== 200 || !pre.json?.ok || !Array.isArray(pre.json.positions)) refuse(`pre-check failed (HTTP ${pre.status}: ${pre.json?.error ?? 'no body'})`);
  const positions = pre.json.positions as Array<{ symbol: string; state: string; closable: boolean }>;
  const notClosable = positions.filter((p) => !p.closable);
  if (notClosable.length > 0) refuse(`no observed price for ${notClosable.map((p) => p.symbol).join(', ')} — the flatten would leave them open`);
  const n = positions.length;
  const pending = positions.filter((p) => p.state === 'pending').length;
  log(`ok — ${n} open paper position(s): ${n - pending} priced, ${pending} pending maker(s) (dropped as never_filled)${n === 0 ? ' — a CLEAN ZERO: the flatten will close nothing' : ''}`);

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
    newBalance: balance,
    reason: 'measurement_override',
    note: `Kyle-directed ${RESET_TAG} (2026-09-29; amount 2026-10-06): one shared paper pot reset to $${balance}, the real `
      + `Kraken balance; every open paper position closed as 'reset' by the engine stop; nothing deleted. Prior anchored balance `
      + `$${Number(anchorBefore.balance).toFixed(2)} (v${anchorBefore.anchorVersion}). Run ${RUN_ID}. Plan: B-SIZING-DEC-RESTORE PRE_AUDIT §13.2 P1 + §16.4.`,
  });
  state.anchorWritten = true;
  if (anchorVersion !== anchorBefore.anchorVersion + 1) refuse(`anchor version ${anchorVersion}, expected ${anchorBefore.anchorVersion + 1}`);
  log(`ok — paper anchor v${anchorVersion} = $${balance}`);

  // ── (4) the settings, as the app reads them — PRINTED, not written (Kyle 2026-10-06: they are the operator's) ────
  state.step = '4';
  const g = await api('GET', '/guardrails-v2?mode=paper');
  const settings = {
    httpStatus: g.status,
    maxPositionPct: g.json?.data?.maxPositionPercentPct ?? null,
    maxTotalExposurePct: g.json?.data?.maxTotalExposurePct ?? null,
    derivedSlots: g.json?.derivedSlots ?? null,
    dailyLossKillSwitchPct: g.json?.data?.dailyLossKillSwitchPct ?? null,
  };
  log(`the app reads: max position % ${settings.maxPositionPct}, exposure ${settings.maxTotalExposurePct}%, ${settings.derivedSlots} slots, kill switch ${settings.dailyLossKillSwitchPct}% — set on the Guardrails screen, not by this script`);

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
  const readBack = {
    runId: RUN_ID,
    stopRequestedAt: resetInstant.toISOString(),
    epoch: epoch.epochStartedAt.toISOString(),
    preCheck: { open: n, pending },
    closesSinceStop: byReason,
    appPortfolioSummary: { httpStatus: sum.status, startingBalance, cashBalance: appBalance, sessionStart: sessionStart?.toISOString() ?? null },
    anchor: { before: anchorBefore.anchorVersion, after: anchorAfter?.anchorVersion, balance: anchorAfter?.balance },
    settingsAtStep4: settings,
    rowsOpenedBeforeRun: { atStep0: rowsBefore, now: rowsAfter },
    resetCloses: { atStep2: resetCount, now: resetAfter },
    killSwitchTripped: killSwitchAfter,
  };
  console.log(`[${RESET_TAG}][7] READ-BACK ${JSON.stringify(readBack)}`);
  const problems: string[] = [];
  if (sum.status !== 200) problems.push(`the app's portfolio summary did not load (HTTP ${sum.status})`);
  if (!sessionStart || sessionStart.getTime() < startRequestedAt.getTime()) problems.push(`the app's session began ${sessionStart?.toISOString() ?? 'never'}, before our start — its balance adds P&L from before the reset, and the kill switch's loss count would include the reset's closes`);
  if (anchorAfter?.anchorVersion !== anchorVersion) problems.push('the anchor version moved after step 3');
  if (rowsAfter !== rowsBefore) problems.push(`paper rows opened before the run: ${rowsBefore} at step 0, ${rowsAfter} now — rows were deleted, or a close route that inserts at close ran mid-reset`);
  if (resetAfter !== resetCount) problems.push(`'reset' closes moved from ${resetCount} to ${resetAfter} after the stop`);
  if (killSwitchAfter) problems.push('the paper KILL SWITCH IS TRIPPED — the engine is running but will not trade');
  const settingsAfter = await settingsMismatch(expectP, expectKill);
  if (settingsAfter) problems.push(`the settings changed during the reset: ${settingsAfter}`);
  if (problems.length) {
    console.error(`[${RESET_TAG}][7] READ-BACK MISMATCH — ${problems.join('; ')}. The reset ran and the engine is running; report this, do not re-run.`);
    process.exit(2);
  }
  log(`ok — PAPER-RESET-3000 complete. The app's starting balance reads $${startingBalance.toFixed(2)} (asked for $${balance}) — check it on the Paper Trading screen.`);
  process.exit(0);
}

// Runs only when executed directly, so a test can import parsePositiveArg without starting a reset.
if (process.argv[1] && /paper-reset-3000\.[tj]s$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(`[${RESET_TAG}][${state.step}] CRASHED — ${err instanceof Error ? err.message : err}`);
    console.error(`[${RESET_TAG}][${state.step}] ${stateLine()}`);
    process.exit(1);
  });
}
