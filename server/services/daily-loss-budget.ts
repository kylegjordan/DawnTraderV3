/**
 * P19-B6: Daily Loss-Budget Kill Switch — automatic auto-trip evaluator.
 *
 * RESTORE of the deleted Phase-8 `risk-manager.ts::checkKillSwitch` + `calculate24hPL`
 * (recovered from `594aad717^`; the whole RiskManager class was deleted 2026-01-01 in
 * "Remove legacy risk management and userId parameters" — the working auto-trip was
 * collateral of that remove-legacy sweep). Re-homed to the modern mode-based architecture
 * and re-pointed at `guardrails_v2` / `getPortfolioBalanceV2` / `getEngineSessionStart`.
 *
 * WHAT IT DOES (per close of a paper/live trade, tick-deferred):
 *   - computes the rolling-24h realized loss as a % of portfolio (session-anchored window),
 *   - compares it to the per-mode `dailyLossKillSwitchPct` + the two warning tiers
 *     (`dailyLossWarning1Pct` / `dailyLossWarning2Pct`, stored as % OF the kill threshold),
 *   - fires an INFO/WARNING system-alert at the warning tiers (ratchet + hysteresis re-arm),
 *   - on breach, auto-trips the EXISTING `guardrailPolicy.tripKillSwitch` (which already
 *     flattens all open positions via `stopPaperSimulation → forceCloseAllOpenPositionsOnStop`
 *     — so we do NOT restore the Phase-8 `closeAllTrades`; that would double-close) + a
 *     CRITICAL system-alert.
 *
 * SAFETY (Langston Step-2 conditions):
 *   - re-entrancy: the kill flatten routes back through `closePosition` → re-fires this hook.
 *     Prevented by (1) `tripKillSwitch` persisting `killSwitchTripped`/`isEngineActive=false`
 *     BEFORE the flatten, (2) the setImmediate-deferred hook running next-tick after the trip,
 *     and (3) the synchronous in-memory `killInProgress` latch with an ATOMIC check-and-set
 *     (no await between the check and the set) that closes the same-tick double-trip window.
 *   - circuit-breaker: the loss window is anchored to `max(now-24h, engineSessionStart)`, so a
 *     deliberate restart (which advances `engineSessionStart` AND clears the trip + the latch
 *     via `resetDailyLossBudgetState`) rebaselines the budget — no immediate re-trip. This is
 *     a circuit-breaker on the current run, NOT a hard calendar-day lockout.
 *   - gating: only evaluates when active trading is ON for the mode (`isEngineActive`); dormant
 *     during VTS/passive learning.
 *
 * NOTE: the Phase-8 `killSwitchEvents` table write is intentionally NOT restored — it is
 * userId-coupled legacy (FK to users.id). The modern persistent record is the system-alert
 * (addAlert, queue-visible) + `guardrails_v2.killSwitchReason`/`killSwitchTrippedAt` (set by
 * tripKillSwitch). NOT-DORMANT in mechanism but DORMANT-IN-EFFECT until active paper turns on.
 */

import { storage } from '../storage';
import type { TradingMode } from './guardrail-policy';

// Hysteresis re-arm band (operational anti-flap, NOT a risk threshold): a warning tier re-arms
// when the loss recedes below this fraction of the tier's loss threshold. Tier fires at 100% of
// its loss threshold, re-arms at 90% — a 10% band so a loss hovering at the boundary cannot flap.
const REARM_FRACTION = 0.9;

// ─── Types ──────────────────────────────────────────────────────────────────

export type DailyLossTier = 'none' | 'warn1' | 'warn2' | 'kill';

export interface DailyLossSnapshot {
  realizedPnl24h: number;   // signed: negative = loss
  portfolioValue: number;   // getPortfolioBalanceV2(mode)
  lossPercent: number;      // POSITIVE magnitude of loss as % of portfolio; 0 if flat/profit
  windowStart: Date;        // max(now-24h, engineSessionStart)
  nonPositiveValue: boolean; // portfolioValue <= 0 → force-breach (never compute a ratio)
}

