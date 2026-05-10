-- B79.0g — Persist open VTS trades so they survive PM2 restarts and so
-- downstream consumers read asset_class from the row (not re-resolve from
-- canonical symbol form, which post-canonicalization is ambiguous for the
-- 9 collision tickers — Sun Communities/Sui-Network etc).
--
-- Hybrid schema: key fields explicit (queryable) + `context` JSONB for the
-- 20+ optional fields on OpenVirtualTrade (vts-runner.ts:514-577). Reduces
-- column churn on schema evolution; rehydrate path deserializes context
-- back into the in-memory record.

BEGIN;

CREATE TABLE IF NOT EXISTS vts_open_trades (
  id                 text                     PRIMARY KEY,
  symbol             text                     NOT NULL,
  asset_class        text                     NOT NULL,
  entry_price        numeric(20,8)            NOT NULL,
  stop_loss          numeric(20,8)            NOT NULL,
  take_profit        numeric(20,8)            NOT NULL,
  position_size      numeric(20,8)            NOT NULL,
  dollar_value       numeric(20,2)            NOT NULL,
  quantity           numeric(20,8)            NOT NULL,
  regime             text                     NOT NULL,
  signal_type        text                     NOT NULL,
  strategy           text                     NOT NULL,
  pool               text                     NOT NULL,
  opened_at          timestamp with time zone NOT NULL,
  -- Everything else: regime score, scores, DBS values, friction, pattern
  -- type, mode/overlay/stability, B65 ladder + ratchet observability,
  -- B67.2.1/B67.3 phase + cohort fields, pair/global directional bias.
  context            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  -- Persistence-layer bookkeeping (not on the in-memory record)
  inserted_at        timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at         timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vts_open_trades_symbol_idx ON vts_open_trades (symbol);
CREATE INDEX IF NOT EXISTS vts_open_trades_asset_class_idx ON vts_open_trades (asset_class);
CREATE INDEX IF NOT EXISTS vts_open_trades_opened_at_idx ON vts_open_trades (opened_at);

COMMENT ON TABLE vts_open_trades IS
  'B79.0g — durable open VTS trade rows; written at trade-open, deleted at trade-close inside the same transaction that inserts the closed-trade row into paper_sim_trades. Rehydrated into the in-memory openVirtualTrades Map at server boot.';

COMMIT;
