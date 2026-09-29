/**
 * B-SIZING-DEC-RESTORE increment 3 — P1: KYLE'S PAPER-RESET-3000, RUN ONCE.
 *
 * Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §13.2 P1 (what) and §16.4 (how;
 * Langston's ruling at 66da5e666). One shared paper pot is reset to $3,000; every open paper position is closed and
 * labelled `close_reason = 'reset'`; the max-position % goes to 5 (≈ $145.50 a trade, 20 slots); the Paper Trading
 * dashboard counts from the reset instant; nothing is deleted.
 *
 * HOW: this script drives the app's OWN authenticated API for everything that lives inside the running app (the
 * price cache, the canonical close, the engine stop/start), and calls the ledger's single writers directly for the
 * two database-only steps (the re-anchor, the dashboard epoch). No in-process reset route exists — a reset endpoint
 * left behind would be a re-runnable destructive affordance (rule 18).
 *
 * RUNS: on staging, once, by CC-C, on Kyle's go, immediately after the window's deploy (2a + 2b + 3):
 *   set -a && . ./.env && set +a && DT_API_TOKEN=<crew login token> npx tsx server/scripts/paper-reset-3000.ts
 * ⛔ The token comes from the server-held crew login (B-CREDENTIALS-PRIVATE-REPO OBJ-1) at run time. It is never
 *    typed into this file, never committed, never printed. The reset's own guardrail write therefore signs as the
 *    CREW LOGIN's user id, not Kyle's — it must not be read later as his edit (§16.4 D).
 *
 * ORDER, and it stops at the FIRST failure (no retry):
 *   (0) preconditions — increments 2a/2b/3 are live in this database; the paper engine is running; no earlier
 *       PAPER-RESET-3000 anchor exists (A1: re-runnable up to and including the flatten, NOT after the re-anchor)
 *   (1) the READ-ONLY price pre-check — every open paper position must have an observed price (F3)
 *   (2) POST /active-engine/stop { reason: 'reset' } — the engine blocks new trades FIRST, then flattens every open
 *       paper position under close_reason 'reset' (race-free, §16.4 B1); verified: 0 open, and every close since the
 *       stop began carries 'reset' — a 'manual_stop' among them means the label did not plumb, and the run stops
 *   (3) executeReanchor → $3,000, measurement_override, note citing PAPER-RESET-3000
 *   (4) PUT /guardrails-v2 { maxPositionPercentPct: 5 } — then REFUSE to start unless it reads back 5 (§16.4 D:
 *       starting at 20% on $3,000 would size $582 a trade until a human edits)
 *   (5) the dashboard epoch — storage.setScoreboardEpoch(reset instant, this run's id), read back; then REFUSE to
 *       start unless the paper balance reads 3,000.00 (checked while stopped, the one moment nothing can move it)
 *   (6) POST /active-engine/start { mode: 'continue' } — NEVER 'new' (F1: 'new' hard-resets the tables)
 *   (7) the read-back: balance 3,000.00; anchor +1; the epoch row; the 'reset' closes; NOTHING DELETED = the count of
 *       paper closed_trades rows opened before the run began is unchanged; derived slots 20; the band verdict
 * ⚠️ A closed_trades row is WRITTEN AT OPEN and UPDATED at close (createClosedTrade / updateClosedTrade), so a close
 *    adds no row. "Nothing deleted" is therefore the pre-run population counted twice, never "before + N".
 * ⚠️ N from the pre-check and the number of 'reset' closes can differ by the odd position: the engine is still running
 *    between step 1 and the stop, so a position can open or exit naturally in that gap. That is reported, not refused.
 * ⚠️ If step 2 leaves anything open, the script stops with the ENGINE STOPPED and says so — restarting would reopen at
 *    the old size. That is an operator decision, not something this script guesses.
 */
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { storage } from '../storage.js';
import { executeReanchor, getAnchorState } from '../services/portfolio-anchor-service.js';
import { getPortfolioBalanceV2 } from '../services/guardrail-settings.js';
import { deriveSlotCount, resolveEffectivePositionPct } from '../services/active-position-sizing.js';
import { evaluatePaperSizeBand } from '../services/paper-size-band.js';

const TARGET_BALANCE = 3000;
const TARGET_P = 5;
const RESET_TAG = 'PAPER-RESET-3000';
const API = (process.env.DT_API_BASE || 'http://localhost:5000/api').replace(/\/$/, '');
const TOKEN = process.env.DT_API_TOKEN || '';
const RUN_ID = `paper-reset-3000-${new Date().toISOString()}`;
const log = (step: string, msg: string) => console.log(`[${RESET_TAG}][${step}] ${msg}`);

