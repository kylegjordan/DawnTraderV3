# `B-XSTOCK-FEED-SANITY` (`#943`) — STEP 1 SCOPE

**change-class: non_architecture**

> ⛔⛔ **RE-FRAMED 2026-08-29, AFTER LANGSTON APPROVED THIS SCOPE: THIS IS A RE-DISCOVERY, NOT A NEW CLASS.** **`#531` ADDENDUM-2 (19-20 July, CC-B + Langston's own code-read) already documents it:** *“the xStock exit leg guards FRESHNESS but not PLAUSIBILITY”*, fresh-but-wrong unguarded, the `max_fallback_deviation_pct` knob **deliberately retired**, taxonomy bucket (2). **Langston approved splitting it out as `B-XSTOCK-EXIT-PLAUSIBILITY`. Kyle already ruled: *“accept the pricing that comes in at re-open for tonight and observe.”* Its worked example is `AMGN` phantom-stopped `07-17 00:15Z` — the same minute, six weeks earlier, n=6.**
> ⛔ **BINDING CONSTRAINT I DID NOT CITE WHEN PUTTING THE DECISION TO KYLE:** *the plausibility comparator MUST be the pair's OWN price history, NEVER a second venue*; candidate mechanism = **revive the retired per-class deviation band.** ✅ **“Prefer `last`” survives it** — same venue's own print — **but I proposed it not knowing the rule existed.**
> ✅ **WHAT THIS DOCUMENT STILL CONTRIBUTES:** the CAUSE (§9), the SCALE and STRUCTURE (§11-§12), and the COST WITH ITS DIRECTION (§13). **ADDENDUM-2 had the class on 6 rows and no cause.** ⛔ **It is EVIDENCE FOR `B-XSTOCK-EXIT-PLAUSIBILITY`, not a competing batch — Langston to rule.**
> ⚠️ **HOW IT WAS MISSED: my §3 ledger search ran on the COMPONENT** (`equity-spot-archiver`, `parseTickerSnap`, `getLatestEquityTick`). **The prior art is filed under the WEEKEND-POSTURE entry and cites `active-execution-engine` lines. Searching by the component I was standing on could not reach a class filed under the BEHAVIOUR.** `fix-follows-pointer`, logged.

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

### 2.1b TIER 1 — the RETIRED per-class deviation band (`exit_integrity.max_fallback_deviation_pct`), the candidate mechanism named in the header — provenance read 2026-09-02
**Corpora searched:** `git log -S "max_fallback_deviation_pct" --reverse` (not path-limited); the introducing and retiring commits read; `RUNNING_ISSUES` `#531` ADDENDUM-2 (the 07-20 code-read); the surviving references at the ref.
- **INTRODUCED `2a3315db3`, 2026-07-15 — *"P19-B8.5 soak fix C: exit integrity"*.** The hunk, verbatim in effect: the `PRICE_SANITY` gate ran **ONLY when the price source was NOT Kraken** (`if (priceSource !== 'kraken_ws' && priceSource !== 'kraken_rest')`), read the knob per class (`getCachedNumberRequired('exit_integrity','max_fallback_deviation_pct', {exchange:'*', assetClass, …})` — seeded **0.10 for both classes** by `2026-07-15-p19-b8-5-exit-integrity-knobs.sql`), took **the position's OWN last mark as the reference** (`position.currentPrice ?? position.avgPrice`), and **refused to act on a fallback price deviating more than the knob** — *"Missing/cold knob → fallback prices are NOT actionable (fail-safe), loudly"*; *"No reference mark (cold start) → skip, never fire."* ⇒ **its comparator was already the pair's own price history — exactly the binding constraint recorded in this scope's header.**
- **RETIRED the SAME DAY with venue-only pricing** — `2026-07-15-p19-b8-5-venue-only-pricing.sql:9` deletes the knob rows; the engine at the ref still says so (`active-execution-engine.ts:1361`: *"Its exit_integrity.max_fallback_deviation_pct knob is retired with it"*; `startup/b72-warmup.ts:151` names it *"the C prong-2 sanity gate"*). **The reasoning (07-20 code-read, `#531` ADDENDUM-2 verbatim):** *"retired on the reasoning that venue-only made refereeing unnecessary. That reasoning is sound for PROVENANCE and silently does not hold for PLAUSIBILITY — the two are orthogonal, and closing one made it look like both were closed."* With Kraken the only source, the gate's TRIGGER (a non-Kraken source) could never be true, so the whole gate read as dead and was cut.
- **DISPOSITION: (2) — relevant but needs updating to today's intent.** The band's **comparator** (own last mark, per-class knob, fail-safe skip on cold/missing) is the right shape and survives the binding constraint. Its **trigger** is the part that no longer fits: it keyed on the price's SOURCE, and the defect this batch measures (§9.2) is a Kraken-sourced print off a COLLAPSED side of the book. A revived band triggers on **book STATE** — the OBJ-2 book-wide stub predicate and/or a collapsed side at the decision instant (§13.1's `exit_ticker_ask/bid − 1`) — never on source and never on a second venue. ⛔ **NOT designed here (rule 15; the scope is investigation-only until OBJ-0 reads out and sizes the remedy).**

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
| **OBJ-0** ⭐ *(tabled by Kyle 2026-08-31 — the scratch checklist's ⓹; RUNS BEFORE the remedy is scoped, because its result BRANCHES the batch's size)* | **THE BID-DROP DISCRIMINATOR: do xStock bids collapse against their OWN previous value only at the session-transition instants, or through the whole underlying-shut session?** ⛔ Kyle refused the *"what is the intended behaviour off a stub book"* question on an unverified premise; §11's `spread > 20%` is a WIDTH test and cannot answer it. **PRE-REGISTERED DEFINITIONS (fixed 2026-09-02 19:30Z, BEFORE the full run):** *bid drop* = a snap whose `bid ≤ 0.90 × the same symbol's previous bid`, previous snap ≤ 5 min earlier, with the ask within 2% of its previous value (the ask HOLDS — a collapsed side, not a re-price); *wide* = `(ask−bid)/mid > 20%` (§11's test, kept as the comparison column). **Population:** every row of `xstock_spot_ticker_snap` with `bid>0, ask>0`, retention 2026-08-03 → 2026-09-02 (31 daily partitions), all symbols; bucketed by 15-min UTC minute-of-day; the run covers off-hours (`< 13:45` and `≥ 19:30` UTC, the 19:30 run-in keeping the close boundary's previous snap) — **RTH is the negative control, read in full on 2026-09-01.** ⚠️ The archive is 4 s-throttled and value-blind (a SAMPLE): counts are a floor, and a bid drop that lands between two throttled snaps is invisible — stated, not claimed away. | **A per-bucket table of `bid_drops` and `symbols_with_drop` across all 31 days, split weekday/weekend, with the transition buckets (`20:15`, `00:15`, `08:00-08:15` UTC) named against the rest of the off-hours.** **BRANCH RULE, fixed before the read:** drops confined to the transition buckets (the rest of the off-hours carrying drops in ≤ 1% of symbol-minutes) ⇒ a TRANSITION-INSTANT batch, small, and Kyle is NOT asked the stub question; drops recurring through the session ⇒ a session-behaviour decision, Kyle's, and the premise travels with the question. ➕ **ONE-DAY PROBE, 2026-09-01 (full day, RTH included, 7 min 17 s of DB time):** bid drops cluster at `00:15` UTC (65 events / 55 of 479 symbols; 1,084 wide snaps), `08:15` UTC (20 / 17), `20:15` UTC (20 / 13, tapering to 22:15), plus a 3-4-symbol repeater at `11:30-12:00` UTC; `00:30`-`07:00` UTC (the overnight) carried **1 drop in 6.5 h** and single-digit wide snaps per bucket; **RTH `13:45`-`20:00`: 0 drops, 0 wide across ~1.4 M snaps** (the control). ⇒ on one day the read is TRANSITION-INSTANT — and **§11's "stub for ~19 hours" does not reproduce on this day: the overnight is thin, not wide.** Full-retention run launched 19:35Z (job on staging, `obj0_bid_drop.csv`); the branch is NOT called on one day. |
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

## 13. OBJ-4 - THE CONTAMINATION IS **FAVOURABLE-BIASED**, WHICH IS THE DANGEROUS DIRECTION

**All xStock closes carrying a `net_pnl`:**

| population | n | total P&L | avg P&L | win rate |
|---|---|---|---|---|
| **ALL xStock closes (what consumers read today)** | 243 | **-$253.40** | **-$1.043** | **38.3%** |
| **EXCLUDING the `00:15` cohort (the honest book)** | 178 | ⛔ **-$350.83** | ⛔ **-$1.971** | ⛔ **34.8%** |
| the cohort alone | 65 | **+$97.43** | +$1.499 | 47.7% |

⇒ ⛔⛔ **26.7% OF THE xSTOCK POPULATION IS SYNTHETIC, AND IT FLATTERS THE RECORD IN EVERY DIMENSION:**
- **average P&L reads `-$1.043` when the honest figure is `-$1.971`** - the loss appears **47% SMALLER** than it is
- **win rate reads 38.3% against a true 34.8%** - **3.5 points overstated**
- **$97.43 of phantom profit** sits in a book that is actually down $350.83

★★ **THE DIRECTION IS THE FINDING.** Contamination that made results look WORSE would be self-correcting - somebody would investigate. **This makes a losing configuration look roughly half as losing**, which is exactly the bias that survives review and gets built on. ⇒ **It is also why this went unnoticed for six weeks: nothing about the numbers invited a second look.**

### 13.1 THE CONSUMER CENSUS - NAMED, AND THE PER-CONSUMER AUDIT IS **NOT** CLAIMED

**Repo-wide, tests excluded, 20+ modules read `closed_trades`.** The learning- and reporting-critical ones: `calibration_report_service.ts` · `metrics-core.ts` · `behavioral-template.ts` · `c5-financial-diagnostics.ts` · `c13-validation-service.ts` · `c14-validation-service.ts` · `i1-trade-lifecycle-diagnostics.ts` · `daily-brief.ts` · `ai-summary-task.ts` · `replay-ablation.ts` · `ready_to_buy_service.ts` · `active-portfolio-manager.ts` · `exploration-lane.ts` · `routes.ts` · `routes/vts.ts`.

⛔ **I HAVE NOT AUDITED THESE INDIVIDUALLY, AND I AM NOT PRETENDING TO.** A per-consumer walk of 20+ modules asking *"does this one already exclude the cohort?"* is its own batch. **What IS established: NONE of them can be excluding it, because the cohort had no identifier until today and still has only a time proxy (OBJ-2).** ⇒ ✅ **the exclusion question is answerable in one line for all of them right now - none exclude it - and the per-module audit only becomes useful once an identifier EXISTS.**

### 13.1b ✅ THE PER-CONSUMER STATEMENT — CLAIMED 2026-09-02 (census at the ref `origin/migration/aws-supabase`, tests excluded)
**Instrument:** every `from(closedTradesTable)` read in `storage.ts` (11 accessors, **NONE filters by asset class**), plus every direct `closed_trades` reader outside it; each accessor's callers traced. **The cohort measured for the dollar figures = xStock `stop_hit` rows closed inside the `00:15` UTC minute** (the minute-of-close PROXY this batch is replacing — OBJ-2's identifier will re-cut it), `closed_at` 2026-07-17 → 2026-09-02, **n=41**.
| consumer | reads | affected by the cohort? | excludes it? |
|---|---|---|---|
| ⛔ **THE DAILY LOSS BUDGET** — `daily-loss-budget.ts:131` → `getRealizedPnlSince(mode, windowStart)`, window = max(now−24 h, engine session start), `lossPercent = |realizedPnl24h| / portfolioValue` | realized P&L, ALL classes pooled | **YES, in the dangerous direction: the cohort books ABOVE the stop, so the 24 h window reads LESS loss than real and the budget trips LATER.** Measured: 34 of the 41 booked above their stop; **$300.17 booked above the stop in total; booked net P&L −$170.02 vs −$470.19 had they filled AT the stop — the cohort's loss is understated by 64%**; worst single day **$62.18** (2026-08-05, 2 rows). **Control, the 114 xStock stop-outs OUTSIDE that minute: 57 above the stop, $50.36 in total — $0.44/trade of ordinary tick noise against $7.32/trade in the cohort.** | NO |
| guardrail-settings `:129` — the same aggregate, as a loss PERCENTAGE | same | YES, same direction (the file's own comment on an earlier defect: *"the loss PERCENTAGE reads low and the switch trips LATE"*) | NO |
| trade-safety per-symbol cooldown `:249` | the last closed trade for the symbol | YES — a false stop-out starts a cooldown that blocks re-entry on that symbol | NO |
| RTB re-entry gate `ready_to_buy_service.ts:2263` — last `stop_hit` per symbol + strategy | the last stop close | YES — a false stop-out suppresses re-promotion of that pair/strategy | NO |
| exploration anneal `exploration-lane.ts:92,130` — per-class COUNT of exploration closes | a count, not P&L | YES, mildly — a false stop counts as an informative close and tightens the floor sooner | per-class filter only |
| engine stats / portfolio metrics / health — `getActiveEngineStats`, `getClosedTradesCount`, `checkPortfolioHealth`, `getRealizedPnlTotal`, `getDailyRealizedPnlSince`, `getRecentClosedPnls` (routes + APM) | sums over the closed set | DISPLAY — the win rate and P&L Kyle reads are flattered by the cohort | NO |
| position↔trade lookup — `getClosedTradesBySymbol` at APM `:615` / engine `:2398` | the OPEN row for a position | not an outcome read — unaffected | n/a |
| validation services c5/c13/c14; `getTradeHistory` | history / diagnostics | display | NO |
| **event-fed learning sinks** (outcome feedback, pair telemetry, DI — fed by the close EVENT, not the table; `emitTradeClosed` has ONE producer site) | the same booked outcome | YES by construction — **their per-sink census is Step-2 work; not claimed here** | unknown |
| `rtb-shadow-store`, `signal-orchestrator`, `pattern-recognizer` | (comments / isolation invariant only) | not consumers | n/a |
⇒ ⛔ **THE LOAD-BEARING CONSUMER IS THE DAILY LOSS BUDGET: a HARD risk boundary (CLAUDE.md §0 — risk tolerance wins) reads a flattered loss.** Materiality against the trip threshold is a Step-2 read (the threshold and `portfolioValue` are live values, deliberately not asserted here); the DIRECTION is established and it is the wrong one. **This is the first consumer named in this batch that changes what the system DOES, not only what it learns.**

### 13.2 ⇒ SEQUENCING CONSEQUENCE

**The per-consumer audit is downstream of OBJ-2, which is downstream of `#911`'s instrumentation.** ⇒ **Do not schedule it yet.** ⚠️ **But every xStock calibration read taken between 2026-07-17 and the fix is contaminated by a favourably-biased quarter of its population, and any conclusion already drawn from one should be re-checked rather than trusted.**

