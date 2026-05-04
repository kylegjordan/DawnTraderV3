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
import { getArchiveConfig } from './archive-config.js';
import { getCurrentMode } from '../run-mode-controller.js';

const TABLE = 'signal_eval_archive';
const COLUMNS = [
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

let registered = false;

export function ensureSignalEvalArchiverRegistered(): void {
  if (registered) return;
  registerArchiveTable(TABLE, COLUMNS);
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

  enqueueArchiveRow(TABLE, {
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
}
