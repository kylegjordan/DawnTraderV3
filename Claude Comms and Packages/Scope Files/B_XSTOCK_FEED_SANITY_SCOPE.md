# `B-XSTOCK-FEED-SANITY` (`#943`) — STEP 1 SCOPE

**change-class: non_architecture**

> **INVESTIGATION-ONLY. NO CODE CHANGES IN THIS BATCH.** The deliverable is an attribution and a disposition, not a fix. **Rule 15: we do not yet know why the print exists, and a deviation threshold chosen before that is a patch.**
> **Owner: CC-C. Placed: `PHASE_19_PLAN` row 3b.b, before `F-G-2` (3c).** Board card exists.

---

## 1. WHAT WAS OBSERVED (the finding, already filed as `#943`)

**The xStock price feed delivers a wrong price at `00:15` UTC on most days, the engine reads it FRESH, and closes positions on it.**

Read at the second in `/var/log/dawntrader/out__2026-08-29_06-24-29.log`:

| time | event |
|---|---|
| 00:14:00 | `NOW/USD price=143.15 source=kraken_equities_ws` · `EXIT_EVAL … sl=128.53571429 distSL=10.2091%` — **10% clear of its stop** |
| **00:15:00** | `[I7-WS-D][CACHE_WRITE] symbol=NOW/USD price=118.75 source=kraken_equities_ws` |
| 00:15:00 | `ENGINE_PRICE_READ … price=118.75 ageMs=1479` — **FRESH. NOT STALE.** |
| 00:15:00 | `EXIT_EVAL … distSL=-8.2406%` → `[EXIT_TRIGGER] type=stop_hit price=118.75` |

**The venue's own book at that instant was `bid 143.20 / ask 143.30`.** Same minute: `TGT/USD` decided at `106.075` against `157.00/167.00`; `WEN/USD` booked a **`target_hit`** at `13.31` on a take-profit of `8.562` the market never reached.

**POPULATION: 65 xStock closes land at exactly `00:15` UTC, 2026-07-17 → 2026-08-29. ZERO crypto, ever.** That is **27.1%** of all xStock `stop_hit` and **29.5%** of `target_hit`. Next-largest single-minute concentration since 08-01 is **4**.

**WHY IT SURVIVED UNNOTICED: the cohort is the profitable half of the book** — `+$97.43` over 65 against `−$350.83` over the other 178. **A false stop firing above entry books a WIN.** And the rows look ordinary: `exit_price` and `exit_ticker_bid` carry the CORRECT market values. **Only the DECISION was wrong.**

**ALREADY RULED OUT, with evidence:** not stale (`ageMs=1479`, so the staleness guard **structurally cannot fire**) · not a midnight restart (`pm2` uptime 18h) · not the `last_known_good` fallback (stamped `kraken_equities_ws`) · not a cron (none at 00:15; the xStock universe cron is 06:00) · not stale-at-open · **entries are NOT affected** (opens do not cluster there; ≤3 per minute-of-day since 07-17 against 65 exits in that one minute).

---

## 2. MANDATORY 1.b — PROVENANCE READ

### 2.1 TIER 1 — the mark computation (`parseTickerSnap`), the object under investigation

**CORPORA SEARCHED, NAMED:** `git log -S` (not path-limited) · `RUNNING_ISSUES.md` · `BATCH_CATALOG.md` · `SYSTEM_IMPACT_MAP.md` · `SYSTEM_MANUAL.md`. **`bridge/canonical/` NOT searched — the component was introduced 2026-07-16, months after the 2026-01/02 governance change, so the pre-governance corpus cannot cover it.** *(Stated rather than silently skipped.)*

**INTRODUCING COMMIT — `184c418818715b7fa0459510fd7ae8f4dea75c58`, 2026-07-16T18:23:14+02:00, QUOTED VERBATIM, NOT SUMMARISED:**

