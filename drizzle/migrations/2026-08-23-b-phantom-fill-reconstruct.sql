-- B-PHANTOM-FILL-RECONSTRUCT — COLUMNS ONLY. NO BACKFILL.
--
-- ⚠️ THIS FILE WAS REWRITTEN 2026-08-24, NOT ANNOTATED. Its first version carried an ALTER *and* a
-- backfill UPDATE that flagged rows using a ticker-vs-ask detector. That detector's warrant was
-- WITHDRAWN when #741 falsified its founding premise ("a maker exit never reads the order book, so
-- maker rows cannot be contaminated" — false: the maker exit does not read the book for its PRICE,
-- but the system reads the book to decide WHETHER IT FILLED). Langston superseded the whole 21-row
-- remediation. Running that backfill would write a withdrawn verdict into the ledger, which F-E
-- would then have to re-stamp — two bases in one column, the #641 shape.
--
-- The withdrawn reasoning is NOT reproduced here. A correction stacked on wrong text is not a
-- correction. The error record lives in RUNNING_ISSUES #741 and in this commit's message.
--
-- WHAT THIS FILE DOES NOW: adds the columns and nothing else, so the code already at the deploy head
-- (storage.ts:3270 HONEST_PNL, dashboard-metrics.ts:36 honestNetPnl, routes.ts:13225) has the columns
-- it references. With every value NULL, each of those expressions falls back to the recorded figure.
--
-- ★ BEHAVIOUR-IDENTICAL, MEASURED NOT ARGUED (Langston, at this ref, on staging): across the 534
--   closed non-'never_filled' rows, `net_pnl` is NULL on 0 rows and differs from `pnl` on 0 rows;
--   the sums are identical at −68.35 either way. So COALESCE(reconstructed_net_pnl, pnl) and
--   COALESCE(reconstructed_net_pnl, net_pnl, pnl) both resolve to today's number for every row.
--
-- The real detection is F-E, under a warrant that survives. It populates these columns then.

ALTER TABLE closed_trades
  ADD COLUMN IF NOT EXISTS phantom_fill_suspect      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconstructed_exit_price  numeric(20,8),
  ADD COLUMN IF NOT EXISTS reconstructed_net_pnl     numeric(20,8),
  ADD COLUMN IF NOT EXISTS reconstructed_pnl_percent numeric(20,8),
  ADD COLUMN IF NOT EXISTS reconstruction_basis      varchar(64);

-- ⛔ COND-1 (Langston, blocking): `phantom_fill_suspect` is the ONE non-nullable column here, and a
-- DEFAULT false writes a STATED CLAIM — "this row is clean" — onto all 534 existing rows, over a
-- population where #741 measures 109 of 525 contaminated. Inert today because nothing reads it, and
-- a #546 landmine the day something does. The tri-state has a home already: `reconstruction_basis`
-- is nullable. These COMMENTs are the contract, and F-E must honour them.
COMMENT ON COLUMN closed_trades.phantom_fill_suspect IS
  'B-PHANTOM-FILL-RECONSTRUCT (#741). ⛔ false + reconstruction_basis IS NULL means NOT ASSESSED — it does NOT mean assessed-clean. Every pre-F-E row is in that state. Only F-E may set true, and it must also set reconstruction_basis so the two states are distinguishable. Reading false as clean is the #546 failure this comment exists to prevent.';

COMMENT ON COLUMN closed_trades.reconstruction_basis IS
  'How the reconstruction was derived, or NULL for NOT ASSESSED. The tri-state carrier: (false, NULL) = not assessed; (false, <basis>) = assessed clean; (true, <basis>) = assessed contaminated. Never infer assessment from phantom_fill_suspect alone.';

COMMENT ON COLUMN closed_trades.reconstructed_net_pnl IS
  'The honest P&L had the fill occurred at a price the venue actually printed. NULL until F-E populates it. The recorded pnl/net_pnl are NEVER overwritten — Kyle: "flag and remove from our accounts, but we do not delete these trades".';

CREATE INDEX IF NOT EXISTS closed_trades_phantom_suspect_idx
  ON closed_trades (phantom_fill_suspect) WHERE phantom_fill_suspect;