## 14. ✅ OBJ-2 IS SOLVED - AND §10'S "BLOCKED ON `#911`" WAS MY OWN WRONG-SHAPE ERROR

⛔⛔ **§10 CONCLUDED THE IDENTIFIER WAS BLOCKED ON `#911`'s PER-ROW INSTRUMENTATION. THAT WAS WRONG, AND THE REASON IS THE ONE LANGSTON HAD ALREADY NAMED ONE LEVEL UP: I WENT LOOKING FOR A PER-SYMBOL SIGNATURE FOR AN EVENT I HAD JUST PROVED IS BOOK-WIDE.**
★ **He said a per-SYMBOL spread guard is the wrong SHAPE because the event is book-wide. The identical objection applies to a per-SYMBOL identifier, and I did not carry his point across.**

### 14.1 THE IDENTIFIER - A MARKET-STATE PREDICATE, NOT A ROW PROPERTY

**For each close, measure the fraction of the WHOLE BOOK that was stubbed (`spread > 20%`) within ±90s of it:**

| | n | median book-stub % | **≥ 10%** | ≥ 20% | no snaps |
|---|---|---|---|---|---|
| **00:15 cohort** | 65 | **17.52%** | ✅ **59 (90.8%)** | 6 | 0 |
| all other xStock | 167 | **0.04%** | ✅ **1 (0.6%)** | 0 | 0 |

