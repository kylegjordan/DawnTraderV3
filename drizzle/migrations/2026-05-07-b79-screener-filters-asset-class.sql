-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
-- B79 Migration — screener_filters: add asset_class + tunable_status columns
-- and seed xstock_spot row with NO max_price cap (per Kyle directive 2026-05-07).
--
-- Per BATCH_79_SCOPE.md §-2 row 1 ("Why max-price cap on xStocks if we don't
-- cap crypto? Resolution: REMOVE the cap.") and §10 schema audit (CC PIA
-- 2026-05-07: 5 of 6 audited tables already have asset_class column;
-- screener_filters is the only one missing).
--
-- Crypto_spot no-touch fence: column add is additive with default 'crypto_spot'
-- backfilling all existing rows. Existing screener-filter consumers remain
-- on their current row; behavior unchanged.
--
-- max_price NULL semantics: NULL = no cap. Existing crypto rows keep their
-- numeric values (default 10000.00) so behavior is preserved. New xstock row
-- inserts max_price = NULL.
--
-- Rollback: see 2026-05-07-b79-screener-filters-asset-class-rollback.sql

BEGIN;

-- ── Column adds ─────────────────────────────────────────────────────────────

ALTER TABLE screener_filters
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto_spot';

ALTER TABLE screener_filters
  ADD COLUMN IF NOT EXISTS tunable_status TEXT NOT NULL DEFAULT 'active';
  -- tunable_status values: 'active' (Layer 1 / Layer 2 confirmed),
  -- 'pending_layer_3' (placeholder waiting for shadow-mode evidence to tune),
  -- 'frozen' (do-not-tune, e.g. domain-knowledge anchor).

-- Backfill all existing rows to crypto_spot (defensive — DEFAULT covers new
-- inserts, but explicit UPDATE makes the migration outcome unambiguous).
UPDATE screener_filters
   SET asset_class = 'crypto_spot'
 WHERE asset_class IS NULL OR asset_class = '';

UPDATE screener_filters
   SET tunable_status = 'active'
 WHERE tunable_status IS NULL OR tunable_status = '';

-- ── Index for asset-class-aware lookups ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_screener_filters_asset_class_mode
  ON screener_filters (asset_class, mode);

-- ── Seed xstock_spot row ────────────────────────────────────────────────────
-- Layer 1 domain-knowledge baseline per BATCH_79_SCOPE.md §2.3 / Stage 4 Q4.2.
-- Values reasoned + per-Langston-rev-1 with rev 5/6/7 corrections:
--
--   max_price       — NULL (NO CAP per Kyle directive; rev 6+)
--   min_volume      — 100000 (Langston; xstocks dollar-volumes well above $100K)
--   min_price       — 1.00 (Langston; lowest xstock tokens are sub-$5 not sub-$1)
--   max_bid_ask_spread — 1.00 (default; verify field unit semantics in PIA)
--   min_liquidity   — 50000 (Langston scaled-down)
--   universe_size   — 50 (CC: rev 7 §10 "VERY small at 10; pick proportional value
--                          for 275 symbols" — chose 50 as 18% of universe vs crypto's
--                          100/1530 ≈ 6.5%. Conservative-but-not-tiny Day 1.)
--   final_score_min — 0.35 (same as crypto)
--   confidence_threshold — 70 (Langston conservative Day 1 vs crypto 60;
--                          tagged tunable_status='pending_layer_3' since this
--                          is a Layer-3-derivation candidate.)
--   exclude_stablecoins — false (irrelevant for equities; harmless)
--
-- NOTE: this row is INSERTED dormant. The active scanner pulls by mode='paper'
-- and (post B79.0a) asset_class='xstock_spot'. The mere presence of this row
-- does NOT activate xstock scanning until the dedicated scanner loop wires in.

INSERT INTO screener_filters (
  mode,
  asset_class,
  tunable_status,
  min_volume,
  min_price,
  max_price,
  max_bid_ask_spread,
  min_liquidity,
  universe_size,
  final_score_min,
  confidence_threshold,
  exclude_stablecoins,
  description,
  managed_by_lottie,
  manual_override_enabled,
  enabled
) VALUES (
  'paper',
  'xstock_spot',
  'pending_layer_3',                  -- Layer 1 baseline; Layer 3 tunes
  100000.00,                           -- min_volume — see comment
  1.00,                                -- min_price — see comment
  NULL,                                -- max_price — NO CAP per Kyle
  1.00,                                -- max_bid_ask_spread
  50000.00,                            -- min_liquidity
  50,                                  -- universe_size
  0.3500,                              -- final_score_min
  70,                                  -- confidence_threshold
  false,                               -- exclude_stablecoins (irrelevant)
  'B79 xstock_spot Layer 1 domain-knowledge baseline — Layer 3 tuning pending shadow-mode observation 48-72h post-deploy. Created by B79 schema migration 2026-05-07.',
  false,                               -- managed_by_lottie — start Lottie-disabled
  false,                               -- manual_override_enabled
  true                                 -- enabled
)
ON CONFLICT DO NOTHING;
-- Idempotent: if row already exists (re-run), don't error; verify post-run.

-- ── Verification ────────────────────────────────────────────────────────────
-- SELECT id, mode, asset_class, tunable_status, max_price, confidence_threshold
--   FROM screener_filters
--  WHERE asset_class = 'xstock_spot';
-- Expect: 1 row, max_price=NULL, tunable_status='pending_layer_3', confidence_threshold=70.

COMMIT;
