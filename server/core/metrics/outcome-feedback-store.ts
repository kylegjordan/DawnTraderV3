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
import * as path from 'path';
import type { FactorAlternate } from '../../services/factor-ablation-emitter.js';
import type { RegimeDecision } from '../../services/factor-ablation-emitter.js';
// B79.0n.CONFIDENCE-CHAIN (2026-05-25): per-class threading for metadata
// stamping + future per-class store key shape (full implementation in Chunk 5).
import type { AssetClass } from '../../../shared/asset-classes.js';

/**
 * ITEM-4 step 2 (2026-06-10) — D9 labeled multi-source learning substrate.
 * The producer SOURCE of every learning observation. Single system-wide
 * vocabulary = RunMode ('vts' | 'paper_sim' | 'live') — deliberately NOT a
 * second 'paper' spelling (one vocabulary everywhere; see RUNNING_ISSUES #211
 * for why same-axis-different-names is a landmine). REQUIRED at every write
 * and read — no default; a defaulted source is how a pooled read sneaks back.
 */
export type LearningSource = 'vts' | 'paper_sim' | 'live';

/** Per-tuple stored entry. Reset implicitly via `expiry` sweep on disk-load. */
export interface OutcomeFeedbackEntry {
  /** Alpha-weighted moving average of net P&L percent (e.g., 1.5 = +1.5%). */
  ema_pnl_pct: number;
  /** Total number of trades that have fed this EMA. Cold-start gate uses this. */
  sample_count: number;
  /** Epoch ms of the most recent updateEma call. Used for stale-eviction. */
  last_update: number;
  /**
   * ITEM-4 step 2 — Welford triplet (count, mean, M2), maintained ALONGSIDE
   * the EMA (Gate-2 converged design B.7 #2: the EMA stays the live factor
   * input — zero behavior change; Welford makes future estimators + honest
   * calibration-epoch resets well-posed). variance = w_m2 / (w_count - 1).
   * Missing on legacy disk entries → initialized to zero on load.
   */
  w_count: number;
  w_mean: number;
  w_m2: number;
  /** Calibration epoch the Welford stream was accrued under (0 = pre-step-2 legacy). */
  epoch: number;
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

/**
 * B79.0n.CONFIDENCE-CHAIN (2026-05-25):
 *   - NEW path: persistent under `/home/deploy/dawntrader/data/` so the file
 *     survives staging restarts (`/tmp/` was getting wiped on pm2 restart).
 *   - LEGACY path: prior production location at `/tmp/`. On first boot post-
 *     deploy the constructor reads from new-path first; if absent, falls back
 *     to legacy + re-keys every entry under the `crypto_spot_` prefix (since
 *     all pre-CONFIDENCE-CHAIN trades were crypto by construction) and writes
 *     to the new path. Legacy file stays at its old location (will be wiped
 *     on next pm2 restart but the data is already in the new path).
 *   - HARD-FAIL on corrupt new-path data: per Langston Step 2 clarification 1,
 *     the constructor does NOT silently fall back to legacy when the new path
 *     is corrupt. Throws with a clear error message — operator investigates.
 */
const PERSIST_FILE_NEW = '/home/deploy/dawntrader/data/b67-4-outcome-feedback.json';
const PERSIST_FILE_LEGACY = '/tmp/b67-4-outcome-feedback.json';

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

  /**
   * ITEM-4 step 2 (2026-06-10): key shape is now
   * `<source>_<assetClass>_<regime>_<strategy>` — the D9 labeled-multi-source
   * partition (Gate-2 design B.4/B.7: ONE physical store, strictly disjoint
   * per-source partitions; source REQUIRED, never defaulted, never pooled).
   * History: B79.0n made it `<assetClass>_<regime>_<strategy>`; pre-B79.0n was
   * `<regime>_<strategy>`. Disk-load migration re-keys all pre-step-2 entries
   * under the `vts_` prefix — every observation written before step 2 was VTS
   * by construction (active trading off since Phase 8).
   */
  private key(source: LearningSource, assetClass: string, regime: string, strategy: string): string {
    return `${source}_${assetClass}_${regime}_${strategy}`;
  }

  /**
   * Key-shape detection for the disk-load migrations. Source-shape keys start
   * with a known LearningSource prefix; B79.0n-shape keys start with a known
   * asset-class prefix; anything else is the ancient 2-token shape.
   */
  private isSourceShapeKey(tupleKey: string): boolean {
    const SOURCE_PREFIXES = ['vts_', 'paper_sim_', 'live_'];
    return SOURCE_PREFIXES.some(p => tupleKey.startsWith(p));
  }

