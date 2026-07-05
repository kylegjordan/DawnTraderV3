-- P19-B8.2 — Balance policy: ghost-default deletion, anchor-version ledger,
-- balance-ratio calibration tag, friction-divergence knob seed.
-- Forward migration. Rollback companion: 2026-07-05-p19-b8-2-balance-policy.rollback.sql
-- (kept OUT of the manifest per convention).

BEGIN;

-- ============================================================================
-- 1. GHOST-DEFAULT DROPS (OBJ-2)
--    portfolio_state.balance: default "1000.00" DELETED — the balance may only
--    come into existence via the Kraken-mirror start flow / resume / re-anchor.
--    active_engine_sessions.starting_balance: default "10000" DELETED + NOT NULL.
--    Pre-migration NULL-row precheck (live, 2026-07-05): 0 NULLs / 141 rows.
--    The DO block re-verifies at apply time and ABORTS if any NULL appeared since.
-- ============================================================================

DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM active_engine_sessions WHERE starting_balance IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'P19-B8.2 precheck failed: % active_engine_sessions rows have NULL starting_balance — disposition them before applying', null_count;
  END IF;
END $$;

ALTER TABLE portfolio_state ALTER COLUMN balance DROP DEFAULT;
ALTER TABLE active_engine_sessions ALTER COLUMN starting_balance DROP DEFAULT;
ALTER TABLE active_engine_sessions ALTER COLUMN starting_balance SET NOT NULL;

-- ============================================================================
-- 2. ANCHOR VERSION + APPEND-ONLY ANCHOR-EVENT LEDGER (OBJ-3/OBJ-4)
--    Rows predating B8.2 carry anchor_version 0 (no anchor recorded — honest).
-- ============================================================================

ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS anchor_version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS portfolio_anchor_events (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  mode           trading_mode NOT NULL,
  anchor_version integer NOT NULL,
  old_balance    numeric(20,2),           -- NULL for the first anchor (no prior)
  new_balance    numeric(20,2) NOT NULL,
  reason         varchar(24) NOT NULL,    -- 'start_new' | 'auto_divergence' | 'launch_snap'
  divergence_bps numeric(12,4),           -- NULL unless reason='auto_divergence'
  min_notional_delta integer,
  occurred_at    timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT portfolio_anchor_events_reason_check
    CHECK (reason IN ('start_new','auto_divergence','launch_snap'))
);

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_anchor_events_mode_version_idx
  ON portfolio_anchor_events (mode, anchor_version);
CREATE INDEX IF NOT EXISTS portfolio_anchor_events_occurred_at_idx
  ON portfolio_anchor_events (occurred_at);

-- ============================================================================
-- 3. BALANCE-RATIO CALIBRATION TAG COLUMNS (OBJ-4)
--    Stamped once at open together with the anchor they were measured against;
--    carried to the closed row at close. Pre-B8.2 rows: honest NULL (no backfill).
--    VTS tables get NO columns — NULL-by-absence (Langston-approved pre-audit §10.3).
-- ============================================================================

ALTER TABLE active_open_positions ADD COLUMN IF NOT EXISTS balance_ratio_at_open   numeric(12,6);
ALTER TABLE active_open_positions ADD COLUMN IF NOT EXISTS anchor_balance_at_open  numeric(20,2);
ALTER TABLE active_open_positions ADD COLUMN IF NOT EXISTS anchor_version_at_open  integer;

ALTER TABLE closed_trades ADD COLUMN IF NOT EXISTS balance_ratio_at_open   numeric(12,6);
ALTER TABLE closed_trades ADD COLUMN IF NOT EXISTS anchor_balance_at_open  numeric(20,2);
ALTER TABLE closed_trades ADD COLUMN IF NOT EXISTS anchor_version_at_open  integer;

-- ============================================================================
-- 4. LIVE-DATA GHOST-ROW DELETE (OBJ-2; Langston Step-2 item 1 — explicit
--    predicate + full row values captured here for auditability/paper-reversibility).
--    Deleted row (live values read 2026-07-05):
--      id               = 'ef9526aa-ef11-4e55-a995-fdd8011bf83c'
--      mode             = 'paper'
--      balance          = 25000.00
--      global_context_id= 'b8c1599a-8917-4048-9898-84b96bf0cea1'
--      created_at       = 2025-12-05T07:45:17.185Z
--      last_update      = 2025-12-30T23:15:48.346Z
--    This is a December-2025 scenario leftover under a non-default context key —
--    the wrong-row-pickup hazard. Kyle's genuine paper row ($878, context 'default')
--    and the live-mode row ($834.11, overwritten by the Phase-21 launch snap) are
--    NOT touched. Also logged in 1-system-manual/DELETED_COMPONENTS_LOG.md.
-- ============================================================================

