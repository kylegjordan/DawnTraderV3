# B-VTS-NO-DECISION-VALVE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Row `3n.q3` (sprint plan row 4) · Step 2 of 11 · owner CC-C · change-class: architecture (from the scope header, unchanged).**
**Scope:** `Scope Files/B_VTS_NO_DECISION_VALVE_SCOPE.md` (r2, Langston APPROVED 2026-10-01T20:47Z with conditions C1-C3).
**Read at:** `origin/migration/aws-supabase` `b398f5fb1` (code) · staging DB and logs 2026-10-01 21:05-21:40Z. All `vts-runner.ts` lines below are at that ref.
⚠️ **`vts-runner.ts` carries the `🔒 LOCKED MODULE` header** — per `#1076` (Langston ruled (b)), the Step-4 change list names it.

---

## 0. PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | Scope §0: the 217 shadow xStock forced exits booked at entry happened in *"xStock quiet hours"* | **All 217 fell on a WEEKEND** (UTC Saturday/Sunday; the eight busiest hours are all Sat-Sun, top: Sunday 15:00Z, 47 rows) | The shadow lane does NOT honour the weekend suspension the real lane does (A6). It is the weekend shutdown, not quiet weekday hours. |
| 2 | Scope OBJ-1 framing: *"the shadow lane is where this matters at volume"* | Still true. But **the xStock part of that volume has a different root cause (A6)** that this batch can remove outright, not just relabel | Same as row 1 |
| 3 | Scope C2: a **third** unguarded outcome computation and a **third** sink | The census finds **17 outcome computations** and readers across **four** stores (archive, shadow sink, `vts_trades_*.json`, `virtual_trades` JSON), listed in A3 | Langston asked for the CLASS, not the three named; the class is larger |
| 4 | Scope §1 OBJ-3: count `bookedNoMarkClamp` beside `bookedNoBidClamp` | **Both become unpriced-close counters** (`unpricedNoBid`, `unpricedNoMark`); after OBJ-1 nothing books at a clamp, so a `booked…Clamp` counter would read 0 forever | P1 removes every clamp booking (A2) |

---

## 1. AUDIT — what the code and the data say

### A1. Langston's Step-2 condition — HOW LONG DOES THE NO-PRICE STATE LAST PAST MAX-HOLD?
His decision rule (scope OBJ-1): *hours ⇒ (a) discards nothing; seconds ⇒ (b), a grace clock, has a case.*
**Instrument:** for every Class B close (exit price = entry price), the gap from `closed_at` to the next two-sided frame (`bid > 0 AND ask > 0`) for that symbol in the class's own capture table (`xstock_spot_ticker_snap` / `crypto_spot_ticker_snap`, both ENUMERATED, not guessed), searched up to 4 days out. Window: epoch-6 boundary 2026-09-15T11:59:22Z → read time. Query: `scripts/analysis/b_vts_valve_persistence.sql` (committed with this file).

| population | n | next two-sided frame after the close |
|---|---|---|
| shadow, xStock, `shadow_max_hold` at entry | **217** (all found) | min 30 s · p10 1.2 h · **p50 3.5 h** · p90 6.0 h · max 26.3 h · 1 of 217 under 1 min |
| shadow, crypto, `timeout` at entry | **19** | 3.5 s → 507 s; 11 of 19 under 1 min; max 8.5 min (W/USD, 4 trades in 4 min) |
| real, crypto (EGLD/USD 2026-09-26) | 1 | not re-measured here (one row) |

**Class A** (a live mark, no usable bid) **cannot be measured from either sink** — neither carries the arm today. **Log proxy, deployed build:** `[8a-P3][VTS_NO_TRIGGER_ESCALATION]` fires once per crypto streak at 10 min of no decision: **73 lines in `error__2026-09-18` → `error.log`** (all `no_transactable_side`; FOLD/USD, AVL/USD and SN8/USD carry most). That bounds Class A streaks from BELOW at 10 min; their full length is unmeasured, because the streak-END line (`VTS_NO_TRIGGER_END`) ships in `8a-P4c` increment 3, which is not deployed — **0 matches, with the escalation line as the positive control (73) in the same files.**
**READING, against his rule:**
- **xStock: hours.** (a) discards nothing a short grace clock would have recovered — and A6 removes this population anyway.
- **crypto Class B: seconds to minutes.** (b) has a case **in principle**, and its whole measured yield is **19 of 12,938 shadow crypto forced exits (0.15%) plus 1 of 55 on the real lane in 16 days.**
- **crypto Class A: ≥ 10 min on at least 73 streaks; beyond that, unmeasured.**
⇒ **(a) stands as the Step-1 ruling made it: the instrument (P2 counters + the arm on both sinks) is what will show whether (b) earns itself.** (b) stays out of this batch; it is revisited on the counters' first month (§4 home).

