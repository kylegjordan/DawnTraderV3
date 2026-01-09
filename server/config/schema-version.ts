/**
 * Directive 11.3B — Schema Version Tracking
 * 
 * Single source of truth for database schema version.
 * Used by telemetry and diagnostics for audit trail.
 * 
 * v1.5.8: Cost Engine Consolidation & Diagnostics Finalization (Directive 11.3B)
 * - Centralized exchange defaults in /server/config/exchange-defaults.ts
 * - In-memory cost cache in /server/core/cache/cost-cache.ts
 * - Default taker fee raised to 0.26% (Kraken conservative)
 * - TEC cost diagnostics endpoint (/api/diagnostics/tec/costs)
 * - Observability loop logging every 60s
 * - Max cost bounds clamped to 1%
 * 
 * v1.5.7: Net Expectancy Standardization, Cost Integration & Geometry Integrity (Directive 11.3A)
 * - No new columns (uses existing telemetry_history structure)
 * - Unified cost model (computeTotalRoundTripCost) across all modules
 * - Net geometry in Signal Orchestrator and RTB Refresh
 * - Cost-aware ratchet in TEC trailing exits
 * - VTS uses same net geometry as production
 * - Conditional geometry refresh (vol/spread/time thresholds)
 * 
 * v1.5.6: Predictive Risk & Cost Modeling - Dynamic Sizing Engine (Directive 11.3)
 * - Added position_size column to telemetry_history (actual trade size executed)
 * - Added size_multiplier column to telemetry_history (DSE scaling multiplier 0.3-1.2)
 * - Enables Dynamic Sizing Engine telemetry tracking
 * 
 * v1.5.5: Adaptive Scanning Fairness - Pool Tracking (Directive 11.2 R1)
 * - Added pool column to telemetry_history (ideal/rotational)
 * - Index for regime/pool queries used by AdaptiveRatioManager
 * - Enables Ideal vs Rotational performance segmentation
 * 
 * v1.5.3: Adaptive Learning Weight Persistence (Directive 11.1B)
 * - Added adaptive_learning table for strategy weight persistence
 * - Timestamp propagation for time-based decay on rehydration
 * - Decay formula: exp(-0.05 * ageDays) ~ 5% per day
 * 
 * v1.5.2: Persistent Intelligence - SQL-based Telemetry Persistence
 * - Added telemetry_history table with regime, checksum, persisted_at columns
 * - Market regime tagging (ENUM: BULL_STABLE, BEAR_STABLE, etc.)
 * - SHA-256 checksum validation for telemetry integrity
 * - Environment guard: live mode only with FORCE_PERSIST override
 * 
 * v1.5.1: Schema Integrity & Telemetry Validation Hardening
 * - Formal migration file created (drizzle/migrations/2026-11-0G-schema-hardening.sql)
 * - Added archive checksum validation (SHA-256)
 * - Implemented telemetry schema validation between backend and frontend
 * - Enforced ExecutionConfig read-only lock
 * 
 * v1.5.0: Legacy Data Purge & Schema Finalization (Directive 11.0F)
 * - Removed cwqi, ngc, profitRate columns from RTB signals
 * - FinalScore is now the sole operational metric
 * - Metric Engine v1.0 (Canonical)
 */

export const SCHEMA_VERSION = "v1.5.8";
export const SCHEMA_DIRECTIVE = "11.3B";
export const METRIC_ENGINE_VERSION = "v1.0";

/**
 * Schema version history for audit trail
 */
export const SCHEMA_HISTORY = [
  { version: "v1.5.8", directive: "11.3B", date: "2026-01-09", description: "Cost Engine Consolidation & Diagnostics Finalization" },
  { version: "v1.5.7", directive: "11.3A", date: "2026-01-08", description: "Net Expectancy Standardization, Cost Integration & Geometry Integrity" },
  { version: "v1.5.6", directive: "11.3", date: "2026-01-08", description: "Predictive Risk & Cost Modeling - Dynamic Sizing Engine" },
  { version: "v1.5.5", directive: "11.2R1", date: "2026-01-08", description: "Adaptive Scanning Fairness - Pool Tracking (ideal/rotational)" },
  { version: "v1.5.3", directive: "11.1B", date: "2026-01-08", description: "Adaptive Learning Weight Persistence with Timestamp Propagation" },
  { version: "v1.5.2", directive: "11.1A", date: "2026-01-08", description: "Persistent Intelligence - SQL-based Telemetry Persistence" },
  { version: "v1.5.1", directive: "11.0G", date: "2026-01-08", description: "Schema Integrity & Telemetry Validation Hardening" },
  { version: "v1.5.0", directive: "11.0F", date: "2026-01-08", description: "Legacy Data Purge & Schema Finalization" },
  { version: "v1.4.6", directive: "11.0E", date: "2026-01-07", description: "FinalScore Transition Phase" },
];
