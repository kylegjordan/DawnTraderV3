-- ════════════════════════════════════════════════════════════════════════════
-- P19 reorg-B3 (#233) — rtb_signals EV-input columns ADD (di_at_queue, dbs_score_at_queue)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Per reorg-B3 scope (P19_REORG_B3_SCOPE.md) + pre-audit (P19_REORG_B3_PRE_AUDIT.md)
-- + Langston Step-2 PROCEED + Option B design endorsement (2026-06-24):
--   - ADD two NULLABLE typed columns carrying the Net-Expectancy kernel EV inputs as
--     captured AT QUEUE TIME (the routing-time FX5 survivor snapshot that drove the
--     signal's entry — see shared/schema.ts rtb_signals column comment for the pinned
--     "at_queue = survivor snapshot, NOT freshest-at-instant" semantic).
--   - di_at_queue        DECIMAL(8,4)  — Directional Integrity [0-100]
--   - dbs_score_at_queue DECIMAL(8,4)  — Directional Bias Score [-1,1]
--
-- WHY columns (not metadata JSONB): these are decision-grade open-gate EV inputs that
-- OBJ-4's rtb-metrics EV-reject breakdown must query BY-INPUT. NULL is allowed (nullable-
-- backfill, mirrors the B79.0n.RTB asset_class column add): an in-flight row queued before
-- this deploy, or an entry hydrated via the non-scanner cold-cache path (which carries no
-- OHLC-derived DBS/DI), reads NULL → the open-gate forwards NULL → the kernel applies its
-- documented default (DI=50 standard pWin ceiling; dbsScore→strong-trend 0.40 floor).
-- Deterministic, no silent coerce (Kyle #10).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Safe to re-run; safe to roll back via companion.
-- Rollback: see companion 2026-06-24-p19-reorg-b3-rtb-ev-inputs-rollback.sql

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- §1. Schema: ADD the two EV-input columns (nullable, no default, no CHECK)
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE rtb_signals
  ADD COLUMN IF NOT EXISTS di_at_queue        DECIMAL(8,4) NULL,
  ADD COLUMN IF NOT EXISTS dbs_score_at_queue DECIMAL(8,4) NULL;

COMMENT ON COLUMN rtb_signals.di_at_queue IS
  'reorg-B3 #233 2026-06-24: Directional Integrity [0-100] captured AT QUEUE from the routing-time FX5 survivor snapshot (active-filter-pool entry). NOT freshest-at-instant. NULL ⇒ kernel default DI=50. Do NOT refix to a live MCE re-read.';
COMMENT ON COLUMN rtb_signals.dbs_score_at_queue IS
  'reorg-B3 #233 2026-06-24: Directional Bias Score [-1,1] captured AT QUEUE from the routing-time FX5 survivor snapshot — the SAME dbsScore that drove strong-trend routing (coherence with the open-gate strong-trend pWin branch). NULL ⇒ kernel strong-trend 0.40 floor. Do NOT refix to a live MCE re-read.';

-- ────────────────────────────────────────────────────────────────────────
-- §2. Verification: confirm both columns landed (HARD-FAIL if not)
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'rtb_signals'
    AND column_name IN ('di_at_queue', 'dbs_score_at_queue');

  IF col_count != 2 THEN
    RAISE EXCEPTION 'reorg-B3 #233 verification FAILED: expected 2 EV-input columns (di_at_queue, dbs_score_at_queue) on rtb_signals, found %', col_count;
  END IF;

  RAISE NOTICE 'reorg-B3 #233 verification OK: di_at_queue + dbs_score_at_queue columns present on rtb_signals (nullable DECIMAL(8,4))';
END $$;

COMMIT;