### A2. Where an unpriced close can come from — exactly two arms, both only at the valve
- **The trigger IS the exit bid on both classes, both lanes:** real lane `_vtsTriggerPrice = _vtsExitBid` for crypto (`:3478-3485`) and xStock (`:3468-3476`); shadow lane passes `_sExitBid` as the trigger (`:4400`). VTS has exactly two classes (staging, `vts_open_trades`: `crypto_spot` 150,618, `xstock_spot` 14,141).
- **So a missing bid refuses every level decision** (`tec-evaluator.ts` step 2b) — and the only exits that can still fire without a bid are the two valve arms above it: step 1 `stale_timeout` (no mark) and step 2 `timeout` (live mark).
- **The resolver** (`server/core/trading/vts-exit-booking.ts`) returns `clamp_no_mark` when the mark is unusable and `clamp_no_bid` when the bid is. ⇒ **`clamp_*` ⇔ a valve exit with no usable sell price.** No other exit reaches a clamp arm. (Moonbag timeout fires after step 2b, so it always has a bid.)
⇒ **The resolver is the one place to make the policy:** a clamp arm returns NO price.

### A3. The census (C2 + FINDING-1) — every reader of a closed VTS outcome and of its arm
Full census, read at `eed4e1552` (a fresh reader with no part in the design; spot-checked by me at the cited lines). The load-bearing rows:

**Outcome computations that would turn a null exit price into a NUMBER** (JavaScript: `null − entry` is `−entry`, so a null exit reads as a **−100% loss, not NaN**):
| site | effect of a null exit |
|---|---|
| real lane `:3711-3721` gross/net/pnlPercent/dollarPnl | −100% |
| twin branch `:3729-3758` → `persistTwinClosedRecord` | −100% written to the twin record |
| `closedTradeRecord` `:3791-3792` → `phase10SessionTrades` → `vts_trades_*.json` → `vts-live-comparison-audit.ts:127-131` | NaN / Infinity |
| telemetry `success: netPnl > 0` (`:3829`) | counted as a failure |
| `persistRealPriceTrade` (`:3863-3872`) → `virtual_trades` JSON → `vts-service` `closedTrades`, `getStats`, `runCalibration` (null passes `!== undefined`, coerced to 0 in `linearFit`), `loadHistoricalTrades` → `ml-calibration`, `vts-telemetry` `getRegimePerformance` → the SQE's predictive confidence | 0 or −100%, counted as a loss |
| archive `rMultiple` `:3962-3965` (guards entry and stop, NOT exit — `#546`) | a large negative R |
| B73 replay `vts-service.ts:1195-1228` → `exit_strategy_replay` → ablation aggregator | −100 persisted and averaged |
| exit log `:4161-4162` `exitPrice.toFixed(6)` | **THROWS** — after the Map delete and soft-close, aborting the rest of the close loop and the cycle summary |
| shadow `computeShadowOutcomeMath` (`:4210-4226`) → `rtb_shadow_pairings` | −1 / −1−f / negative R |

**Readers of the booking arm:** `vts-friction.ts:111,135` (`exitSideBooked = arm === 'bid'`) and `:58-63` (exit spread share 0.5 when `arm !== 'bid'`) — **a new arm would be charged a half-spread exit silently**; `vts-runner.ts:3680` counter; type sites `:3319, :4235, :4361, :679, :3781, :3887`; `vts-service.ts:67,112,892,985,1030` (typed `string`); `export-csv.ts:103,227,352` (pass-through column). **No client, script or SQL reader of the arm exists beyond these.**
**Readers of the exit reason:** the real-lane normaliser (`:3651-3664`, unknown → `timeout`), `exitReasonMap` (`:3945-3953`, unknown → `'other'`), `exit-decision-archiver.ts:55-63` union, the shadow mapping (`:4432`), the `[B83-CYCLE]` tallies (`:4164-4175` — an unknown reason increments only `resolved`, so the line stops adding up), `vts-service.ts:820-823, 1004-1009, 1198-1204` (→ `timeout`), the client badges (neutral, raw text).
**Readers of the shadow sink** (`rtb_shadow_pairings`): `routes.ts:2711-2751` (by-cycle page; null-safe, "—"), `:2768-2797` selection-quality summary (`net_pnl IS NOT NULL` drops the row; a cycle whose only promoted pick is unpriced drops out), `shadow-trades-tab.tsx` (renders "—", neutral badge, excluded from "best").
**Readers of the archive** (`exit_decision_archive`): two xStock gate-audit scripts (`Number.isFinite` excludes null — but would INCLUDE a fabricated −100); `b5-w2a-geometry-sweep.ts:587-589` (`count(*)` includes, `avg()` skips ⇒ n and the averaged population diverge); the drift dashboard (row counts only).

