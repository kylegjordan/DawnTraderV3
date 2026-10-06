-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-29 — B-SIZING-DEC-RESTORE increment 3 (P4 / obj-14, #698): the paper size band's three rows
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §13.2 P4 and §16.2 / §16.4 (C1, C2;
-- Langston's ruling at 66da5e666).
--
-- Kyle's PAPER-RESET-3000 (as corrected 2026-09-29; AMOUNT CHANGED 2026-10-06, #698): the paper pot resets to the real Kraken
-- balance, $820, about 20 paper trades open, each near $39.77 (was $3,000 and $140-150, before this file was first applied), the max-position %
-- adjusted by hand as the balance moves. server/services/paper-size-band.ts watches the size that % gives a normal trade
-- and alerts when it leaves the band. These rows ARE the band: no literal in the code (rule 15).
--
--   low    38    — below it the alert fires `low`  (the balance has fallen ~4.5%; the alert suggests a higher p)
--   high   41    — above it the alert fires `high` (a reset that left p at 20 reads ~$159; a typo 50 for 5 reads ~$398)
--   target 39.77 — ⛔ NOT A BAND MEMBER. It feeds ONLY the suggested p* in the alert text ("set max position % to …").
--                Do not "correct" it by averaging low and high: 39.77 is Kyle's intended size, $820 x 100% x 5% x 0.97
--                = $39.77 at the reset (§16.4 C2). The band keeps the 09-29 band's proportions (140/145.5, 150/145.5).
--   ⚠️ TRIPWIRE A IS RETIRED: the old LOW alarm for an undone re-anchor cannot fire now, because the reset balance ($820)
--      is within a dollar of the prior anchor. The reset script's step 7 still refuses unless the app's starting
--      balance equals $820.00, which is what catches an undone re-anchor.
--
-- Read FAIL-HARD: server/index.ts refuses to boot without all three (beside the RTB cadence check), and the module is
-- in the b72 warm-up so the synchronous read never sees a cold cache. Step 7 of the reset script reads them back.
--
-- Rollback: 2026-09-29-b-sizing-inc3-paper-size-band-rollback.sql (IN git, beside this file; never listed in
-- MANIFEST.txt). ⚠️ Rolling this back while increment 3's code is deployed makes the app refuse to boot — roll the
-- code back first.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('paper_size_band','*','*','*','*','low',    '38'::jsonb,    'b-sizing-inc3'),
  ('paper_size_band','*','*','*','*','high',   '41'::jsonb,    'b-sizing-inc3'),
  ('paper_size_band','*','*','*','*','target', '39.77'::jsonb, 'b-sizing-inc3')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants WHERE module_name = 'paper_size_band' AND constant_name IN ('low', 'high', 'target');
  IF n <> 3 THEN
    RAISE EXCEPTION 'b-sizing-inc3: expected 3 paper_size_band rows after the seed, found %', n;
  END IF;
END $$;

COMMIT;
