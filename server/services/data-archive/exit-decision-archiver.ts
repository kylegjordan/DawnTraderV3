/**
 * B70 Step 3.5 — Exit Decision Archiver
 *
 * Captures actual exit decisions (parallel to B73 counterfactual exit-strategy
 * ablation). Hooks into:
 *   - vts-runner.ts:exit-loop → source='vts-runner'
 *   - paper-execution-engine.ts:closePosition → source='paper-execution-engine'
 *   - live-trading-service.ts:closePosition → source='live-trading-service' (Phase 21)
 *
 * Low cadence: 50–300 rows/day. Captures full state snapshot at exit time
 * (regime/DBS at entry vs at exit, R-multiple, time-in-trade) for downstream
 * exit-policy analysis.
 */

import { enqueueArchiveRow, registerArchiveTable } from './archive-batch-writer.js';
import { getArchiveConfig } from './archive-config.js';
import { getCurrentMode } from '../run-mode-controller.js';

const TABLE = 'exit_decision_archive';
const COLUMNS = [
  'captured_at',
  'trade_id',
  'symbol',
  'exchange',
  'asset_class',
  'mode',
  'source',
  'strategy',
  'exit_reason',
  'entry_price',
  'exit_price',
  'pnl_pct',
  'r_multiple',
  'duration_min',
  'regime_at_entry',
  'regime_at_exit',
  'dbs_at_entry',
  'dbs_at_exit',
  'atr_at_exit',
  'state_snapshot',
];

let registered = false;

export function ensureExitDecisionArchiverRegistered(): void {
  if (registered) return;
  registerArchiveTable(TABLE, COLUMNS);
  registered = true;
}

export type ExitDecisionSource =
  | 'vts-runner'
  | 'paper-execution-engine'
  | 'live-trading-service';
export type ExitReason =
  | 'BE_stop'
  | 'SL_hit'
  | 'TP_target_hit'
  | 'TRAIL_hit'
  | 'time_stop'
  | 'regime_flip'
  | 'manual'
  | 'other';

export interface ExitDecisionArchiveInput {
  capturedAt?: Date | number;
  tradeId: string;
  symbol: string;
  exchange: string;
  assetClass: string;
  source: ExitDecisionSource;
  strategy?: string;
  exitReason: ExitReason;
  entryPrice?: number;
  exitPrice?: number;
  pnlPct?: number;
  rMultiple?: number;
  durationMin?: number;
  regimeAtEntry?: string;
  regimeAtExit?: string;
  dbsAtEntry?: number;
  dbsAtExit?: number;
  atrAtExit?: number;
  stateSnapshot?: Record<string, unknown>;
}

export function archiveExitDecision(input: ExitDecisionArchiveInput): void {
  const cfg = getArchiveConfig();
  if (!cfg.exitDecisionEnabled) return;

  ensureExitDecisionArchiverRegistered();

  const capturedAt =
    input.capturedAt instanceof Date
      ? input.capturedAt
      : input.capturedAt !== undefined
      ? new Date(input.capturedAt)
      : new Date();

  enqueueArchiveRow(TABLE, {
    captured_at: capturedAt,
    trade_id: input.tradeId,
    symbol: input.symbol,
    exchange: input.exchange,
    asset_class: input.assetClass,
    mode: getCurrentMode(),
    source: input.source,
    strategy: input.strategy ?? null,
    exit_reason: input.exitReason,
    entry_price: input.entryPrice ?? null,
    exit_price: input.exitPrice ?? null,
    pnl_pct: input.pnlPct ?? null,
    r_multiple: input.rMultiple ?? null,
    duration_min: input.durationMin ?? null,
    regime_at_entry: input.regimeAtEntry ?? null,
    regime_at_exit: input.regimeAtExit ?? null,
    dbs_at_entry: input.dbsAtEntry ?? null,
    dbs_at_exit: input.dbsAtExit ?? null,
    atr_at_exit: input.atrAtExit ?? null,
    state_snapshot: { schema_version: 1, ...(input.stateSnapshot ?? {}) },
  });
}