export interface DailyLossVerdict {
  tier: DailyLossTier;
  lossPercent: number;
  killThreshold: number;    // dailyLossKillSwitchPct (absolute % of portfolio)
  warn1Loss: number;        // (warn1Pct/100) * killThreshold  (absolute % of portfolio)
  warn2Loss: number;        // (warn2Pct/100) * killThreshold
  portfolioValue: number;
}

// ─── Pure compute core (exported for unit tests) ─────────────────────────────

/**
 * Loss magnitude as a % of portfolio value. Guard: a non-positive portfolio value is treated
 * as a BREACH (lossPercent = +Infinity-equivalent flag), never a NaN/sign-flip that could
 * suppress a trip (Langston Q3 guard).
 */
export function computeLossPercent(
  realizedPnl24h: number,
  portfolioValue: number,
): { lossPercent: number; nonPositiveValue: boolean } {
  if (!Number.isFinite(portfolioValue) || portfolioValue <= 0) {
    return { lossPercent: 0, nonPositiveValue: true };
  }
  if (!Number.isFinite(realizedPnl24h) || realizedPnl24h >= 0) {
    return { lossPercent: 0, nonPositiveValue: false };
  }
  return { lossPercent: (Math.abs(realizedPnl24h) / portfolioValue) * 100, nonPositiveValue: false };
}

/**
 * Classify the loss into a tier. `warn1Pct`/`warn2Pct` are % OF the kill threshold (coherency
 * RULE_011: 0 < warn1 < warn2 < 100). Highest crossed band wins (kill > warn2 > warn1).
 */
export function classifyTier(
  lossPercent: number,
  killThreshold: number,
  warn1Pct: number,
  warn2Pct: number,
  nonPositiveValue: boolean,
): { tier: DailyLossTier; warn1Loss: number; warn2Loss: number } {
  const warn1Loss = (warn1Pct / 100) * killThreshold;
  const warn2Loss = (warn2Pct / 100) * killThreshold;
  if (nonPositiveValue) return { tier: 'kill', warn1Loss, warn2Loss };
  if (lossPercent >= killThreshold) return { tier: 'kill', warn1Loss, warn2Loss };
  if (lossPercent >= warn2Loss) return { tier: 'warn2', warn1Loss, warn2Loss };
  if (lossPercent >= warn1Loss) return { tier: 'warn1', warn1Loss, warn2Loss };
  return { tier: 'none', warn1Loss, warn2Loss };
}

// ─── Async snapshot + verdict (re-pointed restore of calculate24hPL/checkKillSwitch) ─────────

async function compute24hSnapshot(mode: TradingMode): Promise<DailyLossSnapshot> {
  const { getPortfolioBalanceV2 } = await import('./guardrail-settings.js');
  const { getEngineSessionStart } = await import('./paper-execution-engine.js');

  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
  const sessionStart = getEngineSessionStart(mode);
  // Session-anchored window: never count trades from before the current engine session, so a
  // restart rebaselines the budget (circuit-breaker). Reuses the existing getEngineSessionStart.
  const windowStart = sessionStart && sessionStart > twentyFourHoursAgo ? sessionStart : twentyFourHoursAgo;

  // Mode-aware closed-trade query (same sources as getPortfolioBalanceV2).
  let closed: Array<{ closedAt: Date | string | null; pnl: unknown }>;
  if (mode === 'paper') {
    const trades = await storage.getPaperSimTrades(mode, { closedOnly: true });
    closed = trades.map((t: any) => ({ closedAt: t.closedAt, pnl: t.pnl }));
  } else {
    const trades = await storage.getTrades(mode, { status: 'closed' });
    closed = trades.map((t: any) => ({ closedAt: t.exitTime, pnl: t.realizedPL }));
  }

  const realizedPnl24h = closed
    .filter((t) => t.closedAt && new Date(t.closedAt) >= windowStart)
    .reduce((sum, t) => sum + (parseFloat(String(t.pnl ?? '0')) || 0), 0);

  const portfolioValue = await getPortfolioBalanceV2(mode);
  const { lossPercent, nonPositiveValue } = computeLossPercent(realizedPnl24h, portfolioValue);

  return { realizedPnl24h, portfolioValue, lossPercent, windowStart, nonPositiveValue };
}