> *"P19-B8.5 xstock open-position marks (fix-on-find, Langston design-APPROVED + Step-4 APPROVED): the exit monitor's venue leg for xstock-class positions = the Kraken WS-EQUITIES feed's latest tick (getLatestEquityTick — the map lives INSIDE equity-spot-archiver, updated in the same parseTickerSnap handler, ONE feed consumer; universe-wide static subscription = no pin lifecycle by architecture) with a BLOCKING class-explicit staleness knob exit_integrity.max_equity_tick_age_ms (xstock_spot 90000ms — a stop must never fire on a stale mark; stale/missing/knob-gone → skip + the escalation rail). Root cause: Kraken spot REST carries NO tokenized equities (empirical: Ticker pair=BIIBUSD AND BIIBxUSD both Unknown-asset-pair while XBTUSD serves; Langston re-derived) — 5 open xstock positions (BIIB/PPG/ISRG/UBER/TYL) had NO marks, stops/TPs not evaluating…"*

**ORIGINAL INTENT, ESTABLISHED:** the mark exists because **Kraken's spot REST carries no tokenized equities at all** — five open positions had no marks and their stops were not evaluating. It shipped **with** a blocking staleness knob, on the stated principle that **"a stop must never fire on a stale mark."**

**DISPOSITION: (1) STILL RELEVANT AND CORRECT.** The mark must exist; there is no alternative source. **This batch does not propose removing or bypassing it.**

**⚠ AND THE PART THAT IS *NOT* ESTABLISHED, marked as the evidence standard requires:** the commit message **never says why the mark is a MID rather than the last print.** The only rationale in the repo is the code comment itself — *"mid from bid/ask when both sides exist, else last."* ⇒ **the mid-vs-last choice is `INFERRED-FROM-CODE`, not established.** **This matters: the investigation must not assume the mid was chosen deliberately for this condition.**

**⚠ AND THE GUARD'S OWN PRINCIPLE IS THE FINDING'S SHAPE.** The batch that built this said *a stop must never fire on a stale mark* and shipped a blocking age gate. **`#943` is a stop firing on a mark that is perfectly FRESH and economically meaningless** — the same harm the guard was built to prevent, arriving on the one axis the guard does not measure. **The guard is not defective; its axis is incomplete.**

### 2.2 TIER 2 — one-line intent notes

- **`getLatestEquityTick` (`equity-spot-archiver.ts:115`)** — read-only accessor for the map above; sole consumer is the exit monitor. Same commit, same intent.
- **`market-hours.ts` (`server/asset_classes/xstock_spot/`)** — owns `isInXstockWeekendClose`, `isXstockMarketOpenUTC`, `isXstockLiquidFillWindowET`. **Read, not changed.**
- **`active-execution-engine.ts:1230`** — the consumer. Reads the mark, falls through to the shared evaluation pipeline.

---

## 3. THE LEDGER SEARCH — AND IT CHANGED THIS SCOPE (§9.5(b-ii))

**Searched by FILE and SYMBOL name, not by symptom.** Three prior issues bear directly on this and one supersedes work I had already done.

### 3.1 `#636` ALREADY MEASURED THE FALLBACK ARM — AND I RE-MEASURED IT WITHOUT CITING IT

`#636` records: *"the mechanism is REAL IN CODE and did not occur ONCE in 24 hours at 437k snaps… the equities feed supplies a two-sided quote on **99.9995%** of snaps… the `last` fallback fired **twice**."*

**I ran that same measurement on 2026-08-29 during F-G-2 (7 days, 14,565,408 snaps: mid 100.000%, `_last` arm 2, carried 0) and reported it as new.** ⇒ **It is a WIDER RE-DERIVATION of an existing measurement, not a new finding, and F-G-2 §18.1 should have cited `#636`.** ★ **This is precisely the failure the pre-scope ledger search exists to prevent, and I hit it one step before the rule fired.**
✅ **USE FOR THIS BATCH: the fallback arm is already excluded as a cause, twice, by two independent windows. Do not re-run it.**

