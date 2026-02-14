-- Directive 11.3: Predictive Risk & Cost Modeling - Dynamic Sizing Engine
-- Schema v1.5.6
-- Adds position_size and size_multiplier columns to telemetry_history

ALTER TABLE telemetry_history
  ADD COLUMN IF NOT EXISTS position_size DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS size_multiplier DOUBLE PRECISION;

-- Comments for documentation
COMMENT ON COLUMN telemetry_history.position_size IS 'Directive 11.3: DSE computed trade size';
COMMENT ON COLUMN telemetry_history.size_multiplier IS 'Directive 11.3: DSE scaling multiplier (0.3-1.2)';