### A4. The twin precedent is the right SHAPE — and it leaks (out of scope, A9)
P19-B7.2c gave twins a short cascade (`:3722-3758`: *"a twin must never leak into win-rate, expectancy, or any learning surface"*): Map delete + soft-close + one comparison record, nothing else. **An unpriced close needs exactly that shape, minus the comparison record** — any record written to the `virtual_trades` JSON is read by `vts-telemetry` WITHOUT the `countsInAggregates` filter (A9), so the only leak-proof choice is to write none there.

### A5. C3 — the archive columns, re-read
`exit_decision_archive` (raw SQL, no Drizzle schema): `exit_price`, `pnl_pct`, `r_multiple` nullable; `exit_reason text NOT NULL`, no CHECK ⇒ **no migration for the real lane**, but the union at `exit-decision-archiver.ts:55-63`, the normaliser (`:3651`) and `exitReasonMap` (`:3945`) must all widen or the reason funnels to `'other'`. **`rtb_shadow_pairings` has no arm column** (38 columns enumerated 2026-10-01; `gross_pnl`, `net_pnl`, `r_multiple`, `exit_price` numeric nullable; `close_reason varchar`) ⇒ the shadow arm needs a column (P5).

### A6. 🟨 FINDING — the shadow lane runs xStock trades through the weekend shutdown
- The real lane skips `weekend_suspended` trades (`:3334`); the weekend controller (`session-lifecycle-controller.ts`, B-NEW-36) passes ONLY the real lane's map (`getOpenVirtualTradesMap`, `:217-229, :391-393, :448-450`), so only the real lane's IN-MEMORY trades are suspended.
- ⚠️ **The DATABASE half does reach shadow rows** (second reader, re-derived): the suspend `UPDATE` (`vts-trade-persistence.ts:238-244`) filters on `asset_class = 'xstock_spot' AND closed = false AND state = 'open'` with no shadow filter, and shadow trades live in `vts_open_trades` too (`vts-runner.ts:1083`). So shadow xStock rows are flipped to `weekend_suspended` and back in the table while the shadow pass ignores `state` — and after a restart inside the closure a suspended shadow row is rehydrated into `openShadowTrades` (`:1169-1171`) and evaluated anyway. **The two halves disagree today; P6 makes the shadow pass agree with the window.**
- The shadow pass (`:4362-4436`) has no weekend check, so an xStock shadow trade opened late in the week reaches its 48 h cap while the market is shut, gets no mark, and closes `stale_timeout` → `shadow_max_hold` **at its entry price**.
- **Measured: 217 of 217 xStock Class B shadow closes are on Saturday/Sunday UTC; real-lane xStock Class B since the boundary is 0 of 62** (it is suspended).
- The shadow xStock price is a 5-minute look-back on the snapshot table (`:4334`), so inside the closure the mark is null and the cap fires `stale_timeout` at entry.
- **Provenance:** the shadow lane is reorg-B4 (`f3cbe2d14`, 2026-06-25, *"shadow-trade telemetry layer (selection-quality data engine)"*), seven weeks after B-NEW-36 (2026-05-20). It reuses the real lane's exit MATH and was not given its weekend POSTURE; nothing in the ledger decides that it should run through the shutdown (searched `RUNNING_ISSUES`, `BATCH_CATALOG` for shadow + weekend). ⇒ **rule 24 outcome (1) as a hypothesis with its mechanism cited, and the batch depends on it** (it is the whole xStock Class B population).
- `DISPOSITION: folded into this batch` — new **OBJ-6** (P6).