### 3.2 `#559` — A UNIFORM ~15.7-MINUTE ARCHIVE LAG, AND AN EXPLICIT "MEASURE BEFORE ACTING"

`#559` records: *"the equities archive shows a **UNIFORM ~15.7-minute lag on the newest bar across ALL symbols including liquid ones** — an archive-write lag, not a coverage gap. Whether it reaches the exit monitor depends on whether that path reads the live in-memory tick (code says yes ⇒ harmless) or something archive-derived. **Measure before acting.**"*

⚠️ **A ~15.7-minute offset and a `00:15` cohort are suggestive and I am NOT claiming they are the same thing.** `#559` reasons the lag is harmless *because* the exit path reads the in-memory tick — **and `#943` shows the in-memory tick itself carrying a wrong value.** ⇒ **OBJ-1 must test the relationship rather than assume it either way.**

### 3.3 `#594` — `00:15` UTC IS ALREADY ON THE RECORD AS A BOUNDARY, AND THE WATCHDOG SLEEPS THROUGH IT

`#594`'s provenance section refutes an earlier hypothesis thus: *"2026-07-25 **00:15:49Z = Friday 20:15 ET**, i.e. 15 min inside the scheduled Fri-20:00→Sun-20:00 ET weekend close — `market-hours.ts:79`; the watchdog was asleep BY DESIGN, `:335` `if (isInXstockWeekendClose(now)) return;`."*

⇒ **`00:15` UTC = `20:15` ET, and `20:00` ET is a boundary the system already models.** ⚠️ **BUT the `#943` cohort is NOT weekend-only — `PDD/USD` closed at `00:15:05` on Tuesday 2026-08-25.** ⇒ **whatever happens at 20:00 ET happens on ordinary weekdays too, and the weekend-close function cannot be the whole explanation.**

### 3.4 DOES A FIX ALREADY EXIST? — SEARCHED FOR THE CAPABILITY, NOT THE NAME

**A blocking staleness gate exists** (`exit_integrity.max_equity_tick_age_ms`, and per `SYSTEM_MANUAL` the active path replaced the 90s gate with a DB-resolved seconds-scale freshness gate plus a liquid-fill-window gate and a silent-stall watchdog). **NO deviation/sanity gate exists on the VALUE of a mark** — every existing guard is an **AGE** or **LIVENESS** guard. ⇒ ⛔ **The capability is genuinely absent, not merely unnamed.** ⚠️ **That is a statement about what exists, NOT a proposal to build one — see the rule-15 note at the top.**

---

## 4. MANDATORY 1.a — SIM + SYSTEM MANUAL READS

- **`SYSTEM_IMPACT_MAP.md`** — `:321` names `getLatestEquityTick` as an upstream of the exit-provenance surface; `:2111` carries the archiver as a live component; `:2335` the ticker-snap table; `:3462-3463` the C3 fill-safety gates and `#594`'s `lastDataMsgAt` fix, including the census note that **`parseTickerSnap` IS the `latestEquityTick` writer.**
- **`SYSTEM_MANUAL.md`** — carries the C3 gates and the freshness knob. ⚠️ **SILENT on the mark being a MIDPOINT at all** — the same class of gap `#941` corrected on the crypto side, on the other asset class. **Flagged as a governance gap per rule 3; a content update is owed at this batch's close.**

---

## 5. OBJECTIVES + VERIFICATION CRITERIA

