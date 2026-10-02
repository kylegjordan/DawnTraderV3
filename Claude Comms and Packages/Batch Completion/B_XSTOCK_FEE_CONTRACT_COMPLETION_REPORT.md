# B-XSTOCK-FEE-CONTRACT — COMPLETION REPORT

**Batch:** `B-XSTOCK-FEE-CONTRACT` · **Issue:** `#1010` · **Plan row:** `PHASE_19_PLAN` 2.4-FEE · **Change-class:** `architecture` (Langston, 2026-09-06) · **Owner:** CC-B (Claude New)
**Deployed:** `b597f1bf2` at **2026-09-11 20:09:47Z** (one restart shared with `B-PRICE-SIDE-BY-JOB` OBJ-7, two named boundaries — Langston's ruling 19:48Z)
**Langston:** Step 1 approved · Step 2 approved 16:14Z (conditions A/B/C) · Step 4 **APPROVED** 17:50Z at `eb5b7831d` · deploy ruling 19:48Z · **Step 8 CONFIRMED 2026-09-12 00:32Z, re-derived on staging** (*"this is not `RULED ON REPORTED FACT`"*), with one condition folded before close.

---

## ⏳ OPEN AT CLOSE — STATED AT THE TOP, NOT BURIED

✅ **BOTH WINDOWS READ AND CLOSED 2026-10-02 (P8 INCONCLUSIVE as ruled; Arm B a rise) — see FINAL READ OF RECORD below; the open question moves to `#1097`.** **The batch is CLOSED; the QUESTION it opened is not.** Two pre-registered observation windows opened at the deploy instant and cannot be read for about three weeks.

| open item | owner | home | closing condition | failure condition |
|---|---|---|---|---|
| **P8 — the maker-share prediction** | CC-B | `PHASE_19_PLAN` row 2.4-FEE (observation) | **PASS = zero class-(iii) mechanism bypasses AND xStock maker share ≤ 1.0 % at n ≥ 300** (~21 days after deploy) | share ≥ the frozen `p₀` (24.0 %) = NO IMPROVEMENT OBSERVED; between = INCONCLUSIVE-EXTEND |
| **Arm B — EV-gate admission** | CC-B | same row | **No PASS/FAIL line is set. A rise is the expected direction and its SIZE is the finding** (Langston, Step-4 condition B) | a flip on restoring the excluded alias rows ⇒ INCONCLUSIVE-EXTEND |

⛔ **BOTH VERDICTS EXCLUDE 17 SYMBOLS UNTIL `#1024` LANDS** — `A` · `ADI` · `CAT` · `CVX` · `DASH` · `EDU` · `ES` · `IR` · `MET` · `OPEN` · `PEP` · `STRK` · `STX` · `SUI` · `T` · `WELL` · `WEN` (all `/USD`), which share an exact cache key with a Kraken crypto pair. **Their historical share is 1.09 % (3 of 274 xStock closes), ABOVE P8's 1.0 % PASS line** — so the exclusion is not immaterial by construction, and **if restoring them would flip an arm, that arm is INCONCLUSIVE-EXTEND, never PASS on the remainder** (Langston, deploy conditions 6 and 7).

### ⏳ INTERIM READ, 2026-09-29 — the window is still open to 2026-10-02T20:09:47Z; the verdict of record is re-run after it closes
Read at 2026-09-29T14:19:38Z (P8) and 14:00Z (Arm B) on staging by a read-only reader, then **re-derived independently by a second reader with its own SQL — every figure matched.** Pre-registered text quoted from `B_XSTOCK_FEE_CONTRACT_PRE_AUDIT.md:239-249` (P8) and `:262-281` (Arm B). Queries: **`B_XSTOCK_FEE_CONTRACT_EVIDENCE/`** (moved from the session scratchpad 2026-09-30): the `p8_*`, `armb_*` and `rv_armb_*` files, byte for byte as the interim read ran them. ⚠️ **The second reader's `rv1..rv4.sql` are not recoverable under those names.** The scratchpad reused them the same day for another batch. So the `rv3.sql` context figure below is rebuilt or declared lost at the final read. It is never re-cited under that name (see the folder's README).

