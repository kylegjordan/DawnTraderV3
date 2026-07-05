// P19-B8.2 (OBJ-3) — the friction-divergence evaluator: the ONE call site at
// the paper trade-open seam that feeds the pure estimator
// (server/core/math/friction-divergence.ts) and executes the auto re-anchor
// (Kyle decision #1: triggered, not advisory) through the anchor service.
//
// DISCIPLINE (B3b): this is telemetry + policy — an evaluation failure must
// NEVER break the open path. Every entry point catches, counts, and logs;
// nothing here throws into the caller.
//
// WHAT IS EVALUATED PER OPEN:
//   Q_paper = THIS open's real notional. Q_live = the risk-equivalent notional
//   at the LIVE Kraken balance (same risk% — notional scales linearly with
//   balance, so Q_live = Q_paper * liveBalance / paperBalance). The live figure
//   comes from the mirror helper's 60s-cached read — the trigger keys on
//   order-size divergence, never on per-fill balance jitter (scope §B-1).
//   The spread term cancels in the divergence subtraction (identical market,
//   only Q differs), so sigma (from the signal's ATR) + k + L are sufficient.
//
// MIN-NOTIONAL LEG (discrete): per open, we check whether the LPCP order floor
// binds DIFFERENTLY at the two balances (sizeable at one, blocked at the
// other) and accumulate a rolling 24h count; the trigger compares that count
// to `min_notional_delta_max`. In-memory, mode-invariant telemetry (resets on
// restart — a trigger backstop, not a ledger).

import {
  computeDivergence,
  evaluateReanchorTrigger,
} from '../core/math/friction-divergence';
import { getCachedNumberRequired } from './module-constants-service';

interface OpenSeamInput {
  mode: 'paper' | 'live';
  assetClass: string;
  /** THIS open's real notional (quantity × entry), USD. */
  paperNotionalUsd: number;
  entryPrice: number;
  /** ATR at open (absolute price units) — converted to bps of entry. */
  atr: number;
  /** Liquidity proxy, USD (volume24h at the open seam). */
  liquidityUsd: number;
}

interface RollingSample {
  atMs: number;
  divergenceBps: number;
  minNotionalSplit: boolean;
}

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

// Rolling per-open samples (telemetry + the discrete-leg counter + the B8.3
// dashboard aggregate). Module-global, mode carried in the caller's usage —
// only the paper open seam calls this today.
const _samples: RollingSample[] = [];
let _evalErrors = 0;
let _evalSkips = 0;
let _lastError: string | null = null;

function pruneRolling(nowMs: number): void {
  while (_samples.length > 0 && _samples[0].atMs < nowMs - ROLLING_WINDOW_MS) {
    _samples.shift();
  }
}

/** Observability for diagnostics + the B8.3 dashboard row. */
export function getDivergenceStats(): {
  rolling24hCount: number;
  rolling24hMedianBps: number | null;
  rolling24hMaxBps: number | null;
  minNotionalSplits24h: number;
  evalErrors: number;
  evalSkips: number;
  lastError: string | null;
} {
  const now = Date.now();
  pruneRolling(now);
  const bps = _samples.map((s) => s.divergenceBps).sort((a, b) => a - b);
  const median = bps.length ? bps[Math.floor(bps.length / 2)] : null;
  return {
    rolling24hCount: _samples.length,
    rolling24hMedianBps: median,
    rolling24hMaxBps: bps.length ? bps[bps.length - 1] : null,
    minNotionalSplits24h: _samples.filter((s) => s.minNotionalSplit).length,
    evalErrors: _evalErrors,
    evalSkips: _evalSkips,
    lastError: _lastError,
  };
}

/**
 * Evaluate friction divergence for one paper open; executes the auto re-anchor
 * when a bound is breached outside the cooldown. NEVER throws.
 */