| # | objective | verification criterion |
|---|---|---|
| **OBJ-1** | **NAME THE MECHANISM: why does the feed emit this value at `20:00`-`20:15` ET?** Candidates to ELIMINATE, not assume: the underlying US market closing at 20:00 ET leaving a wide/synthetic book · `#559`'s ~15.7-min archive lag · a venue-side settlement or roll · a subscription/resubscribe boundary | **An attribution with a `file:line` or a venue-behaviour citation — or an explicit `UNEXPLAINED`.** ⛔ **A number is not a deliverable here.** Each candidate carries the measurement that eliminated it |
| **OBJ-2** | **A POSITIVE ROW-LEVEL IDENTIFIER for the cohort, replacing the minute-of-close proxy** — `#943` owes this and `F-G-2` currently depends on the proxy | **A predicate computable from a stored row that selects the cohort.** ⛔ **NOT the spread — tested and REFUTED: wide-spread rows outside `00:15` behave in the OPPOSITE direction** (F-G-2 §19). ⛔ **NOT the minute — that is the proxy being replaced** |
| **OBJ-3** | **BOUND THE PHENOMENON IN TIME.** Is it one minute, or a window that merely concentrates there? | **A distribution of the anomaly over minute-of-day across the full retention window (2026-07-01 →), with the population stated.** A single-minute answer and a broad-window answer are different defects |
| **OBJ-4** | **QUANTIFY THE CALIBRATION CONTAMINATION** for consumers that read `closed_trades` | **A per-consumer statement**: which reads are affected, by how much, and whether each already excludes the cohort. ⚠️ **The P&L skew is the load-bearing part — the cohort is the profitable half of the book** |
| **OBJ-5** | **DISPOSITION under rule 24's three outcomes, and WHERE any fix belongs** | **An explicit choice of (1) real defect / (2) working-as-designed but unaddressed / (3) legacy that no longer fits — with the reasoning.** ⛔ **NOT pre-judged, and NO fix is designed in this batch.** If (1), the fix gets its own scope |

---

## 6. WHAT THIS BATCH DELIBERATELY DOES NOT DO

