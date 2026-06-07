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
import { getCurrentMode } from '../run-mode-controller.js';
import { takeArchiveId } from './archive-id-allocator.js';
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

export type SignalEvalSource = 'vts-runner' | 'signal-orchestrator' | 'paper-execution-engine';
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
    mode: getCurrentMode(),
    source: input.source,
    strategy: input.strategy,
    regime_label: input.regimeLabel ?? null,
    reject_stage: input.rejectStage,
    final_score: input.finalScore ?? null,
    confidence_modulated: input.confidenceModulated ?? null,
    features: { schema_version: 1, ...(input.features ?? {}) },
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
