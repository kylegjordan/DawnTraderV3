/**
 * B70 Step 3.4 — Pair Scan Archiver
 *
 * Captures per-pair × per-cycle MCE scan-state snapshots. Hooks into MCE
 * post-classification (`computeContext()` return path) to record:
 *  - regime label + confidence (modulated)
 *  - DBS score + category
 *  - ATR%
 *  - 7-modulator chain values (per BATCH_70_SCOPE.md §1)
 *  - feature inputs at classification time
 *  - scan_stage_decision (whether the pair admitted to signal-eval, and if not, why)
 *
 * Cadence: ~177 active filter-pool pairs × 1 cycle / 60s = ~255k rows/day.
 *
 * Hot-path constraint: hook MUST NOT block the MCE 60s cycle. Wrapped in
 * try/catch in the caller (see MCE hook site) and uses fire-and-forget enqueue
 * with bounded queue + drop-on-overflow.
 *
 * Mode/source semantics:
 *  - mode = 'shared' (ITEM-4 step 2: producer-agnostic substrate, computed once for all)
 *  - source = 'mce-cycle' (hook origin)
 */

import { enqueueArchiveRow, registerArchiveTable } from './archive-batch-writer.js';
import { getArchiveConfig } from './archive-config.js';
// ITEM-4 step 2 (D1, Langston-confirmed decision 2): pair_scan is the SHARED
// producer-agnostic substrate (sole caller = the MCE scan cycle; zero mode-
// filtered readers). Stamping getCurrentMode() on shared rows becomes a lie
// the moment two producers run -> rows now stamp the literal 'shared'.
// Value-set addition documented in SIM + the B70 migration comment vocabulary.

const TABLE = 'pair_scan_archive';
const COLUMNS = [
  'captured_at',
  'symbol',
  'exchange',
  'asset_class',
  'mode',
  'source',
  'regime_label',
  'regime_confidence',
  'dbs_score',
  'dbs_category',
  'atr_pct',
  'confidence_modulated',
  'features',
  'modulators',
  'scan_stage_decision',
];

let registered = false;

export function ensurePairScanArchiverRegistered(): void {
  if (registered) return;
  registerArchiveTable(TABLE, COLUMNS);
  registered = true;
}

export interface PairScanArchiveInput {
  capturedAt?: Date | number;
  symbol: string;
  exchange: string;
  assetClass: string;
  regimeLabel?: string;
  regimeConfidence?: number;
  dbsScore?: number;
  dbsCategory?: string;
  atrPct?: number;
  confidenceModulated?: number;
  features?: Record<string, unknown>;
  modulators?: Record<string, unknown>;
  scanStageDecision?: Record<string, unknown>;
}

export function archivePairScan(input: PairScanArchiveInput): void {
  const cfg = getArchiveConfig();
  if (!cfg.pairScanEnabled) return;

  ensurePairScanArchiverRegistered();

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
    mode: 'shared', // ITEM-4 step 2: shared substrate — computed once for ALL producers
    source: 'mce-cycle',
    regime_label: input.regimeLabel ?? null,
    regime_confidence: input.regimeConfidence ?? null,
    dbs_score: input.dbsScore ?? null,
    dbs_category: input.dbsCategory ?? null,
    atr_pct: input.atrPct ?? null,
    confidence_modulated: input.confidenceModulated ?? null,
    features: { schema_version: 1, ...(input.features ?? {}) },
    modulators: { schema_version: 1, ...(input.modulators ?? {}) },
    scan_stage_decision: { schema_version: 1, ...(input.scanStageDecision ?? {}) },
  });
}
