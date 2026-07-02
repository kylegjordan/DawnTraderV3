/**
 * B70 Step 3.6 — Signal Eval Archiver
 *
 * Captures per-strategy × per-pair signal evaluations (admit + reject) with
 * full feature inputs + gate decision. Highest-cadence archiver — protected
 * by the kill-switch `b70_signal_eval_pre_filter_capture` (default `true`).
 *
 * Hook sites:
 *  - vts-runner.ts (next to existing emitAblationRecord at L~1374) → source='vts-runner'
 *  - signal-orchestrator.ts (next to existing emit at L~638) → source='signal-orchestrator'
 *
 * reject_stage values:
 *  - 'admitted'           — passed all gates; this is a real opportunity
 *  - 'pre_filter'         — pair didn't make filter pool (spread/volume/etc.)
 *  - 'sqe'                — failed SQE FinalScore floor
 *  - 'rtb'                — RTB queue stale / TTL expired before promotion
 *  - 'tcl'                — TCL cooldown / dedup
 *  - 'strategy_internal'  — strategy detect() returned null
 */

import { enqueueArchiveRow, registerArchiveTable } from './archive-batch-writer.js';
import { getArchiveConfig, provenanceCaptureEnabled } from './archive-config.js';
import type { RunMode } from '../run-mode-controller.js'; // ITEM-4 step 2: carried tag — getCurrentMode() write-time lookup DELETED (D1)
import { takeArchiveId } from './archive-id-allocator.js';
import { getPaperFinalScoreMinSync } from './would-admit-cache.js'; // ITEM-4 step-2b: the B.3 bridge
import { resolveConstantsProvenance, recordConstantsVersion } from './decision-provenance.js';

const TABLE = 'signal_eval_archive';
// B-NEW-53: `id` is now app-supplyable (for the 1:1 provenance link). It is a
// DEFAULT-on-undefined column — rows that don't supply an id fall back to the
// DB sequence, so the base archive can never lose a row.
const COLUMNS = [
  'id',
  'captured_at',
  'symbol',
  'exchange',
  'asset_class',
  'mode',
  'source',
  'strategy',
  'regime_label',
  'reject_stage',
  'final_score',
  'confidence_modulated',
  'features',
  'modulators',
  'gate_decision',
];

// B-NEW-53: 1:1 provenance sibling. Fixed typed columns (no JSONB) — the
// variable resolved-constant set lives once-per-version in module_constants_version.
const PROVENANCE_TABLE = 'signal_eval_provenance';
const PROVENANCE_COLUMNS = [
  'captured_at',
  'archive_id',
  'symbol',
  'strategy',
  'asset_class',
  'forming_open',
  'forming_high',
  'forming_low',
  'forming_close',
  'forming_volume',
  'forming_bar_ts',
  'settled_bucket_ts',
  'settled_bar_count',
  'bar_interval_sec',
  'constants_hash',
  'resolved_stop_price',
  'resolved_target_price',
];

let registered = false;

export function ensureSignalEvalArchiverRegistered(): void {
  if (registered) return;
  registerArchiveTable(TABLE, COLUMNS, ['id']); // 'id' emits SQL DEFAULT when undefined
  registerArchiveTable(PROVENANCE_TABLE, PROVENANCE_COLUMNS);
  registered = true;
}

export type SignalEvalSource =
  | 'vts-runner'
  | 'signal-orchestrator'
  | 'active-execution-engine'
  // P19-B5a: active-path scanner pre_filter capture sources (crypto path).
  | 'market-scanner'
  | 'fx5-scanner'
  // P19-B5a: active-path reject source — RTB confidence-drop (reject_stage='rtb').
  | 'ready-to-buy';
export type RejectStage =
  | 'admitted'
  | 'pre_filter'
  | 'sqe'
  | 'rtb'
  | 'tcl'
  | 'strategy_internal';

/**
 * B-NEW-53: the EXACT decision-time replay inputs not derivable from the base
 * archive row. Captured BY VALUE at the hook (the forming bar is destructured to
 * scalars at the detect site — never a live reference). Present only when the
 * hook can supply it; capture is additionally gated per-asset-class at write time.
 */
export interface SignalEvalProvenanceInput {
  /** The in-progress (forming) 15m bar the engine evaluated — the irreducible gap. */
  formingBar?: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp?: number; // forming bucket epoch (ms); omitted/null if the bar carried no usable time
  };
  /** Reference to the settled bar-set already persisted in *_ohlc_15m_snapshot. */
  settledBucketTs?: Date | number;
  settledBarCount?: number;
  barIntervalSec?: number;
  /** RI-a checksum: the resolved stop/target LEVELS the engine produced. */
  resolvedStopPrice?: number;
  resolvedTargetPrice?: number;
}