✅ **At a `≥ 10%` book-stub threshold: SENSITIVITY 59/65 = 90.8%, SPECIFICITY 166/167 = 99.4%.** ⇒ **against 26-29% sensitivity for both per-symbol attempts in §10.**
✅ **AND IT NEEDS NO NEW INSTRUMENTATION** - it is computable TODAY, retroactively, for any close, from `xstock_spot_ticker_snap` alone. **`#911` is not a prerequisite.**

### 14.2 WHY IT WORKS WHERE THE PER-ROW PREDICATES FAILED

§10.1 diagnosed the per-row failure correctly - *"the stub exists at INSTANTS and the nearest snap frequently lands on a normal one"* - **and then drew the wrong conclusion from it.** The fix is not a better per-row observation; it is **to stop asking about the row.** ★ **The condition being detected is a STATE OF THE MARKET, and the market's state is observable from the other 475 symbols even when this symbol's own snap is missing.** ⇒ **the missing observation stops mattering.**

### 14.3 ⚠️ LIMITS, STATED BEFORE ANYONE USES IT AS A GATE

- ⛔ **THE `10%` THRESHOLD IS POST-HOC, chosen after seeing this table. It is NOT pre-registered and must be before it gates anything.** The separation is wide (17.52% vs 0.04% medians) so the exact cut is not delicate, **but that is an argument for picking it deliberately, not for skipping the step.**
- **6 cohort rows fall below it** - closes at `00:15` where the book was NOT broadly stubbed. **Those may be genuine closes that merely coincide with the minute**, which would make them correct exclusions from the exclusion. Untested.
- **1 non-cohort row exceeds it.** If the mechanism is real, that row is a contaminated close the MINUTE PROXY MISSES - **which is the identifier doing its job, not a false positive.** Untested.
- ★ **IT IS STRICTLY BETTER THAN THE PROXY IN KIND: it measures the CONDITION, not the CLOCK** - so it travels to any future occurrence at any time of day, which the `00:15` rule cannot.

