-- B-EXIT-BOOK-AGE-STAMP (#961 / #962) — 2026-08-30
--
-- ONE new column, and FIVE column comments corrected on the LIVE DATABASE.
--
-- WHY THE COLUMN: the exit fill walks a depth ladder and never recorded how old it was, so
-- #961's headline — 22 of 243 closes filling on depth older than the ENTRY gate's own 15s
-- limit, worst 1,554.9s — had to be RECONSTRUCTED by joining the ticker archive after the
-- fact. A finding that large should not rest on a reconstruction. This makes it READ.
--
-- ⛔ WHY IT IS NOT CALLED `exit_fill_book_age_ms`, which is what the scope originally decided:
-- on xStock `getDepthSnapshot` returns the ROW AGE of a `xstock_spot_ticker_snap` record
-- (computed in SQL as NOW() - captured_at), not an order-book age. A column named `book_age`
-- would assert a book on a class that has none — the precise wrong-object naming this batch
-- exists to end, committed by the batch itself. Langston's Step-2 condition 1.
--
-- ⛔ NULLABLE, NO DEFAULT. A default would make a pre-deploy row indistinguishable from a
-- post-deploy row whose stamp was missed — #546.
--
-- ⛔ NO BEHAVIOUR CHANGE. Nothing is gated, refused, delayed or re-priced by this batch.

ALTER TABLE closed_trades
  ADD COLUMN IF NOT EXISTS exit_fill_depth_age_ms DOUBLE PRECISION;

COMMENT ON COLUMN closed_trades.exit_fill_depth_age_ms IS
  'Age of the depth snapshot the FILL actually walked, taken two lines before the walk with no await between - the tightest of this table''s three age columns. NOT THE SAME QUANTITY ACROSS CLASSES: crypto_spot = live WS mini-book age; xstock_spot = ROW AGE of an xstock_spot_ticker_snap record (NOW() - captured_at). A row age and a book age are different measurements - never pool them. DISCRIMINATE ON closed_trades.asset_class, which is NOT NULL and is on this row; DepthSnapshot.source is the in-process form and is never persisted. A NULL IS FOUR-VALUED and exit_fee_mode does NOT separate them alone - that column has exactly one writer, inside closePosition, so any close not routed through there lands NULL/NULL. fee_mode=maker: a resting fill consulted no depth. fee_mode=taker: the walk ran and getDepthSnapshot returned null (cold or one-sided book). fee_mode IS NULL: the row came from a non-closePosition path (never_filled, closeAllPositions, engine_stop_cleanup, hard_reset, the two manual routes) or predates this column - use close_reason and closed_at for those, never the fee mode. B-EXIT-BOOK-AGE-STAMP.';

-- ── THE FIVE CORRECTIONS. All five were TRUE when written and are read from the live database
-- by anyone running \d+ closed_trades, which is why they are corrected here and not only in
-- shared/schema.ts (whose comments are TypeScript and NEVER reach Postgres).

-- (1) INSTANT + BOUND. Said "at close" with no instant qualifier, and "NULL BY CONSTRUCTION on
-- xStock" as a class-level claim. Both too wide: this pair is built ONCE PER POSITION above the
-- exit-condition evaluation (decision-time, not close-time), and the FILL-time getDepthSnapshot
-- DOES return an xStock ladder.
COMMENT ON COLUMN closed_trades.exit_book_age_ms IS
  'DECISION-time age of the crypto WS mini-book (getBookForFill), captured once per position ABOVE the exit-condition evaluation - NOT at the close. NULL BY CONSTRUCTION on xStock because that accessor has no xStock equivalent; this is NOT a claim that xStock has no book (see exit_fill_depth_age_ms, which IS populated on xStock). NOT comparable to entry_book_age_ms (a depth-GATE reading) or exit_fill_depth_age_ms (the fill) - THREE DIFFERENT INSTANTS. B-EXIT-PROVENANCE, bounded by B-EXIT-BOOK-AGE-STAMP.';

COMMENT ON COLUMN closed_trades.exit_book_mid IS
  'DECISION-time order-book mid from the crypto WS mini-book - independent cross-check. NULL BY CONSTRUCTION on xStock because getBookForFill has no xStock equivalent, not by omission and not because the class has no book. Same instant as exit_book_age_ms. B-EXIT-PROVENANCE, bounded by B-EXIT-BOOK-AGE-STAMP.';

-- (2) INSTANT + CLASS. Said "a real book age" at what its write-site comment called "the REAL
-- fill instant". It is the DEPTH-GATE reading: the walk that consumes the snapshot happens ~150
-- lines and THREE awaits later, one of them a venue round-trip.
COMMENT ON COLUMN closed_trades.entry_book_age_ms IS
  'DEPTH-GATE age, not the fill instant: the snapshot is taken by _evaluateOpenDepthGate and the walk that consumes it runs ~150 lines and THREE awaits later, one a venue round-trip. NULL BY CONSTRUCTION on a MAKER-fill row (a resting fill consults no depth). NOT THE SAME QUANTITY ACROSS CLASSES: on xstock_spot this is a ticker-snap ROW AGE, not an order-book age. B-EXIT-PROVENANCE, corrected by B-EXIT-BOOK-AGE-STAMP.';

-- (3) A STALE ABSENCE. Said "NOT YET INSTRUMENTED - NULL on every branch at the deploy ref".
-- True at 2026-08-26; #911 wired the witness on 2026-08-27 and 18 of 662 closes now carry a
-- value. The database was asserting an absence its own rows refute.
COMMENT ON COLUMN closed_trades.exit_ticker_bid IS
  'INSTRUMENTED since #911 (2026-08-27): read from the archiver ticker snapshot via getTickerWitness, NOT from the depth snapshot the fill walks. A NULL here means NO WITNESS ROW - it does NOT mean "not instrumented", and it never means "no ticker existed". NEVER fill this from the order book: top-of-book is a DIFFERENT feed, and #741 is a BOOK defect, so a row with a book mid and no ticker checks the suspect against itself. NOT independent on xStock - the fill reads the same table. B-EXIT-PROVENANCE / #911.';

COMMENT ON COLUMN closed_trades.exit_ticker_ask IS
  'INSTRUMENTED since #911 (2026-08-27) - see exit_ticker_bid. A NULL means no witness row, not "not instrumented". B-EXIT-PROVENANCE / #911.';

-- (4) THE PRODUCER VOCABULARY WIDENED. Three coarse members split into _mid/_last so that
-- exit_price_producer alone determines whether the exit-driving number was a midpoint or a
-- last trade. PURE RE-DESCRIPTION: no member merged, none deleted, no number changed.
COMMENT ON COLUMN closed_trades.exit_price_producer IS
  'WHICH HANDLER produced the exit price, AND since 2026-08-30 which KIND of number it was. Closed vocabulary (PriceProducer, live-pricing-adapter.ts); a value outside it FAILS the OBJ-5 fence. SPLIT EPOCH 2026-08-30: kraken_ws_ticker, kraken_equities_ws and kraken_rest_engine_fallback each became _mid/_last. Rows before that epoch carry the coarse names and are NOT wrong, only coarse - a cohort query spanning the epoch MUST ENUMERATE both old and new members and must NEVER use LIKE, because kraken_ws_ticker is a strict prefix of kraken_ws_ticker_v1 and _ is itself a LIKE wildcard. A _mid suffix records the KIND and says NOTHING about WHICH BBO produced it (#952 is open). B-EXIT-PROVENANCE / B-EXIT-BOOK-AGE-STAMP.';