/**
 * B-NEW-53: build a provenance input by snapshotting the in-progress (forming)
 * bar of `bars` BY VALUE — the last element — plus a settled-bar-set reference.
 * Shared by every archive hook (xStock `eval-cycle.ts`, crypto `vts-runner.ts`)
 * so the forming-bar snapshot logic lives in exactly one place. The bar interval
 * is derived from the spacing of the last two bars (15m → 900, 60m → 3600), so
 * it stays faithful across asset classes and any future cadence change. Returns
 * undefined for an empty bar array. Pass the resolved stop/target when known.
 */
export function buildBarProvenance(
  bars: ReadonlyArray<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }> | undefined,
  stopPrice?: number,
  targetPrice?: number,
): SignalEvalProvenanceInput | undefined {
  const n = Array.isArray(bars) ? bars.length : 0;
  if (n === 0) return undefined;
  const fb: any = bars![n - 1];
  const settled: any = n >= 2 ? bars![n - 2] : undefined;
  // Guard non-finite timestamps: a bar may carry a NaN/undefined time (some feeds
  // populate OHLCV but not the time field). NEVER emit NaN — `forming_bar_ts` and
  // `settled_bucket_ts` are bigint/timestamptz and reject NaN, which would drop the
  // whole row at flush. Non-finite → null/undefined; the OHLCV + constants + levels
  // still persist. Interval falls back to 900 when it can't be derived.
  const fbTs = Number(fb.timestamp);
  const settledTs = settled ? Number(settled.timestamp) : NaN;
  const intervalSec =
    Number.isFinite(fbTs) && Number.isFinite(settledTs) && fbTs > settledTs
      ? Math.round((fbTs - settledTs) / 1000)
      : 900;
  return {
    formingBar: {
      open: Number(fb.open),
      high: Number(fb.high),
      low: Number(fb.low),
      close: Number(fb.close),
      volume: Number(fb.volume),
      timestamp: Number.isFinite(fbTs) ? fbTs : undefined,
    },
    settledBucketTs: Number.isFinite(settledTs) ? settledTs : undefined,
    settledBarCount: Math.max(0, n - 1),
    barIntervalSec: intervalSec,
    resolvedStopPrice: stopPrice,
    resolvedTargetPrice: targetPrice,
  };
}

export interface SignalEvalArchiveInput {
  /** ITEM-4 step 2 (D1): REQUIRED — the producer's carried mode tag ('vts' | 'paper_sim' | 'live'). */
  mode: RunMode;
  capturedAt?: Date | number;
  symbol: string;
  exchange: string;
  assetClass: string;
  source: SignalEvalSource;
  strategy: string;
  regimeLabel?: string;
  rejectStage: RejectStage;
  finalScore?: number;
  confidenceModulated?: number;
  features?: Record<string, unknown>;
  modulators?: Record<string, unknown>;
  gateDecision?: Record<string, unknown>;
  /** B-NEW-53: decision-provenance for exact future replay (telemetry-only). */
  provenance?: SignalEvalProvenanceInput;
}

/**
 * P19-B5a: thin wrapper for ACTIVE-PATH pre_filter reject capture from the
 * crypto scanners (market-scanner global filters + fx5-scanner family/pattern
 * IMF). Centralizes the fixed pre_filter row shape so the scanner call-sites
 * stay one-liners and the semantics live in exactly one place:
 *   - rejectStage = 'pre_filter' (the pair was evaluated against a quality/
 *     liquidity bar and FAILED — not an eligibility exclusion);
 *   - score fields stay NULL (a pre_filter pair was never scored — Langston rule);
 *   - strategy defaults to 'none'; family-IMF rows pass the FAMILY name here, so
 *     at pre_filter the `strategy` column carries a family, NOT a strategy
 *     (query convention: reject_stage='pre_filter' AND label LIKE 'family_imf%');
 *   - the failing gate label + observed/threshold detail go in gate_decision.
 * Fire-and-forget + try/catch: a telemetry write must NEVER throw into the scan
 * path (B11/§11 — telemetry degrades silently, never backpressures the cycle).
 * The CALLER gates on the canonical active-mode SoT (isEngineActive /
 * !isPassiveLearning), so NOTHING is written while the engine is in VTS/passive
 * learning — these are the active-pipeline reject sites, dormant until paper-
 * active turns on (the gate_decision table is expected EMPTY mid-Phase-19-build).
 */
export function capturePreFilterReject(args: {
  mode: RunMode;
  symbol: string;
  exchange: string;
  assetClass: string;
  source: SignalEvalSource;
  label: string;
  strategy?: string;
  gateDetail?: Record<string, unknown>;
}): void {
  try {
    archiveSignalEval({
      mode: args.mode,
      symbol: args.symbol,
      exchange: args.exchange,
      assetClass: args.assetClass,
      source: args.source,
      strategy: args.strategy ?? 'none',
      rejectStage: 'pre_filter',
      // scores stay null — a pre_filter pair was never scored.
      gateDecision: { label: args.label, ...(args.gateDetail ?? {}) },
    });
  } catch {
    /* B5a: telemetry must never throw into the scan path (Langston Step-4 (c)). */
  }
}

