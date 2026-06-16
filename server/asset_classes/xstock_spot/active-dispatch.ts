/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B4a (C2) — xStock ACTIVE-PATH dispatch (stamp-at-source wire-in)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The xStock scanner is a boot-time, always-on, centralClock-driven singleton, decoupled
 * from any trading engine. This is the sibling of the VTS dispatch (registerOpenVtsTrade):
 * when active trading is authoritatively ON, it also routes the xStock signal onto the
 * SHARED active pipeline by reaching the active paper orchestrator instance and calling
 * its public `dispatchExternalSignal` (which sizes → SQE → queues to RTB internally).
 *
 * Stamp-at-source: the asset class (xstock_spot) is stamped on the SizingContext HERE — at
 * the per-pipe chokepoint where the pipe (and thus the class) is known by construction —
 * never re-derived from the symbol downstream (which mislabels the 17 collision tickers).
 *
 * Langston-approved design (P19_B4a_C2_DISPATCH_DESIGN_rev1.md + C2 review):
 *  - Q3 DORMANCY BY AUTHORITY: gate on the authoritative active-trading flag
 *    (`system_context.isEngineActive`, the one B7b flips — mirrors fx5-scanner.ts:544-546),
 *    NOT on orchestrator/manager presence (they diverge → silent activation). Until B7b this
 *    is DORMANT (isEngineActive=false) — §9.1 scaffolding; skips are silent-but-COUNTED.
 *  - Q1 CONFIDENCE: predictiveConfidence is 0–1 (matches the crypto build input; build
 *    clamp01s, so a 0–100 value would silently inflate to the ceiling). Fail-loud assert ∈[0,1].
 *  - Q2 STRATEGY: validate against the 19-name canonical SSOT (STRATEGY_DISPLAY_NAMES) PRE-alias,
 *    then alias the only mismatch (range_trade → range_trading, the type-union name).
 *  - Errors never throw into the eval-cycle hot loop: caught + counted + logged [CRITICAL]
 *    (B3b observable-counter discipline — no silent drops).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { getOrchestratorByMode } from '../../services/paper-sim-service.js';
import { getPortfolioBalanceV2 } from '../../services/guardrail-settings.js';
import { storage } from '../../storage.js';
import { STRATEGY_DISPLAY_NAMES } from '../../config/canonical-regime-strategy-map.js';
import type { StrategySignal } from '../../services/strategy-engine.js';
import type { StrategyType } from '../../services/paper-position-sizing.js';
import type { AssetClass } from '../../../shared/asset-classes.js';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { addAlert } from '../../services/system-alerts.js';
import { resolveXstockFillSafetyConfig } from './fill-safety-config.js';
// P19-B4b.1 (#295): the RTH liquid-fill-window clock predicate is retired from the
// active path — the 24/5 book-depth-sufficiency gate at the engine open seam replaces it.

// Observable counters (Langston Q3: silent-but-counted, not silent). Surfaced via getter.
let _dormantSkips = 0;     // active trading authoritatively OFF (normal pre-B7b)
let _noOrchSkips = 0;      // engine flagged active but no orchestrator handle (should not happen)
let _dispatched = 0;       // signals routed onto the active pipeline
let _dispatchErrors = 0;   // assert/build/dispatch failures (loud-logged, never thrown into the loop)
// P19-B4a (C3) — fill-safety gate counters (all fail-CLOSED, all observable).
let _configClosedSkips = 0; // fill-safety config missing/incomplete → fail-closed block
let _staleSkips = 0;        // latest tick older than the freshness threshold (or absent)

export function getXstockActiveDispatchStats() {
  return {
    dormantSkips: _dormantSkips,
    noOrchSkips: _noOrchSkips,
    dispatched: _dispatched,
    dispatchErrors: _dispatchErrors,
    configClosedSkips: _configClosedSkips,
    staleSkips: _staleSkips,
  };
}

/**
 * P19-B4a (C3) — latest-tick age (ms) for `symbol` from the append-only ticker
 * snapshots, or `null` when no tick exists. Index-served by
 * `xstock_spot_ticker_snap_sym_time (symbol, captured_at DESC)`.
 */
async function getLatestTickAgeMs(symbol: string): Promise<number | null> {
  const res = await db.execute<{ age_ms: string | number | null }>(sql`
    SELECT EXTRACT(EPOCH FROM (NOW() - MAX(captured_at))) * 1000 AS age_ms
    FROM xstock_spot_ticker_snap
    WHERE symbol = ${symbol}
  `);
  const rows = (res as any).rows ?? res;
  const raw = Array.isArray(rows) ? rows[0]?.age_ms : undefined;
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** P19-B4a (C3) — dedup'd warning when an active fill is blocked on a stale price. */
async function raiseStaleFillAlert(symbol: string, ageMs: number | null, maxAgeMs: number): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'warning',
      title: 'xStock active fill blocked — stale price',
      body: `An active xStock fill was blocked because the latest price for ${symbol} was ${ageMs === null ? 'absent' : `${Math.round(ageMs)}ms old`} (limit ${maxAgeMs}ms). Routine if transient; persistent staleness during US regular hours indicates a feed problem — see the equity-feed silent-stall watchdog.`,
      dedupe_key: 'xstock-stale-fill-block',
    });
  } catch (err) {
    console.error(`[P19-B4a][C3] failed to raise stale-fill alert for ${symbol}:`, err);
  }
}