### A7. Per-pass exit coverage (Langston flag 2026-09-19) — answered
Each real pass iterates the WHOLE `openVirtualTrades` Map (`:3331`) with no slice or limit; it skips only `weekend_suspended` (`:3334`), `pending` maker rests (exit eval begins after the fill, `:3345-3420`) and a missing `assetClass` (`:3425-3431`, logged). The shadow pass iterates the whole `openShadowTrades` Map (`:4362`), dropping only a missing class. **Every open trade is evaluated every pass.**

### A8. `#1073` (paper lane, entry leg) — still unmeasurable with what is persisted
Placement time and `maker_deadline` are not on `closed_trades` (columns enumerated); `active_open_positions` holds 7 rows, 1 with a `maker_deadline`, 0 opened after it — a snapshot, not a measurement; `MAKER_PLACED` lands in `out.log` (~7 h reach). ⇒ **the entry leg needs an instrument before it can be measured.** `#1073`'s conversion trigger stays armed. Home in §4.

### A9. 🟨 FINDING — the SQE's predictive confidence counts records flagged "never count"
- `updateRegimePerformanceFromVTS` (`vts-telemetry.ts:117-241`; the loop `:146-160`) reads every row of the `logs/virtual_trades/*.json` files modified in the last 7 days and counts wins and totals by regime × strategy — **with no `countsInAggregates`, `mtTwin` or `resultType` filter** — and stores them in memory; `getRegimePerformance` (`:280-284`) is the lookup. **It runs live:** the 6-hourly scheduler job `vts_telemetry_aggregation` (`autonomy-scheduler.ts:578-586`) logged a snapshot on staging at 2026-10-01 14:38:57Z (1,994 entries, 5 regimes).
- Twin comparison records and never-filled orders are written to that same store (`vts-service.ts` `persistTwinClosedRecord`, the never-filled writer, both via `logTrade`) with `countsInAggregates: false`, whose stated meaning is *"never in win-rate/expectancy/ML"* (`vts-service.ts:818`).
- **Measured on staging 2026-10-01 (the reader's own population — 8 files inside its 7-day window): 2,153 rows, of which 375 twin + 14 never-filled = 389 (18.1%) carry the "never count" flag.**
- **Live consumers:** `getPredictiveConfidence` (`score-calculator.ts:205`) ← the SQE (`signal_quality_evaluator.ts:375`), the VTS runner (`:1936`) and the xStock eval cycle (`eval-cycle.ts:671`); and `getAdaptiveExpectancy` (`expectancy.ts:420`).
- **Also, on the same object:** the lookup takes no asset class (`score-calculator.ts:205`), so the two classes pool; a regime × strategy cell absent from the current window is never removed (`:201-219`); the `SKIPPED` fallback (`:283`) can return another strategy's metrics; the SQE calls it only when entry, target and regime are all present (`signal_quality_evaluator.ts:372`).
- **Not established:** the effect on any single ranking (twins carry real outcomes, never-filled rows count as non-wins; the net direction per cell is unmeasured). ⇒ a hypothesis with its mechanism and population, **not yet a verdict**; it needs its own bug investigation.
- **Not this batch's subject** (it is a selection input, not a price side). `DISPOSITION: own batch, placed in the plan` — proposed `HOME: B-VTS-TELEMETRY-AGGREGATES, owner CC-C, placed in SPRINT_TO_LIVE_PLAN directly after this batch (row 4's next item)` — **Langston to confirm the position in his Step-2 review**; `RUNNING_ISSUES` entry filed with this commit.

### A10. Smaller items the census raised
- **The name `unpriced` is taken:** `VtsFrictionBasis` (`vts-friction.ts:91`) and the friction ledger use it for "the record never carried cost inputs" (every shadow close today). ⇒ the new reason is `timeout_unpriced` (and the counters say `unpricedNo…`), never a bare `unpriced`.
- **`vts-live-comparison-audit.ts:127` reads `vts.loss`, which the census found nowhere written** — a lead, not verified here; untouched by this batch (an unpriced close never reaches `phase10SessionTrades`). `DISPOSITION: review scheduled at this batch's Step 10` — re-derive and home it there.
- **`b63_counterfactual_audit.py:276,280`** would raise on a `None` P&L — `DISPOSITION: no work — withdrawn`: under P1 no unpriced row reaches the `virtual_trades` JSON it reads (A4).
- **Stale "6 h" comments** — four, not two: `:1026`, `:1272`, `:1277`, `:4296` (the cap is 48 h, `:874`).