/** Reads the per-mode guardrails + the 24h snapshot → a tier verdict. Null if no guardrails row. */
export async function computeDailyLossVerdict(mode: TradingMode): Promise<DailyLossVerdict | null> {
  const guardrails = await storage.getGuardrailsV2({ mode });
  if (!guardrails) return null;
  const g = guardrails as any;
  const killThreshold = parseFloat(String(g.dailyLossKillSwitchPct));
  const warn1Pct = g.dailyLossWarning1Pct != null ? parseFloat(String(g.dailyLossWarning1Pct)) : 50.0;
  const warn2Pct = g.dailyLossWarning2Pct != null ? parseFloat(String(g.dailyLossWarning2Pct)) : 75.0;

  const snap = await compute24hSnapshot(mode);
  const { tier, warn1Loss, warn2Loss } = classifyTier(
    snap.lossPercent, killThreshold, warn1Pct, warn2Pct, snap.nonPositiveValue,
  );
  return {
    tier,
    lossPercent: snap.lossPercent,
    killThreshold,
    warn1Loss,
    warn2Loss,
    portfolioValue: snap.portfolioValue,
  };
}

// ─── In-memory per-mode state (de-dup + the re-entrancy latch; epoch = engineSessionStart) ───

interface ModeBudgetState {
  sessionEpoch: number | null; // engineSessionStart ms — the single de-dup/latch anchor
  killInProgress: boolean;     // re-entrancy circuit breaker (a kill is underway)
  warn1Armed: boolean;
  warn2Armed: boolean;
  warn1Gen: number;            // arm-cycle generation — bumped on each disarmed→armed re-arm so a
  warn2Gen: number;            // legitimate hysteresis re-cross gets a fresh alert dedupe key (D).
}
const stateMap = new Map<TradingMode, ModeBudgetState>();

function freshState(epoch: number | null): ModeBudgetState {
  return { sessionEpoch: epoch, killInProgress: false, warn1Armed: true, warn2Armed: true, warn1Gen: 0, warn2Gen: 0 };
}

/** Get the per-mode state, resetting it whenever the session epoch advances (anchor change). */
function getState(mode: TradingMode, epoch: number | null): ModeBudgetState {
  let s = stateMap.get(mode);
  if (!s || s.sessionEpoch !== epoch) {
    s = freshState(epoch);
    stateMap.set(mode, s);
  }
  return s;
}

/**
 * Reset the in-memory budget state for a mode (clears the kill latch + re-arms warnings).
 * Called by `guardrailPolicy.resetKillSwitch` (which fires on `/api/trading/start`) so a
 * deliberate restart re-arms everything together with the loss-window rebaseline (Langston
 * invariant 1b — without this the latch stays true and the evaluator is permanently off).
 */
export function resetDailyLossBudgetState(mode: TradingMode): void {
  stateMap.set(mode, freshState(null));
}

/** Test/diagnostic peek (does not mutate). */
export function peekDailyLossBudgetState(mode: TradingMode): Readonly<ModeBudgetState> | undefined {
  return stateMap.get(mode);
}

// ─── Observable failure counter (Langston/rule-11: no silent swallow) ────────

const evalFailures = new Map<TradingMode, number>();
function recordEvalFailure(mode: TradingMode, err: unknown): void {
  evalFailures.set(mode, (evalFailures.get(mode) || 0) + 1);
  console.error(`[DailyLossBudget] evaluation error (${mode}):`, err instanceof Error ? err.message : err);
}
export function getDailyLossEvalStats(): { failures: Record<string, number> } {
  return { failures: { paper: evalFailures.get('paper') || 0, live: evalFailures.get('live') || 0 } };
}

// ─── Alert helper — fires on BOTH surfaces (each independently fault-isolated) ────────────────
//   (1) the operational §10.5 queue (`.jsonl` via addAlert) — the per-turn CC/Langston channel +
//       the dispatcher's Telegram push (away-from-keyboard awareness);
//   (2) the USER-FACING website notification (DB `system_alerts` via AlertsService.createAlert →
//       GET /api/alerts → the dismissible alert banner/panel; the user clicks to acknowledge and
//       it goes away). Reads are mode-global (AlertsService comment), so one row per event shows
//       to every user in that mode. The two writes are independently try/caught so one failing
//       never suppresses the other (the warning must be impossible to silently drop).