**P8 — RULED 2026-09-29 (Langston, 15:14Z): CLOSE P8 INCONCLUSIVE at 2026-10-02T20:09:47Z; do not extend on this instrument. ⛔ PASS WAS UNREACHABLE BY CONSTRUCTION, NOT UNDERPOWERED.** n ≥ 300 was MET (718 and 865 inside single stretches). Class (iii) is defined so that a thin genuine survivor lands in it and still fails PASS (Langston's own Step-4 condition A, `:231-237`), so no n could satisfy the criterion. The object that decides *"did the corrected fee reach this decision"* is **the fee the decision used**; `r ≤ 1` is a proxy bounded by market conditions. **Read INCONCLUSIVE here as "the test could not answer", never as "wait longer".** **Successor (§9.4 disposition 3):** `HOME: B-FEE-BASIS-STAMP (#1097), owner CC-B, placed in PHASE_19_PLAN at 2.4-FEE-c-iii after 2.4-FEE-c-ii, and in SPRINT_TO_LIVE_PLAN at row 107a after row 107` — stamp the RESOLVED fee rate and the fee-schedule epoch (not a yes/no) onto the decision row, written from the same variable the decision consumed, at the decision site, cited by line. The two counts that make it inconclusive under the rule as registered:
1. **The gate.** Verdict population (17 alias symbols excluded): **116 maker of 2,096 decisions = 5.53 %, and all 116 maker picks are class (iii)** (r ≤ 0.3478; class (i) 0, class (ii) 0). Buckets: booked-new 6, **booked-old 0**, no position 110. **Leg 1, n ≥ 300: MET** inside single stretches (718 and 865). **Leg 2, zero class-(iii): NOT MET.** The share sits between the PASS line (1.0 %) and every candidate `p₀`: **24.0 % (24/100, :241, 16:45Z) · 21.9 % (25/114 pooled) and 20.5 % (23/112 verdict population), both frozen at 20:01:34Z** — §K's n = 114. Alias rows restored: 122/2,153 = 5.67 %, no flip.
2. **The window is not one population.** **Eighteen deploys** landed inside it (the staging deploy clone's history); seventeen changed trading code. None is discharged as inert.
- ★ **THE VERDICT IS THE SAME HOWEVER THE WINDOW IS SPLIT.** Counting decisions and maker picks between every pair of consecutive deploys, **all 79 possible stretches with n ≥ 300 hold at least 35 class-(iii) picks and a maker share of 4.82 %–6.11 %** — so PASS is unreachable and NO IMPROVEMENT is unreachable on every split. **A per-deploy inertness argument cannot change the result, so none is claimed.**
- **These 2,096 rows are never pooled with any extension.**
- *Context, not verdict:* the instrument cannot separate a bypass from a thin genuine survivor (the pre-audit's own honest limit, `:231`). The one discriminating sign in hand points to the corrected fee REACHING the decision: the implied maker-over-taker advantage (the recorded EVs with the fill haircut undone, per entry) shifted at the deploy: **before it, 0 of 113 joined decisions (maker and taker) fell below 0.004 — the old fee gap — and the minimum was 0.00464; after it, 62 of the 122 maker picks fall below 0.004** (the new gap is 0.0012). Re-checker's query was lost to a reused scratchpad name; **rebuilt 2026-10-01 as `B_XSTOCK_FEE_CONTRACT_EVIDENCE/rv_context_rebuilt.sql`, which reproduces both figures exactly** (README there). The decision row records no fee, so this is not proof. **This shift stays context: it is an aggregate and cannot discharge a single class-(iii) row, so it does not become the successor's evidence** (Langston).

**Arm B — THE RESULT IS THE DIRECTION: a RISE, with no flip on restoring the alias rows; no PASS/FAIL line exists (`:277`).** **The size is not the fee contract's:** the same restart also shipped OBJ-7 and reset the xStock learning epoch (Langston: report the direction, not the multiple). The window splits at each `B-PRICE-SIDE-BY-JOB` (row 3n) deployment — **the registered clause firing (`:278`, by reference to `:243`), not a grouping of mine.** The table's boundaries are the five 8a increments and `3n.v`; `8a-P4b` and `3n.v` fall either side of an xStock weekend with no trading time, so they act as one boundary. `bc199185e` (8a-P4c inc 1) is the S4/S5 boundary and is NOT discharged for this xStock window. **Split at EVERY in-window deploy (19 stretches, `armb_fine.sql`), B1 rises in 12 of the 13 non-empty stretches; the 13th is 0 admits of 53 gate rows in 23 minutes (`2fbdef295` → `a57aa209f`), where about one admit is expected even at the post-deploy rate — too small to show a direction.** Verdict population; sizes shown for the record only:
| segment (sha and time at each boundary) | B1 VTS admission: gate rows · admits = rate | B2 paper admitted per trading day |
|---|---|---|
| baseline (frozen Step-6: 09-04, 09-07, 09-08, 09-09, 09-10) | n 50,633 · 98 = 0.194 % | 20.6 |
| S0 `b597f1bf2` 09-11 20:09Z → `7d4cdf5a8` 09-14 08:34Z (0.52 trading days) | n 5,285 · 41 = 0.776 % | 48.4 |
| S1 → `7e3d64c84` 09-15 11:59Z (1.14 days) | n 11,135 · 270 = 2.425 % | 236.3 |
| S2 → `323ae2776` 09-19 00:02Z (3.50 days) | n 40,650 · 765 = 1.882 % | 211.7 |
| S3 → `40f22a1bb` 09-20 21:19Z (weekend, 0 days) | empty | empty |
| S4 → `bc199185e` 09-22 14:38Z (1.61 days) | n 15,783 · 250 = 1.584 % | 146.0 |
| S5 → read 09-29 14:00Z; current code (4.97 days) | n 46,457 · 908 = 1.954 % | 173.5 |
**Further limits on the size:** short segments are skewed by time of day (off-hours rates are flat from the deploy on, 12–17× the baseline's off-hours rate) · the row-level B1 rate overstates the loosening (setup-level 6.2 % → 42.3 %, 6.9× against 10.1×) · B2 is not independent of B1 · `3n.v` is shown inert for B1 in code (the xStock VTS reach and min-reward-to-risk gates only tag).
**⚠️ A CORRECTION TO THE PRE-AUDIT'S REASON, not to its number:** `:264` calls 2026-09-07 "a partial Sunday"; **it was Monday, Labor Day (a US market holiday).** The stronger fact is a composition defect: **all 1,748 of that day's gate rows are the 17 alias symbols** (evaluated on crypto prices through the shared cache key, `#1024`). The alias exclusion (condition 6) **does apply to Arm B** (`:279`), so 09-07 adds nothing to B1's rate but sits inside B2's per-day baseline as a structural zero day. The registered figure stands (20.6/day; the pre-registered text is not rewritten); with 09-07 replaced by the prior trading day, 09-03, it is 31.2/day (B1 0.217 %) — the rise holds either way. Also recorded on `#1010` in `RUNNING_ISSUES`.

### ✅ FINAL READ OF RECORD, 2026-10-02 — BOTH WINDOWS CLOSED AT 2026-10-02T20:09:47Z
Run by CC-B, read-only on staging, from the `*_final.sql` copies in `B_XSTOCK_FEE_CONTRACT_EVIDENCE/` (each is the interim file with only its end bound moved to the window's close). Read instants: P8 `p8_q1_final.sql` **2026-10-02T20:26:55Z**; the rebuilt context query **20:31:41Z**; the Arm B readers ran in the same batch, 20:10Z–20:31Z, and their last window row is 20:09:44Z. **Controls first, all passed:** the frozen Step-6 Arm B baseline re-derives exactly (**100 / 54,136; 105; verdict 98 / 50,633 / 103; alias 2 / 3,503 / 2**); the frozen `p₀` rows re-derive exactly (**verdict 23 / 112 = 20.5 %, pooled 25 / 114 = 21.9 %**); the pre-deploy positive control for `r` reads 25 of 25 maker picks at r ≤ 1, as before; **VOID did not fire** — no xStock `maker_taker` row was written in the window (last write 2026-07-15), the two xStock fee rows still read `0.0010` / `-0.0002` from 2026-09-11 20:09:37Z, and the haircut as applied on every post-deploy evidence row is the same in every segment (`maker_fill_probability` 0.50, adverse selection 0.0017925).

**P8 — CLOSED INCONCLUSIVE, AS LANGSTON RULED ON 2026-09-29 (15:14Z). The criterion, as pre-registered (`PRE_AUDIT:239-249`): PASS = zero class-(iii) rows AND maker share ≤ 1.0 % at n ≥ 300; NO IMPROVEMENT = share ≥ `p₀`; anything between = INCONCLUSIVE.** The final numbers, verdict population (17 alias symbols excluded):
- **2,874 decisions, 165 maker picks = 5.74 %** (S0 2/23 · S1 12/256 · S2 35/720 · S3 none, a weekend · S4 18/232 · S5 98/1,643). Between the PASS line and every `p₀`, so INCONCLUSIVE on the share alone.
- **Classes: (iii) 164 · (ii) 1 · (i) 0.** ★ **The one class-(ii) row is new since the interim read (S5, r = 1.2085): the first decision in the window where the corrected maker advantage beat its own threshold at its own entry.** It changes nothing in the verdict, because zero class (iii) is a condition and 164 remain.
- **Buckets for the 164 class-(iii) rows: booked-new 6 · booked-old 0 · no position 158.** The six are the same six as at the interim read (BE, NIO, MRVL, AMC, SPCE ×2); every one booked the new rate (taker `0.001000` ×5, maker `-0.000200` on MRVL and AMC). **No decision in the window booked the old rate.**
- **Alias rows restored: 177 / 2,956 = 5.99 %, 12 more class (iii), 0 booked — no flip.**
- **Decision of record (Langston, 2026-09-29): INCONCLUSIVE, read as "this test could not answer", not "wait longer"; not extended on this instrument.** PASS was unreachable by construction, because class (iii) catches a thin genuine survivor too. **The successor carries the real question:** `B-FEE-BASIS-STAMP` (`#1097`), which stamps the fee rate each decision actually used.

**ARM B — CLOSED. THE RESULT IS THE DIRECTION: A RISE, with no flip on restoring the alias rows. No PASS/FAIL line was registered (`PRE_AUDIT:277`), so the direction is the finding and the size is reported, not judged.** Same split as the interim table; S5 now runs to the window's close. **Trading days are counted as the interim table counted them (UTC calendar time, Saturdays and Sundays excluded; no US market holiday falls in the window); that basis reproduces the interim's S0 48.4, S2 211.7 and S4 146.0 per day.**
| segment | B1 VTS admission: gate rows · admits = rate | B2 paper admitted per trading day |
|---|---|---|
| baseline (frozen Step-6) | n 50,633 · 98 = 0.194 % | 20.6 |
| S0 → S4 | unchanged from the interim table above | unchanged |
| **S5 `bc199185e` 09-22 14:38Z → window close (8.23 trading days)** | **n 79,085 · 1,728 = 2.185 %** | **199.6** |
| **whole window, verdict population** | **n 151,938 · 3,054 = 2.010 %** | **194.3** (2,914 over 15.00 trading days) |
| **whole window, alias rows restored** | **n 156,414 · 3,140 = 2.007 %** (baseline 0.185 %) | **199.7** (baseline 21.0) |
⇒ **Direction: up on both measures, in every segment, with and without the alias rows.** The second reader's query (`rv_armb_main_7c2_final.sql`) returns the same per-segment counts. **The size is still not the fee contract's alone**: the same restart shipped `B-PRICE-SIDE-BY-JOB` OBJ-7 and reset the xStock learning epoch, so the multiple is not attributed (Langston's ruling at the interim read stands).

**Context, rebuilt and still not the verdict** (`rv_context_final.sql`): the implied maker-over-taker advantage before the deploy, **113 joined decisions, 0 below 0.004, minimum 0.00464**; after it, **98 of 177 maker picks below 0.004**, and 2,514 of 2,757 taker decisions, consistent with the new 0.0012 fee gap plus slippage.

**WHAT CLOSES, AND WHAT DOES NOT:** both observation windows are read and closed, so `#1010` closes. **The question P8 could not answer moves to `#1097` (`B-FEE-BASIS-STAMP`), owner CC-B, already placed.** The Arm B loosening is a sized fact that the Phase-25 calibration inherits; it is not a defect.

---

## 1. WHAT WAS WRONG, AND WHAT IT COST

`fee_model|*|xstock_spot` held `spot_taker_fee 0.008` and `spot_maker_fee 0.004` — **byte-identical to the crypto rows**, written 2026-06-10 by `b45-tier1-seed` and never touched since. Kraken Pro's xStocks schedule is a **separate two-rung ladder**: **taker 0.10 %**, **maker −0.02 %, a REBATE the venue pays us**. So the taker rate was **8× too high** and the maker rate carried **the wrong SIGN**.

⭐ **This was a SELECTION defect, not a bookkeeping one.** The taker rate feeds `computeNetExpectancyKernel`, which feeds the SQE's `netEV <= 0` admission gate, the VTS net-EV floor and the RTB rank — **every xStock candidate for three months was graded against a cost eight times the real one.** Signal GENERATION is fee-free (detector geometry is price, ATR and structure), so the candidate SET was never contaminated; only filtering, mode choice and ranking were.

---

## 2. SCOPE OBJECTIVES — CHECKLIST WITH EVIDENCE

| # | objective | verdict | evidence (re-derived at the object 2026-09-12, not recalled) |
|---|---|---|---|
| **OBJ-1** | Correct the two xStock rows; crypto byte-identical | ✅ **YES** | `fee_model` reads `xstock_spot` `0.0010` / `-0.0002`, `updated_by b-xstock-fee-contract` @ 20:09:37.088Z; **crypto still `0.008` / `0.004` on its ORIGINAL `b45-tier1-seed` 2026-06-10 21:50:44 timestamps** — untouched proven on `updated_at`, not only on value (Langston's stronger form). Boot log 20:09:40Z: `[B45][warmup] fee_model verified: … xstock taker=0.001 maker=-0.0002`. |
| **OBJ-2** | Boot rail accepts a rebate, still refuses nonsense | ✅ **YES** | Rail is **taker `(0, 0.05]`, maker `[−0.001, 0.05]`, maker ≤ taker, finite**. Unit cases: maker −0.0002 boots; −0.02 refuses; taker 0 and negative refuse; maker > taker refuses; NaN refuses; the crypto pair boots. Staging restarted clean at 20:09:40Z with the signed value live. |
| **OBJ-3** | A fresh database cannot re-create the defect | ✅ **YES** | The 2026-06-11 seed migration keeps its historical `VALUES` and carries a supersession banner naming the new migration, which is an unconditional `UPDATE` with a post-condition assert on the resolved pair. CI `db:migrate` against an empty database is green on the covering run. |
| **OBJ-4** | One resolver for fee rates (Langston's binding condition) | ✅ **YES** | Census at the ref, production code, unbounded: **exactly two reads of `fee_model` remain** — `cost-model.ts:119-120` (the resolver) and `b72-warmup.ts:229` (the boot assertion). `slippage-fee-model.resolveFee` now routes through the resolver. **Control: the same census finds the test files, so the instrument is not blind.** |
| **OBJ-5** | Every maker-rate consumer handles a negative value | ✅ **YES** | Per-site disposition recorded in the change list; no clamp touches the fee (`cost-cache.ts` bounds slippage and spread only). **Proven live:** a maker exit booked `-0.03387422`, and `netAmount = gross − fees` rises accordingly. `parity-gate.ts:117`'s `avgFeesPerTrade > 0` has **ZERO reach** — the buffer it averages has had no writer since 2026-06-16 (`#1041`, now noted in the System Manual at §10). |
| **OBJ-6** | Stamp the boundary: calibration epochs, xStock only | ✅ **YES** | `calibration_epoch` `xstock_spot`: **`vts 6→7`, `paper_sim 3→4`, and a class-scoped `live` row CREATED at `3`** where none existed (it had been resolving the wildcard `*/live = 2`). **Crypto and wildcard rows did not move** — verified against their pre-image. The bump was gated on the fee pair actually changing, so a re-run moves nothing. |
| **OBJ-7** | The other stored copies, each dispositioned | ✅ **YES** | `cost_model` **deleted wholesale** — `count(*)` returns **0** — with its `b72-warmup` prefetch entry removed in the SAME deploy (`#133`/`#134` closed with it). `calibration_ledger` xStock fee rows corrected to **`0.10%` / `-0.02%`** (`decision_grade` stays true). `system_context` overrides remain NULL. Prose corrected in the System Manual, the System Impact Map, the Kraken reference and the friction modules. |
| **OBJ-8** | Tests: subject vs probe, never blind-swapped | ✅ **YES** | 16 files name fee rates; subject files corrected, probe files re-pointed to named per-class constants. New fence tests assert the migration's literals, the fee-changed gating, the rollback guard and `-v ON_ERROR_STOP=1`. CI green (§4). |
| **OBJ-9** | Measure what the wrong fee did to xStock ranking (read-only) | ✅ **YES** | Among recorded pool members, rank 0 would have changed **CERTAIN in 163, POSSIBLE in 340, of 1,516 cycles (10.8–22.4 %)**, pinned at 2026-09-11 16:00Z so a re-run reproduces every figure. **Limits (i) and (ii) are quoted verbatim in §6 and bound what this may be read to mean.** |

---

## 3. VERIFIED IN BOOKED MONEY — BOTH LEGS

**Taker leg.** Post-deploy VTS xStock entries book `entry_fee_rate` **`0.001000` ×14**, with **zero rows at any other stamped rate**; the 7-day pre-deploy control is `0.008000` ×117 with zero at 0.001 — two-sided. On the staging screen the same rows read **`Taker (0.10%)`, $0.1500 on a $150.00 position**, while a position entered 12 minutes before the deploy still reads **`Taker (0.80%)`, $1.2000**.

**Rebate leg — the first negative fee in this system's history**, booked **2026-09-12 00:16:31.648Z**:

| row | entry (pre-deploy) | exit mode | exit fee | implied rate |
|---|---|---|---|---|
| **CRM/USD** | taker `0.008000` | **maker** | **−0.03387422** | **−0.000200** |
| NEM/USD | taker `0.008000` | taker | +0.15095990 | **0.001000** |

**CONTROL, and Langston graded it higher than I did:** enumerated (not counted) xStock maker exits fall into **exactly two rate values** — `+0.004000` **×92 spanning 2026-07-17 → 2026-09-10**, and `−0.000200` ×1. Eight weeks of the column holding the other value is positive-control grade. Independently, `exit_fee < 0` across `closed_trades` (both legs) and `active_open_positions` returns **exactly one row in all history**.

**UI corroboration:** the paper-trading screen's Day view reads `xstock_spot | 2 trades | fees $2.67`, and that $2.67 is the four fee legs of exactly those two rows **with the rebate inside it** (NEM 1.26088879 + 0.15095990; CRM 1.28776677 + (−0.03387422); sum 2.66574124).

### ⚠️ THE EVIDENCE ROWS CLOSED ON FABRICATED PRICES — AND THE FEE CLAIM IS INDEPENDENT OF THAT

**Stated because a reader who later learns these two trades were bad-quote closes must not think the fee evidence falls with them.** Langston measured, the same night, that both closes were triggered by an after-hours hollow book (CRM `exit_decision_price` **503.50**, from a $7 bid against a $1,000 ask; NEM **86.945**, from 28.50 / 145.39). **That exit-decision defect is real, is NOT this batch's, and is routed to CC-C at plan row 3b.f-c.**

**Why the fee leg survives it, arithmetically:** the fee was applied to the **BOOKED** exit price, not the fabricated decision price. `exit_fee / (quantity × exit_price)` recovers **0.00100000** and **−0.00020000** exactly; the same division against `exit_decision_price` recovers **neither** (0.00139398 and −0.00010379). **Positive control on the method: across 262 pre-deploy xStock closes the identical arithmetic recovers the stamped rate to six decimals — maker `0.004000` ×92, taker `0.008000` ×170, min = max in both.** ⇒ the rate is resolved from the fee rows and is orthogonal to how the exit price was chosen.

---

## 4. CI

⛔ **STATED PLAINLY RATHER THAN ROUNDED UP: the run on the reviewed head `eb5b7831d` was CANCELLED, not green** (run `34628689272`, all four jobs `cancelled` — this branch's CI cancels itself under concurrent pushes from four sessions, a known condition).
✅ **The covering run is `34640169287` on the DEPLOYED sha `b597f1bf2`, all four jobs green** — TypeScript Check (baseline gate) `success` · Test Suite `success` · Build `success` · Docker Build `success` — and **`eb5b7831d` is an ancestor of `b597f1bf2`** (`git merge-base --is-ancestor`, verified). So the reviewed code was covered by a green run; it was **not** covered by a green run *on its own head*.

---

## 5. NUMERIC DELTAS — PREVIOUSLY STATED / NOW

- **PREVIOUSLY STATED:** maker rail floor `−0.01`. **NOW:** `−0.001`. **REASON:** Langston ruling 1.
- **PREVIOUSLY STATED:** "15 test files" carry a fee literal. **NOW:** **16**, of which 10 mention `xstock_spot`. **REASON:** re-derived unbounded at the ref.
- **PREVIOUSLY STATED:** the maker advantage falls 0.40 % → 0.12 %. **NOW:** **both arms fall** — taker round-trip fee 160 → 20 bps, maker-entry round trip 120 → 8 bps, the gap between them 40 → 12 bps. **REASON:** Langston F-4 reword.
- **PREVIOUSLY STATED:** rank 0 would have changed in "188–266 of 1,512 cycles (12.4–17.6 %)". **NOW:** **CERTAIN 163, POSSIBLE 340, of 1,516 (10.8–22.4 %)**, pinned at 2026-09-11 16:00Z. **REASON:** the first method shifted every xStock member by one bound together, which brackets crypto-led cycles but not xStock-led ones; re-derived per cycle.
- **PREVIOUSLY STATED (P8):** falsified if share ≥ 24.9 % at n ≥ 300. **NOW:** **PASS = zero class-(iii) bypasses AND share ≤ 1.0 % at n ≥ 300.** **REASON:** Langston's P8 ruling 16:39Z — no share-only comparator is sound across a drifting window.
- ⛔ **PREVIOUSLY STATED (mine, in the change list): "crypto unchanged" over 533 post-deploy VTS rows. NOW: the claim rests on 19 STAMPED rows of 533** — 514 carry a NULL `entry_fee_rate` (twins and shadow rows carry no fee stamp); **xStock is 14 stamped of 25. REASON:** Langston's Step-8 population correction. **A reader who sees "533 unchanged" would treat 514 NULLs as evidence, and they carry none in either direction.**

---

## 6. A9 LIMITS (i) AND (ii) — VERBATIM, AS REQUIRED

> **(i) Neither count bounds real-world change.** xStock candidates refused at the SQE net-EV gate (`signal_quality_evaluator.ts:362`, `:571`) or evicted at refresh under the wrong fee never entered the pool, so the true reach is larger in ways this data cannot see.

> **(ii) Pool membership is itself fee-dependent, through two channels** — the duplicate tiebreak keeps the incumbent when `existingR >= newR` (`ready_to_buy_service.ts:2207`), and the pair guard drops every symbol that already holds an active trade (`:1836-1840`), and which trades were open depended on earlier fee-priced promotions. So the counterfactual pool is not the recorded pool — for CERTAIN as well as POSSIBLE.

---

## 7. CONDITION C, AND THE ROLLBACK-SNAPSHOT NOTE (Langston, carried here as required)

⛔ **CONDITION C — TWO THINGS CHANGE FOR xSTOCK AT THE SAME INSTANT, AND THEY CANNOT BE SEPARATED IN THIS WINDOW.** The epoch bump **resets every xStock learning aggregate** (the Welford reset on mismatch, `outcome-feedback-store.ts:358`), so xStock restarts from an **empty outcome corpus** — *and* it restarts on a **materially looser EV gate**, because the cost input just fell by ~8×. **Both are correct individually.** Together they compound `#648` / `#596`, and the ~21-day P8 window is also the corpus-rebuild window.
**In plain terms for Kyle:** xStock is simultaneously forgetting what it learned under the wrong fees **and** being offered many more candidates than before — so early xStock results in this window describe a system that is both re-learning and newly permissive, and neither effect can be read alone.

⚠️ **ROLLBACK-SNAPSHOT NOTE:** the rollback migration's five `cost_model` literals are a **2026-09-11 staging snapshot**, restored **with no pre-image assertion**. Zero readers make a wrong restore inert, which is why it was accepted — but it is a snapshot, not a derivation.

⛔ **ROLLBACK ORDER IS A BOOT HAZARD:** `b72-warmup` throws on a prefetched module with zero rows, so restoring a pre-batch sha after this migration ran would **refuse boot**. The rollback SQL re-inserts the five rows and **must be run BY HAND BEFORE any code rollback** (`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/migrations/2026-09-11-b-xstock-fee-contract-rollback.sql`). That rollback is itself a fee change and bumps the xStock epochs again.

---

## 8. THE ONE CONDITION LANGSTON ATTACHED TO THE CLOSE, AND WHAT I GOT WRONG

He rejected a judgement call of mine, and he was right on all three points. **My verify query's `xstock_taker_wrong_rate` counter read `2` on a PASSING result, and I documented that rather than fixing it.**

1. **My stated reason was a non-sequitur** — narrowing the counter's predicate in section (3) never touched section (2), a separate query with its own filter, so the trade-off I claimed did not exist.
2. **The real defect was worse than a confusing number: the counter had NO DISCRIMINATING POWER.** A genuine failure (a post-deploy xStock taker entry stamped 0.008) and a benign pre-deploy-entry close each increment it by 1. **It can never alarm again, and it teaches the next reader to discount it.** A verdict counter that must be hand-adjudicated against another section is a to-do list, not a verdict.
3. ⛔ **`xstock_maker_entry_nonnegative_fee` carried the identical defect and I had not named it** — fixing only the counter he pointed at would have been `fix-follows-pointer`.

**Folded before close (his §9.4 disposition 1):** section (3) is now **two populations** — **(3a) entry-side** filtered on `opened_at`, **(3b) close-side** filtered on `closed_at` — **each printing its own denominator**, so a zero is readable rather than ambiguous with an empty population. `crypto_unexpected_rate` is no longer NULL-blind. New section (1b) prints `rows_in_window / stamped / unstamped_null_rate` per surface and class. **Re-run:** entries 25 (11 unstamped), maker-entry rebate 0, taker-entry wrong-rate 0, crypto 542 (523 unstamped), crypto unexpected 0; closes 2, **maker-exit rebate 1**, no-rebate 0, taker-exit wrong-rate 0, crypto closes 0.

⛔ **AND THE CORRECTED ANALYSIS SQL IS AT `11e39e5b6` AND LATER — IT IS NOT IN THE DEPLOYED `b597f1bf2`.** It is an analysis script, not runtime, so deployed behaviour is unaffected; said here, in the same paragraph as the deployed sha, so nobody reads the fix as deployed.

**My own correction, recorded rather than patched away:** the batch's first verify query filtered on `opened_at >= deploy_at` and **returned 0 rows against a database that held the pass** — an exit fee is resolved at CLOSE, so the first row to carry a new exit rate always opened under the old one. `MISTAKE: wrong-object`. A second `wrong-object` the same night (filtering `calibration_ledger` on `metric_label` when those keys live in `setting_key`) was caught only because a population control sat in the same query. Both are recorded in `MISTAKE_PATTERNS.md`.

---

## 9. GOVERNANCE FILES ACTUALLY CHANGED — transcribed from the Step-10 tier ledger

| tier | document | verdict | one line |
|---|---|---|---|
| **T1** | `BATCH_CATALOG.md` | ✅ | Entry added: defect, deploy sha and instant, both legs measured, Langston's gates, observation state. |
| **T1** | `PHASE_HISTORY.md` | ✅ | Dated plain-language entry: the selection defect, the fix, both legs in booked money, and the lesson about the check rather than the fix. |
| **T1** | `PHASE_19_PLAN.md` | ✅ | Row 2.4-FEE stamped DEPLOYED + Step-8 CONFIRMED + observation open; **new row 2.4f `B-ARCHIVE-RETENTION-SIZING`** placed (Langston's routing of disk alert `74424570`). |
| **T1** | shared `MEMORY.md` + `MEMORY_CC_B.md` | ✅ | FEE REALITY consensus line rewritten per class (it asserted one schedule for both); position block moved to Step 10/11. |
| **T1** | the batch `SCOPE` | ✅ | Written at Step 1, r1.1 at `c891de65a`. |
| **T1** | the batch `PRE_AUDIT` | ✅ | Written at Step 2, approved 16:14Z; r5–r8 fold every Langston ruling. |
| **T1** | this `COMPLETION_REPORT` | ✅ | This document. |
| **T1** | ★ **THE FOUR SESSION TASK LISTS** — `CC_A` · `CC_B` · `CC_C` · `CC_INFRA` (mine is `CLAUDE_NEW_PHASE_19_TASK_LIST.md`, named under an older convention — see the note below) | **✅ mine / N/A ×3** | Batch row added under In flight with what remains (the two observation windows). The other three sessions' task lists were not touched by this batch. ⚠️ **This row is why `gov-ledgerrow` fired (`8d7d977a`): the row's SUBSTANCE was done at close, but it named my list by its real filename, which does not contain the phrase the checker matches on (`session task list`). The requirement and the filing cabinet disagree — only one of the four lists is actually named and filed to the canonical pattern. Recorded as a P5 miss on `B-TASK-LIST-SLOT` (`#1009`, plan row 4.57, CC-A), caused by the naming divergence, not by a skipped step.** |
| **T1** | Langston's `/home/langston/MEMORY.md` | ✅ | Synced in the same turn: verdict, the denominator correction, the folded condition, the routed alerts. |
| **T2** | `SYSTEM_MANUAL.md` | ✅ | §5 now states the landed contract, the signed rail and the epoch boundary; **both** B-4.5 banners carry the per-class outcome; §10 carries the `#1041` note. |
| **T2** | `SYSTEM_IMPACT_MAP.md` | ✅ | The `fee_model` section's *"identical by construction: account-wide tier"* is superseded — per-class values, the widened rail, the deleted `cost_model`, the epoch stamp. |
| **T2** | `RUNNING_ISSUES.md` | ✅ | `#1010` closed; `#133`/`#134` closed as a class; `#592` homed at the new plan row. |
| **T2** | `CHANGES_AND_FIXES.md` | ✅ | Defect, reach, fix, verification and residuals. |
| **T2** | `ADJUSTMENT_FRAMEWORK.md` | ✅ | **New epoch rule 6:** class-scoped rows supersede the wildcard, a bump may have to CREATE one at wildcard+1, and the bump must be conditional on the value actually changing. |
| **T2** | `DELETED_COMPONENTS_LOG.md` | ✅ | The `cost_model` module (5 rows) + its prefetch entry, with the blast-radius control and the rollback boot hazard. |
| **T2** | `MISTAKE_PATTERNS.md` | ✅ | Two `wrong-object` instances with their mechanisms. |
| **T2** | `external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md` | ✅ | §2's heading *"AND WE DO NOT IMPLEMENT IT"* → implemented, with the defect table relabelled as the historical record. |
| **T2** | `drizzle/migrations/MANIFEST.txt` | ✅ | Migration registered; **the rollback file correctly absent** (verified at the ref). |
| **T2** | `POST_AUDIT_ROADMAP.md` | **N/A** | No phase-level roadmap item changed — the batch sits inside Phase 19 at row 2.4-FEE. |
| **T2** | `STORAGE_POLICY.md` | **N/A** | No tier or retention window changed; the disk alert became plan row 2.4f, not a storage-policy edit. |
| **T2** | `AUTHORITY_BASELINE.md` | **N/A** | No constitutional baseline touched; fee rates are DB-governed constants. |
| **T2** | `GOVERNANCE_EXCEPTIONS.md` | **N/A** | No exception was granted or needed. |
| **T2** | `CLAUDE.md` / `CONDUCT.md` | **N/A** | No stable rule changed. |
| **T2** | `BUILD_METHOD_PLAYBOOK.md` · `LANGSTON_ARCHITECTURE.md` · `ALERT_HANDLING_PROTOCOL.md` · `DELIVERY_BOARD_PROTOCOL.md` · `CLAUDE_CODE_FEATURE_WATCH.md` | **N/A** | The method, the reviewer's build, the alert process, the board's fields and the model watch are all unchanged by this batch. |

---

## 10. HONEST RESIDUAL — WHAT THIS BATCH DID NOT ESTABLISH

- ⛔ **It did not establish that the fix improves outcomes.** It establishes that the **rates are right and are being charged**. P8 and Arm B are the outcome questions and they are unread for ~3 weeks.
- ⛔ **The decisions the wrong fee caused are NOT recoverable.** A candidate refused at the gate was never simulated; only stored outcomes are recomputable. OBJ-9's bounds are re-rankings of the **recorded** pool, and limits (i)–(vi) say why that is narrower than *"what the system would have done"*.
- ⚠️ **The entry-side rebate is still unobserved** — predicted-absent with a named mechanism (P8 expects xStock maker entries to fall to ~0 now that taking is cheap), not missing. The three open xStock positions are all pre-deploy taker entries, so the next rebate evidence must again come from an exit.
- ⚠️ **"Crypto unchanged" rests on 19 stamped rows of 533**, plus the stronger `updated_at` argument that the crypto rows were never written at all. There were **zero crypto closes** in the post-deploy window, so no crypto close-side evidence exists.
- ⚠️ **The alias census read Kraken's live catalog, not the scanner's stored universe, and did not filter 23 delisted rows** — over-inclusion is the safe direction; re-run it if `#1024` slips past the window.
- ⚠️ **CI never ran green on the reviewed head itself** (§4). The covering evidence is a green run on a descendant sha plus a proven ancestry relation.
