/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ITEM-4 Phase B step 2 (2026-06-10) — per-source CALIBRATION EPOCH (v0)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The anti-mixing stamp for the labeled multi-source learning substrate
 * (Gate-2 design B.7 #4 + Langston step-2 amendments). Each learning SOURCE
 * (vts / paper_sim / live) carries an integer epoch identifying the
 * calibration lineage its observations were produced under. Learning
 * aggregates reset (Welford) on epoch mismatch so pre- and post-calibration
 * outcomes are never silently blended — the exact trap that data-blocked the
 * W2.x backward studies.
 *
 * ── v0 semantics (manual-but-MANDATORY; Langston-reviewed) ─────────────────
 * - Storage: `module_constants` module `calibration_epoch`, one numeric
 *   constant per source ('vts' | 'paper_sim' | 'live'), wildcard resolution
 *   key, seeded at 1 by migration 2026-06-10-item4-step2-calibration-epoch.sql.
 * - BUMP-SCOPE RULE (Langston amendment 1): a calibration-affecting change
 *   scoped to ONE source bumps THAT source only; a SHARED-substrate change
 *   (MCE indicator math, SQE thresholds, regime-map edits, strategy
 *   detect/scoring constants used by all producers) bumps ALL sources.
 * - ENFORCEMENT (Langston amendment 2): every calibration-batch completion
 *   report MUST contain either the epoch bump or an explicit "no calibration
 *   impact" line — checked at Step 4/Step 8. Recorded in ADJUSTMENT_FRAMEWORK.
 * - MECHANICS (Langston amendment 3): bumps go through the canonical
 *   module_constants write path (the B72 family) — never a direct DB poke.
 * - KNOWN LIMITATION (documented, accepted): on a bump, the Welford stream
 *   resets honestly but the legacy EMA continues carrying cross-epoch signal
 *   until the future estimator swap (Gate-2 B.7 #2 retained the EMA as the
 *   live factor input to avoid an unattended calibration behavior change).
 * - Auto-bump detection = future enhancement; manual-but-mandatory beats a
 *   half-built detector.
 *
 * Reads are sync via the warmed B72 cache (module added to PREFETCH_MODULES);
 * a cold cache or missing row throws — no silent fallback (Kyle invariant).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { getCachedNumbersForModule } from '../../services/module-constants-service.js';
import type { LearningSource } from './outcome-feedback-store.js';

/**
 * B-5 AMR (Obj-12, 2026-06-11): epochs gained an OPTIONAL asset-class
 * dimension. The v0 "per-source only" simplification broke on the first
 * class-scoped calibration change (xstock static->measured spread changes
 * the xstock admit population while crypto economics are untouched). A
 * class-scoped row (e.g. calibration_epoch/xstock_spot/vts) supersedes the
 * wildcard via the service's native most-specific-wins resolution; sources
 * without class splits keep resolving the wildcard row unchanged.
 */
const WILDCARD_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };

/**
 * Current calibration epoch for a learning source. Throws if the module is
 * not warmed or the source row is missing (fail-hard: the migration seeds
 * all three rows; absence means the migration was not applied).
 * `assetClass` narrows to a class-scoped epoch row when one exists
 * (most-specific-wins); omitted = wildcard (pre-B-5 behavior).
 */
export function getCalibrationEpoch(source: LearningSource, assetClass?: string): number {
  const key = assetClass ? { ...WILDCARD_KEY, assetClass } : WILDCARD_KEY;
  const rows = getCachedNumbersForModule('calibration_epoch', key);
  const epoch = rows[source];
  if (!Number.isFinite(epoch) || epoch < 1) {
    throw new Error(
      `[ITEM4][calibration-epoch] no epoch row for source='${source}' — ` +
      `migration 2026-06-10-item4-step2-calibration-epoch.sql not applied or row deleted. ` +
      `No fallback (fail-hard by design).`,
    );
  }
  return epoch;
}
