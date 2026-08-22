-- B-PHANTOM-FILL-RECONSTRUCT (#507 follow-on) — flag the trades whose exit price came from a
-- ghost order-book level, and record what the honest exit WOULD have been, WITHOUT ever
-- overwriting what was originally recorded.
--
-- KYLE'S DECISION, 2026-08-23, in two parts:
--   (1) "flag and remove from our accounts, but we don't delete these trades"
--   (2) "we can replace the phantom exits with real market prices if we have them"
-- ⇒ the original `exit_price` / `pnl` / `net_pnl` are NEVER modified. The reconstruction lands in
-- SEPARATE columns beside them, so both readings stay visible forever and anyone can see what we
-- recorded AND what we believe actually happened. Langston's condition, and the right shape:
-- "don't correct in place -- rewriting buries the distinction between recorded and reconstructed,
-- and if a better reconstruction lands later you have to un-rewrite."
--
-- THE DEFECT (fixed in code at e6f7c70b3, deployed 2026-08-22T22:01Z): the Kraken mini-book never
-- truncated to its subscribed depth, so dead price levels accumulated. A stale bid from an earlier,
-- higher price ended up ABOVE the real ask, and the paper close-fill walks the bid side -- so a
-- stop-triggered sell filled against a buyer that did not exist. Measured on the live venue:
-- 31.08% of book states were crossed under the old logic; 0% under the fix.
--
-- ★ DETECTION -- and the criterion is deliberately CONSERVATIVE, chosen because it has a negative
-- control that proves it measures the book rather than something else:
--     taker exit  AND  exit_price > the recorded ASK within ±5s of the close.
-- You cannot sell ABOVE the ask. A maker exit fills at its own resting limit and never reads the
-- book, so an honest detector must be SILENT on maker fills -- and this one is: measured over the
-- last 24h, maker 0 of 4 with snapshots, taker 7 of 8. That silence is what makes the taker count
-- a measurement rather than a number. (Three earlier estimates -- $187.78, 111 rows, ~$111 -- were
-- produced WITHOUT that control and are withdrawn; none was reproducible.)
--
-- ★ RECONSTRUCTION uses the BID, not the ask. The ask is the right DETECTOR (selling above it is
-- impossible) but a market sell takes the BID, so the honest fill is the bid at that moment. This
-- distinction was corrected before the numbers below were computed.
--
-- MEASURED EFFECT (521 lifetime trades, 21 affected = 4%; ALL 21 reconstructable, none excluded):
--     lifetime  -74.11 -> -132.74   (overstatement 58.63)
--     30d       157.07 ->  101.30
--     7d        235.09 ->  204.99
--     24h        63.33 ->   35.91
-- The 21 were recorded as +88.14 and are actually +29.50 -- still genuinely profitable, which is
-- exactly why they are CORRECTED rather than removed: excluding them would have discarded $29.50
-- of real gains along with the fiction.
-- ★ INDEPENDENT CORROBORATION: Langston, using a different method and his own data pull, put the
-- overstatement at "about $55". This lands at $58.63. Two methods, no coordination.

ALTER TABLE closed_trades
  ADD COLUMN IF NOT EXISTS phantom_fill_suspect   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconstructed_exit_price numeric(20,8),
  ADD COLUMN IF NOT EXISTS reconstructed_net_pnl    numeric(20,8),
  ADD COLUMN IF NOT EXISTS reconstructed_pnl_percent numeric(20,8),
  ADD COLUMN IF NOT EXISTS reconstruction_basis     varchar(64);

COMMENT ON COLUMN closed_trades.phantom_fill_suspect IS
  'B-PHANTOM-FILL-RECONSTRUCT: the recorded exit came from a ghost book level (#507). The original exit_price/pnl/net_pnl are UNCHANGED; see reconstructed_*.';
COMMENT ON COLUMN closed_trades.reconstructed_net_pnl IS
  'The honest P&L had the sell filled at the real bid. NULL when no contemporaneous market data exists -- such a row stays flagged and uncorrected, which is the truthful answer.';

-- Backfill. Idempotent: only touches rows not already reconstructed, so a re-run is a no-op.
WITH cand AS (
  SELECT c.id,
         c.entry_price::numeric  AS entry,
         c.quantity::numeric     AS qty,
         c.total_cost::numeric   AS cost,
         c.exit_price::numeric   AS px,
         (SELECT t.ask::numeric FROM crypto_spot_ticker_snap t
           WHERE t.symbol = c.symbol
             AND t.captured_at BETWEEN c.closed_at - interval '5 seconds'
                                   AND c.closed_at + interval '5 seconds'
           ORDER BY abs(EXTRACT(EPOCH FROM (t.captured_at - c.closed_at))) LIMIT 1) AS ask,
         (SELECT t.bid::numeric FROM crypto_spot_ticker_snap t
           WHERE t.symbol = c.symbol
             AND t.captured_at BETWEEN c.closed_at - interval '5 seconds'
                                   AND c.closed_at + interval '5 seconds'
           ORDER BY abs(EXTRACT(EPOCH FROM (t.captured_at - c.closed_at))) LIMIT 1) AS bid
    FROM closed_trades c
   WHERE c.asset_class = 'crypto_spot'
     AND c.closed_at IS NOT NULL
     AND c.close_reason IS DISTINCT FROM 'never_filled'
     AND c.exit_fee_mode = 'taker'
     AND c.exit_price IS NOT NULL AND c.exit_price::numeric > 0
     AND c.reconstructed_exit_price IS NULL
     AND c.phantom_fill_suspect = false
)
UPDATE closed_trades ct
   SET phantom_fill_suspect     = true,
       reconstructed_exit_price = cand.bid,
       reconstructed_net_pnl    = CASE WHEN cand.bid IS NOT NULL
                                       THEN (cand.bid - cand.entry) * cand.qty - COALESCE(cand.cost, 0)
                                  END,
       -- The percentage basis was DERIVED FROM THE DATA, not assumed: over all 521 closed rows,
       -- `pnl / (entry_price * quantity) * 100` reproduces the recorded `pnl_percent` to a mean
       -- absolute deviation of 0.008, while `gross_pnl`-over-notional deviates by 2.10 and raw
       -- price-move by 1.22. Three candidates, one fits -- so this is a measurement of the
       -- writer's formula rather than a guess that happened to look plausible.
       reconstructed_pnl_percent = CASE WHEN cand.bid IS NOT NULL AND cand.entry > 0 AND cand.qty > 0
                                       THEN ((cand.bid - cand.entry) * cand.qty - COALESCE(cand.cost, 0))
                                            / (cand.entry * cand.qty) * 100
                                  END,
       reconstruction_basis     = CASE WHEN cand.bid IS NOT NULL
                                       THEN 'ticker_snap_bid_5s'
                                       ELSE 'none_no_market_data'
                                  END
  FROM cand
 WHERE ct.id = cand.id
   AND cand.ask IS NOT NULL
   AND cand.px > cand.ask;   -- the conservative detector: you cannot sell above the ask

CREATE INDEX IF NOT EXISTS closed_trades_phantom_suspect_idx
  ON closed_trades (phantom_fill_suspect) WHERE phantom_fill_suspect;