### A11. Provenance and existence — re-checked, nothing new
Scope §4's tier-1 reads stand (valve `dd1f53726`, resolver `d3e643032`, alert `57d89095e`). Added tier 1: the weekend controller (B-NEW-36, 2026-05-20; disposition (2) — extend it to the shadow lane) and `vts-telemetry` `getRegimePerformance` (Batch 59, 2026-04-12 fixed its field names; disposition (2), homed per A9). `bridge/canonical/`: every component post-dates the governance change — not consulted, stated.
**SIM / System Manual read (1.a):** the SIM's VTS runner / shadow lane / `exit_decision_archive` entries and the System Manual §18.0.1 price-side table. **Silences, flagged as gaps:** neither document says what the VTS records when a forced exit has no price, and neither says the shadow lane is exempt from the weekend suspension. Both are written at Step 10 (P10).

---

## 2. PLAN — every item points at its finding

| # | change | from |
|---|---|---|
| **P1** | **The resolver returns no price for a clamp arm.** `VtsBookedExit.price: number \| null`; `clamp_no_mark` and `clamp_no_bid` return `price: null`; `bid` unchanged. The arm names stay (they say WHY there was no price). | A2 |
| **P2** | **Real lane, unpriced close = a short cascade** (twin shape minus the record): Map delete → `markOpenTradeClosed` → `clearTrailingState` → ONE archive row (`exit_reason = 'time_stop_unpriced'`, `exit_price`, `pnl_pct`, `r_multiple` NULL, arm and carried class in the row) → one log line `[3n.q3][VTS_UNPRICED_CLOSE] <symbol> <trade> class=<c> arm=<a> holdMs=<n>` → `continue`. **Skipped, by construction:** friction recompose and its ledger note, `phase10SessionTrades`, telemetry, `persistRealPriceTrade` (the `virtual_trades` JSON, `closedTrades`, ML, session P&L, B73 replay, outcome feedback). A **twin** closing unpriced takes the same path and writes no comparison record (its pair loses that comparison; logged). The normaliser union gains `timeout_unpriced`; `exitReasonMap` maps it to `time_stop_unpriced` (the archive's own `time_stop` family); the archiver's `ExitReason` union widens. The `[B83-CYCLE]` tallies gain `unpriced`. | A2, A3, A4, A5, A10 |
| **P3** | **Shadow lane, unpriced close:** `shadowClose` takes `exitPrice: number \| null`; `computeShadowOutcomeMath` returns null gross/net/R for a null exit (no NaN, no −1); no friction recompose; the row is written `closed = true`, `close_reason = 'timeout_unpriced'`, `exit_price`/`gross_pnl`/`net_pnl`/`r_multiple` NULL, arm in the new column (P5). | A3, A5 |
| **P4** | **The archive `rMultiple` guards the exit price** (`:3962`), so no path can write NaN or a fabricated R even outside the valve (`#546`). | A3 |
| **P5** | **Migration: `rtb_shadow_pairings.exit_booking_arm varchar(16)` NULLABLE**, written on every shadow close from the deploy on (old rows stay NULL = "before the arm was recorded"). A column, not a suffix on `close_reason`: the reason and the arm are two facts, and one string would pool them — the cell conflation this row has found five times. Forward file + rollback file, both `git add -f`; MANIFEST entry. `updateShadowPairingOutcome` gains the field. | A5, OBJ-2 |
| **P6** | **OBJ-6 (new): the shadow pass skips xStock trades while the weekend controller's window is shut** — the SAME window function the controller uses, so the two lanes cannot disagree about when the market is shut. The 48 h clock keeps running (as the real lane's 7-day clock does); on the Sunday reopen a trade past its cap closes `timeout` on a live bid. | A6 |
| **P7** | **OBJ-3 + C1 — counters keyed per asset class on BOTH lanes.** Real `[8a-P3][VTS_TOUCH]` and shadow `[8a-P3][VTS_SHADOW_TOUCH]` each print `crypto_spot{…}` and `xstock_spot{…}` with `exitLooks`, `exitNoTransactableSide`, `unpricedNoBid`, `unpricedNoMark`, `closedUnpriced`; the line prints when ANY class has a non-zero counter (today a pass with only xStock trades prints nothing and the reset wipes its increments). `bookedNoBidClamp` is retired (it reads 0 after P1); the counter-schema change marks the build boundary. Entry-fill counters stay crypto (the entry guard is crypto-only). | A1, A10, OBJ-3, C1 |
| **P8** | **OBJ-4 — the refusal alert names the real reason.** The streak keeps the selector's own refusal (`tickerRefusal` from the crypto touch selection; `reason` from `selectVtsXstockExitBid`) beside `no_transactable_side`; the alert body states it, and its *"books a timeout at the mark"* sentence becomes *"closes the trade with no recorded price (`time_stop_unpriced`)"*. | scope OBJ-4 |
| **P9** | **OBJ-5 / `#1075` — the close writes the CARRIED class.** The archive row takes `trade.assetClass` (`:3816` today re-derives from the ticker); the xStock open's `pairFriction` fallback prices from the carried class; the boot bootstrap (`vts-trade-persistence.ts:405-424`) stops overwriting a carried class. Crypto-lane derivation sites (`:1470, :2240, :5035`, labels `:2892, :5335, :5426`) stay — they are correct while the collision set is complete — and the collision set is re-run against Kraken's AssetPairs in Step 3, with its quarterly re-audit given a real trigger (a scheduled system alert) and the five documents that cite the non-existent `§10c.X` corrected. | scope OBJ-5, `#1075` |
| **P10** | **Stale comments** `:1026, :1272, :1277, :4296` → 48 h. **Governance at Step 10:** SIM (the VTS close path both lanes, the shadow sink's new column, the weekend controller's reach), System Manual §18.0.1 (a forced exit with no sell side closes unpriced), `ADJUSTMENT_FRAMEWORK` rule 8 (the register closes to new A/B members from the deploy; existing rows stay excluded by id). | A10, A11 |