async function fireAlert(
  severity: 'info' | 'warning' | 'critical',
  mode: TradingMode,
  title: string,
  body: string,
  dedupeKey?: string, // omitted → no operational-queue dedup (e.g. the trip-FAILED retry alert,
                      // which should re-surface on every failing close as escalating emergency)
): Promise<void> {
  // (1) Operational queue / Telegram.
  try {
    const { addAlert } = await import('./system-alerts.js');
    await addAlert({
      triggers_at: new Date(), // now → dispatcher promotes to active on its next run
      category: severity === 'critical' ? 'breakage' : 'one_off',
      severity,
      title,
      body,
      metadata: { source: 'daily-loss-budget', mode },
      dedupe_key: dedupeKey,
    });
  } catch (err) {
    console.error(`[DailyLossBudget] failed to fire ${severity} operational alert:`, err instanceof Error ? err.message : err);
  }

  // (2) User-facing website notification (dismissible banner).
  try {
    const { AlertsService } = await import('./alerts-service.js');
    const users = await storage.getAllUsers();
    const target = users.find((u: any) => u.role === 'owner') ?? users[0];
    if (target) {
      await AlertsService.createAlert({
        userId: target.id,
        mode,
        alertType: severity === 'critical' ? 'daily_loss_kill' : 'daily_loss_warning',
        severity,
        message: `${title} — ${body}`,
        metadata: { source: 'daily-loss-budget', mode },
      });
    } else {
      console.warn('[DailyLossBudget] no user found to attach website alert to (skipping banner alert)');
    }
  } catch (err) {
    console.error(`[DailyLossBudget] failed to fire ${severity} website alert:`, err instanceof Error ? err.message : err);
  }
}

// ─── The evaluator (called tick-deferred from the post-close hook) ───────────

/**
 * Evaluate the daily loss budget after a trade closes. Gated on active trading; idempotent;
 * latch-first on kill. MUST be scheduled via setImmediate from the close path (never appended
 * synchronously inside closePosition) so it runs after the close frame + locks release.
 */