### 14.4 ⇒ CONSEQUENCES

- ✅ **`OBJ-2` DELIVERED.** The leg Langston kept with me (his split (a)) is done, and it was never blocked.
- ✅ **`F-G-2`'s xStock legs are unblocked** - it can exclude on a mechanism-based predicate instead of a time proxy. ⚠️ **Langston's both-populations condition should still stand** until the threshold is pre-registered.
- ⛔ **`§10.2`'s claim that the identifier requires `#911` IS WITHDRAWN.** `#911` remains valuable on its own merits; it is not a prerequisite for this.

---

## 13. ⭐⭐ KYLE'S DECISION, 2026-08-31 — Q3 IS ANSWERED, AND `#911`'s BLOCKER HAS LIFTED

> **KYLE, 2026-08-31:** *"xStocks can trade in all four sessions, but there needs to be a way of handling the 8:15 PM price anomaly that happens every night."*

✅ **THIS ANSWERS `XSTOCK_PRICING_DECISION_PATH.md` Q3 — *"may the exit path act during every session?"* — YES.** ⛔ **A session blackout is DECIDED AGAINST and may not be proposed.**

⛔⛔ **BUT §11 AND §12 RESHAPE WHAT HIS DECISION HAS TO COVER, AND HE SHOULD BE TOLD PLAINLY: THE STUB BOOK IS NOT AN 8:15 EVENT.** **ZERO stub books in 8,172,799 snaps during US regular trading; they appear ONLY while the underlying is shut**, across **~19 hours of every weekday and all weekend**. `00:15` is where the CLOSES cluster (82% of the book goes stub in that one minute) — **it is the worst instant of a condition that runs almost all day.**
⇒ ★ **So "handle the 8:15 anomaly" cannot be implemented as an 8:15 rule.** Whatever is chosen governs the entire underlying-shut period. **§11.2 already recorded this: *"refuse the exit" for that whole window is a different proposition from refusing it for one minute."***

