/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ARCHIVE SEALED — Directive 11.0G
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Legacy metric data retained for compliance only.
 * Purge Date: 2026-06-30 or upon 11.5 system audit completion.
 * 
 * This file preserves historical formulas for legacy metrics that were used
 * prior to the FinalScore unification in Phase 10/11.
 * 
 * STATUS: ARCHIVED - DO NOT USE IN PRODUCTION CODE
 * 
 * These metrics have been PERMANENTLY REMOVED from the database schema (v1.5.0):
 *   - cwqi: Removed from rtb_signals table
 *   - ngc: Removed from rtb_signals table
 *   - profitRate: Removed from all signal evaluation
 * 
 * Current canonical metrics (Metric Engine v1.0):
 *   - FinalScore: Unified signal quality score
 *   - RegimeWeight: Market regime alignment
 *   - HybridScore: Hybrid strategy score component
 *   - DecayPenalty: Signal age decay factor
 * 
 * Archive Integrity: SHA-256 checksum validation enabled (Directive 11.0G)
 * 
 * See: server/core/utils/score-calculator.ts for current implementation
 * See: server/legacy/data/legacy_metrics_snapshot.json for archived data
 * ══════════════════════════════════════════════════════════════════════════════
 */

import crypto from "crypto";

/**
 * ARCHIVED: CWQI (Confidence-Weighted Quality Index)
 * 
 * Historical Formula:
 *   CWQI = (NGC × 0.40) + ((1 - Risk) × 0.25) + (ExpectedReturn × 0.20) + (ProfitRate × 0.15)
 * 
 * Replaced by: FinalScore = (HybridScore × 0.4) + (Confidence × 0.3) + (RegimeWeight × 0.2) - (DecayPenalty × 0.1)
 */
export const CWQI_FORMULA_ARCHIVED = "(NGC × 0.40) + ((1 - Risk) × 0.25) + (ExpectedReturn × 0.20) + (ProfitRate × 0.15)";

/**
 * ARCHIVED: NGC (Normalized Global Confidence)
 * 
 * Historical Formula:
 *   NGC = normalize(base_confidence × (1 - volatility) × (1 - risk))
 * 
 * Replaced by: Direct use of confidence in FinalScore calculation
 */
export const NGC_FORMULA_ARCHIVED = "normalize(base_confidence × (1 - volatility) × (1 - risk))";

/**
 * ARCHIVED: ProfitRate
 * 
 * Historical Formula:
 *   ProfitRate = expectedReturn / expectedDuration
 * 
 * Replaced by: Not used - FinalScore does not consider time-based profit metrics
 */
export const PROFITRATE_FORMULA_ARCHIVED = "expectedReturn / expectedDuration";

/**
 * ARCHIVED: CWQI Durability Decay
 * 
 * Historical Formula:
 *   CWQI_decayed = CWQI_orig × e^(-λt)
 *   λ = 0.03 per minute
 * 
 * Replaced by: decayPenalty in FinalScore formula
 */
export const CWQI_DECAY_FORMULA_ARCHIVED = "CWQI_orig × e^(-0.03 × t)";

/**
 * ARCHIVED: Historical threshold constants
 * These were used in legacy signal evaluation before Directive 11.0B
 */
export const ARCHIVED_THRESHOLDS = {
  NGC_MIN: 0.45,
  CWQI_MIN: 0.35,
  PROFITRATE_MIN: 0.002,
  RISK_MAX: 0.70,
};

/**
 * ARCHIVED: Strategy-specific ProfitRate floors
 * These per-strategy floors were used to adjust signal quality evaluation
 */
export const ARCHIVED_PROFITRATE_FLOORS: Record<string, number> = {
  DHMA: 0.002,
  WHALE_WATCHER: 0.001,
  LIQUIDITY_SURGE: 0.0015,
  DEFAULT: 0.002,
};

/**
 * Archive metadata for documentation purposes
 */
export const ARCHIVE_METADATA = {
  archivedDate: "2026-01-08",
  directive: "11.0G",
  sealedBy: "Directive 11.0F",
  replacedBy: {
    CWQI: "FinalScore",
    NGC: "confidence (direct)",
    ProfitRate: "removed",
    Risk: "part of RegimeWeight",
  },
  currentFormula: "FinalScore = (HybridScore × 0.4) + (Confidence × 0.3) + (RegimeWeight × 0.2) - (DecayPenalty × 0.1)",
};

/**
 * Directive 11.0G — Archive Integrity Checksum
 * 
 * Creates a SHA-256 checksum for archive data to ensure immutability.
 * @param data - The archive data object to seal
 * @returns The data object with archiveChecksum field added
 */
export function sealLegacyArchive(data: Record<string, unknown>): Record<string, unknown> & { archiveChecksum: string } {
  const dataCopy = { ...data };
  delete (dataCopy as any).archiveChecksum;
  
  const serialized = JSON.stringify(dataCopy, null, 2);
  const checksum = crypto.createHash("sha256").update(serialized).digest("hex");
  
  return {
    ...data,
    archiveChecksum: checksum,
  };
}

/**
 * Directive 11.0G — Verify Archive Integrity
 * 
 * Validates the SHA-256 checksum of archive data.
 * @param data - The archive data object with checksum to verify
 * @returns true if checksum matches, false otherwise
 */
export function verifyArchiveIntegrity(data: Record<string, unknown> & { archiveChecksum?: string }): boolean {
  if (!data.archiveChecksum) {
    return false;
  }
  
  const storedChecksum = data.archiveChecksum;
  const dataCopy = { ...data };
  delete dataCopy.archiveChecksum;
  
  const serialized = JSON.stringify(dataCopy, null, 2);
  const computedChecksum = crypto.createHash("sha256").update(serialized).digest("hex");
  
  return storedChecksum === computedChecksum;
}
