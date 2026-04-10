/**
 * Directive 11.4C.1 — Schema Version Tracking
 * 
 * Single source of truth for database schema version.
 * Used by telemetry and diagnostics for audit trail.
 * 
 * v1.6.3: Adaptive Scanner Integration & Legacy Deprecation (Directive 11.4C.1)
 * - Replaced legacy 60-pair collectMixedBatch with 100-pair collectAdaptiveBatch
 * - 60% Ideal Pool (telemetry top performers) + 40% Rotational Pool (exploration)
 * - AdaptiveScanManager now sole batch generator (M27 governance)
 * - collectMixedBatch deprecated with runtime warning (M28 governance)
 * - BATCH_SIZE=100, Ideal:Rotational=60:40 (M29 governance)
 * - Telemetry data freshness ≤24h (M30 governance)
 * - AdaptiveScan runtime ≤30s per cycle (M31 governance)
 * 
 * v1.6.2: Unified Table Schema with Market Regime & Friction Visualization (Directive 11.4B)
 * - Extended TradeRecord with MarketRegimeType and FrictionColor (M24 governance)
 * - Added mapFrictionVisual() helper for 4-tier color coding (M25 governance)
 * - Ready-to-Buy table: 17 columns with Regime/Friction before Status
 * - Open Trades table: 21 columns with Regime/Friction before Duration
 * - Trade History table: 18 columns with Regime/Friction before Opened/Closed
 * - Net P/L computation from canonical totalCost (M26 governance)
 * 
 * v1.6.1: Market Explanations, Layout Refinement & Navigation Reorganization (Directive 11.4A.1)
 * - Expanded Market Regime Definitions with full descriptions (M19 governance)
 * - Expanded Market Friction Narratives (M20 governance)
 * - Single continuous Analytics layout (no tabs) (M21 governance)
 * - Sidebar navigation reordering (M22 governance)
 * 
 * v1.6.0: Market Indicators & Narrative Transparency Dashboard (Directive 11.4A)
 * - Market Friction computation (0-100 normalization, M10 governance)
 * - Market Indicators service (global regime + friction)
 * - Narrative Feed service (7-day retention, M12 governance)
 * - Analytics UI page with frozen header
 * - API endpoints: /api/market-indicators, /api/narrative-feed
 * 
 * v1.5.9: Persistent Cost Telemetry & Drift Monitoring (Directive 11.3C)
 * - Cost telemetry persistence (5-min snapshots, 72h retention)
 * - Drift detection with 50% threshold alerting
 * - DSE cost pressure integration (up to 20% dampening)
 * - Extended diagnostics endpoints (/costs-history, /costs-alerts)
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
 * - Removed legacy columns from RTB signals
 * - FinalScore is now the sole operational metric
 * - Metric Engine v1.0 (Canonical)
 */

export const SCHEMA_VERSION = "v1.6.3";
export const SCHEMA_DIRECTIVE = "11.4C.1";
export const METRIC_ENGINE_VERSION = "v1.0";

/**
 * Schema version history for audit trail
 */
export const SCHEMA_HISTORY = [
  { version: "v1.6.3", directive: "11.4C.1", date: "2026-01-09", description: "Adaptive Scanner Integration & Legacy Deprecation (100-pair Ideal/Rotational)" },
  { version: "v1.6.2", directive: "11.4B", date: "2026-01-09", description: "Unified Table Schema with Market Regime & Friction Visualization" },
  { version: "v1.6.1", directive: "11.4A.1", date: "2026-01-09", description: "Market Explanations, Layout Refinement & Navigation Reorganization" },
  { version: "v1.6.0", directive: "11.4A", date: "2026-01-09", description: "Market Indicators & Narrative Transparency Dashboard" },
  { version: "v1.5.9", directive: "11.3C", date: "2026-01-09", description: "Persistent Cost Telemetry & Drift Monitoring" },
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
