/**
 * Directive 11.1A — Schema Version Tracking
 * 
 * Single source of truth for database schema version.
 * Used by telemetry and diagnostics for audit trail.
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

export const SCHEMA_VERSION = "v1.5.2";
export const SCHEMA_DIRECTIVE = "11.1A";
export const METRIC_ENGINE_VERSION = "v1.0";

/**
 * Schema version history for audit trail
 */
export const SCHEMA_HISTORY = [
  { version: "v1.5.2", directive: "11.1A", date: "2026-01-08", description: "Persistent Intelligence - SQL-based Telemetry Persistence" },
  { version: "v1.5.1", directive: "11.0G", date: "2026-01-08", description: "Schema Integrity & Telemetry Validation Hardening" },
  { version: "v1.5.0", directive: "11.0F", date: "2026-01-08", description: "Legacy Data Purge & Schema Finalization" },
  { version: "v1.4.6", directive: "11.0E", date: "2026-01-07", description: "FinalScore Transition Phase" },
];