### 13.1 ✅ `OBJ-2`'s BLOCKER HAS MATERIALLY LIFTED — RE-MEASURED 2026-08-31

§10.2 recorded OBJ-2's identifier as `exit_ticker_bid`/`exit_ticker_ask` at the decision instant, **blocked on `#911` reaching coverage**, then cited *"6 xStock rows out of 232."*
⛔ **THAT FIGURE POOLED TWO ERAS AND UNDERSTATES TODAY'S STATE.** Split at the `B-EXIT-PROVENANCE` deploy (`2026-08-26 21:23Z`):
| era | xStock closes | carry `exit_ticker_bid` | |
|---|---|---|---|
| pre-deploy | 234 | **0** | 0.0% |
| **post-deploy** | **11** | ⭐ **8** | **72.7%** |
⇒ **the instrument is live and populating.** ⚠️ **n=11 is small and 3 of 11 still lack it — establish WHY those three are unstamped before treating the identifier as available.**
✅ **ANSWERED 2026-09-02 (re-read at the object, all 21 post-deploy xStock closes):** the three unstamped rows are **SKHY/USD 08-26 21:23:07Z, MOH/USD 08-27 00:15:02Z, MRVL/USD 08-27 00:16:02Z — the first three closes after the 21:23Z column deploy, all three BEFORE the code that fills the column existed on the box.** The witness fill (`exitProvenance.tickerBid`) landed in `68930cd35` (B-EXIT-PROVENANCE Step-3, 2026-08-26 21:51Z — 28 min AFTER the deploy that created the columns) and reached staging between 00:16 and 11:25Z on 08-27; the witness itself is a DB read of the latest `xstock_spot_ticker_snap` row with `bid>0 and ask>0` (`depth-source.ts:107-147`, fail-open), not an in-memory map, so boot-coldness is not the cause. **Since the first stamped close (CRM/USD 08-27 11:25:40Z): 18 of 18 xStock closes carry `exit_ticker_bid`** — the identifier is AVAILABLE from 08-27 11:25Z; the three nulls are a deploy-boundary artifact, not a data gap, and are excluded by date. ➕ **What the same 21 rows show, and it corroborates OBJ-0 from the TRADE RECORD rather than the feed:** the witness spread at the exit instant (`exit_ticker_ask / exit_ticker_bid − 1`) is **1.8% – 17.9% on every `00:15` / `20:15` UTC stop-out** (TGT 6.4%, BABA 17.9%, SPGI 12.5%, TRGP 1.8%) and **≤ 0.4% on every other close** (CRM 0.4%, MRNA 0.14%, BE 0.4%, DOW 0.03%, NET 0.07%, FANG 0.2%, INTC 0.07%, MSTR 0.15%, PANW 0.4%, PLTR 0.04%) — no overlap on n=21. ⚠️ **Post-hoc and small: an observation that sharpens OBJ-2's identifier (a collapsed side at the decision instant, measurable per row from `#911`'s columns), NOT a pre-registered gate.**

