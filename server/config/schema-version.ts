/**
 * Directive 11.0F — Schema Version Tracking
 * 
 * Single source of truth for database schema version.
 * Used by telemetry and diagnostics for audit trail.
 * 
 * v1.5.0: Legacy Data Purge & Schema Finalization
 * - Removed cwqi, ngc, profitRate columns from RTB signals
 * - FinalScore is now the sole operational metric
 * - Metric Engine v1.0 (Canonical)
 */

export const SCHEMA_VERSION = "v1.5.0";
export const SCHEMA_DIRECTIVE = "11.0F";
export const METRIC_ENGINE_VERSION = "v1.0";
