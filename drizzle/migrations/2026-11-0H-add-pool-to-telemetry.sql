-- Directive 11.2 R1: Adaptive Scanning Fairness - Pool Tracking
-- Schema Version: v1.5.5
-- Date: January 2026

-- Add tracking for source pool (ideal vs rotational)
ALTER TABLE telemetry_history
  ADD COLUMN IF NOT EXISTS pool TEXT DEFAULT 'ideal';

-- Index for regime/pool queries used by AdaptiveRatioManager
CREATE INDEX IF NOT EXISTS idx_telemetry_history_regime_pool
  ON telemetry_history (regime, pool);

-- Comment for documentation
COMMENT ON COLUMN telemetry_history.pool IS 'Directive 11.2 R1: Source pool (ideal or rotational) for segmented performance tracking';
