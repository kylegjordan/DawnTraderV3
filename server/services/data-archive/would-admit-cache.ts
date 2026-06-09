/**
 * ITEM-4 Phase B step-2b (2026-06-10) — would_admit_v0 threshold cache
 *
 * The B.3 bridge (Gate-2 design): tag VTS signal-eval rows with "would the
 * REAL filter have admitted this?" so the firehose can be re-sliced into a
 * pseudo-post-selection sample comparable to paper's actually-admitted rows
 * (tier-2a comparison; precondition for any future tier-2b pooling).
 *
 * v0 semantics (HONEST about its basis — Langston Phase-A framing + #211):
 *   would_admit_v0 = (vts finalScore) >= (PAPER-mode SQE finalScoreMin for
 *   the row's asset class). SINGLE-check verdict. It does NOT replay the
 *   regime-weight, ROI, or confidence-floor checks (those need fields not on
 *   every row), and per #211 the VTS finalScore is a DIFFERENT implementation
 *   than the orchestrator's — so every stamp carries its basis + the exact
 *   threshold used. Consumers must treat this as v0, not gospel.
 *
 * The archiver is sync; threshold resolution is async (screener_filters /
 * module_constants). Resolution: lazy TTL cache, background-refreshed.
 * Rows archived before the cache warms get would_admit_v0 = null with basis
 * 'thresholds_not_warm' (honest, non-blocking — no fabricated default).
 */

import { getSQEThresholdsFromConfig } from '../../core/filters/signal_quality_evaluator.js';
import type { AssetClass } from '../../../shared/asset-classes.js';

const TTL_MS = 60_000;

interface CachedThreshold {
  finalScoreMin: number;
  fetchedAt: number;
}

const cache = new Map<string, CachedThreshold>();
const inFlight = new Set<string>();
// R1 (Langston step-2b review): failure cooldown — at firehose row rates a
// persistently failing config path must NOT become a per-row retry loop
// against a degraded dependency. Stale values still serve indefinitely.
const lastFailedAt = new Map<string, number>();
const FAILURE_COOLDOWN_MS = 10_000;

/**
 * Sync read of the PAPER-mode finalScoreMin for an asset class. Returns null
 * when not (yet) cached — triggers a background refresh so subsequent rows
 * get stamped. Never throws into the archive path.
 */
export function getPaperFinalScoreMinSync(assetClass: string): number | null {
  const hit = cache.get(assetClass);
  const now = Date.now();
  if (hit && now - hit.fetchedAt < TTL_MS) return hit.finalScoreMin;

  const failedAt = lastFailedAt.get(assetClass) ?? 0;
  if (!inFlight.has(assetClass) && now - failedAt >= FAILURE_COOLDOWN_MS) {
    inFlight.add(assetClass);
    getSQEThresholdsFromConfig('paper', assetClass as AssetClass)
      .then(t => {
        cache.set(assetClass, { finalScoreMin: t.finalScoreMin, fetchedAt: Date.now() });
        lastFailedAt.delete(assetClass);
      })
      .catch(err => {
        lastFailedAt.set(assetClass, Date.now());
        console.warn('[ITEM4][would-admit] threshold refresh failed (cooldown 10s):', err instanceof Error ? err.message : err);
      })
      .finally(() => inFlight.delete(assetClass));
  }
  // Stale-while-revalidate: serve the stale value if we have one.
  return hit ? hit.finalScoreMin : null;
}

/** Test-only. */
export function _clearWouldAdmitCache(): void {
  cache.clear();
  lastFailedAt.clear();
}
