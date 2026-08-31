# B-XSTOCK-SESSION-TRANSITION — SCOPE (Step 1) — **r2**

**Batch:** `B-XSTOCK-SESSION-TRANSITION` · **Issue:** `#943` (plan row **3b.b**) · **Owner:** CC-C · **Phase 19**
change-class: architecture

> ⛔ **r2 REBUILT ON A DIFFERENT EVIDENCE BASE. A second reader refuted most of r1's §1, and the premise survived on evidence r1 never used.** Round record at the foot. **Nothing in r1's headline table is retained as a headline.**

---

## 0. ⭐ KYLE'S DECISION, 2026-08-31 — THE SCOPE'S PREMISE

> **"xStocks can trade in all four sessions, but there needs to be a way of handling the 8:15 PM price anomaly that happens every night."**

⇒ ✅ **Q3 of `XSTOCK_PRICING_DECISION_PATH.md` IS ANSWERED: NO SESSION IS CLOSED TO THE EXIT PATH.** ⛔ **A session blackout is DECIDED AGAINST and may not be re-proposed here.**
⇒ **In scope: the TRANSITION INSTANT only.** **8:15 PM ET = 00:15 UTC.**

---

## 1. ⛔ THE EVIDENCE — **THE HARM, NOT THE SPREAD**

**Object:** `closed_trades`, `asset_class='xstock_spot'`, August 2026. **Population:** all 110 closes.

| | |
|---|---|
| UTC **hour 0** holds | **34 of 110** August xStock closes — **the largest single hour** |
| of those 34, falling in minute **`:15`** exactly | ⛔ **30**, across **16 distinct dates** |
| other minutes in hour 0 (`:16`, `:20`, `:46`) | 1, 2, 1 |
| close reasons represented | **both `stop_hit` and `target_hit`** |

⇒ ⭐⭐ **THIRTY CLOSES IN ONE MINUTE OF THE DAY, ACROSS SIXTEEN SEPARATE NIGHTS.** That is the harm, it is direct, and — unlike everything in r1 — **it does not depend on night type, on direction, or on a spread ratio.**

⚠️ **TWO CAUTIONS, STATED WITH THE FINDING:**
1. **I have NOT established the engine's evaluation cadence**, so some `:15` clustering could in principle be a scheduling artifact. ★ **Against that: the near-total absence of any `:15` spike in hours 1-23.** Not conclusive; **OBJ-0 settles it.**
2. **`#943`'s "65-close cohort" is cited in the plan row but I could not locate its definition.** August alone gives 110 closes. ⇒ **OBJ-3 must define its own population; it may not inherit an uncheckable one.**

## 1b. ⛔ WHAT r1 CLAIMED AND WHY IT IS WITHDRAWN — RECORDED, NOT QUIETLY DROPPED

r1's headline was *"the transition frame's median spread is 5× the next frame's, universe-wide (42.90% vs 8.25%)."* **It reproduces — for 2026-08-31 only.**
⛔ **ACROSS 11 FULL NIGHTS IT INVERTS ON 8.** Pooled over 13 nights: frame1 median **5.01%**, frame2 **12.90%** — the opposite of the claim. **It holds on 3 nights and reverses on 8.**
⛔⛔ **AND I NEVER RAN THE BACKWARD CONTROL, WHICH REVERSES THE INTERPRETATION. There are TWO NIGHT TYPES:**

| night type | frame BEFORE 00:15 | frame 1 | frame 2 | what is happening |
|---|---|---|---|---|
| **Monday UTC** (= **Sunday evening ET, the weekly reopen**) — 08-17/24/31 | **42-59% wide** | 8-43% | 6.7-8.1% | ⛔ **ALREADY WIDE, MONOTONICALLY RECOVERING.** The transition frame is **TIGHTER than the frame before it.** |
| **Tue-Fri** — 9 nights | **0.79-1.02%** | 1.70-2.54% | **12.58-15.19%** | tight, then **DEGRADES** through 00:15 |

