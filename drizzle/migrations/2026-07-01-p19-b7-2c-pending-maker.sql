-- P19-B7.2c — post-promotion PENDING maker-order fill lifecycle (paper + VTS).
--
-- Kyle model (LOCKED; SIMPLIFIED 2026-07-02): a maker-chosen promotion does NOT fill
-- immediately — it rests as a PENDING open trade holding a slot and fills only on honest
-- side-aware trade-through of the REAL price (buy: price<=limit). TIMEOUT = DROP, period
-- (no convert re-evaluation — Kyle cut it; an unfilled maker after ~1h means price never
-- came to us). Marketable-at-placement = the STORED gen-time taker_net_ev check (already
-- on the rtb_signals row): >0 → open as taker now, else drop. A dropped/never-filled
-- pending is recorded VISIBLY in the closed records ("never filled") but EXCLUDED from
-- stats + learning. VTS additionally opens the NON-chosen leg as a tagged TWIN (pair id,
-- shadow-style exemptions) for maker-vs-taker learning. Real Kraken resting order =
-- Phase-21. All ADDs nullable/defaulted = safe online column-adds.

BEGIN;

-- ── (1) paper_sim_open_positions — pending-maker lifecycle + EV-snapshot columns ──────
--   state             — 'open' (default; a normal filled position) | 'pending' (a maker
--                       order resting, holding a slot, not yet filled). Filled/converted →
--                       'open'; dropped → row removed (never a closed-trade).
--   maker_limit_price — the resting maker limit (= the signal entry). The maker-FILL price.
--   maker_deadline    — the hard-drop timeout instant (now + maker_max_pending_ms).
ALTER TABLE paper_sim_open_positions
  ADD COLUMN IF NOT EXISTS state             varchar(16) DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS maker_limit_price numeric(20,10),
  ADD COLUMN IF NOT EXISTS maker_deadline    timestamp;

-- ── (2) vts_open_trades — pending-maker typed columns (state col already exists, B-NEW-36)
-- di/dbs/vol are already carried on the VTS OpenVirtualTrade record; only the maker
-- resting-order fields are new here.
ALTER TABLE vts_open_trades
  ADD COLUMN IF NOT EXISTS maker_limit_price numeric(20,10),
  ADD COLUMN IF NOT EXISTS maker_deadline    timestamp;

-- ── (3) vts_open_trades — AMEND the state CHECK to allow 'pending' (closed=false) ────────
-- BOTH classes (the maker/taker decision applies to crypto AND xStock; xStock's pending
-- deadline is weekend-aware in code via isXstockMarketOpenUTC — NOT crypto-only). The
-- weekend_suspended → xstock_spot scoping clause is preserved unchanged.
ALTER TABLE vts_open_trades DROP CONSTRAINT IF EXISTS vts_open_trades_state_consistency;
ALTER TABLE vts_open_trades
  ADD CONSTRAINT vts_open_trades_state_consistency
  CHECK (
    (
      (closed = false AND state IN ('open', 'weekend_suspended', 'pending'))
      OR
      (closed = true AND state = 'closed')
    )
    AND
    (state <> 'weekend_suspended' OR asset_class = 'xstock_spot')
  );

-- ── (4) module_constants `maker_taker` — the hard-drop max-age knob + inert tier placeholder
--   maker_max_pending_ms        — the HARD-DROP timeout (a pending maker older than this →
--                                 convert valve). START-TIGHT ~1h (Kyle); calibrated Phase-25
--                                 on real fill data. Load-time invariant (in code):
--                                 maker_max_pending_ms >= maker_time_budget_ms (the soft T1
--                                 window; existing knob, its NEW meaning documented in
--                                 ADJUSTMENT_FRAMEWORK). fail-hard resolver (no hidden default).
--   maker_late_fill_haircut_pct — INERT Phase-25 placeholder (=0 now): the tiered diminishing-
--                                 returns adverse-selection haircut applied to a LATE maker
--                                 fill. Seeded at 0 so it is provably inert (the OBJ-7 test
--                                 asserts fill price == limit EXACTLY with this knob present) —
--                                 Phase-25 calibrates it once real fill-latency data exists.
INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('maker_taker', 'maker_max_pending_ms',        '3600000'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2c'),
  ('maker_taker', 'maker_late_fill_haircut_pct', '0'::jsonb,       'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2c'),
  ('maker_taker', 'twin_enabled',                '1'::jsonb,       'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2c'),

  ('maker_taker', 'maker_max_pending_ms',        '3600000'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2c'),
  ('maker_taker', 'maker_late_fill_haircut_pct', '0'::jsonb,       'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2c'),
  ('maker_taker', 'twin_enabled',                '1'::jsonb,       'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2c')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;
