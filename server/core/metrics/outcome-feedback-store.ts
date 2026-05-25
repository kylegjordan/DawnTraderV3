/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B67.4 — Realized-outcome feedback (cheap-tier bundle)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Per-(regime, strategy) tuple EMA of realized net P&L. On every trade close
 * (active or VTS), the trade's `netPnlPercent` is fed into the corresponding
 * tuple's EMA. On signal evaluation, the EMA modulates the regime confidence:
 * persistently profitable tuples get a small boost, persistently money-losing
 * tuples get a small penalty.
 *
 * Per BATCH_67_4_SCOPE.md §A + BATCH_67_4_PRE_AUDIT.md §B.1 File 1.
 * §D refinements folded in:
 *   §D.1 — 7-day disk-load expiry (was 24h in original scope)
 *   §D.3 — first sample becomes `ema_pnl_pct` directly (no decay applied)
 *
 * Modulation chain position (per pre-audit §B.3 step 5):
 *   raw × macro × phase_weight × freshness × OUTCOME_FEEDBACK → clamp [0.4, 1.0]
 *
 * No active gating yet. Pre-B67.5 this modulates the `regime_confidence_modulated`
 * column on trade records but no consumer reads it as an admission gate. The
 * ablation row captures the counterfactual for the calibration window.
 *
 * Per Kyle directive 2026-04-29 (no shadow theater + no fallbacks): factor is
 * always computed and always applied. Cold-start (sample_count < min_samples)
 * emits factor=1.0 + cold_start=true — that's a legitimate runtime state, not
 * a silent fallback.
 *
 * ── State ─────────────────────────────────────────────────────────────────
 *
 * Map<"<regime>_<strategy>", { ema_pnl_pct, sample_count, last_update }>.
 * Bounded: ~5 regimes × 18 strategies = 90 max tuples. Persisted to
 * `/tmp/b67-4-outcome-feedback.json` on each updateEma call. Loaded on
 * construction with 7d hard-expiry (configurable via b67_4_expiry_hours
 * module_constant; passed in by MCE on first refresh — store falls back to
 * a 7d default for the constructor-time load before the first refresh).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import type { FactorAlternate } from '../../services/factor-ablation-emitter.js';
import type { RegimeDecision } from '../../services/factor-ablation-emitter.js';
// B79.0n.CONFIDENCE-CHAIN (2026-05-25): per-class threading for metadata
// stamping + future per-class store key shape (full implementation in Chunk 5).
import type { AssetClass } from '../../../shared/asset-classes.js';

/** Per-tuple stored entry. Reset implicitly via `expiry` sweep on disk-load. */
export interface OutcomeFeedbackEntry {
  /** Alpha-weighted moving average of net P&L percent (e.g., 1.5 = +1.5%). */
  ema_pnl_pct: number;
  /** Total number of trades that have fed this EMA. Cold-start gate uses this. */
  sample_count: number;
  /** Epoch ms of the most recent updateEma call. Used for stale-eviction. */
  last_update: number;
}

/** Resolved config — supplied by MCE, mirrors `RegimeConfig` pattern. */
export interface OutcomeFeedbackConfig {
  alpha: number;
  sensitivity: number;
  minSamples: number;
  factorMin: number;
  factorMax: number;
  /** §D.1 — disk-load hard-expiry, in hours. */
  expiryHours: number;
}

const PERSIST_FILE = '/tmp/b67-4-outcome-feedback.json';
/**
 * Constructor-time default expiry — used only for the load-from-disk sweep on
 * process startup, before MCE's first refresh has resolved the
 * `b67_4_expiry_hours` constant. After MCE wires up, expiry comes from config.
 * 7d matches §D.1 — chosen so rare-regime tuples (IE, ST fire <5% of the time)
 * still survive between bursts.
 */
const DEFAULT_LOAD_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

class OutcomeFeedbackStore {
  private entries: Map<string, OutcomeFeedbackEntry> = new Map();

  constructor() {
    this.loadFromDisk();
  }