- ⛔ **No code changes.** Not a deviation gate, not a threshold, not a guard. **Rule 15: the structural cause first.**
- ⛔ **Does not re-run `#636`'s fallback-arm measurement** — settled twice.
- ⛔ **Does not touch `F-G-2`.** F-G-2 keeps the `00:15` exclusion as a labelled proxy and reports both populations (Langston's condition 3). **If OBJ-2 delivers a real identifier, F-G-2 may adopt it — that is F-G-2's call, not this batch's.**
- ⛔ **Does not assume the mid was chosen deliberately for this condition** — §2.1's disposition is `INFERRED-FROM-CODE`.

---

## 7. GOVERNANCE OWED AT CLOSE

`BATCH_CATALOG` · `PHASE_HISTORY` · `PHASE_19_PLAN` §1+§5 · `RUNNING_ISSUES` (`#943` updated; `#559`/`#594`/`#636` cross-referenced) · **`SYSTEM_MANUAL` — the silence on the xStock mark being a midpoint, flagged in §4** · `SYSTEM_IMPACT_MAP` if any component fact changes · memory.

---

## 8. PLAIN-LANGUAGE SUMMARY

Once a day, at about eight in the evening New York time, our tokenized-stock price feed reports a price that is badly wrong — and because the price arrives *fresh*, every safety check we have waves it through. The system then closes positions on it. That has happened 65 times since mid-July, and it accounts for about a quarter of all our tokenized-stock exits.

This batch does **not** fix it. It works out **why** it happens, and produces a way to tell those trades apart from real ones in the data. We deliberately aren't designing a fix yet: the obvious one is to reject prices that jump too far, and picking that number before understanding the cause is exactly the kind of patch we've agreed not to ship.

---

## 9. OBJ-1 ANSWERED DURING STEP 1 - LANGSTON'S CONDITION 3 CRACKED IT

> **His condition 3 asked me to name the object and population behind *"the venue's own book was 143.20/143.30 at that instant"*, and predicted that if it came from `xstock_spot_ticker_snap` the arithmetic would be impossible and would point at the writer. It was the highest-yield lead in the batch and it resolved the OTHER way - at the feed, not the writer.**

### 9.1 CONDITION 3, ANSWERED - AND MY ORIGINAL FIGURE WAS FRAMED WRONG

**Object: `xstock_spot_ticker_snap`. Population: snaps for the three symbols in `00:14:50`-`00:15:10` on 2026-08-29.**

| symbol | captured_at | bid | ask | last | mid |
|---|---|---|---|---|---|
| NOW/USD | 00:14:55.665 | 143.20 | 143.30 | 143.20 | 143.2500 |
| NOW/USD | 00:14:59.964 | 143.20 | 143.30 | 143.20 | 143.2500 |
| TGT/USD | 00:15:00.183 | 157.00 | 167.00 | 163.18 | 162.0000 |
| WEN/USD | 00:15:00.183 | 7.70 | 8.36 | 8.21 | 8.0300 |

⛔ **SO THE `143.20/143.30` I QUOTED WAS FROM A SNAP ~1 SECOND EARLIER, NOT THE MARK INSTANT.** The engine wrote `118.75` at `00:15:00.736` and **no NOW/USD snap exists at that timestamp.** ⇒ **`#943`'s phrasing *"the venue's own book at that instant was 143.20/143.30"* is NOT supported as written and is corrected below.** ★ **His instinct that the figure was load-bearing and unsourced was right.**

### 9.2 THE MECHANISM, ESTABLISHED - **THE BID COLLAPSES TO A STUB AND THE MID FOLLOWS IT**

**Each bad mark is EXACTLY the symbol's MINIMUM mid over the retained window** - `NOW/USD` min_mid `118.7500`, `TGT/USD` min_mid `106.0750`, to four decimals, on two independent symbols. **That is not coincidence, and it located the producing book:**

| symbol | bid | ask | **mid = THE MARK** | spread | `last` (CORRECT) |
|---|---|---|---|---|---|
| **NOW/USD** | ⛔ **92.50** | 145.00 | **118.7500** | **44.21%** | 143.20 |
| **TGT/USD** | ⛔ **48.45** | 163.70 | **106.0750** | ⛔ **108.65%** | 163.18 |
| **WEN/USD** | 7.57 | ⛔ **19.05** | **13.3100** | **86.25%** | 8.21 |

⇒ ★★ **THE BOOK LOSES ITS REAL BID (or ask) AND SHOWS A DEEP STUB, WHILE THE OTHER SIDE STAYS NEAR THE TRUE PRICE. Both sides are `> 0`, so the mid arm fires, and `(bid+ask)/2` on a 44-109% spread is a number NOBODY WOULD EVER TRADE AT.**
✅ **AND THE `last` FIELD IS CORRECT THROUGHOUT** - 143.20, 163.18, 8.21. **The `_last` fallback would have produced the right answer; it is not reached because both sides are present.**

**RECURRENCE, not a momentary glitch:** the identical stub books appear at multiple timestamps - `NOW` at 10:52:42 and 12:42:24, `WEN` at 04:35:35, 10:35:36 and 12:42:24. **All three appear together at `12:42:24.08`.**

### 9.3 CONDITION 2 - THE ARM IS **DETERMINED**, NOT INFERRED

**Per-row: all three took the `1 mid` arm** (`bid > 0 AND ask > 0`). ⇒ ✅ **`#636`'s population rate is not being leaned on; the arm for THESE rows is read from the archived snap written in the same call, exactly as he specified.**

### 9.4 CONDITION 4 - SIMULTANEITY, AND IT ELIMINATES EVERY PER-SYMBOL EXPLANATION

**`NOW`, `TGT` and `WEN` all carry their stub book at `12:42:24.08` - the same sweep.** ⇒ **feed-wide or venue-wide, not per-symbol.** ⛔ **ELIMINATED by this: per-symbol liquidity, per-symbol staleness, per-symbol subscription faults.**

### 9.5 CONDITION 1 - THE AXIS SENTENCE RESOLVES, AND IT RESOLVES HIS WAY ROUND

He warned that *"the guard's axis is incomplete"* presupposes a real-but-meaningless value, and that a **writer** defect would make a deviation gate a mask.
✅ **The measurement settles it: the value is REAL** - a genuinely quoted two-sided book, faithfully archived, faithfully averaged. **The writer is correct. The feed is correct. The ARITHMETIC is correct.** ⇒ **it IS a value-plausibility problem, and the axis sentence stands - now conditional-satisfied rather than presupposed.**

### 9.6 ⇒ RULE-24 DISPOSITION, AND THE FIX IS NOT DESIGNED HERE

**OUTCOME (2) - WORKING AS DESIGNED, DECISION MISSING.** Every component does what it was built to do. **Nobody ever decided what the mark should be when the book is not a market.** ⛔ **The batch still designs no fix** - but the candidate is now EVIDENCED rather than guessed: **the `last` price is correct in every observed case, and the spread is the discriminator that the age gate cannot see.** ⚠️ **Whether the answer is "prefer `last` on an absurd spread", "refuse the mark", or "refuse the EXIT" is a design question with a real trade-off - and refusing to act is not free either** (`#594`'s eleven exit-skip alerts are what refusing looks like).

## 10. OBJ-2 - BOTH CANDIDATE IDENTIFIERS TESTED AND BOTH FAIL. THE REASON IS THE USEFUL PART.

With the mechanism known, two predicates looked obvious. **Neither works, and I am recording the failure rather than the hope.**

**All xStock `stop_hit` + `target_hit`, nearest snap within +/-30s:**

| | n | median divergence from venue `last` | p90 | over 5% | median spread | over 20% |
|---|---|---|---|---|---|---|
| **00:15 cohort** | 65 | 1.728% | 9.027% | **17** | 8.219% | **19** |
| all other xStock | 167 | 0.069% | 0.482% | 5 | 0.166% | 2 |

⇒ **The separation is real and strong in the AGGREGATE - the cohort's median divergence is 25x the rest.** ⛔ **BUT AS A ROW-LEVEL IDENTIFIER BOTH FAIL ON SENSITIVITY: `spread > 20%` catches 19 of 65 (29%); `divergence > 5%` catches 17 of 65 (26%). Each MISSES roughly THREE QUARTERS of the cohort.**

### 10.1 WHY THEY FAIL, AND IT IS NOT THE THRESHOLD

**The stub book exists at specific INSTANTS. The nearest snap within +/-30s frequently lands on a NORMAL one** - and §9.1 already showed the sharpest case: **the engine wrote its mark at `00:15:00.736` and NO `NOW/USD` snap exists at that timestamp at all.**
⇒ ⛔ **A row-level predicate CANNOT be computed reliably, because the evidence at the decision instant is not always stored.** ★ **No threshold fixes that - it is a missing-observation problem wearing a threshold problem's clothes.**

### 10.2 ⇒ WHAT WOULD ACTUALLY SOLVE OBJ-2, AND IT ALREADY HAS AN ISSUE NUMBER

**The book that drove the decision has to be recorded ON the trade row.** ★ **That is exactly what `exit_ticker_bid` / `exit_ticker_ask` were built for - and they are populated on 6 xStock rows out of 232 (`#911`, KNOWN OPEN, already a close gate on `B-EXIT-PROVENANCE`).**
⇒ ✅ **OBJ-2's honest answer: the identifier is `exit_ticker_bid`/`exit_ticker_ask` at the decision instant, and it is BLOCKED ON `#911`'s instrumentation reaching coverage.** ⛔ **Not a new batch. Not a new field. An existing open issue whose value this finding materially raises.**
⚠️ **AND THE PROXY MUST THEREFORE STAND FOR NOW.** `F-G-2` keeps the minute-of-close exclusion **and** reports both populations (Langston's condition 3 there) - **that stays the right call, and this measurement is why.**

### 10.3 THE AGGREGATE RESULT IS STILL WORTH HAVING

**A 25x median divergence is decision-grade evidence for OBJ-4** (calibration contamination) **even though it is not a per-row selector.** ⇒ **carried to OBJ-4, not discarded.**

## 11. OBJ-3 ANSWERED - IT IS NOT ONE MINUTE. IT IS A CLOSED-UNDERLYING-MARKET PHENOMENON.

**Population: `xstock_spot_ticker_snap`, 2026-08-22 -> 2026-08-30, `bid > 0 AND ask > 0`. A stub book is `spread > 20%`. ~13 million snaps.**

| UTC hour | ET | snaps | stub books | % |
|---|---|---|---|---|
| **00** | **20:00 (extended hours JUST CLOSED)** | 254,088 | **7,244** | ⛔ **2.851% - THE PEAK** |
| 01-07 | 21:00-03:00 | ~1.39M | ~4,973 | 0.26-0.50% |
| **08-10** | **04:00-06:00 (European morning, US shut)** | 640,656 | **12,434** | ⛔ **1.69-2.41%** |
| 11-13 | 07:00-09:00 (US pre-open) | 1.15M | 4,706 | 0.15-0.78% |
| 14 | **10:00 (US OPEN)** | 1,690,649 | 304 | **0.018%** |
| ⛔ **15-19** | ⛔ **11:00-15:00 (US REGULAR TRADING)** | ⛔ **8,172,799** | ⛔ **0** | ⛔ **0.000%** |
| 20-23 | 16:00-19:00 (after the US close, extended) | 1.28M | 9,596 | 0.30-1.45% |

⇒ ★★ **ZERO STUB BOOKS IN 8,172,799 SNAPS ACROSS THE FIVE HOURS THE US MARKET IS ACTUALLY OPEN. They appear ONLY when the underlying is shut, and PEAK in the hour immediately after extended hours end.**
✅ **THE ANSWER TO OBJ-3: NOT one minute, and not a glitch. It is a STRUCTURAL PROPERTY OF THE TOKENIZED BOOK WHEN THE UNDERLYING MARKET IS CLOSED** - there is no arbitrage anchor, so one side of the quote walks away.
★ **The snap counts corroborate independently: ~1.6M snaps/hour during RTH against ~200k outside. The feed is an order of magnitude busier when the market is open, and clean.**

### 11.1 ⛔ BUT THE CLOSES STILL CLUSTER AT `00:15`, AND THAT IS NOW THE SHARPER QUESTION

**Stub books run at 1-2.9% across MANY hours. The closes are 65 at `00:15` and essentially nothing elsewhere.** ⇒ **exposure alone does not explain the concentration.**

**LEADING CANDIDATE, STATED AS A HYPOTHESIS AND NOT MEASURED: A SURVIVOR EFFECT.** `00:15` is the **first sweep after the underlying shuts.** Positions vulnerable to a stub-book mid are closed on that first exposure - **so the later stub books at 08-10 and 20-23 UTC find nothing left to close.**
⚠️ **NOT ESTABLISHED. What would settle it: the count of OPEN xStock positions immediately before and after each sweep in the shut window** - if the book empties at the first sweep, the hypothesis holds; if positions survive it and are still there at 08:00, it does not.
★ **It matters because it changes the fix's target: if it is a survivor effect, the exposure is EVERY position held across the US close, not a 00:15 edge case.**

### 11.2 ⇒ WHAT THIS DOES TO THE DECISION ALREADY WITH KYLE

**It sharpens it and does not change it.** The trade-off was *prefer the last trade / refuse the mark / refuse the exit*. **OBJ-3 adds: whatever is chosen applies for ~19 hours of every weekday and all weekend - the entire period the underlying is shut - not to one minute a day.** ⇒ **"refuse the exit" is a much larger posture than it looked when this appeared to be a single minute**, and `#531`/`#583` (xStock weekend posture, already open) are the same surface.

## 12. THE `00:15` CONCENTRATION IS ANSWERED - AND MY SURVIVOR HYPOTHESIS IS SUPERSEDED, NOT CONFIRMED

**§11.1 offered a survivor effect as the leading candidate. I tested it, then found a better explanation that is MEASURED rather than hypothesised. Both are recorded; the first is withdrawn as the primary.**

### 12.1 THE SURVIVOR TEST - REAL BUT INSUFFICIENT

**Of xStock positions open just before the sweep, how many close at it? 10 of 35 across 14 days = 28.6%.** ⇒ **A real effect, but the book does NOT empty** - the majority survive and are still open during the later stub windows. ⛔ **So survivorship cannot explain why the later windows produce almost no closes.**

### 12.2 ⛔⛔ THE ACTUAL ANSWER: AT `00:15` **82% OF THE ENTIRE BOOK GOES STUB AT ONCE**

**Stub rate and symbol coverage by minute, hour 00 UTC, 2026-08-22 -> 2026-08-30:**

| minute | snaps | symbols | stub % | **symbols carrying a stub** |
|---|---|---|---|---|
| 00 | 5,225 | 476 | 6.72% | **307** |
| 01-12 | ~4,000 | ~455 | ~1.2% | **~24** |
| 13 | 4,714 | 476 | 7.02% | **306** |
| 14 | 4,393 | 374 | 0.14% | 5 |
| ⛔ **15** | ⛔ **16,053** | **476** | ⛔ **23.55%** | ⛔ **389 of 476 = 82%** |
| 16 | 8,626 | 445 | 11.42% | 124 |
| 17-19 | ~5,500 | ~410 | 3-4.5% | 68-86 |
| 20+ | ~4,500 | ~300 | <1% | ~20 |

⇒ ★★ **`00:15` IS A BOOK-WIDE STUB EVENT: 82% of all symbols quote a broken book SIMULTANEOUSLY, at FOUR TIMES the normal snap volume, decaying over the next four minutes.** **At a typical minute only ~24 of 476 symbols (5%) are stubbed.**

### 12.3 ⇒ THAT IS THE WHOLE CONCENTRATION, AND THE ARITHMETIC CHECKS

**P(a given open position is exposed) is `389/476 = 82%` at `00:15` against `24/476 = 5%` at a typical minute - a SIXTEENFOLD difference.** With the 1-5 xStock positions typically open, that turns a rare event into a near-certainty **for every position at once**.
✅ **Order-of-magnitude check: ~3 positions x 82% x 43 days ~= 106 expected closes; 65 observed.** ⇒ **the right order, and lower than expected rather than higher - consistent with only some stubs crossing a given position's stop or target.**

### 12.4 ⇒ WHAT IT MEANS FOR THE FIX, WHICH IS THE POINT

⛔ **THE EXPOSURE IS NOT "ONE MINUTE A DAY" AND IT IS NOT "EVERY POSITION ALL NIGHT" EITHER.** It is: **a book-wide quote collapse that recurs on a schedule, in which essentially every open position is simultaneously priced off a broken book for a few minutes.**
⇒ ★ **A per-symbol guard is the WRONG SHAPE** - the event is book-wide, so a rule that asks *"is THIS symbol's spread absurd?"* fires 389 times in one minute and is indistinguishable from a rule that asks *"is the book open?"* **The cheaper and more honest question is the second one.**
⚠️ **STILL NOT DESIGNING THE FIX (rule 15)** - but this materially reorders the candidates, and it is the kind of finding that should reach the decision BEFORE it is taken, not after.
★ **AND IT CONNECTS TO EXISTING WORK RATHER THAN COMPETING WITH IT: `#531`/`#583` (xStock weekend posture) are the same surface, and `isXstockLiquidFillWindowET` already exists** - the system ALREADY models "is this a liquid window", and uses it to gate FILLS. **It does not gate EXIT PRICING.** ⛔ **Stated as an observation about what exists; NOT a proposal.**