export async function evaluateDailyLossBudgetOnClose(mode: TradingMode): Promise<void> {
  try {
    // Cheap synchronous pre-guard — skip the DB reads entirely if a kill is already underway.
    if (stateMap.get(mode)?.killInProgress) return;

    // Gate: only act when active trading is ON for this mode (dormant in VTS/passive learning).
    const ctx = await storage.getSystemContext(mode);
    if (!ctx?.isEngineActive) return;

    const { guardrailPolicy } = await import('./guardrail-policy.js');
    if (await guardrailPolicy.isKillSwitchTripped(mode)) return; // already tripped → no-op

    const verdict = await computeDailyLossVerdict(mode);
    if (!verdict) return;

    const { getEngineSessionStart } = await import('./paper-execution-engine.js');
    const ss = getEngineSessionStart(mode);
    const epoch = ss ? ss.getTime() : null;
    const st = getState(mode, epoch);

    if (verdict.tier === 'kill') {
      // ★ ATOMIC check-and-set — the re-entrancy circuit breaker. NO await may sit between the
      //   check and the set (Langston invariant 1a): that adjacency is what serializes two
      //   same-tick evaluators.
      if (st.killInProgress) return;
      st.killInProgress = true;
      try {
        await doKill(mode, verdict, epoch);
      } catch (killErr) {
        // Langston Step-4 Blocker-2: a thrown kill must NOT permanently latch the evaluator OFF
        // while trading may still be live + bleeding (tripKillSwitch reads guardrails BEFORE it
        // persists the trip, so an early throw can leave the trip un-persisted). Roll the latch
        // back (single-threaded → race-free) so the NEXT close retries, and fire a CRITICAL
        // trip-FAILED alert (no dedupe key → re-surfaces every failing close; also covers the
        // case where the trip persisted but a later step threw — the user is still notified).
        // Do NOT fall through to the warning logic.
        st.killInProgress = false;
        recordEvalFailure(mode, killErr);
        await fireAlert(
          'critical', mode,
          `Daily loss kill TRIP FAILED — ${mode}`,
          `The automatic kill-switch trip threw and did NOT complete cleanly (${killErr instanceof Error ? killErr.message : String(killErr)}). Trading may still be ACTIVE — consider a manual stop now. The system will retry on the next closed trade.`,
        );
      }
      return;
    }

    // Hysteresis re-arm: a tier re-arms once the loss recedes below REARM_FRACTION of its
    // threshold (anti-flap). On each disarmed→armed TRANSITION bump the arm-generation so the next
    // fire's dedupe key is fresh — this keeps the operational queue (which dedups on the key) in
    // step with the website banner (which does not dedup) on a legitimate re-cross (Langston D).
    // A session-epoch advance already re-armed everything (gen 0) via getState.
    if (!st.warn1Armed && verdict.lossPercent < verdict.warn1Loss * REARM_FRACTION) { st.warn1Armed = true; st.warn1Gen++; }
    if (!st.warn2Armed && verdict.lossPercent < verdict.warn2Loss * REARM_FRACTION) { st.warn2Armed = true; st.warn2Gen++; }

    // Ratchet: fire only the HIGHEST crossed+armed tier; mark lower tiers consumed so a later
    // close cannot belatedly fire warn1 after warn2 already fired (reads backwards).
    if (verdict.tier === 'warn2') {
      if (st.warn2Armed) {
        st.warn2Armed = false;
        st.warn1Armed = false; // lower tier consumed in this episode
        await fireAlert(
          'warning', mode,
          `Daily loss warning (75%) — ${mode}`,
          `Rolling-24h loss ${verdict.lossPercent.toFixed(2)}% has crossed 75% of the kill limit (${verdict.killThreshold.toFixed(2)}%). Kill switch trips at ${verdict.killThreshold.toFixed(2)}%.`,
          `daily-loss-warn2-${mode}-${epoch}-g${st.warn2Gen}`,
        );
      }
    } else if (verdict.tier === 'warn1') {
      if (st.warn1Armed) {
        st.warn1Armed = false;
        await fireAlert(
          'info', mode,
          `Daily loss warning (50%) — ${mode}`,
          `Rolling-24h loss ${verdict.lossPercent.toFixed(2)}% has crossed 50% of the kill limit (${verdict.killThreshold.toFixed(2)}%).`,
          `daily-loss-warn1-${mode}-${epoch}-g${st.warn1Gen}`,
        );
      }
    }
  } catch (err) {
    recordEvalFailure(mode, err);
  }
}

async function doKill(mode: TradingMode, verdict: DailyLossVerdict, epoch: number | null): Promise<void> {
  const reason = verdict.portfolioValue <= 0
    ? `DAILY_LOSS_KILL: non-positive portfolio value (${verdict.portfolioValue.toFixed(2)})`
    : `DAILY_LOSS_THRESHOLD_EXCEEDED: ${verdict.lossPercent.toFixed(2)}% >= ${verdict.killThreshold.toFixed(2)}%`;
  console.log(`[DailyLossBudget] 🚨 KILL (${mode}): ${reason}`);

  // Trip the existing kill switch — this ALSO flattens all open positions via
  // stopPaperSimulation → forceCloseAllOpenPositionsOnStop (we do NOT close separately).
  const { guardrailPolicy } = await import('./guardrail-policy.js');
  await guardrailPolicy.tripKillSwitch(mode, reason, verdict.lossPercent, verdict.killThreshold);

  // Critical system-alert — the kill must be at least as loud as the warnings (Langston).
  await fireAlert(
    'critical', mode,
    `Daily loss kill switch TRIPPED — ${mode}`,
    `${reason}. All open ${mode} positions flattened and trading halted. Restart trading to resume (this rebaselines the daily loss budget).`,
    `daily-loss-kill-${mode}-${epoch}`,
  );
  // killInProgress stays true until resetDailyLossBudgetState clears it on restart (invariant 1b).
}
