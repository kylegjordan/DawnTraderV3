-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-24 — B-BOOK-STATE-RESTART-DURABLE (plan row 3n.q8, #1066)
-- The durable store of the xStock book-state guard's retained spread rings.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Scope:  Claude Comms and Packages/Scope Files/B_BOOK_STATE_RESTART_DURABLE_SCOPE.md (Step 1 approved)
-- Plan:   Claude Comms and Packages/Scope Files/B_BOOK_STATE_RESTART_DURABLE_PRE_AUDIT.md (Step 2 approved, r2)
--
-- One row per xStock symbol: "the ring a clear would leave behind right now"
-- (SIM S25b), written by book-state-ring-store.ts every 30 s and on shutdown,
-- read once at boot before resumeActiveEngines(). Small and non-partitioned:
-- at most one row per xStock symbol, each at most the guard's ring size.
--
-- `spreads` is JSONB (an array of non-negative spread fractions), not
-- double precision[]: the writer passes one JSON parameter per row, and the
-- boot reader validates every element itself (a bad row is skipped, never
-- fatal). Deviation from the Step-2 plan's column type, stated here.
--
-- No module_constants rows and NO calibration-epoch bump: Step-2 r2 §6 C2
-- records the impact as NAMED, not epoch-bumped (Langston's ruling).
--
-- Rollback: 2026-09-24-b-book-state-restart-durable-rollback.sql (IN git,
-- beside this file; never listed in MANIFEST.txt).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS xstock_book_state_rings (
  symbol        TEXT        PRIMARY KEY,
  spreads       JSONB       NOT NULL,
  seed_basis    TEXT        NOT NULL CHECK (seed_basis IN ('judged', 'vacuous')),
  source        TEXT        NOT NULL CHECK (source IN ('live', 'retained')),
  written_at    TIMESTAMPTZ NOT NULL,
  persisted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT xstock_book_state_rings_spreads_is_array CHECK (jsonb_typeof(spreads) = 'array')
);

COMMENT ON TABLE xstock_book_state_rings IS
  '3n.q8 B-BOOK-STATE-RESTART-DURABLE (#1066): the xStock book-state guard''s retained spread rings (SIM S25b), one row per symbol, so a restart does not make every first seed unjudged. Written and read only by book-state-ring-store.ts.';

COMMIT;