**Tests (Step 3):** per lane, max-hold with (i) no bid, (ii) no mark, (iii) a usable bid — (i)/(ii) close unpriced with the arm, NULL outcomes, no NaN anywhere, no friction charge, no JSON record, no telemetry; (iii) books the bid exactly as today. A twin closing unpriced writes no comparison record. Shadow xStock inside the weekend window is skipped, outside it is evaluated. Counters per class. The alert body names a crossed book. The archive writes the carried class for a collision ticker (MET).
**Nothing in the plan is `UNAUDITED`.**

**Verification (Step 7), pre-registered:** after the deploy, (a) no new `exit_decision_archive` row with `exit_reason = 'time_stop'` and `exit_price = entry_price`, and no new shadow row with `close_reason = 'shadow_max_hold'` and `exit_price = entry_price`; (b) every new shadow close carries `exit_booking_arm`; (c) the first weekend after the deploy shows 0 xStock shadow closes inside the shut window; (d) `time_stop_unpriced` / `timeout_unpriced` rows, if any, carry NULL outcomes and appear in no `virtual_trades` JSON file; (e) the counter lines print per class. **A zero in (d) is "the valve did not fire", never "it works".**

---

## 3. Langston's three conditions — where each landed
- **C1** (per-class counters, both lanes) → P7.
- **C2** (the class of outcome computations, the third sink) → A3 (17 computations, four stores) → P2, P3, P4.
- **C3** (the real columns; widen the union and the map) → A5 → P2, P5.

## 4. Homes for what this batch does not do
- **(b) the grace clock:** `DISPOSITION: review scheduled at row 3n.q3's next increment` — read P7's `unpricedNo*` counters over their first month; build (b) only on measured yield.
- **`#1073` entry-leg instrument:** `HOME: B-VTS-NO-DECISION-VALVE increment 2 (paper lane), owner CC-C, placed in SPRINT_TO_LIVE_PLAN at row 4, after this increment` — persist placement time and deadline beside the fill, then measure.
- **A9:** proposed home above, Langston to confirm.
- **The crossed-book design question:** unchanged from scope §2.

## 5. Reviewer record
REVIEWER r2: claim-only (A2, A6, A9 as claims) · "what other states of the world are consistent?" · A2 holds (a third class is ruled out at open; on rehydrate the class is unvalidated — staging holds only the two classes, measured); A6 incomplete — the DB suspension reaches shadow rows; A9 named the lookup, not the counter, plus pooling and stale cells · all re-derived at the code, the scheduler's live run read in `out.log`, folded in · re-derived y
REVIEWER r1: object (the code at `eed4e1552`) · census of outcome, arm, reason and counter readers · 17 computations, 4 stores, 4 stale comments, 2 name/flag hazards · spot-re-derived y (A2's trigger = bid, A9's reader, A6's controller scope, the throw at `:4161`)