  private isAssetClassShapeKey(tupleKey: string): boolean {
    // Known asset class prefixes — extend as ASSET_CLASSES grows.
    const KNOWN_PREFIXES = ['crypto_spot_', 'crypto_perp_', 'xstock_spot_', 'xstock_perp_'];
    return KNOWN_PREFIXES.some(p => tupleKey.startsWith(p));
  }

  /**
   * Normalize a loaded entry: legacy disk data predates the Welford fields —
   * initialize them to zero (the Welford stream starts accruing from step-2
   * deploy; the EMA carries the historical signal).
   */
  private normalizeEntry(entry: OutcomeFeedbackEntry): OutcomeFeedbackEntry {
    return {
      ...entry,
      w_count: Number.isFinite(entry.w_count) ? entry.w_count : 0,
      w_mean: Number.isFinite(entry.w_mean) ? entry.w_mean : 0,
      w_m2: Number.isFinite(entry.w_m2) ? entry.w_m2 : 0,
      epoch: Number.isFinite(entry.epoch) ? entry.epoch : 0,
    };
  }

  private loadFromDisk(): void {
    const now = Date.now();
    // Try the NEW persistent path first.
    if (fs.existsSync(PERSIST_FILE_NEW)) {
      try {
        const raw = fs.readFileSync(PERSIST_FILE_NEW, 'utf-8');
        const data = JSON.parse(raw) as Record<string, OutcomeFeedbackEntry>;
        let loaded = 0;
        let expired = 0;
        let rekeyed = 0;
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
            // ITEM-4 step 2 migration: pre-step-2 keys lack the source prefix.
            // ALL pre-step-2 observations are VTS by construction (active
            // trading off since Phase 8) → re-key under `vts_`. B79.0n-shape
            // keys (`<assetClass>_...`) get the prefix directly; anything even
            // older ALSO re-keys to vts_ + crypto_spot_ (pre-B79.0n data was
            // crypto-only — same rationale as the B79.0n migration).
            let newKey = tupleKey;
            if (!this.isSourceShapeKey(tupleKey)) {
              newKey = this.isAssetClassShapeKey(tupleKey)
                ? `vts_${tupleKey}`
                : `vts_crypto_spot_${tupleKey}`;
              rekeyed++;
            }
            this.entries.set(newKey, this.normalizeEntry(entry));
            loaded++;
          }
        }
        console.log(
          `[B67.4][outcomeFeedbackStore] Loaded ${loaded} tuples from NEW path ${PERSIST_FILE_NEW} (expired ${expired}, re-keyed ${rekeyed} under vts_ source prefix)`,
        );
        if (rekeyed > 0) this.saveToDisk();
        return;
      } catch (err) {
        // HARD-FAIL on corrupt new-path data (Langston Step 2 clarification 1).
        // No silent fallback to legacy — the file at the canonical path was
        // unparseable and the legacy data may be stale; manual investigation
        // is the correct response.
        throw new Error(
          `[B67.4][outcomeFeedbackStore][load-corrupt] new-path JSON at ${PERSIST_FILE_NEW} ` +
          `is unparseable — cowardly refusing to silently fall back to legacy /tmp/ data ` +
          `which may be stale. Manual investigation required. Inner error: ` +
          (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // NEW path absent — try the LEGACY path + re-key under crypto_spot prefix.
    if (fs.existsSync(PERSIST_FILE_LEGACY)) {
      try {
        const raw = fs.readFileSync(PERSIST_FILE_LEGACY, 'utf-8');
        const data = JSON.parse(raw) as Record<string, OutcomeFeedbackEntry>;
        let loaded = 0;
        let expired = 0;
        let rekeyed = 0;
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
            // ITEM-4 step 2: the LEGACY /tmp/ path predates BOTH the
            // asset-class prefix AND the source prefix — re-key fully under
            // vts_crypto_spot_ (pre-B79.0n data was crypto-only VTS).
            const newKey = this.isSourceShapeKey(tupleKey)
              ? tupleKey
              : this.isAssetClassShapeKey(tupleKey)
                ? `vts_${tupleKey}`
                : `vts_crypto_spot_${tupleKey}`;
            this.entries.set(newKey, this.normalizeEntry(entry));
            if (newKey !== tupleKey) rekeyed++;
            loaded++;
          }
        }
        console.log(
          `[B67.4][outcomeFeedbackStore] Loaded ${loaded} tuples from LEGACY path ${PERSIST_FILE_LEGACY} ` +
          `(expired ${expired}, re-keyed ${rekeyed} under crypto_spot prefix); will persist to NEW path on next write`,
        );
        // Persist immediately to the new path so subsequent boots use it.
        this.saveToDisk();
      } catch (err) {
        console.warn(
          '[B67.4][outcomeFeedbackStore] Failed to load LEGACY persisted state:',
          err instanceof Error ? err.message : err,
        );
      }
      return;
    }

    // Neither path exists — cold start.
    console.log(
      `[B67.4][outcomeFeedbackStore] Cold start — no persisted state at NEW or LEGACY path`,
    );
  }