DELETE FROM portfolio_state
WHERE mode = 'paper'
  AND global_context_id = 'b8c1599a-8917-4048-9898-84b96bf0cea1'
  AND balance = 25000.00;

-- ============================================================================
-- 5. ORPHANED LEGACY SCHEMA-COPY DROP (rule 18; pre-audit §4.3, Langston-approved)
--    dawntrader_v2.portfolio_state: an abandoned schema-copy (4 stale rows),
--    unreachable by the app (search_path = public). Repo-wide grep 2026-07-05:
--    ZERO code references (single hit = a chat-archive filename). Certainty-
--    before-cutting evidence in the Step-4 diff notes + DELETED_COMPONENTS_LOG.
-- ============================================================================

DROP TABLE IF EXISTS dawntrader_v2.portfolio_state;

-- ============================================================================
-- 6. FRICTION-DIVERGENCE KNOB SEED (OBJ-3; rule 15 — boot hard-fails on zero
--    rows for a warmed module, so the rows MUST ship with the code).
--    ALL VALUES ARE CONSERVATIVE PLACEHOLDERS pending Phase-25 calibration
--    (stated per §9.2 — these are NOT calibrated numbers):
--      max_divergence_bps: re-anchor when the estimated paper-vs-live execution
--        cost gap exceeds this (25 bps ≈ a quarter of the round-trip fee tier —
--        deliberately tight so the FIRST live trigger is reviewed early).
--      min_notional_delta_max: re-anchor when this many pool candidates are
--        sizeable at one balance but blocked by min-notional at the other.
--      min_reanchor_interval_ms: cooldown — no auto re-anchor within 24h of the
--        last anchor event (Langston Step-1 hysteresis condition).
--      impact_k: the sqrt-law coefficient k in estCostBps = spread_half_bps +
--        k * sigma_bps * sqrt(Q/L). k is DIMENSIONLESS; sigma enters in bps —
--        the product resolves to bps (unit reconciliation per scope §B-4).
--      ratio_band_low/high: the OBJ-4 in-band window for calibration-fit reads.
-- ============================================================================

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('friction_divergence', 'max_divergence_bps',      '25'::jsonb,       'crypto_spot', '*', '*', '*', NOW(), 'p19-b8-2'),
  ('friction_divergence', 'min_notional_delta_max',  '3'::jsonb,        'crypto_spot', '*', '*', '*', NOW(), 'p19-b8-2'),
  ('friction_divergence', 'min_reanchor_interval_ms','86400000'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'p19-b8-2'),
  ('friction_divergence', 'impact_k',                '1'::jsonb,        'crypto_spot', '*', '*', '*', NOW(), 'p19-b8-2'),
  ('friction_divergence', 'ratio_band_low',          '0.5'::jsonb,      'crypto_spot', '*', '*', '*', NOW(), 'p19-b8-2'),
  ('friction_divergence', 'ratio_band_high',         '2'::jsonb,        'crypto_spot', '*', '*', '*', NOW(), 'p19-b8-2'),

  ('friction_divergence', 'max_divergence_bps',      '25'::jsonb,       'xstock_spot', '*', '*', '*', NOW(), 'p19-b8-2'),
  ('friction_divergence', 'min_notional_delta_max',  '3'::jsonb,        'xstock_spot', '*', '*', '*', NOW(), 'p19-b8-2'),
  ('friction_divergence', 'min_reanchor_interval_ms','86400000'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b8-2'),
  ('friction_divergence', 'impact_k',                '1'::jsonb,        'xstock_spot', '*', '*', '*', NOW(), 'p19-b8-2'),
  ('friction_divergence', 'ratio_band_low',          '0.5'::jsonb,      'xstock_spot', '*', '*', '*', NOW(), 'p19-b8-2'),
  ('friction_divergence', 'ratio_band_high',         '2'::jsonb,        'xstock_spot', '*', '*', '*', NOW(), 'p19-b8-2')
ON CONFLICT DO NOTHING;

COMMIT;