⇒ ⛔⛔ **`2026-08-31` IS A MONDAY. r1's headline described a RECOVERY and read it as a DEGRADATION.**
⛔ **AND THE BID DOES NOT "DROP FOR ONE READING":** median bid vs the pre-transition frame is **−3.2% at frame 2 and still −2.7% at frame 4**, while the median **mid** moves **0.00% to −0.18%**. ⇒ **a widening that PERSISTS for minutes and is symmetric about the mid — which is §14's conclusion, not a single bad print.**
⛔ **r1's "279 vs 49-62 symbols past 2%" WAS DIRECTION-FILTERED — it counted UPWARD moves only.** On magnitude: **286 / 279 / 363** — a **1.27×** difference, not 5×. ★ **r1's own §5 disclaimed signed direction while its headline column silently applied one.**
⚠️ **AND THE MEANS ARE OUTLIER-DRIVEN AND MUST NOT BE QUOTED** (08-24 mean jump **+39,879%**; 08-31 frame1 p95 885%, max 7,500%). **Medians survive; means do not.**

✅ **ONE THING FROM r1 THAT SURVIVED THE READER'S OWN CONTROL:** running the identical frame1-vs-frame2 computation at **every UTC hour** on 08-27 gives ratios **0.91-1.59 at hours 1-23** and **0.19 at hour 0**. ⇒ **the 00:15 window IS genuinely special. What did not generalise was the SIGN and the MAGNITUDE, not the existence of the effect.**

## 1c. ⛔ THE RELATIONSHIP TO AUDIT §14 — r1 MANUFACTURED A CONFLICT THAT WAS NEVER THERE

r1 claimed §14 missed the anomaly because an *"~80-frames-per-symbol average"* diluted it. **Both legs are false:**
- **Frames per symbol in the 00:15 minute is 4.6-6.9, not ~80** — off by more than 10×.
- **§14's 00:15 control is `wide rows only` (`EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md:920`, population `spread > 5%`), not "all rows in the minute."** Transition frames are **INSIDE** that cohort — roughly 17% of it.
- ⛔ **AND THE DILUTION ARGUMENT DOES NO WORK ANYWAY: isolating frame 1 alone — zero dilution — still gives `pos` = 0.497 (wide-only 0.513) against §14's 0.511. NO bid-collapse signature.**

⇒ ✅ **THE TRUE RELATIONSHIP: §14 MEASURES *STRUCTURE* (`pos`); THIS BATCH MEASURES *WIDTH*. A 43%-wide quote with `pos` ≈ 0.51 IS symmetric widening. THE TWO FINDINGS AGREE BY CONSTRUCTION AND NEED NO RECONCILING.**

★★ **WHAT IS GENUINELY THERE, AND r1 GOT TO THE RIGHT PLACE FOR THE WRONG REASON:** the **bid-collapse-shaped tail is ENRICHED at the transition frame** — `pos > 0.9` runs **13.1% at frame 1 vs 6.7% at frame 3+**, a **2× enrichment**. **`BABA`'s `00:15:00` frame is one of them: `pos` = 0.916.** ⇒ **§14.4's named residual is real and is CONCENTRATED HERE.** That is this batch's actual foothold in §14.

⚠️⚠️ **AND A LIMIT THAT CUTS AT §14 AS HARD AS AT ME: `pos` IS A WEAK INSTRUMENT AT THE TRANSITION.** **94-99% of transition frames carry a `last` byte-identical to the pre-transition frame's** ⇒ `pos` is a **stale numerator over a fresh denominator**, so ≈0.5 is partly arithmetic. It retains power against one-sided collapse but **cannot certify symmetry**. ⛔ **§14's own 00:15 conclusion inherits this limit and should be re-read with it.**

---

## 2. ⛔ PROVENANCE (MANDATORY 1.b) — CORPORA NAMED, AND ONE r1 CLAIM REFUTED

**Searched:** `RUNNING_ISSUES` `#943`/`#531`/`#950`, `PHASE_19_PLAN` 3b.b/3c, `XSTOCK_PRICING_DECISION_PATH.md`, `EXIT_PATH_MACHINERY_AUDIT` §14/§14.4/§14.5, `BATCH_74_SCOPE.md`, plus a repo-wide read census (below).

| thing | original intent | disposition |
|---|---|---|
| the xStock ticker feed | `BATCH_74_SCOPE.md:37` — a **passive archive** sharing **no state** with trading, before xStocks traded | **(2)** relevant, needs updating — it became the trading feed without a decision (`#950`, 3b.e) |
| the exit monitor's mark read | decide on a live venue mark | **(1)** still relevant and correct — the reader is fine |
| ⛔ **session awareness** | — | **(2) relevant but PARTIAL — NOT (3) "disconnected", which is what r1 said and is FALSE** |