export async function evaluateDivergenceAtOpen(input: OpenSeamInput): Promise<void> {
  try {
    if (input.mode !== 'paper') return; // live has no paper-vs-live divergence by definition

    // ── knobs (warmed module; per-class rows seeded by the B8.2 migration)
    const key = { exchange: 'kraken', assetClass: input.assetClass, strategy: '*', regime: '*' };
    const maxDivergenceBps = getCachedNumberRequired('friction_divergence', 'max_divergence_bps', key);
    const minNotionalDeltaMax = getCachedNumberRequired('friction_divergence', 'min_notional_delta_max', key);
    const minReanchorIntervalMs = getCachedNumberRequired('friction_divergence', 'min_reanchor_interval_ms', key);
    const impactK = getCachedNumberRequired('friction_divergence', 'impact_k', key);

    // ── balances: paper = persisted anchor state; live = 60s-cached Kraken mirror
    const { getAnchorState, getLastAnchorAt, reanchorToLive } = await import('./portfolio-anchor-service.js');
    const anchorState = await getAnchorState('paper');
    if (!anchorState || !(anchorState.balance > 0)) {
      _evalSkips++;
      return; // no trustworthy paper balance — the open path's own guards govern; nothing to compare
    }

    let liveBalance: number;
    try {
      const { getKrakenMirrorBalance } = await import('./kraken-mirror-balance.js');
      liveBalance = (await getKrakenMirrorBalance()).mirrorBalanceUsd;
    } catch (mirrorErr: any) {
      // A Kraken outage never affects the open path — divergence is simply not
      // evaluable this open. Counted, logged once per message, not thrown.
      _evalSkips++;
      _lastError = `mirror unavailable: ${mirrorErr?.message ?? mirrorErr}`;
      return;
    }
    if (!(liveBalance > 0)) {
      _evalSkips++;
      return; // empty live account — a divergence vs $0 is not meaningful
    }

    // ── the two order sizes (same risk%, only the balance differs)
    const qPaper = input.paperNotionalUsd;
    const qLive = qPaper * (liveBalance / anchorState.balance);

    // ── sigma from ATR (bps of entry); liquidity guard
    if (!(input.entryPrice > 0) || !(input.liquidityUsd > 0) || !Number.isFinite(input.atr) || input.atr < 0) {
      _evalSkips++;
      return;
    }
    const sigmaBps = (input.atr / input.entryPrice) * 10_000;

    // spreadHalfBps = 0: the spread term is identical for both legs and cancels
    // in the divergence subtraction — only the sqrt-impact term differentiates.
    const result = computeDivergence({
      paperOrderNotionalUsd: qPaper,
      liveOrderNotionalUsd: qLive,
      spreadHalfBps: 0,
      sigmaBps,
      k: impactK,
      liquidityNotionalUsd: input.liquidityUsd,
    });

    // ── discrete min-notional leg: does the LPCP floor bind differently?
    let minNotionalSplit = false;
    try {
      const { storage } = await import('../storage');
      const g2 = await storage.getGuardrailsV2({ mode: 'paper' });
      const floor = g2 ? Number.parseFloat(String((g2 as any).lowPriceMinPositionNotional ?? '')) : NaN;
      if (Number.isFinite(floor) && floor > 0) {
        minNotionalSplit = (qPaper < floor) !== (qLive < floor);
      }
    } catch {
      // floor unreadable → leg not evaluated this open (bps leg still counts)
    }

    const now = Date.now();
    pruneRolling(now);
    _samples.push({ atMs: now, divergenceBps: result.divergenceBps, minNotionalSplit });
    const splits24h = _samples.filter((s) => s.minNotionalSplit).length;

    const lastAnchorAt = await getLastAnchorAt('paper');
    const msSinceLastAnchor = lastAnchorAt ? now - lastAnchorAt.getTime() : Number.POSITIVE_INFINITY;

    const trigger = evaluateReanchorTrigger({
      divergenceBps: result.divergenceBps,
      minNotionalDelta: splits24h,
      maxDivergenceBps,
      minNotionalDeltaMax,
      msSinceLastAnchor,
      minReanchorIntervalMs,
    });

    if (trigger.suppressedByCooldown) {
      console.log(
        `[B8.2][divergence] breach (${trigger.breach}) suppressed by cooldown — ` +
        `${(msSinceLastAnchor / 3_600_000).toFixed(1)}h since last anchor < ${(minReanchorIntervalMs / 3_600_000).toFixed(1)}h`
      );
      return;
    }
    if (!trigger.triggered) return;

    console.log(
      `[B8.2][divergence] AUTO RE-ANCHOR (${trigger.breach}): divergence=${result.divergenceBps.toFixed(2)}bps ` +
      `(paper $${anchorState.balance.toFixed(2)} vs live $${liveBalance.toFixed(2)}), splits24h=${splits24h}`
    );
    await reanchorToLive('paper', 'auto_divergence', {
      divergenceBps: result.divergenceBps,
      minNotionalDelta: splits24h,
    });
  } catch (err: any) {
    _evalErrors++;
    _lastError = err?.message ?? String(err);
    console.error(`[B8.2][divergence] evaluation error (open path unaffected): ${_lastError}`);
  }
}
