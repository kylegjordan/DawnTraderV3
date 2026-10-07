-- B-VENUE-QUIET-ALERTING (#526 + #994 + #638; SPRINT_TO_LIVE_PLAN row 3a1; CC-B) — the four thresholds of the venue-quiet
-- delivery rule, module `venue_quiet`, class `xstock_spot`. Read sync by server/services/venue-quiet-alerting.ts; the module
-- is prefetched at boot (b72-warmup.ts), so a missing row HARD-FAILS boot rather than silently defaulting.
--
-- (1) quiet_ticking_min = 346 — the xStock class is QUIET iff fewer than 346 symbols sent a ticker frame in the trailing
--     60 s. 346 = 75 % of the regular-hours p05 (461 of 468 symbols), measured per minute 2026-10-06 12:00Z → 10-07 03:00Z
--     (pre-audit A2: after-hours median 154, overnight median 135, min 108). Pre-registered prediction on the 2026-10-06
--     close: 1 of the 14 first-hour quiet-family rows still pages (pre-audit A3, corrected per Langston C1).
-- (2) thin_ticking_min = 50 — below 50 the cohort cannot tell a quiet venue from an impaired feed ⇒ PAGE (default-to-page).
--     Measured overnight minimum 108 (2026-10-07) and 88 (seven sessions to 2026-09-02), so ordinary nights never reach it.
-- (3) escalate_after_ms = 1800000 — a standing-record member still unpriced 30 min after the class stopped being quiet
--     pages on its own key (the market resumed; this symbol did not).
-- (4) resolve_stuck_after_ms = 3600000 — a key the clearing sweep has failed to resolve for an hour raises one
--     venue-quiet-resolve-stuck-<mode> row.
-- Rollback: 2026-10-07-b-venue-quiet-alerting-rollback.sql — revert the code (the prefetch entry) FIRST or together: with
-- `venue_quiet` still prefetched and these rows gone, boot hard-fails.

BEGIN;
SET LOCAL lock_timeout = '5s';

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('venue_quiet', '*', 'xstock_spot', '*', '*', 'quiet_ticking_min',      '346'::jsonb,     'b-venue-quiet-alerting'),
  ('venue_quiet', '*', 'xstock_spot', '*', '*', 'thin_ticking_min',       '50'::jsonb,      'b-venue-quiet-alerting'),
  ('venue_quiet', '*', 'xstock_spot', '*', '*', 'escalate_after_ms',      '1800000'::jsonb, 'b-venue-quiet-alerting'),
  ('venue_quiet', '*', 'xstock_spot', '*', '*', 'resolve_stuck_after_ms', '3600000'::jsonb, 'b-venue-quiet-alerting')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants WHERE module_name = 'venue_quiet';
  IF n <> 4 THEN
    RAISE EXCEPTION 'venue_quiet seed: expected 4 rows, found %', n;
  END IF;
END $$;

COMMIT;