⛔⛔ **r1's ABSENCE CLAIM — *"no session awareness exists anywhere, all four sessions treated identically"* — IS REFUTED.** What exists:
- **A binary weekend gate, READ IN THE LIVE EXIT PATH:** `market-hours.ts:79` `isInXstockWeekendClose` / `:104` `isXstockMarketOpenUTC`, consumed at **`active-execution-engine.ts:1073`** and **`trailing-exit-controller.ts:1030`** (plus `vts-runner.ts:3030`, `signal_quality_evaluator.ts:272`, `eval-cycle.ts:332`, `scanner.ts:506`, `session-lifecycle-controller.ts:207`).
- ⛔ **A TIME-OF-DAY LITERAL ALREADY LIVE ON THE EXIT PATH:** `price-discontinuity-detector.ts:214-215` (ex-dividend pre-open block, 7:30-9:30 ET), consumed via `trailing-exit-controller.ts:33` and `tec-evaluator.ts:84`. **OBJ-2 must be written knowing this precedent exists.**
- **Session-shaped code deliberately unwired:** `time-of-day.ts:47` (7 NYSE buckets, telemetry-only by its own header, only caller is a test) · `market-hours.ts:122` `isXstockLiquidFillWindowET` (retired from the fill gate at `active-dispatch.ts:173-177`) · `data-freshness.ts:93-99` records that the closed-market short-circuit **was removed**.

✅ **ACCURATE STATEMENT: one binary weekend gate plus one narrow ex-dividend block. NOTHING distinguishes pre-market / RTH / after-hours / overnight.**
⛔ **AND r1's *"the venue publishes session state and we ignore it"* OVERSTATES THE VENUE: `is_extended_hours` is a **BOOLEAN** — it could never distinguish four sessions.** ✅ **Its zero-reads half IS confirmed:** declared `shared/schema.ts:5036`, written only at `equity-spot-archiver.ts:165`, **no SELECT, no drizzle reference, no raw SQL, no analytics script.** `metadata` jsonb is never populated by that archiver either.
⚠️ **I could find NO venue-side enumeration of four named sessions anywhere in the repo or the data. Kyle's four-session description is taken as VENUE BEHAVIOUR HE HAS OBSERVED AND KRAKEN DOCUMENTS — it is NOT corroborated by anything we store, and OBJ-2 may not depend on it.**

---

## 3. OBJECTIVES

### ⛔ OBJ-0 — SETTLE THE CADENCE QUESTION AND EXTEND THE INSTRUMENT THAT ALREADY EXISTS *(no behaviour change)*
**(a)** Establish the engine's xStock evaluation cadence, and confirm or refute that the `:15` clustering is a market event rather than a scheduling artifact. ⛔ **This is a PRECONDITION of OBJ-1 — if the clustering is a scheduler artifact the whole batch changes shape.**
**(b)** ⚠️ **`exit_tick_cadence_ms` ALREADY RECORDS the inter-frame gap on an exit decision** — populated on **11 of 110** xStock closes since 08-01. ⇒ **do not build a new instrument; establish why it is populated 10% of the time and extend that coverage.**
**Verification:** the cadence question is answered with a number and a control; coverage of `exit_tick_cadence_ms` on new xStock closes is stated.

### ⛔ OBJ-1 — UNCONDITIONAL CORROBORATION ON THE xSTOCK EXIT PATH
**A single frame may not, on its own, drive a stop or target for an xStock position. Re-evaluate on the next frame and act only if that frame also crosses.**
⛔⛔ **NO GAP GATE. THIS IS THE r1 DESIGN CHANGED, AND THE READER'S EVIDENCE IS WHY:** gaps ≥93 s number **45,736 in one day** (2,483 in hour 0 alone), the gap distribution is **smooth and monotone with no bimodality**, and in hour 0 **8.1% of frames follow a ≥60 s gap against ~202 transition frames — a ~20:1 false-positive rate.** ⛔ **AND GAP AND ANOMALY ARE NOT CO-EXTENSIVE: on 08-17 the median pre-transition gap is 5.6 s with only 11 of 473 symbols over 60 s.**
⇒ ★★ **REMOVING THE GATE REMOVES THE ONLY PLACE A NUMBER WAS REQUIRED.** Unconditional corroboration costs **one frame of delay everywhere** and introduces **no threshold of any kind.**
⚠️ **HONEST CONSEQUENCE, NOT HIDDEN: on Tue-Fri nights the wide state PERSISTS through frames 3-4, so corroboration will CONFIRM and the exit will fire. That is correct** — §14 says that state is the real thin market. **This rule only removes single-frame excursions.**
⛔ **KILL SWITCH AND FORCE-CLOSE EXEMPT** (same carve-out as `XSTOCK_PRICING_PLAN` P1).
**Verification:** a synthetic single-frame excursion does not exit; a two-frame persistent move does. **The cost — one frame of delay — is measured and stated, not assumed negligible.**