function refuse(step: string, why: string): never {
  console.error(`[${RESET_TAG}][${step}] REFUSED — ${why}`);
  console.error(`[${RESET_TAG}] Stopped at ${step}. Nothing after this step ran.`);
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

async function one<T = any>(q: ReturnType<typeof sql>): Promise<T | undefined> {
  const r: any = await db.execute(q);
  return (r?.rows ?? r)?.[0];
}

async function main() {
  log('RUN', `run id ${RUN_ID}; API ${API}`);
  if (!TOKEN) refuse('0', 'DT_API_TOKEN is not set (the crew login token, B-CREDENTIALS-PRIVATE-REPO OBJ-1)');

  // ── (0) preconditions — the deployed code is present IN THIS DATABASE, checked at the objects ────────────────
  const noSlotsColumn = await one<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM information_schema.columns
     WHERE table_name = 'guardrails_v2' AND column_name = 'max_open_positions'`);
  if (Number(noSlotsColumn?.n) !== 0) refuse('0', 'increment 2a is not applied (guardrails_v2.max_open_positions still exists)');
  const floor = await one<{ def: string }>(sql`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conname = 'guardrails_v2_max_position_percent_pct_range'`);
  if (!floor?.def || !/>=\s*\(?1\)?/.test(floor.def)) refuse('0', `increment 2b is not applied (the position-% floor reads: ${floor?.def ?? 'absent'})`);
  const band = await one<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM module_constants
     WHERE module_name = 'paper_size_band' AND constant_name IN ('low', 'high', 'target')`);
  if (Number(band?.n) !== 3) refuse('0', `increment 3's band rows are not seeded (found ${band?.n})`);
  const prior = await one<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM portfolio_anchor_events WHERE mode = 'paper' AND note LIKE ${'%' + RESET_TAG + '%'}`);
  if (Number(prior?.n) > 0) refuse('0', `a ${RESET_TAG} anchor already exists — this reset has run; it is NOT re-runnable after the re-anchor (A1)`);
  const status = await api('GET', '/active-engine/status');
  if (status.status !== 200 || !status.json?.isRunning) refuse('0', `the paper engine is not running (status ${status.status})`);
  const anchorBefore = await getAnchorState('paper');
  if (!anchorBefore) refuse('0', 'no paper anchor state');
  // The "nothing deleted" population: every paper row opened before this run began. Counted again at step 7.
  const runStart = new Date();
  const rowsBefore = Number((await one<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM closed_trades WHERE mode = 'paper' AND opened_at < ${runStart}`))?.n);
  log('0', `ok — 2a/2b/3 present; engine running; anchor v${anchorBefore.anchorVersion} $${anchorBefore.balance}; paper rows opened before ${runStart.toISOString()}: ${rowsBefore}`);

  // ── (1) the read-only price pre-check ─────────────────────────────────────────────────────────────────────────
  const pre = await api('GET', '/active-engine/flatten-precheck');
  if (pre.status !== 200 || !pre.json?.ok) refuse('1', `pre-check failed (status ${pre.status}: ${pre.json?.error ?? 'no body'})`);
  const unpriced = (pre.json.positions as Array<{ symbol: string; hasObservedPrice: boolean }>).filter((p) => !p.hasObservedPrice);
  if (unpriced.length > 0) refuse('1', `no observed price for ${unpriced.map((p) => p.symbol).join(', ')} — the flatten would leave them open`);
  const n = Number(pre.json.count);
  log('1', `ok — ${n} open paper position(s), every one priced`);

  // ── (2) stop, flattening under close_reason 'reset' ───────────────────────────────────────────────────────────
  const resetInstant = new Date();
  const stop = await api('POST', '/active-engine/stop', { reason: 'reset' });
  if (stop.status !== 200 || !stop.json?.success) refuse('2', `stop failed (status ${stop.status}: ${stop.json?.error ?? 'no body'})`);
  const stillOpen = await storage.getActiveOpenPositions('paper');
  if (stillOpen.length > 0) {
    refuse('2', `the ENGINE IS STOPPED and ${stillOpen.length} position(s) are still open (${stillOpen.map((p) => p.symbol).join(', ')}). `
      + 'Do not restart until they are closed — a restart reopens at the old size. Operator decision.');
  }
  // Every close since the stop began, by reason. 'reset' is the flatten; a natural exit can land in the instant
  // before ENGINE_STOPPING took hold; a 'manual_stop' here means the label did NOT reach the close, which is the one
  // thing other windows depend on (CC-B's 3n.u exclusion is a query on it).
  const byReasonRes: any = await db.execute(sql`
    SELECT coalesce(close_reason, '(null)') AS reason, count(*)::int AS n FROM closed_trades
     WHERE mode = 'paper' AND closed_at >= ${resetInstant} GROUP BY 1 ORDER BY 1`);
  const byReason: Record<string, number> = Object.fromEntries(((byReasonRes?.rows ?? byReasonRes) as any[]).map((r) => [r.reason, Number(r.n)]));
  const resetCount = byReason['reset'] ?? 0;
  log('2', `closes since the stop began, by reason: ${JSON.stringify(byReason)}`);
  if ((byReason['manual_stop'] ?? 0) > 0) refuse('2', `${byReason['manual_stop']} close(s) carry 'manual_stop', not 'reset' — the label did not plumb (engine is STOPPED)`);
  if (n > 0 && resetCount === 0) refuse('2', `the pre-check saw ${n} open position(s) and no close carries 'reset' (engine is STOPPED)`);
  if (resetCount !== n) log('2', `NOTE — pre-check counted ${n}, the flatten closed ${resetCount}: the engine ran between the two (reported, not refused)`);
  log('2', `ok — engine stopped; ${resetCount} position(s) closed as 'reset'; 0 open`);

  // ── (3) the re-anchor ────────────────────────────────────────────────────────────────────────────────────────
  const { anchorVersion } = await executeReanchor({
    mode: 'paper',
    newBalance: TARGET_BALANCE,
    reason: 'measurement_override',
    note: `Kyle-directed ${RESET_TAG} (2026-09-29, as corrected): one shared paper pot reset to $3,000 for ~20 trades at `
      + `~$140-150; every open paper position closed as 'reset' by the engine stop; nothing deleted. Prior anchored balance `
      + `$${Number(anchorBefore.balance).toFixed(2)} (v${anchorBefore.anchorVersion}). Run ${RUN_ID}. Plan: B-SIZING-DEC-RESTORE PRE_AUDIT §13.2 P1 + §16.4.`,
  });
  if (anchorVersion !== anchorBefore.anchorVersion + 1) refuse('3', `anchor version ${anchorVersion}, expected ${anchorBefore.anchorVersion + 1}`);
  log('3', `ok — paper anchor v${anchorVersion} = $${TARGET_BALANCE}`);

  // ── (4) p = 5, through the governed path, read back before any start ─────────────────────────────────────────
  const put = await api('PUT', '/guardrails-v2?mode=paper', { maxPositionPercentPct: TARGET_P });
  if (put.status !== 200) refuse('4', `guardrails save failed (status ${put.status}: ${put.json?.detail ?? put.json?.error ?? 'no body'}) — engine STOPPED, anchor v${anchorVersion} written`);
  const g = await storage.getGuardrailsV2({ mode: 'paper' });
  const p = parseFloat(String(g?.maxPositionPercentPct));
  if (p !== TARGET_P) refuse('4', `max_position_percent_pct reads ${g?.maxPositionPercentPct}, not ${TARGET_P} — NOT starting (it would size at the old %)`);
  log('4', `ok — paper max position % reads ${p}`);

  // ── (5) the dashboard epoch ──────────────────────────────────────────────────────────────────────────────────
  // The write REPLACES the prior epoch's updated_by note (its only record in the database), so print it first:
  // the run log then carries the previous epoch's provenance.
  const priorEpoch = await one<{ v: string; by: string }>(sql`
    SELECT value #>> '{}' AS v, updated_by AS by FROM module_constants
     WHERE module_name = 'scoreboard' AND constant_name = 'epoch_started_at' LIMIT 1`);
  log('5', `prior epoch ${priorEpoch?.v ?? '(none)'} — updated_by: ${priorEpoch?.by ?? '(none)'}`);
  const epoch = await storage.setScoreboardEpoch(resetInstant, RUN_ID);
  if (epoch.epochStartedAt.getTime() !== resetInstant.getTime() || epoch.updatedBy !== RUN_ID) {
    refuse('5', `epoch read back ${epoch.epochStartedAt.toISOString()} by ${epoch.updatedBy}`);
  }
  log('5', `ok — dashboard epoch ${epoch.epochStartedAt.toISOString()} (updated_by ${RUN_ID})`);

  // The balance the sizer will read, checked while the engine is still STOPPED — nothing can close and move it yet,
  // so this is the one moment the reading is exactly the re-anchor's. Same refuse-before-start shape as step 4.
  const balanceAtStart = await getPortfolioBalanceV2('paper');
  if (Math.abs(balanceAtStart - TARGET_BALANCE) > 0.005) refuse('5', `the paper balance reads ${balanceAtStart}, not ${TARGET_BALANCE} — NOT starting`);
  log('5', `ok — the paper balance reads ${balanceAtStart.toFixed(2)}`);

  // ── (6) start, continuing ────────────────────────────────────────────────────────────────────────────────────
  const start = await api('POST', '/active-engine/start', { mode: 'continue' });
  if (start.status !== 200 || !start.json?.success) refuse('6', `start failed (status ${start.status}: ${start.json?.error ?? 'no body'}) — engine STOPPED, reset otherwise complete`);
  log('6', 'ok — engine started (continue)');

  // ── (7) the read-back ────────────────────────────────────────────────────────────────────────────────────────
  // The engine is RUNNING again here, so the open count and (after the first close) the balance are live readings,
  // reported rather than asserted; the balance was asserted at step 5, while stopped.
  const balance = balanceAtStart;
  const anchorAfter = await getAnchorState('paper');
  const openAfter = await storage.getActiveOpenPositions('paper');
  const rowsAfter = Number((await one<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM closed_trades WHERE mode = 'paper' AND opened_at < ${runStart}`))?.n);
  const resetAfter = Number((await one<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM closed_trades
     WHERE mode = 'paper' AND close_reason = 'reset' AND closed_at >= ${resetInstant}`))?.n);
  const bandRows = await db.execute(sql`
    SELECT constant_name, (value #>> '{}')::numeric AS v FROM module_constants
     WHERE module_name = 'paper_size_band' ORDER BY constant_name`);
  const bandMap = Object.fromEntries(((bandRows as any)?.rows ?? bandRows).map((r: any) => [r.constant_name, Number(r.v)]));
  const buf = await one<{ v: number }>(sql`
    SELECT (value #>> '{}')::numeric AS v FROM module_constants
     WHERE module_name = 'active_sizing' AND constant_name = 'max_position_buffer_factor' LIMIT 1`);
  const e = parseFloat(String(g?.maxTotalExposurePct));
  const verdict = evaluatePaperSizeBand(
    { balance, e, p, buffer: Number(buf?.v) },
    { low: bandMap.low, high: bandMap.high, target: bandMap.target },
  );
  const slots = deriveSlotCount(resolveEffectivePositionPct(p, 'quant'));
  const readBack = {
    runId: RUN_ID,
    resetInstant: resetInstant.toISOString(),
    preCheckOpen: n,
    closedAsReset: { atStep2: resetCount, now: resetAfter, byReasonAtStep2: byReason },
    balanceAtStart: Number(balance.toFixed(2)),
    anchor: { before: anchorBefore.anchorVersion, after: anchorAfter?.anchorVersion, balance: anchorAfter?.balance },
    epoch: epoch.epochStartedAt.toISOString(),
    openPositionsSinceStart: openAfter.length,
    rowsOpenedBeforeRun: { atStep0: rowsBefore, now: rowsAfter },
    maxPositionPct: p,
    maxTotalExposurePct: e,
    derivedSlots: slots,
    band: bandMap,
    bandVerdict: { status: verdict.status, size: Number(verdict.size.toFixed(2)) },
  };
  console.log(`[${RESET_TAG}][7] READ-BACK ${JSON.stringify(readBack)}`);
  const problems: string[] = [];
  if (anchorAfter?.anchorVersion !== anchorVersion) problems.push('anchor version moved after step 3');
  if (rowsAfter !== rowsBefore) problems.push(`paper rows opened before the run: ${rowsBefore} at step 0, ${rowsAfter} now — something was deleted or re-dated`);
  if (resetAfter !== resetCount) problems.push(`'reset' closes moved from ${resetCount} to ${resetAfter} after the stop`);
  if (slots !== 20) problems.push(`derived slots ${slots} ≠ 20`);
  if (verdict.status !== 'in') problems.push(`band verdict ${verdict.status} at $${verdict.size}`);
  if (problems.length) {
    console.error(`[${RESET_TAG}][7] READ-BACK MISMATCH — ${problems.join('; ')}. The reset ran; report this, do not re-run.`);
    process.exit(2);
  }
  log('7', 'ok — every read-back matches. PAPER-RESET-3000 complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`[${RESET_TAG}] FAILED:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