  private saveToDisk(): void {
    try {
      const data: Record<string, OutcomeFeedbackEntry> = {};
      for (const [tupleKey, entry] of this.entries) {
        data[tupleKey] = entry;
      }
      // Ensure the parent directory exists (idempotent — `data/` is part of
      // the staging deploy; the mkdir is defensive for fresh hosts + tests).
      const dir = path.dirname(PERSIST_FILE_NEW);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(PERSIST_FILE_NEW, JSON.stringify(data));
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
    // ITEM-4 step 2 (D9): REQUIRED source — first param, no default. The
    // writer states WHO it is (its carried mode tag); partitions are strictly
    // disjoint — a paper_sim close can never touch the vts-trained aggregate.
    source: LearningSource,
    assetClass: AssetClass,
    regime: string,
    strategy: string,
    netPnlPct: number,
    alpha: number,
    now: number,
    // ITEM-4 step 2 (calibration epoch v0): the writer's CURRENT per-source
    // epoch (resolve via getCalibrationEpoch(source)). Epoch mismatch with the
    // stored entry → the Welford stream RESETS (honest per-lineage stats);
    // the EMA continues (documented limitation, Gate-2 B.7 #2).
    epoch: number,
  ): void {
    if (!Number.isFinite(netPnlPct)) {
      console.warn(
        `[B67.4][outcomeFeedbackStore] non-finite netPnlPct dropped: source=${source} asset_class=${assetClass} regime=${regime} strategy=${strategy} value=${netPnlPct}`,
      );
      return;
    }
    if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
      console.warn(
        `[B67.4][outcomeFeedbackStore] invalid alpha dropped: source=${source} asset_class=${assetClass} regime=${regime} strategy=${strategy} value=${alpha}`,
      );
      return;
    }
    const k = this.key(source, assetClass, regime, strategy);
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
    // Welford update (count, mean, M2) — reset on epoch mismatch. Legacy
    // entries carry epoch 0 → first post-deploy update resets Welford once
    // (harmless: the Welford stream is brand-new anyway).
    let wCount: number, wMean: number, wM2: number;
    const storedEpoch = existing?.epoch ?? 0;
    if (!existing || storedEpoch !== epoch) {
      wCount = 1;
      wMean = netPnlPct;
      wM2 = 0;
      if (existing && storedEpoch !== 0) {
        console.log(
          `[ITEM4][outcomeFeedbackStore] epoch ${storedEpoch}→${epoch} for ${k}: Welford reset (EMA continues — documented limitation)`,
        );
      }
    } else {
      wCount = (existing.w_count ?? 0) + 1;
      const delta = netPnlPct - (existing.w_mean ?? 0);
      wMean = (existing.w_mean ?? 0) + delta / wCount;
      wM2 = (existing.w_m2 ?? 0) + delta * (netPnlPct - wMean);
    }
    this.entries.set(k, {
      ema_pnl_pct: nextEma,
      sample_count: nextCount,
      last_update: now,
      w_count: wCount,
      w_mean: wMean,
      w_m2: wM2,
      epoch,
    });
    this.saveToDisk();
    console.log(
      `[B67.4][feedback] source=${source} asset_class=${assetClass} regime=${regime} strategy=${strategy} ` +
        `ema_pnl_pct=${nextEma.toFixed(3)} sample_count=${nextCount} w_count=${wCount} epoch=${epoch}`,
    );
  }

  /**
   * Read accessor — returns the entry for a tuple, or undefined if untracked.
   * Caller must NOT mutate the returned object.
   * B79.0n.CONFIDENCE-CHAIN: REQUIRED-assetClass for per-class isolation.
   * ITEM-4 step 2: REQUIRED-source — SOURCE-MATCHED reads (Gate-2 decision):
   * each consumer reads its OWN partition; no cross-source pooling, ever.
   */
  peek(source: LearningSource, assetClass: AssetClass, regime: string, strategy: string): OutcomeFeedbackEntry | undefined {
    return this.entries.get(this.key(source, assetClass, regime, strategy));
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
