# B-RTB-REFRESH-LIVE-PRICE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Batch:** row 59e (row 59's pre-sprint increment, P1a; Kyle's directive 3) · **Owner:** CC-B · **change-class:** architecture · **Scope:** `B_RTB_REFRESH_LIVE_PRICE_SCOPE.md` r1 — Step 1 PROCEED (Langston 2026-10-12, re-derived at `ba1005d9bd`) with four conditions C1-C4, all carried here.

## 0. PRE-REGISTRATION — committed BEFORE any measurement below is run
**Read sites and times:** every query runs on the staging database; each states its UTC read time and the deployed sha. The live ask for a queued signal is approximated from the durable ticker archives (`crypto_spot_ticker_snap`, `xstock_spot_ticker_snap`: `bid`, `bid_qty`, `ask`, `ask_qty`, captured time) — the newest row per symbol, with its age stated. **This is the archive, not the refresh's eventual read site** (crypto `selectCryptoTouch` in memory; xStock `getDepthSnapshot`, which reads this same xStock table); the crypto figures are therefore a proxy, labelled so.
**Population:** every `rtb_signals` row, both modes as they occur, split by `asset_class`, at each read time. **Three read times:** one now (xStock overnight session), one in the US regular session (13:30-20:00Z), one after it.

**M1 — would-retire (OBJ-2's blast radius), and C1's grounding.** Per row: the newest ticker row for its symbol no older than **15 s** (the open's `active_fill_max_age_ms`); classify `ask <= stop_price`, `ask >= target_price`, strictly inside, or no admissible row. **Every would-retire row is listed** with bid, ask, the spread as a share of the mid, both quantities and the row's age. **Decision rule, fixed now:** a would-retire row whose book the exit side would refuse to decide on (no quantity on the ask, a one-sided book, or a spread wider than the exit's book-state bound — the bound is read from the code at the audit, and cited) is counted as **"the contract must exclude"**; **if there is even one, OBJ-1's contract must exclude that shape before OBJ-2 may act** (Langston C1). Counts are not otherwise a gate — the retire rule is the existing primitive.

**M2 — `price_unavailable`.** At the same reads, the share of rows per class with no admissible ask. No decision rides on it; it is the denominator for C2 and the Step-2 question on unpriced signals. If xStock is unpriced on more than half its rows off-session, the plan states that the refresh check is in practice a regular-session check for xStock.

**M3 — is a retirement reversible? (Langston C4).** Code: the queue-insert path's dedupe, cooldown and re-entry rules for a `symbol × strategy` whose row was deleted, cited. Data: over the last 72 h, per class, the time between consecutive orchestrator `admitted` rows (`signal_eval_archive`, `source` = the signal orchestrator, `reject_stage = 'admitted'`) for the same `symbol × strategy` — median and p90. **Decision rule, fixed now:** if the median re-admission gap is at most **10 minutes**, a false retirement costs about one cycle and OBJ-1's contract may be the open's own; **if it is longer, or the code blocks re-entry, the contract is stricter than the open's** (a retirement then needs the ask to have passed the level on two consecutive passes, or equivalent) — chosen in the plan, not after the data.

**M4 — volume.** Rows per class per read; passes per hour from the refresh's own log line (`[A4.R10R-3][RTBRefresh] … signals=… priced=…`), sized to say whether OBJ-3's shadow line needs sampling (threshold fixed now: more than **2,000 lines an hour** ⇒ sample).

**M5 — the selection-to-open gap.** From the code: the refresh cadence per bucket and the promotion loop's interval, cited. No live measurement is planned (the promoted row is deleted at promotion, so the last refresh time is not retained); stated as **UNMEASURED** with that reason.

**L/USD vs row 2a (the plan's open question):** L's 1-hour bars at its 2026-10-06 open run through `B-ATR-BAD-PRINT`'s filter; result reported, or `UNMEASURED` with the reason if the bars are no longer in the archive.

## PREVIOUSLY STATED vs NOW
*(filled in after the measurements; none yet)*