### ⛔ OBJ-2 — NO THRESHOLDS, AND THE RULE NAMES NO CLOCK
No price floor, clamp or tolerance; **no time-of-day literal; no session name.** *(Kyle 2026-08-27: "every time we've instituted floors and ceilings, it hasn't worked out well.")*
✅ **The reader confirmed this is now SATISFIABLE: the corroboration test is purely causal — the stop comparison is the test.** It was OBJ-1's gap gate that required a number, and the gate is gone.
**Verification:** the diff contains no new numeric constant on the exit path.

### OBJ-3 — WHAT IT WOULD HAVE CHANGED *(analysis, no code)*
Over a **population this batch defines and states** (⛔ not `#943`'s uncheckable 65-close cohort), report how many exits corroboration would have deferred and what the following frame showed.
⛔ **STATED LIMIT, LOAD-BEARING: THE ENGINE'S STREAM AND THE ARCHIVE ARE NOT THE SAME STREAM** (§4 below) ⇒ **a faithful historical replay may be impossible. If so, say so and make OBJ-3 forward-looking rather than fabricating a backtest.**

### OBJ-4 — GOVERNANCE
`XSTOCK_PRICING_DECISION_PATH.md` Q3 marked **ANSWERED** with Kyle's decision and date · `SYSTEM_IMPACT_MAP` · `#943` · **and §14 annotated with the `pos` weak-instrument limit from §1c.**

---

## 4. ⛔⛔ A FINDING THE READER SURFACED THAT IS BIGGER THAN THIS BATCH

**r1 used `BABA/USD` 2026-08-31 as its worked example. The trade's own provenance columns contradict the attribution:**
| field | value | consequence |
|---|---|---|
| `stop_loss` | **116.2167** | r1's *"trigger 112.750"* is `exit_decision_price`, **not the stop** |
| `exit_ticker_bid` / `ask` | **112.00 / 132.00** | ⛔ **the `00:13:27` PRE-GAP frame — not `00:15:00`'s 108.00/119.60** |
| `exit_decision_price` | **112.75** | ⛔ **neither mid(112,132)=122.00, nor mid(108,119.6)=113.80, nor either bid. ZERO archived rows in the surrounding hour carry it.** |
| `exit_tick_cadence_ms` | 79,569 | implies a previous tick at **`00:13:41.111`** — **which has NO archive row** |

⇒ ⛔⛔ **THE ENGINE'S TICK STREAM AND `xstock_spot_ticker_snap` ARE NOT THE SAME STREAM.** The engine acted on a value the archive does not contain.
★ **This is `#943`'s own `NOW/USD` shape — a bad mark coexisting with an intact venue book — and it now has a second instance.** ⇒ **DISPOSITION: recorded on `#943`; it is the RAW-FRAME CAPTURE question (3b.b's armed instrument), and OBJ-3's feasibility depends on it.**
⚠️ **It also means r1's OBJ-1 would not obviously have caught the mark actually recorded here** — which is a further reason the gap gate is gone.

---

## 5. ⚠️ KNOWN LIMITS
- **Night-type split rests on 4 Mondays and 13 weeknights**; nights before 08-10 unexamined.
- **Only ONE xStock exit occurred in the whole 08-31 00:00-00:30 window** — the night r1 measured contributes **n=1** to the harm evidence.
- **`pos` cannot certify symmetry at the transition** (§1c) — this limits §14 too.
- **No venue-side four-session enumeration exists in our data.**
- **Sequencing conflict, stated not resolved: Langston ruled F-G-2 crypto Step 2 next; Kyle then decided Q3 and directed this scope. Langston rules on the order.**

---

## 6. ROUND RECORD
**`REVIEWER r1: claim-only + object · six load-bearing claims · HIT on five · re-derived y`** — refuted r1's headline (holds 1 night of 11, inverts on 8), found the missing backward control that reverses the interpretation, found the direction-filtered count, showed the §14 "reconciliation" was a manufactured conflict with both legs wrong by >10×, refuted the absence claim against seven live call sites, and proved the gap gate fires ~20:1. **It also supplied the evidence this scope now leads with (30 of 34 hour-0 closes at `:15` across 16 dates) and the `pos` enrichment that is the real link to §14.4.**
