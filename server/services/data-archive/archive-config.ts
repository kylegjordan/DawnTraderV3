/**
 * B70 — Archive layer config cache
 *
 * Reads `data_archive` module_constants once at startup + every 60s, exposing
 * cached values via sync getters so per-emit hot-path callers don't await a DB
 * round-trip. Mirrors the pattern used by trailing-exit-controller / TEC.
 */

import { getModuleConstants } from '../module-constants-service.js';

const REFRESH_INTERVAL_MS = 60_000;

interface ArchiveConfigSnapshot {
  pairScanEnabled: boolean;
  signalEvalEnabled: boolean;
  signalEvalPreFilterEnabled: boolean;
  exitDecisionEnabled: boolean;
  macroFeedEnabled: boolean;
  parquetExportEnabled: boolean;
  retentionDays: number;
  retentionSweepBatchSize: number;
  retentionSweepPauseMs: number;
  archiveWriterQueueMax: number;
  // B-NEW-53: per-asset-class decision-provenance capture flag, resolved
  // most-specific-wins. Default false (fail-closed) for any class not present.
  provenanceCaptureByClass: Record<string, boolean>;
}

// B-NEW-53: the asset classes whose provenance flag we resolve each refresh.
// Only the live spot classes archive signal-evals today; perp classes are dormant.
const PROVENANCE_RESOLVE_CLASSES = ['xstock_spot', 'crypto_spot'];

const DEFAULT: ArchiveConfigSnapshot = {
  pairScanEnabled: true,
  signalEvalEnabled: true,
  signalEvalPreFilterEnabled: true,
  exitDecisionEnabled: true,
  macroFeedEnabled: true,
  parquetExportEnabled: false,
  retentionDays: 90,
  retentionSweepBatchSize: 10_000,
  retentionSweepPauseMs: 100,
  archiveWriterQueueMax: 50_000,
  provenanceCaptureByClass: {}, // empty → all classes default false (fail-closed)
};

let cached: ArchiveConfigSnapshot = { ...DEFAULT };
let refreshTimer: NodeJS.Timeout | null = null;

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true';
  return fallback;
}
function asInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function refreshArchiveConfig(): Promise<void> {
  try {
    const rows = await getModuleConstants('data_archive', {
      exchange: '*',
      assetClass: '*',
      strategy: '*',
      regime: '*',
    });
    // B-NEW-53: resolve the per-asset-class provenance flag (most-specific-wins).
    const provenanceCaptureByClass: Record<string, boolean> = {};
    for (const ac of PROVENANCE_RESOLVE_CLASSES) {
      const classRows = await getModuleConstants('data_archive', {
        exchange: '*',
        assetClass: ac,
        strategy: '*',
        regime: '*',
      });
      provenanceCaptureByClass[ac] = asBool(
        classRows['b_new_53_provenance_capture_enabled'],
        false, // fail-closed
      );
    }
    cached = {
      pairScanEnabled: asBool(rows['b70_pair_scan_capture_enabled'], DEFAULT.pairScanEnabled),
      signalEvalEnabled: asBool(rows['b70_signal_eval_capture_enabled'], DEFAULT.signalEvalEnabled),
      signalEvalPreFilterEnabled: asBool(
        rows['b70_signal_eval_pre_filter_capture'],
        DEFAULT.signalEvalPreFilterEnabled,
      ),
      exitDecisionEnabled: asBool(
        rows['b70_exit_decision_capture_enabled'],
        DEFAULT.exitDecisionEnabled,
      ),
      macroFeedEnabled: asBool(rows['b70_macro_feed_capture_enabled'], DEFAULT.macroFeedEnabled),
      parquetExportEnabled: asBool(
        rows['b70_parquet_export_enabled'],
        DEFAULT.parquetExportEnabled,
      ),
      retentionDays: asInt(rows['b70_postgres_retention_days'], DEFAULT.retentionDays),
      retentionSweepBatchSize: asInt(
        rows['b70_retention_sweep_batch_size'],
        DEFAULT.retentionSweepBatchSize,
      ),
      retentionSweepPauseMs: asInt(
        rows['b70_retention_sweep_pause_ms'],
        DEFAULT.retentionSweepPauseMs,
      ),
      archiveWriterQueueMax: asInt(
        rows['b70_archive_writer_queue_max'],
        DEFAULT.archiveWriterQueueMax,
      ),
      provenanceCaptureByClass,
    };
  } catch (err) {
    console.warn(
      `[B70][config] refresh failed, holding cached values:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export function getArchiveConfig(): ArchiveConfigSnapshot {
  return cached;
}

/**
 * B-NEW-53: is decision-provenance capture enabled for this asset class?
 * Fail-closed — any class not explicitly resolved true returns false.
 */
export function provenanceCaptureEnabled(assetClass: string): boolean {
  return cached.provenanceCaptureByClass[assetClass] === true;
}

export async function startArchiveConfigRefresh(): Promise<void> {
  await refreshArchiveConfig();
  if (refreshTimer) return;
  refreshTimer = setInterval(refreshArchiveConfig, REFRESH_INTERVAL_MS);
  console.log(
    `[B70][config] archive-config cache started (refresh every ${REFRESH_INTERVAL_MS / 1000}s)`,
  );
}

export function stopArchiveConfigRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export function _resetForTests(): void {
  cached = { ...DEFAULT };
  stopArchiveConfigRefresh();
}