export function archiveSignalEval(input: SignalEvalArchiveInput): void {
  const cfg = getArchiveConfig();
  if (!cfg.signalEvalEnabled) return;
  // Kill-switch: when pre-filter capture is OFF, only admitted + post-SQE rows
  // make it through. This is the D.2 escape valve for volume worst-case.
  if (
    !cfg.signalEvalPreFilterEnabled &&
    (input.rejectStage === 'pre_filter' || input.rejectStage === 'strategy_internal')
  ) {
    return;
  }

  ensureSignalEvalArchiverRegistered();

  const capturedAt =
    input.capturedAt instanceof Date
      ? input.capturedAt
      : input.capturedAt !== undefined
      ? new Date(input.capturedAt)
      : new Date();

  // B-NEW-53: decision-provenance. Capture only when the hook supplied it AND
  // capture is enabled for this asset class (xStock on, crypto off at launch).
  // The link id is drawn from signal_eval_archive_id_seq via an amortized
  // block allocator (no hot-path DB round-trip). If the block is momentarily
  // empty, `archiveId` is undefined → the base row uses the DB DEFAULT and this
  // decision simply gets no provenance row (coverage < 100%, allowed by C1).
  const wantProvenance =
    input.provenance !== undefined && provenanceCaptureEnabled(input.assetClass);
  const archiveId: number | undefined = wantProvenance ? takeArchiveId() : undefined;

  enqueueArchiveRow(TABLE, {
    // undefined → SQL DEFAULT (sequence); a number → app-supplied (links to provenance)
    id: archiveId,
    captured_at: capturedAt,
    symbol: input.symbol,
    exchange: input.exchange,
    asset_class: input.assetClass,
    mode: input.mode, // ITEM-4 step 2 (D1): the CALLER's carried tag — never a global lookup
    source: input.source,
    strategy: input.strategy,
    regime_label: input.regimeLabel ?? null,
    reject_stage: input.rejectStage,
    final_score: input.finalScore ?? null,
    confidence_modulated: input.confidenceModulated ?? null,
    // ITEM-4 step-2b (2026-06-10) — the B.3 would_admit bridge, v0:
    // VTS rows get tagged with the single-check verdict "vts finalScore >=
    // PAPER-mode SQE finalScoreMin (this asset class)". Basis + threshold are
    // stamped so consumers know exactly what v0 means (see would-admit-cache
    // header + #211 — VTS finalScore is a different implementation than the
    // orchestrator's). null + 'thresholds_not_warm' while the TTL cache fills.
    features: {
      schema_version: 1,
      ...(input.features ?? {}),
      ...(input.mode === 'vts'
        ? (() => {
            // N1 (Langston): EVERY post-deploy VTS row carries a basis —
            // rows without a finite finalScore are distinguishable from
            // pre-deploy rows in Phase-25 slicing.
            if (!Number.isFinite(input.finalScore)) {
              return { would_admit_v0: null, would_admit_basis: 'no_final_score' };
            }
            const thr = getPaperFinalScoreMinSync(input.assetClass);
            return thr === null
              ? { would_admit_v0: null, would_admit_basis: 'thresholds_not_warm' }
              : {
                  would_admit_v0: (input.finalScore as number) >= thr,
                  would_admit_basis: 'final_score_vs_paper_finalScoreMin',
                  would_admit_threshold: thr,
                };
          })()
        : {}),
    },
    modulators: { schema_version: 1, ...(input.modulators ?? {}) },
    gate_decision: { schema_version: 1, ...(input.gateDecision ?? {}) },
  });

  if (wantProvenance && archiveId !== undefined) {
    const p = input.provenance!;
    const fb = p.formingBar;
    // Re-resolve + hash the strategy's detect constants (cheap pure cache lookup,
    // the same most-specific-wins set detect used) and record a novel version.
    const constants = resolveConstantsProvenance(input.strategy, input.assetClass);
    if (constants) recordConstantsVersion(constants, input.assetClass, input.strategy);
    const settledBucketTs =
      p.settledBucketTs instanceof Date
        ? p.settledBucketTs
        : p.settledBucketTs !== undefined
        ? new Date(p.settledBucketTs)
        : null;
    enqueueArchiveRow(PROVENANCE_TABLE, {
      captured_at: capturedAt,
      archive_id: archiveId,
      symbol: input.symbol,
      strategy: input.strategy,
      asset_class: input.assetClass,
      forming_open: fb?.open ?? null,
      forming_high: fb?.high ?? null,
      forming_low: fb?.low ?? null,
      forming_close: fb?.close ?? null,
      forming_volume: fb?.volume ?? null,
      forming_bar_ts: fb?.timestamp ?? null,
      settled_bucket_ts: settledBucketTs,
      settled_bar_count: p.settledBarCount ?? null,
      bar_interval_sec: p.barIntervalSec ?? null,
      constants_hash: constants?.hash ?? null,
      resolved_stop_price: p.resolvedStopPrice ?? null,
      resolved_target_price: p.resolvedTargetPrice ?? null,
    });
  }
}