  private key(regime: string, strategy: string): string {
    return `${regime}_${strategy}`;
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(PERSIST_FILE)) return;
      const raw = fs.readFileSync(PERSIST_FILE, 'utf-8');
      const data = JSON.parse(raw) as Record<string, OutcomeFeedbackEntry>;
      const now = Date.now();
      let loaded = 0;
      let expired = 0;
      for (const [tupleKey, entry] of Object.entries(data)) {
        if (
          entry &&
          Number.isFinite(entry.ema_pnl_pct) &&
          Number.isFinite(entry.sample_count) &&
          Number.isFinite(entry.last_update)
        ) {
          if (now - entry.last_update > DEFAULT_LOAD_EXPIRY_MS) {
            expired++;
            continue;
          }
          this.entries.set(tupleKey, entry);
          loaded++;
        }
      }
      console.log(
        `[B67.4][outcomeFeedbackStore] Loaded ${loaded} tuples from ${PERSIST_FILE} (expired ${expired})`,
      );
    } catch (err) {
      console.warn(
        '[B67.4][outcomeFeedbackStore] Failed to load persisted state:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  private saveToDisk(): void {
    try {
      const data: Record<string, OutcomeFeedbackEntry> = {};
      for (const [tupleKey, entry] of this.entries) {
        data[tupleKey] = entry;
      }
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(data));
    } catch (err) {
      console.warn(
        '[B67.4][outcomeFeedbackStore] Failed to persist state:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  /**
   * Update the EMA for a (regime, strategy) tuple with a new realized P&L.
   *
   * §D.3 — first-sample-as-EMA: when `sample_count` is 0, the new EMA equals
   * the incoming P&L directly (no decay applied to a zero seed). Subsequent
   * samples decay normally per `alpha`.
   *
   * Cold-start floor lives in `computeOutcomeFeedbackFactor`, NOT here. We
   * always update on close so the EMA can warm up.
   *
   * Persists synchronously on every update (≤ 90 entries, ≤ 100B each → trivial).
   */
  updateEma(
    regime: string,
    strategy: string,
    netPnlPct: number,
    alpha: number,
    now: number,
  ): void {
    if (!Number.isFinite(netPnlPct)) {
      console.warn(
        `[B67.4][outcomeFeedbackStore] non-finite netPnlPct dropped: regime=${regime} strategy=${strategy} value=${netPnlPct}`,
      );
      return;
    }
    if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
      console.warn(
        `[B67.4][outcomeFeedbackStore] invalid alpha dropped: regime=${regime} strategy=${strategy} value=${alpha}`,
      );
      return;
    }
    const k = this.key(regime, strategy);
    const existing = this.entries.get(k);
    let nextEma: number;
    let nextCount: number;
    if (!existing || existing.sample_count === 0) {
      // §D.3 first-sample-as-EMA
      nextEma = netPnlPct;
      nextCount = 1;
    } else {
      nextEma = alpha * netPnlPct + (1 - alpha) * existing.ema_pnl_pct;
      nextCount = existing.sample_count + 1;
    }
    this.entries.set(k, {
      ema_pnl_pct: nextEma,
      sample_count: nextCount,
      last_update: now,
    });
    this.saveToDisk();
    console.log(
      `[B67.4][feedback] regime=${regime} strategy=${strategy} ` +
        `ema_pnl_pct=${nextEma.toFixed(3)} sample_count=${nextCount}`,
    );
  }

  /**
   * Read accessor — returns the entry for a tuple, or undefined if untracked.
   * Caller must NOT mutate the returned object.
   */
  peek(regime: string, strategy: string): OutcomeFeedbackEntry | undefined {
    return this.entries.get(this.key(regime, strategy));
  }

  /** Number of tracked tuples. Diagnostic. */
  size(): number {
    return this.entries.size;
  }

  /**
   * Sweep entries older than `expiryMs`. Called from MCE refresh after
   * `b67_4_expiry_hours` has been resolved. Runs cheap (≤ 90 entries).
   */
  evictExpired(expiryMs: number, now: number): number {
    let removed = 0;
    for (const [k, entry] of this.entries) {
      if (now - entry.last_update > expiryMs) {
        this.entries.delete(k);
        removed++;
      }
    }
    if (removed > 0) {
      this.saveToDisk();
      console.log(`[B67.4][outcomeFeedbackStore] evicted ${removed} stale tuples`);
    }
    return removed;
  }

  /** Test-only: reset all state. */
  clear(): void {
    this.entries.clear();
  }
}

/** Singleton — shared by signal-orchestrator + vts-runner + paper/vts close hooks. */
export const outcomeFeedbackStore = new OutcomeFeedbackStore();

/**
 * Pure function: compute the feedback factor from an entry + config.
 *
 * Cold-start (entry undefined OR sample_count < minSamples) → factor=1.0,
 * coldStart=true. Otherwise:
 *
 *   raw   = 1.0 + (ema_pnl_pct × sensitivity / 100)
 *   factor = clamp(factorMin, factorMax, raw)
 *
 * `ema_pnl_pct` is in PERCENT units (e.g., 1.5 = +1.5%). Sensitivity 4.0 means
 * a 1% EMA P&L → 0.04 factor delta. With factorMin=0.85 / factorMax=1.05 the
 * floor is hit at −3.75% EMA, ceiling at +1.25% EMA (asymmetric — intentional;
 * see scope §B.2).
 */
export function computeOutcomeFeedbackFactor(
  entry: OutcomeFeedbackEntry | undefined,
  config: OutcomeFeedbackConfig,
  // B79.0n.CONFIDENCE-CHAIN: REQUIRED. The pair's asset class. Currently used
  // for metadata stamping at the buildAlternate hook; in Chunk 5 the store
  // key shape becomes <assetClass>_<regime>_<strategy> so the entry lookup
  // is naturally per-class — no further computation here.
  assetClass: AssetClass,
): { factor: number; coldStart: boolean; assetClass: AssetClass } {
  if (!entry || entry.sample_count < config.minSamples) {
    return { factor: 1.0, coldStart: true, assetClass };
  }
  const raw = 1.0 + (entry.ema_pnl_pct * config.sensitivity) / 100;
  const clamped = Math.max(config.factorMin, Math.min(config.factorMax, raw));
  return { factor: clamped, coldStart: false, assetClass };
}

/**
 * Build the B67.4 ablation-emitter alternate row.
 *
 * Per pre-audit §A.1 cascade analysis: alternate represents the counterfactual
 * "what if outcome feedback were OFF and the rest of the modulation chain were
 * the same?" — so confidence_without_factor = real_confidence / feedback_factor
 * (approximately — both end up clamped at the chain's terminal step, but for
 * factor-attribution we recover the multiplicative contribution).
 */
export function buildB67_4Alternate(
  realConfidence: number,
  realRegimeLabel: string,
  feedbackResult: { factor: number; coldStart: boolean; assetClass: AssetClass },
  context: {
    regime: string;
    strategy: string;
    entry: OutcomeFeedbackEntry | undefined;
  },
  assetClass: AssetClass,
): FactorAlternate {
  // confidence_without_factor: divide-out the feedback factor to recover what
  // the modulated confidence would have been without B67.4.
  const confidenceWithoutFactor =
    feedbackResult.factor > 0 ? realConfidence / feedbackResult.factor : realConfidence;

  const alternate: RegimeDecision = {
    regimeLabel: realRegimeLabel,
    confidence: confidenceWithoutFactor,
    admissionPossible: true,
    metadata: {
      feedback_factor: feedbackResult.factor,
      confidence_with_factor: realConfidence,
      confidence_without_factor: confidenceWithoutFactor,
      regime: context.regime,
      strategy: context.strategy,
      ema_pnl_pct: context.entry?.ema_pnl_pct ?? 0,
      sample_count: context.entry?.sample_count ?? 0,
      cold_start: feedbackResult.coldStart,
      // B79.0n.CONFIDENCE-CHAIN: stamp asset class. The feedbackResult itself
      // carries assetClass too; mirror into top-level metadata for dashboard
      // / replay filterability.
      asset_class: assetClass,
    },
  };

  return {
    factorName: 'b67_4_outcome_feedback',
    factorState: 'alternate_disabled',
    alternateDecision: alternate,
  };
}