### 13.2 ⭐ A HARM CUT THAT SURVIVES THE SCHEDULING-ARTIFACT OBJECTION

Everything in §10-§12 keys on the feed. This keys on the **trade outcome**, which no scheduler can fake:
| cohort | n | median (exit − stop)/stop | exits **above** their own stop |
|---|---|---|---|
| **`stop_hit` inside `00:15`** | **18** | ⛔ **+4%** (max +25.9%) | ⛔ **16 of 18 = 89%** |
| `stop_hit` outside `00:15` | 48 | ✅ **−0.004%** | 24 of 48 = 50% |
⇒ **A forced sale must fill at or worse than its stop. Outside the window it does, to four decimals. Inside it, 89% book a price ABOVE the stop they were cut at.** ★ **This is §9.2's mechanism arriving in the P&L: the stub-dragged mid fires the stop, and the booking happens at a real price.**

### 13.3 ⛔ PROCESS — A REDISCOVERY WAS OPENED AND WITHDRAWN THE SAME DAY
`B-XSTOCK-SESSION-TRANSITION` was scoped 2026-08-31 against this same phenomenon and taken through **two reader rounds** before Kyle caught it: *"the answer was already determined."* **WITHDRAWN** — see that file for the full error record.
★★ **THE LESSON, AND IT IS ABOUT THE LEDGER SEARCH ITSELF: I ran `§9.5(b-ii)`, it returned `#943`, and I read the ISSUE while never opening THE SCOPE FILE OF THE BATCH I WAS RE-SCOPING.** ⇒ **the search must ask "has this been WORKED", not "does an issue exist" — a batch with a 35 KB Step-1 scope reads identically to a bare issue number if you only ever grep the ledger.**
