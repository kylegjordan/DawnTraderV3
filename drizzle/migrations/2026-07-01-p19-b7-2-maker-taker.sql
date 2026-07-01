-- P19-B7.2 — maker/taker best-of-both entry decision (the structural crypto opener).
--
-- At the July-9 Kraken Tier-1 fee wall (0.80% taker / 0.40% maker ≈ 1.8% round-trip
-- taker friction) the honest Net-Expectancy gate refuses most crypto on taker
-- economics. This batch computes, per signal at the shared build convergence
-- (signal-orchestrator.buildSizedSignalForStrategy — quant + hybrid + pattern +
-- xStock all funnel through it), a BEST-OF-BOTH maker/taker net-EV comparison and
-- snapshots the chosen (better) net-EV onto the RTB row, so a taker-unprofitable /
-- maker-profitable signal survives to be ranked (B7.1) and opened ([11.8B] gate).
-- Conservatism lives in ONE place: a per-asset-class, signal-conditioned adverse-
-- selection haircut with an explicit pFill (the non-fill branch is booked as an
-- opportunity-cost LOSS, never EV=0). START TIGHT (Kyle 2026-07-01) — the haircut
-- is a deliberately pessimistic uncalibrated guess until live passive-fill data
-- exists (Phase-21); Phase-25 calibrates it and it tightens with no re-architecture.
--
-- TWO parts:
--   (1) rtb_signals columns: the decision snapshot + the make-then-take ladder state.
--   (2) module_constants `maker_taker` seeds, PER-ASSET-CLASS (crypto_spot,
--       xstock_spot) — DB-governed, fail-hard (b72-warmup asserts non-zero rows;
--       the resolver throws on a missing knob — no hidden default, CLAUDE.md §5 r15).

BEGIN;

-- ── (1) rtb_signals columns ───────────────────────────────────────────────────
-- All nullable / defaulted so the add is a safe online column-add (mirrors the
-- reorg-B3 di_at_queue / dbs_score_at_queue add). chosen_net_ev is what the
-- open-gate + ranker read; net-EV is in price units (wide precision spans
-- micro-cap → BTC entry scales). The maker_* columns hold the ladder state.
ALTER TABLE rtb_signals
  ADD COLUMN IF NOT EXISTS chosen_entry_mode       varchar(8) DEFAULT 'taker',
  ADD COLUMN IF NOT EXISTS chosen_net_ev           numeric(20,10),
  ADD COLUMN IF NOT EXISTS taker_net_ev            numeric(20,10),
  ADD COLUMN IF NOT EXISTS maker_net_ev_adjusted   numeric(20,10),
  ADD COLUMN IF NOT EXISTS maker_pending           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS maker_posted_at         timestamp,
  ADD COLUMN IF NOT EXISTS maker_limit_price       numeric(20,10),
  ADD COLUMN IF NOT EXISTS maker_budget_expires_at timestamp;

-- ── (2) module_constants `maker_taker` — per-class START-TIGHT seeds ───────────
-- All rates are fractions of entry price (same units as the cost components).
--   maker_fill_probability          — static conservative pFill (0..1). Non-fill
--                                     is weighted by (1 - pFill) as a loss.
--   adverse_selection_base          — A base (cost-on-fill).
--   adverse_selection_strength_mult — A slope: A = base + mult * signalStrength
--                                     (↑ with strength — a stronger signal
--                                     adversely-selects its own passive fills harder).
--   non_fill_cost_base              — C base (missed-edge opportunity cost).
--   non_fill_continuation_penalty   — added to C for continuation signals (fast
--                                     alpha decay → a non-fill misses the move).
--   non_fill_reversal_discount      — subtracted from C for reversal signals
--                                     (patient edge; a non-fill costs little).
--   hard_floor_continuation_strength— strong continuation ≥ this → force taker
--                                     (belt-and-suspenders over the EV compare).
--   maker_time_budget_ms            — the make-then-take ladder budget; short, to
--                                     bound non-fill exposure (RTB refresh = 30s).
-- Crypto: taker 0.80% / maker 0.40% → makerEntryAdvantage ≈ 0.55% of entry; the
-- haircut at max strength (~0.5%) nearly eats it — maker wins only for weaker /
-- reversal / patient signals. xStock leans slightly more maker-friendly (a maker
-- rebate is possible per the July-2026 schedule) but stays TIGHT pre-calibration.
INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('maker_taker', 'maker_fill_probability',           '0.50'::jsonb,   'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'adverse_selection_base',           '0.0015'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'adverse_selection_strength_mult',  '0.0035'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'non_fill_cost_base',               '0.0010'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'non_fill_continuation_penalty',    '0.0030'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'non_fill_reversal_discount',       '0.0008'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'hard_floor_continuation_strength', '0.70'::jsonb,   'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'maker_time_budget_ms',             '60000'::jsonb,  'crypto_spot', '*', '*', '*', NOW(), 'p19-b7-2'),

  ('maker_taker', 'maker_fill_probability',           '0.50'::jsonb,   'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'adverse_selection_base',           '0.0010'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'adverse_selection_strength_mult',  '0.0025'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'non_fill_cost_base',               '0.0008'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'non_fill_continuation_penalty',    '0.0025'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'non_fill_reversal_discount',       '0.0006'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'hard_floor_continuation_strength', '0.70'::jsonb,   'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2'),
  ('maker_taker', 'maker_time_budget_ms',             '60000'::jsonb,  'xstock_spot', '*', '*', '*', NOW(), 'p19-b7-2')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Verify both classes fully seeded (16 rows) — fail the migration loudly otherwise.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM module_constants WHERE module_name = 'maker_taker';
  IF n < 16 THEN
    RAISE EXCEPTION 'maker_taker seed incomplete: expected >= 16 rows, found %', n;
  END IF;
END $$;

COMMIT;
