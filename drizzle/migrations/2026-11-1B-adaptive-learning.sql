-- Directive 11.1B: Adaptive Learning Weight Persistence
-- Schema Version: v1.5.3
-- Date: January 2026
-- 
-- Creates adaptive_learning table for persisting strategy weights
-- with timestamp propagation for time-based decay on rehydration.
-- Decay formula: exp(-0.05 * ageDays) ~ 5% per day

CREATE TABLE IF NOT EXISTS adaptive_learning (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id VARCHAR(50) NOT NULL,
  mode trading_mode NOT NULL,
  regime market_regime NOT NULL,
  weights JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS adaptive_learning_strategy_mode_idx 
  ON adaptive_learning(strategy_id, mode);

CREATE INDEX IF NOT EXISTS adaptive_learning_regime_idx 
  ON adaptive_learning(regime);

CREATE INDEX IF NOT EXISTS adaptive_learning_updated_at_idx 
  ON adaptive_learning(updated_at);

-- Documentation comments
COMMENT ON TABLE adaptive_learning IS 'Directive 11.1B: Adaptive learning weight persistence with timestamp propagation';
COMMENT ON COLUMN adaptive_learning.strategy_id IS 'Unique identifier for the strategy';
COMMENT ON COLUMN adaptive_learning.weights IS 'AdaptiveWeights JSON object';
COMMENT ON COLUMN adaptive_learning.updated_at IS 'Timestamp for time-based decay calculation';
