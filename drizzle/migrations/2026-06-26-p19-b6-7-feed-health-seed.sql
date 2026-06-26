-- P19-B6.7 (#301) — feed-health ALARM per-asset-class thresholds + xStock warmup grace.
--
-- The feed-integrity alarm was re-pointed off the removed vestigial 2nd WebSocket onto
-- the PRIMARY adapter's real per-symbol tick-age (server/services/feed-integrity-monitor.ts
-- → gradePerClassFeedLiveness in market-data/feed-health-aggregate.ts). The alarm grades
-- FEED-LEVEL aliveness = the FRESHEST subscribed symbol's age, PER ASSET CLASS, because
-- crypto (24/7) and xStock (24/5, market-hours) have different legitimate-quiet profiles:
--
--   crypto_spot — always graded (no market-closed concept; threshold absorbs weekend
--                 thin-book). warning 5s / critical 10s on the freshest crypto symbol
--                 (matches the prior global env defaults FEED_WARNING/CRITICAL_TICK_AGE_SEC).
--   xstock_spot — graded only over symbols that are OPEN (isXstockMarketOpenUTC, per-symbol;
--                 class-critical suppressed when ALL xStock symbols are closed). More lenient
--                 (warning 60s / critical 120s) since BBO cadence is slower than crypto.
--   xstock_spot warmup_grace_ms — after the market reopens the freshest age is stale-by-
--                 construction (hours since last close) until the first quotes land; suppress
--                 the xStock-class critical for this long after the open transition so the
--                 alarm doesn't false-fire at every bell (deterministic warmup, CLAUDE.md §8#11).
--
-- Per-asset-class (§11). exchange/strategy/regime = wildcard. DB-tunable, not hardcoded
-- (Langston P19-B6.7 Step-2). Read via getCachedNumberRequired (warmed cache); the monitor
-- reads defensively (a config gap logs + skips the liveness grade that cycle — it must never
-- crash the alarm nor false-fire a critical off a missing knob).

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('feed_health', 'warning_age_ms',  '5000'::jsonb,   'crypto_spot', '*', '*', '*', NOW(), 'p19-b6-7'),
  ('feed_health', 'critical_age_ms', '10000'::jsonb,  'crypto_spot', '*', '*', '*', NOW(), 'p19-b6-7'),
  ('feed_health', 'warning_age_ms',  '60000'::jsonb,  'xstock_spot', '*', '*', '*', NOW(), 'p19-b6-7'),
  ('feed_health', 'critical_age_ms', '120000'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b6-7'),
  ('feed_health', 'warmup_grace_ms', '120000'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b6-7')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Verify all 5 rows resolve (fail the migration loudly if the seed is incomplete).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM module_constants WHERE module_name = 'feed_health';
  IF n < 5 THEN
    RAISE EXCEPTION 'P19-B6.7 seed incomplete: expected 5 feed_health rows, found %', n;
  END IF;
END $$;

COMMIT;