/** Only canonical→type-union name mismatch (Langston: the single alias in the 19). */
const STRATEGY_ALIAS: Record<string, string> = { range_trade: 'range_trading' };

export interface XstockActiveDispatchInput {
  symbol: string;
  strategyKey: string;           // canonical name from getStrategiesForRegime (e.g. range_trade)
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  predictiveConfidence: number;  // 0–1 (per-signal confidence; matches crypto build input)
  signalType?: string;
  sourcePool?: string;
  atr?: number;
  high24h?: number;
  low24h?: number;
}

/**
 * Route an xStock signal onto the active paper pipeline IF active trading is authoritatively
 * ON. Fire-and-forget safe: never throws into the caller; failures are counted + loud-logged.
 */
export async function dispatchXstockActiveSignal(input: XstockActiveDispatchInput): Promise<void> {
  try {
    // ── Q3 dormancy-by-authority: the flag B7b flips (NOT manager presence). ──────────────
    const paperCtx = await storage.getSystemContext('paper');
    if (!paperCtx?.isEngineActive) {
      _dormantSkips++; // §9.1 scaffolding: wire-in dormant until B7b. Normal state pre-flip.
      return;
    }
    const orch = getOrchestratorByMode('paper');
    if (!orch) {
      _noOrchSkips++; // engine flagged active but no orchestrator — surface, do not fabricate.
      console.warn(`[P19-B4a][C2] active-trading ON but no paper orchestrator handle — skip ${input.symbol}/${input.strategyKey}`);
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // P19-B4a (C3) — HARD fill-safety gate. Three fail-CLOSED + counted checks
    // before any active fill (audit-4 R1: never fill on a dead/untradeable price).
    // Config is DB-resolved (module_constants xstock_fill_safety); missing config
    // blocks every fill until seeded.
    // ════════════════════════════════════════════════════════════════════════
    const safety = await resolveXstockFillSafetyConfig();
    if (!safety) {
      _configClosedSkips++; // fail-closed: no DB fill-safety config → do not fill (resolver logs loudly).
      return;
    }
    // (a) #295 (P19-B4b.1): the RTH liquid-fill-window CLOCK gate is RETIRED here —
    //     replaced by the direct 24/5 BOOK-DEPTH-SUFFICIENCY gate at the engine open
    //     seam (PaperExecutionEngine._evaluateOpenDepthGate, both asset classes). The
    //     clock was a proxy for "is the book deep enough"; it was wrong in BOTH
    //     directions (blocked fillable off-hours books, passed thin RTH books). The
    //     other two C3 gates — freshness (b) + the silent-stall watchdog — STAY
    //     (both 24/5-correct; #295 keeps them).
    // (b) Freshness — the symbol's latest tick must be within the max-age window.
    const ageMs = await getLatestTickAgeMs(input.symbol);
    if (ageMs === null || ageMs > safety.activeFillMaxAgeMs) {
      _staleSkips++;
      await raiseStaleFillAlert(input.symbol, ageMs, safety.activeFillMaxAgeMs);
      return;
    }

    // ── Q1 fail-loud confidence domain: must be 0–1 (build clamp01s; 0–100 inflates to 1.0). ──
    if (!(input.predictiveConfidence >= 0 && input.predictiveConfidence <= 1)) {
      throw new Error(`predictiveConfidence ${input.predictiveConfidence} out of [0,1] (silent-clamp landmine)`);
    }

    // ── Q2 strategy: validate canonical SSOT membership PRE-alias, then alias to the union name. ──
    if (!(input.strategyKey in STRATEGY_DISPLAY_NAMES)) {
      throw new Error(`unknown strategy '${input.strategyKey}' (not in STRATEGY_DISPLAY_NAMES SSOT)`);
    }
    const mappedStrategy = STRATEGY_ALIAS[input.strategyKey] ?? input.strategyKey;

    const rawSignal: StrategySignal = {
      symbol: input.symbol,
      strategy: mappedStrategy as StrategySignal['strategy'],
      entryPrice: input.entryPrice,
      stopPrice: input.stopPrice,
      targetPrice: input.targetPrice,
      confidence: input.predictiveConfidence, // 0–1, matches the crypto build input
      metadata: {
        assetClass: 'xstock_spot',
        sourcePool: input.sourcePool,
        signalType: input.signalType,
      },
    };

    // SizingContext stamped at the pipe chokepoint (stamp-at-source single source of truth).
    // Structural match to the orchestrator's SizingContext (not exported); getOrchestratorByMode
    // returns `any`, so include ALL four fields explicitly.
    const sizingContext = {
      portfolioValue: await getPortfolioBalanceV2('paper'),
      guardrails: await storage.getGuardrailsV2({ mode: 'paper' }),
      mode: 'paper' as const,
      assetClass: 'xstock_spot' as AssetClass, // 🔒 one sizingContext = one class = one pipe
    };
    const marketContext = { atr: input.atr, high24h: input.high24h, low24h: input.low24h };

    await orch.dispatchExternalSignal(rawSignal, mappedStrategy as StrategyType, sizingContext, marketContext);
    _dispatched++;
  } catch (err: any) {
    // Observable, never silent (B3b discipline) — and never thrown into the eval-cycle loop.
    _dispatchErrors++;
    console.error(`[P19-B4a][C2][DISPATCH_ERR][CRITICAL] ${input.symbol}/${input.strategyKey}: ${err?.message ?? err}`);
  }
}
