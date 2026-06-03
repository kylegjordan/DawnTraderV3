-- B3.1b — Disable volume-confirmation on the xStock strategy paths.
--
-- WHY: the per-bar `xstock_spot_ohlc_1m.volume` (and the 24h ticker volume) are
-- the UNDERLYING-EQUITY share volume, not the xStock token's traded volume
-- (ws-equities OHLC channel; SPY ~$6.8B/day vs the token market <$1M/24h, ~4
-- orders of magnitude off). B3.1a §1/§4: the data is wrong AND the honest
-- replacement (top-of-book depth-delta) has NO forward-return signal (AUC ~0.50)
-- — so the correct fix is to REMOVE volume-confirmation on the xStock path, not
-- swap in a meaningless metric (NO-PATCHES). Crypto KEEPS its volume gates
-- (crypto has real token volume). Documented known-gap: revisit if/when a real
-- xStock token-volume feed exists (Phase 19+).
--
-- MECHANISM: a per-class numeric flag `volume_confirmation_enabled` (1=on, 0=off)
-- under each volume-gated strategy module. Read in each detect() via the existing
-- getCachedNumbersForModule per-class resolver; the gate is bypassed when 0.
-- Seeded EXPLICITLY: global (*,*,*,*)=1 (crypto + everything else = enabled,
-- preserves current behavior) + (*,xstock_spot,*,*)=0 (xStock override). The
-- asset_class dimension (weight 2) makes the xstock_spot row win for xStocks; all
-- other classes fall through to the global =1 row. Both VTS and active paths read
-- the same flag.
--
-- 6 volume-touching strategy modules × 2 rows = 12 rows, 1:1 with the 6 edited
-- detect() sites. (morning_star's volume is a SOFT confidence factor, not a hard
-- gate — its bonus is gated on the same flag so the wrong data does not nudge
-- xStock confidence.) abcd_long is intentionally NOT seeded (Langston Step-4): it
-- is enabled=false for xstock_spot AND its detectABCD volume gate is not wired to
-- this flag, so a seed would imply coverage the code does not provide — when/if
-- abcd is enabled on xStock, wire detectABCD + seed it together then.
--
-- ⚠️ The value MUST stay NUMERIC (1/0), NOT a JSON string ("1"/"0"): the sync
-- resolver getCachedNumbersForModule keeps only typeof === 'number' rows, so a
-- string value would be silently dropped → `?? 1` default → gate silently
-- re-enabled on xStock. Do not "fix" these into strings.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  -- Global default = ENABLED (crypto + all non-xStock classes; preserves behavior)
  ('strategy.vwap_pullback',       'volume_confirmation_enabled', '1'::jsonb, '*', '*', '*', '*', NOW(), 'b3.1b'),
  ('strategy.vwap_bounce',         'volume_confirmation_enabled', '1'::jsonb, '*', '*', '*', '*', NOW(), 'b3.1b'),
  ('strategy.breakout',            'volume_confirmation_enabled', '1'::jsonb, '*', '*', '*', '*', NOW(), 'b3.1b'),
  ('strategy.inside_bar_reversal', 'volume_confirmation_enabled', '1'::jsonb, '*', '*', '*', '*', NOW(), 'b3.1b'),
  ('strategy.pivot_shift',         'volume_confirmation_enabled', '1'::jsonb, '*', '*', '*', '*', NOW(), 'b3.1b'),
  ('strategy.morning_star',        'volume_confirmation_enabled', '1'::jsonb, '*', '*', '*', '*', NOW(), 'b3.1b'),
  -- xStock override = DISABLED (wrong-data volume; no honest replacement)
  ('strategy.vwap_pullback',       'volume_confirmation_enabled', '0'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b3.1b'),
  ('strategy.vwap_bounce',         'volume_confirmation_enabled', '0'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b3.1b'),
  ('strategy.breakout',            'volume_confirmation_enabled', '0'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b3.1b'),
  ('strategy.inside_bar_reversal', 'volume_confirmation_enabled', '0'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b3.1b'),
  ('strategy.pivot_shift',         'volume_confirmation_enabled', '0'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b3.1b'),
  ('strategy.morning_star',        'volume_confirmation_enabled', '0'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b3.1b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = 'b3.1b';

COMMIT;
