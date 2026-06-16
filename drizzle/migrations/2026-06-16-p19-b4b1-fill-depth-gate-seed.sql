-- P19-B4b.1 — per-class FILL DEPTH-GATE knobs (module_constants), + retire the
-- B4a-C3 RTH liquid-fill-window clock keys (#295: replace the time-of-day proxy
-- with a direct 24/5 book-depth-sufficiency gate).
--
-- Resolved by server/services/execution/depth-gate-config.ts (fail-CLOSED if
-- absent — CLAUDE.md rule 11/15; a missing safety/EV knob blocks the fill loudly,
-- never silently defaults). Per-asset-class; exchange/strategy/regime = wildcard.
--
-- SEED VALUES + NET-EXPECTANCY JUSTIFICATION (Langston Step-2 Q-C — the sufficiency
-- multiple is an EV knob, seeded on "walking to this depth still leaves Net EV > 0",
-- from the P19-B4b.1 measured distributions; precise per-class calibration → the
-- Phase-25 run produces real paper-fill slippage-vs-depth evidence):
--
--   crypto_spot (live Kraken WS v2 book, depth=10):
--     warmth_max_age_ms       = 5000  -- healthy pairs p90 book-update gap <60ms,
--                                         p99 <400ms; thin pairs p99 ~1.5-2s; 5s
--                                         clears every healthy book, blocks only the
--                                         6-8.7s genuine-staleness tail.
--     sufficiency_multiple    = 3     -- 10-level depth >= 3x order notional: the
--                                         order consumes <=1/3 of the book, so the
--                                         depth-walk stays within a few levels of
--                                         top-of-book and slippage stays small vs
--                                         the ~1.8% round-trip friction the EV gate
--                                         already tolerates -> Net EV stays positive
--                                         at the gate boundary. Binds only on the
--                                         thin-book moments (depth $2-6K vs $1-2K
--                                         order). 10x would forgo legit thin-alt EV;
--                                         2x risks deeper slippage. 3x = conservative
--                                         floor.
--     min_levels              = 3     -- a <3-level book is not a fillable book.
--     beyond_depth_penalty_bps= 50    -- close-side beyond-captured-depth slippage
--                                         (0.50%, DB-tunable; matches the legacy
--                                         calculatePriceImpact >book literal, no
--                                         longer a magic constant on the seam).
--
--   xstock_spot (equities ticker top-of-book ask/bid depth in USD):
--     warmth_max_age_ms       = 15000 -- matches the C3 freshness floor (RTH p99
--                                         8.75s -> 15s; snapshot p50 gap 3.2s).
--     sufficiency_multiple    = 2     -- top-of-book (1 level) >= 2x order notional:
--                                         median top-of-book $28K vs $150 order
--                                         passes trivially; the thin tail (SUIG/GOTU
--                                         ~$150) at/near order size blocks (correct).
--                                         2x (not 3x) since it is a single top-of-book
--                                         level, not a 10-level cumulative.
--     min_levels              = 1     -- xStock has only top-of-book.
--     beyond_depth_penalty_bps= 50    -- same close penalty.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('fill_depth_gate', 'warmth_max_age_ms',        '5000'::jsonb,  'crypto_spot', '*', '*', '*', NOW(), 'p19-b4b1'),
  ('fill_depth_gate', 'sufficiency_multiple',     '3'::jsonb,     'crypto_spot', '*', '*', '*', NOW(), 'p19-b4b1'),
  ('fill_depth_gate', 'min_levels',               '3'::jsonb,     'crypto_spot', '*', '*', '*', NOW(), 'p19-b4b1'),
  ('fill_depth_gate', 'beyond_depth_penalty_bps', '50'::jsonb,    'crypto_spot', '*', '*', '*', NOW(), 'p19-b4b1'),
  ('fill_depth_gate', 'warmth_max_age_ms',        '15000'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b4b1'),
  ('fill_depth_gate', 'sufficiency_multiple',     '2'::jsonb,     'xstock_spot', '*', '*', '*', NOW(), 'p19-b4b1'),
  ('fill_depth_gate', 'min_levels',               '1'::jsonb,     'xstock_spot', '*', '*', '*', NOW(), 'p19-b4b1'),
  ('fill_depth_gate', 'beyond_depth_penalty_bps', '50'::jsonb,    'xstock_spot', '*', '*', '*', NOW(), 'p19-b4b1')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- #295 NOTE: the RTH `liquid_fill_window_*` keys are RETIRED as a FILL gate (replaced by
-- the 24/5 depth gate above) but are NOT deleted — `equity-spot-archiver.ts`'s silent-stall
-- watchdog still reads them to select its RTH-vs-off-RTH reconnect threshold (a feed-cadence
-- use, not a fill-quality use). Verify-before-cut: removing them would break the watchdog.

COMMIT;
