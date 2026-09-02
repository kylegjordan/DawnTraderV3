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

## 15. THE FOUR SESSION TRANSITIONS — KYLE'S QUESTION OF 2026-09-02, RESEARCHED (vendor documentation + code + the archive + the trade record)

> **Kyle:** *"at no point have we talked about the 4:15 PM Eastern or the 4 AM Eastern versions of that same phenomenon … previously we were saying that everything outside of the 8:15 transition, particularly in the overnight session, the spreads were just much wider, but the bid price had not dropped dramatically like it does at 8:15 PM. All of that needs to be confirmed."* ⇒ **Confirmed in part, refuted in part — below, by source.**

### 15.1 WHAT THE VENDOR DOCUMENTS SAY (read 2026-09-02; the `vendor-docs-unread` lesson applied BEFORE measuring further)
- **Kraken, *Market hours explained*:** four sessions — **Overnight 8 PM–4 AM ET** (*"Blue Ocean ATS, a venue that provides overnight markets for the underlying equity assets"*), **Pre-market 4 AM–9:30 AM ET** and **After hours 4 PM–8 PM ET** (*"live prices from the extended hours markets of the underlying exchanges such as Nasdaq and NYSE"*), **Market open 9:30 AM–4 PM ET**. Window *"8:00 PM ET on Sunday through 8:00 PM ET on Friday"*, no weekends, no market holidays. *"During non-standard hours, liquidity may be lower, which can lead to greater price volatility."*
- **Kraken, *xStocks FAQ*:** *"During regular market hours, xStock prices are anchored to the official exchange price of the underlying equity. Outside market hours (extended hours and weekends), market makers use alternative data sources including ATS platforms, index futures, and internal models to approximate fair value."* *"Spreads are wider outside market hours."* Ten symbols trade 24/7 (TSLAx, QQQx, SPYx, NVDAx, CRCLx, AAPLx, HOODx, MSTRx, GLDx, GOOGLx).
- **Kraken, *Extended hours trading (EHT)*:** sessions only (4:00–9:30 pre, 9:30–16:00 regular, 16:00–20:00 post); generic risk language (*"wider than normal spreads"*, *"prices … may not reflect the prices on other concurrently operating extended hours trading systems"*); **NOTHING on how quotes behave at a session boundary.**
- **Blue Ocean ATS Trading Rules (the overnight venue's own rulebook, PDF):** *"Subscribers may submit orders to the ATS beginning at 6:15 p.m. ET … Matching … occurs from 8:00 p.m. ET to 4:00 a.m."*; *"The ATS accepts only Limit Day orders … does not accept market orders or pegged orders"*; *"All Limit Day orders on the ATS book are expired and cancelled at the end of the trading session"*; *"a 15% price band such that orders … priced at more than 15% away from the reference price … will be rejected. The reference price is (i) the last sale price of the symbol in the Nasdaq or NYSE Arca Post Session as of 7:50 p.m. ET with respect to orders submitted prior to the beginning of trading on the ATS, or (ii) the inside market for that symbol on the ATS during the hours of operation"* — that is the **2021 BOATS Trading Rules** PDF; the **current Form ATS-N (FY2026, EDGAR)** read by the fresh reader states a **20% band, static per session, around the last SIP print as of 7:30 p.m. ET**, and the same nightly clearing (*"there are no unexecuted orders … when BOATS begins its regular trading at 8:00 p.m. ET"*). The parameters moved; the shape — a limit-only book rebuilt from empty every night inside a wide band — did not; *"trades executed on the ATS are not priced according to and do not relate to the NBBO, which is not available during the ATS' overnight operating hours. Rather, reference prices … are based on best available bid and offer on the ATS at the time of the trade."* No Friday session (no TRF Saturday).
- ⇒ **THE VENDOR-DOCUMENTED SHAPE OF EACH BOUNDARY:** **8 PM ET** = Kraken's reference source HANDS OFF from the exchanges' post-session to a **fresh, limit-only, order-book that is rebuilt from empty every night**, whose only price band is ±15% around the 7:50 PM last sale — **a lone resting bid 10–15% below the last sale is a LEGAL best bid on that book.** **4 AM ET** = that book is **expired and cancelled** and the reference hands back to the exchanges' pre-market. **4 PM ET** = the exchange close hands to the exchanges' post-session (thin, fragmented — the EHT doc's own warnings). **9:30 AM ET** = the opening auction; a full book from the first print. ⇒ **three handoffs into thin or empty books, one into a full one.** Nothing in any document says quotes are pulled or halted at a boundary; the hollow bid is a *property of the receiving book*, not a documented event.

### 15.2 WHAT OUR CODE KNOWS ABOUT SESSIONS: THE WEEKEND, AND NOTHING INSIDE THE WEEK (census at `origin/migration/aws-supabase`, tests excluded; CORRECTED IN THE BODY after the fresh reader's hits were re-derived at the ref, 2026-09-02 21:10Z)
- **ONE session concept exists on the path, and it is the WEEKEND CLOSE ONLY:** `market-hours.ts:79-85` `isInXstockWeekendClose` — Fri ≥ 20:00 ET → Sun < 20:00 ET via `Intl.DateTimeFormat('America/New_York')`; `isXstockMarketOpenUTC(symbol)` at `:104-106` is its negation and **ignores the symbol by a documented decision** (B-NEW-36 (c), 2026-05-20: the ten "24/7" names were measured to carry ZERO weekend feed activity, so the designation was retired — the header at `:13-20` records it; NOT a defect, §9.5(b-ii)). Holidays and half-days are explicitly unmodelled (`:25-29`). It is consumed at FOUR points: the SQE hard-rejects xStock signals in the weekend close (`signal_quality_evaluator.ts:269-287`, reason `xstock_weekend_closure`, entry leg); the engine suppresses the pending-maker hard-drop in it (`active-execution-engine.ts:1072-1074`); **the TEC FREEZES every xStock stop evaluation in it** (`trailing-exit-controller.ts:1024-1045`, reached from `evaluateTECExit`; `#531`'s weekend posture); and the archiver's stall watchdog returns early in it (`equity-spot-archiver.ts:374`). One more ET-clock branch reaches the exit path: the ex-dividend block 07:30–09:30 ET on dividend-seeded symbols (`price-discontinuity-detector.ts:191-221`, via `tec-evaluator.ts:305/390`).
- **NO INTRA-WEEK session concept anywhere on the path:** no RTH / pre-market / after-hours / overnight branch in the engine, the TEC, the SQE, the σ modules, the dispatch, or the archiver (clock-primitive and token sweeps at the ref, former names included; the retired RTH fill-window knobs still travel in `fill-safety-config.ts:36-41` but their only reader is the stall watchdog's reconnect timing, `equity-spot-archiver.ts:393-398`). Kraken's per-tick **`is_extended_hours`** is written by `equity-spot-archiver.ts:165` into `xstock_spot_ticker_snap` — **populated** (measured 2026-09-01: `true` on every off-hours snap, `false` in RTH) — and **read by nothing named** in `server/` or `shared/` (the only column-agnostic reader is the warm-storage exporter's `SELECT *`, `partition-exporter.ts:147,156`). ⇒ **the three intra-week handoffs the vendor documents are invisible to the engine.**
- ⚠️ **AND THE TWO FRESHNESS GATES ARE SESSION-DEPENDENT *BY DATA*, WHICH IS WORSE THAN BLIND:** the exit ceiling's σ_rate is `stddev(ret) / mean(dt_sec)` over a trailing **wall-clock** window (`sigma-rate.ts:87-107`, 30 min at the seed), so sparser off-hours ticks LOWER σ_rate and WIDEN the ceiling — and at the 9:30 open the ceiling is derived from pre-open σ until the cache refreshes (`mark-staleness.ts:30-53` names the open as its own spike case); the fill gate's 15 s floor was derived from **RTH** cadence (`fill-safety-config.ts:19-22`: *"RTH p99 inter-tick gap 8.75s → freshness floor 15s; off-RTH p99 192s"*) and applied 24/5 once `#295` retired the RTH window — so off-hours refusals are the gate working as built, on a number chosen for a different session (Langston's 36-of-39 census).
- **And the flag itself is BINARY** (measured 2026-09-01, every off-hours snap): `true` from the 20:15 UTC bucket to 13:30 UTC, `false` in RTH — it does **not** distinguish after-hours / overnight / pre-market, so even a session-aware guard cannot be keyed on it alone; the clock (in ET, holiday-aware) would be needed — **which is exactly the 20:15 rule Kyle forbade.** ⇒ **the guard keys on BOOK STATE (§2.1b), and the session is telemetry, not a trigger.**
- `REVIEWER: claim-only · "the xStock path has no session concept (a)-(d)" · HIT — (a),(b),(c) hold as stated, (d) is contradicted by the weekend-close predicate at four consumers and the ex-dividend ET block; the σ window and the RTH-derived fill floor make both gates session-dependent by data · re-derived y (every cited line read at the ref, 21:10Z; the ignored-symbol point checked against the module header and found to be a documented decision, not filed)`

### 15.3 WHERE THE BID COLLAPSES, BY THE MINUTE (2026-09-01, all four boundaries, per-minute resolution; drop = bid ≤ 0.90 × own previous bid ≤ 5 min earlier with the ask within 2%)
| boundary (ET → UTC) | the minute | snaps that minute | symbols quoting | bid drops / symbols | wide (>20%) snaps |
|---|---|---|---|---|---|
| **8 PM ET → 00:00 UTC** | `00:00`–`00:14` | 570–750 / min | 220–345 | **1–4 / min** (ordinary) | 5–17 |
| | ⛔ **`00:15`** | **3,237** | **478 of 479** | **47 / 47** | **741** |
| | `00:16` | 1,707 | 378 | 8 / 7 | 184 |
| | `00:17`–`00:25` | ~1,000 → 700 | 300 → 150 | 1–3 | 53 → 1 |
| **4 AM ET → 08:00 UTC** | `08:05`–`08:14` | 800–1,350 | 160–440 | 1 / min | 0–13 |
| | ⛔ **`08:15`** | **3,174** | **475** | **8 / 8** | 47 |
| | `08:16`–`08:33` | 800–1,400 | 200–370 | 1–3 | 4–27 |
| **9:30 AM ET → 13:30 UTC** | `13:21`–`13:40` | 1,200–1,600 | 255–479 | 1–3 / min | 0–5 |
| **4 PM ET → 20:00 UTC** | ⛔ **`20:15`** | **3,457** | **479** | **8 / 8** | 62 |
| | `20:16`–`20:36` | 900–1,800 | 330–479 | 0–5 | 7–21 |
⇒ **(a) The event is a WHOLE-BOOK RE-QUOTE BURST: in one minute every symbol re-quotes (3,200–3,500 snaps vs ~700 in an ordinary minute), and the collapsed bids ride inside that burst.** **(b) It lands at `:15` past the hour on all THREE thin-book handoffs — never at `:00`, the documented boundary — and the exchange OPEN (9:30 ET) produces NO burst and no drop cluster.** **(c) 8 PM ET is the big one by symbol reach (47 symbols on this day, 72 median across nine weekdays); 4 PM ET is the same shape, smaller; and 4 AM ET is a DIFFERENT shape — a TIGHTENING burst, not a collapse:** at `08:15` UTC on 09-01, at a 3% threshold, bid RISES (116) and ask DROPS (119) outnumber bid drops (51) two-to-one (re-derived 21:20Z, `xstock_spot_ticker_snap_2026_09_01`, per-symbol LAG) — the exchanges' pre-market book replacing Blue Ocean's wide overnight book. The 8 ask-holding ≥10% drops the pre-registered definition counted there are real but a side-show; the trade record's zero damage at 4:15 AM ET (§15.6) is consistent with that.
✅ **THE `:15` OFFSET — ESTABLISHED AS A PROPERTY OF THE FEED WE RECEIVE (fresh reader R1, re-derived 21:20Z); its CAUSE on Kraken's side stays unread.** (i) The feed's own 1-minute OHLC bars land in our archive **p50 952 s (p05 912 s, p95 963 s) after their own `interval_begin` label** — 205,581 bars, 2026-09-01 — where a real-time bar would land within ~65 s: **the data Kraken sends is ~15–16 minutes behind its own labels, on every bar, all day.** (ii) Kraken's `is_extended_hours` flag flips at **13:45 / 20:15 UTC** (09:45 / 16:15 ET) and the RTH-cadence window in our archive is exactly 09:45–16:15 ET — the whole feed runs a quarter-hour late, not just the boundaries. (iii) On Sunday 08-31 both our archiver AND an independent raw-frame socket saw NOTHING from 00:00 to 00:15 UTC and the first frames at 00:15:00.3 — the week opens for us at 20:15 ET. (iv) No archiver reconnect, stall or restart is logged at any burst minute on 08-27/28 or 09-01/02, and the burst arrives 0.3–0.8 s after `:15:00` on the independent socket — **it is not our capture.** `#559`'s *"uniform ~15.7-minute archive lag"* was this: feed lag, mis-named. ⚠️ **What the objects do NOT settle:** whether Kraken consumes a 15-minute-delayed reference (the Bloomberg/BOATS non-subscriber delay is 15 min) or its market makers run a `:15` schedule — indistinguishable from our side; the equities `ticker` payload carries **no timestamp field** (24,013 frames inspected), so it can never be read off ticker rows. ⚠️ **AND THE INSTRUMENT I CALLED FOR ALREADY EXISTS — I had not censused for it:** `/usr/local/bin/rawcap.cjs` runs from cron at **00:05 UTC for 20 minutes** on its own socket (ticker for 20 symbols + depth-10 `book` for NOW/TGT/WEN) to `/var/log/dawntrader/rawcap-<iso>.jsonl`, 10-day retention — it covers the 8:15 PM ET boundary only; extending it to the 20:15 and 08:15 UTC windows is the Step-2 ask, not building a new one. Its frames show the collapse as **bid levels vanishing to 0–2 and rebuilding over 10–40 s while `last` does not move** (WEN bid 8.28 → 0.002 at 00:15:00.613Z, `last` 8.31) — a pulled book, not a re-price.

### 15.4 HOW LONG THE BID STAYS COLLAPSED — RECOVERY AT THE 8 PM ET HANDOFF (2026-09-01, the 47 symbols that dropped in `00:15`–`00:16`; recovery = bid back within 2% of its pre-drop value)
| drop size | value |
|---|---|
| mean / max drop vs own previous bid | **17.6% / 63.3%** (CTVA 81.44 → 29.92; EWN 64.34 → 24.32; LECO 245 → 129.21) |
| mean spread at the drop | **31.1%** of mid |
| gap between snaps around the drop (median) | **6 s** — **there is NO multi-minute feed silence in the archive** at this handoff |
| recovered within 60 s | **28 of 47** |
| within 5 min | 7 |
| within 30 min | 1 |
| **more than 4 hours (through the whole overnight)** | ⛔ **11 of 47 = 23%** (ARE recovers 05:35 UTC, COR 08:22 UTC — i.e. at the 4 AM ET handoff back to the exchanges) |
**The same read on the busiest day of the run, 2026-08-05, by ZONE (drop = the pre-registered definition; recovery = bid back within 2% of its pre-drop value, bounded lookahead 4 h):**
| zone | drops | symbols | mean / median drop | mean spread at the drop | recovered < 60 s | < 5 min | < 1 h | > 1 h or never |
|---|---|---|---|---|---|---|---|---|
| T 8:15 PM ET (00:15–00:30Z) | 85 | **78** | 20.2% / 14.2% | 32.4% | 38 | 7 | 13 | ⛔ **27 (32%)** |
| T 4:15 AM ET (08:00–08:30Z) | 63 | 33 | **30.4% / 28.1%** | 45.8% | 38 | 8 | 9 | 8 |
| T 4:15 PM ET (20:15–20:30Z) | 34 | 25 | 18.1% / 13.6% | 25.7% | 12 | 9 | 2 | 11 |
| pre-market body (08:45–13:30Z) | **661** | **41** | 25.3% / 18.5% | 44.2% | **551 (83%)** | 47 | 50 | 13 |
| after-hours body (20:45–23:59Z) | 94 | 10 | 13.2% / 12.5% | 19.9% | 18 | 31 | 34 | 11 |
| overnight body (00:45–07:59Z) | 5 | 4 | 14.9% / 16.7% | 24.6% | 0 | 1 | 1 | 3 |
| edges (13:30–13:45Z, 19:30–20:15Z) | 100 | 17 | 25.8% / 14.8% | 41.7% | 77 | 17 | 4 | 2 |
⇒ **Two different animals.** The HANDOFFS hit MANY symbols once each (78 names at 8:15 PM) and a THIRD of them stay collapsed for over an hour. The PRE-MARKET BODY's 661 drops sit on only 41 names — ~16 repeated flickers per name — and 83% recover within a minute: **a small set of names whose bid flickers all morning, not the whole book.** The after-hours body is 94 drops on 10 names. ⇒ a book-state guard sees both; a count of drops alone mistakes the pre-market flicker for the bigger problem.
⇒ **Kyle's account holds for three-quarters of the affected names (one collapsed reading, then normal within a minute) and FAILS for one in four: those bids stay collapsed for the ENTIRE Blue Ocean session.** So the handoff is BOTH a transition instant AND, for ~2% of the universe (11 of 479), a session-long condition. ⇒ **a guard that acts on book STATE covers both; a guard on the clock covers neither properly.**

### 15.5 THE SAME READ ACROSS DAYS (the OBJ-0 full run, first 9 weekdays 2026-08-03 → 08-13; weekend 08-08/09 shown; cells = bid drops / symbols with a drop; the run continues to 09-02)
| day | 4:15 PM ET (20:15–20:30Z) | 8:15 PM ET (00:15–00:30Z) | 4:15 AM ET (08:00–08:30Z) | 9:30 AM ET (13:30Z) | after-hours body (20:45–23:45Z) | overnight body (00:45–07:45Z) | pre-market body (08:45–13:15Z) |
|---|---|---|---|---|---|---|---|
| 08-03 Mon | 37/23 | 93/72 | 66/35 | 5/3 | 60/41 | **106/32** | 105/58 |
| 08-04 Tue | 34/24 | 98/90 | 84/34 | 6/5 | 76/41 | 56/24 | 345/110 |
| 08-05 Wed | 54/32 | 85/78 | 124/39 | 16/3 | 94/48 | 5/5 | **661/113** |
| 08-06 Thu | 37/20 | 71/65 | 150/45 | 8/4 | 99/67 | 18/10 | 322/86 |
| 08-07 Fri | 58/30 | 48/48 | 106/38 | 2/2 | 84/58 | 8/4 | 253/92 |
| 08-08 Sat | 0/0 | 74/71 (Friday's 8 PM handoff) | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| 08-09 Sun | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| 08-10 Mon | 69/32 | 59/59 | 108/41 | 1/1 | 60/42 | 41/14 | 288/110 |
| 08-11 Tue | 47/25 | 76/72 | 82/35 | 3/2 | 101/67 | 11/8 | 391/94 |
| 08-12 Wed | 19/9 | 63/60 | 67/33 | 1/1 | 62/38 | 12/5 | 263/90 |
| 08-13 Thu | 50/20 | 83/77 | 65/34 | 10/3 | 65/44 | 88/23 | 111/69 |
| **weekday median (n=9)** | **47 / 24** | **76 / 72** | **84 / 35** | 5 / 3 | **76 / 44** | 18 / 10 | ⛔ **288 / 92** |
⇒ ⛔ **THE EARLIER CLAIM IS REFUTED FOR TWO OF THE THREE OFF-HOURS SESSIONS.** *"Outside 8:15 the spreads are wider but the bid does not drop dramatically"* is TRUE of the **overnight body** (the Blue Ocean session itself: median 18 drops / 10 symbols across 7 hours) and FALSE of the **after-hours body** (median 76 / 44 in 3 hours) and emphatically FALSE of the **pre-market body** (median 288 / 92 in 4.5 hours — MORE collapsed bids than any transition instant, on a quarter of the universe). ⇒ **The calm session is the one fed by the single consolidated limit book (Blue Ocean); the noisy ones are the two fed by the exchanges' fragmented extended-hours quotes.** The 09-01 one-day probe (pre-market ~30 drops) was a QUIET day — a one-day read would have called the branch wrong, which is why the branch rule waits for the full run. ⚠️ **TWO CORRECTIONS TO HOW THE FULL RUN MUST BE READ (fresh reader R1, re-derived):** (1) **an archiver RECONNECT produces a look-alike burst** — a 479-symbol minute of stale-book snapshots with 20–27 >3% moves and, on Monday 08-31 00:00/00:13 UTC, median spreads of 58% — so every burst minute is checked against the archiver's reconnect/stall/restart lines (`error__*.log`, 15-day retention; `out__*.log` for restarts, ~4 days) and, for days older than the logs, against the signature itself (rows = symbols ≈ 479 in one minute with median spread > 20%); the Monday `00:00` buckets in the table above (08-03: 31 drops) are that artifact. (2) **The pre-registered predicate (bid ≤ 0.90 × previous, ask within 2%) UNDER-COUNTS the damaging handoff events** — in the trade record's worst rows BOTH sides move (SPGI 09-02 00:15:04 bid 439 → 417.51 AND ask 441 → 469.79; TGT bid 157 / ask 167), which fails "ask holds". The pre-registered count stands as registered; the read-out ALSO publishes, labelled POST-HOC, a hollow-book count — spread > 20% of mid with the bid ≥ 10% below the prior mid and `last` unchanged — because that is the shape that reaches `closed_trades`.

### 15.6 WHAT REACHES THE TRADE RECORD, BY ZONE (every xStock `stop_hit` since 2026-07-17, n=153; the stub fingerprint = booked more than 1% ABOVE the stop it was cut at; `stop_loss` and `exit_price` on the row)
| zone of the close (UTC clock proxy) | stop-outs | booked >1% above the stop | $ booked above the stop | median exit vs stop |
|---|---|---|---|---|
| ⛔ **8:15 PM ET handoff** (00:15–00:30Z) | **42** | **32** | **$300.17** | **+2.81%** |
| ⛔ **4:15 PM ET handoff** (20:15–20:30Z) | **14** | **7** | **$39.12** | **+1.25%** |
| 4:15 AM ET handoff (08:00–08:30Z) | 3 | 0 | $0.00 | −0.04% |
| after-hours body | 3 | 0 | $0.04 | +0.03% |
| overnight body | 10 | 0 | $0.26 | −0.06% |
| pre-market body | 20 | 0 | $0.34 | −0.09% |
| RTH (13:30–20:15Z) | 61 | 1 | $10.60 | +0.02% |
⇒ **THE DAMAGE IS AT TWO HANDOFFS, NOT ONE: 8:15 PM ET carries most of it, and 4:15 PM ET carries half its stop-outs with the same fingerprint — the 4:15 PM transition was never discussed and it IS in the record.** The 4:15 AM handoff and all three session BODIES have produced NO stub-priced closes despite the pre-market body carrying the most bid drops of all. ✅ **WHY — MEASURED, and my first hypothesis ("the σ-ceiling skips most pre-market exit checks") is REFUTED (fresh reader R3, 21:25Z; instruments named, none of it reported fact):** (i) the ceiling CANNOT suppress a collapsed print at arrival — the mark's age resets to zero on every snap (`equity-spot-archiver.ts:145`, `active-execution-engine.ts:1200`), so it only withholds evaluation while the PREVIOUS mark ages; (ii) on the three weekdays where both the skip log (stderr, 15-day retention) and the evaluated log (stdout, ~4-day retention) exist, held xStocks were evaluated on essentially every 1.5 s tick in pre-market (PLTR 2,399/h, INTC, MSTR, PANW, BE ~100%), the skips concentrating on ONE slow-quoting name per day (DE 09-01, MDT 09-02); across eleven weekdays the skip share by pre-market hour is **0.8–17.9%**, not "most" — the "most" impression came from two WEEKENDS (341,580 of 497,331 skip lines, market closed). (iii) **The actual reason: the collapsers are a THIN-CADENCE 40-NAME SUBSET WE DO NOT HOLD.** On 09-01's pre-market census (263 events, 40 symbols; WST alone 157), collapsing names quote a median of 87 snaps in the window against 256 for the rest and 1,400–3,700 for the names we held; **joined to every held xStock position across 102 position-days since the snap archive begins (08-03): ZERO collapse events on a held name** (re-run by CC-C at the object 22:37Z — same 102 / 67 / 0 / 0, same 142,330-snap positive control), and the deepest held-name pre-market drops (PWR −6.6%, SYK −6.3%, DD −4.2%) left the mid 1.5–20% above the stop. The 23 stop-outs closed 04:00–09:30 ET (= §15.6's 20 pre-market-body rows plus the 3 in the 08:00–08:30 UTC handoff zone, which the table counts separately) are all small-step crossings with bid, ask and `last` within ~1% of the stop — genuine. ⇒ **What protects the pre-market is SELECTION, not the ceiling: we do not hold the names that flicker** — plausibly because the entry-side freshness, depth-sufficiency and price-liveness gates exclude thin-cadence names (a hypothesis; the cadence contrast is measured, the causal link to the gates is not). **Nothing protects the two handoffs, where the hollow print arrives FRESH (`ageMs=1479` on NOW/USD) on names we DO hold, inside a whole-book burst.** ⚠️ And the evaluator reads the **MID**, never the bid (`mark-kind.ts:2-3`): in 257 of 263 pre-market collapses the mid fell ≥ 5% while `last` fell ≥ 10% in none — the collapse is Kraken's token book, not the underlying.

### 15.6b THE FRESH-READER RECORD (Kyle's instruction: a second reader before Langston; three readers, one claim each, claim-only, read-only)
- `REVIEWER: claim-only · "handoff mechanism + the :15 delayed-feed hypothesis" · HIT ×4 — (1) the feed is ~15–16 min behind its own OHLC labels (p50 952 s) and the flag flips at 09:45/16:15 ET: the offset is the feed's, cause unread; (2) the 4:15 AM ET event is a TIGHTENING, not a collapse; (3) archiver reconnects produce look-alike bursts that must be excluded; (4) `rawcap.cjs` already exists and the ticker payload has no timestamp field · re-derived y (OHLC lag and the 08:15 rises/drops re-run at the object 21:20Z; the ATS-N band figures taken from the reader's EDGAR read, marked as such)`
- `REVIEWER: claim-only · "the xStock path has no session concept (a)-(d)" · HIT — see §15.2 · re-derived y`
- `REVIEWER: claim-only · "pre-market collapses do no damage because the ceiling skips the checks" · HIT — REFUTED: the ceiling cannot reject a fresh print; held names were evaluated ~100% of pre-market ticks; the collapsers are a thin 40-name subset never held (0 events on 102 held position-days) · re-derived y (the mark-age reset and the mid-not-bid read re-read at the ref; the 102-position-day join and its positive control re-run by CC-C at the object 22:37Z — 102 / 67 / 0 / 0; 142,330 snaps, 98/102 with snaps, worst held step −6.63%; the skip/evaluated hour ledgers NOT re-run — they carry the "0.8–17.9% skip share" figure only, which is not load-bearing on any leg)`
⛔ **A HIT is a lead and a CLEAN is not evidence: the three hits above moved the body ONLY after re-derivation at the object; nothing in this scope cites a reader's silence.**

### 15.7 ⇒ WHAT THIS DOES TO THE BATCH
1. ⚠️ **DESIGN CONCLUSION, NOT A MEASUREMENT (labelled on Langston's condition (d); the remedy is designed in the next revision, §2.1b and §6 stand):** **the remedy is NOT a transition-instant rule and NOT a session rule — it is a BOOK-STATE guard** (§2.1b): collapsed bids occur at three handoffs AND recur through two session bodies AND persist for a quarter of the affected names all night. Only a per-tick test of the book itself covers all of that. This is also the only shape consistent with Kyle's three constraints (no blackout, no 20:15 rule, own-history comparator).
2. **The damage cohort for OBJ-4 widens from one handoff to two** (8:15 PM and 4:15 PM ET); the daily-loss-budget figure in §13.1b (n=41, $300) is the 8:15 PM half only — the 4:15 PM half adds 7 fingerprinted rows and $39.
3. **OBJ-0's branch rule (§5) is answered on the evidence so far as: NOT transition-instant.** Formally called only when the full run completes (the pre-market body alone decides it), but nine weekdays already exceed the branch threshold by two orders of magnitude.
4. **What Step 2 owes, after the readers:** (i) the `:15` offset is settled as a feed property (OHLC lag p50 952 s) — the remaining question, Kraken-side cause, has no instrument on our side; **extend the EXISTING `rawcap.cjs` capture to the 20:15 and 08:15 UTC windows** (three boundaries, depth on the held names) rather than build one; (ii) the pre-market question is ANSWERED (selection, not the ceiling) — what remains is the causal link between the entry-side gates and the thin-name exclusion, a census of which gate rejects the 40 flickering names; (iii) the reconnect-minute exclusion and the post-hoc hollow-book count for OBJ-0's read-out (§15.5).

## 16. OBJ-0 READ-OUT — THE FULL RUN (2026-08-03 → 2026-09-02; job launched 18:35Z, complete 22:05Z 2026-09-02; `obj0_bid_drop.csv` + `obj0_readout.py` on staging; every number below re-derivable from those two files)

**Instrument, as pre-registered (§5 OBJ-0):** drop = `bid ≤ 0.90 × the same symbol's previous bid`, previous snap ≤ 5 min earlier, ask within 2% of its previous value; 15-min UTC buckets; off-hours + the 19:30 run-in; all symbols; `xstock_spot_ticker_snap`, 31 daily partitions. **Exclusions applied at BUCKET granularity (§15.5): any 15-min bucket containing an archiver reconnect / stall / restart minute** (129 log-derived minutes 08-19 → 09-02 in `obj0_reconnect_minutes.txt`; 24 signature minutes — rows = symbols ≥ 470 with median spread > 20% — across all days in `obj0_reconnect_sig.csv`; the signature set is every Monday 00:00/00:13 UTC = the Sunday-open snapshots of the stale Friday book, plus eight weekend/reconnect minutes; **none of the 24 falls at 00:15 / 08:15 / 20:15 on a weekday**). ⚠️ **Three weekdays are MISSING — 08-14, 08-17, 08-21 — their per-partition queries died on the 900 s statement timeout while the same DB served the readers' queries; 20 of 23 weekdays read. Stated, not hidden; the medians below are over the 20.**

| zone (ET → UTC) | weekday-days | bid drops, median (min–max) | symbols with a drop, median (max) | drops per 1,000 snaps, median | buckets excluded |
|---|---|---|---|---|---|
| **T 8:15 PM ET** (00:15–00:30Z) | 20 | **73** (9–98) | **65** (90) | **2.70** | 2 of 40 |
| **T 4:15 AM ET** (08:00–08:30Z) | 20 | 66 (23–150) | 34 (45) | 1.55 | 1 of 60 |
| **T 4:15 PM ET** (20:15–20:30Z) | 20 | 37 (14–73) | 20 (32) | 0.99 | 2 of 40 |
| 9:30 AM ET open (13:30Z) | 16 | 2 (0–16) | 2 (5) | 0.11 | 0 of 16 |
| pre-market body (08:45–13:15Z) | 20 | **220** (49–661) | 63 (113) | 0.97 | 28 of 380 |
| after-hours body (20:45–23:45Z) | 20 | 65 (20–425) | 39 (67) | 0.50 | 16 of 252 |
| overnight body (00:45–07:45Z) | 20 | 41 (1–184) | 13 (46) | 0.15 | 18 of 580 |
| weekends (08-08/09, 15/16, 22/23, 29/30) | 8 | 0 outside the Friday-night 00:15 bucket (Sat 00:15: 74, 29, 19, 29 — Friday's 8:15 PM handoff) | | | |

**THE BRANCH RULE, applied as registered** — *drops confined to the transition buckets, the rest of the off-hours carrying drops in ≤ 1% of symbol-minutes ⇒ TRANSITION-INSTANT batch; recurring through the session ⇒ session-behaviour, Kyle's decision.* ⚠️ **The rule names no statistic; the MEDIAN over weekday-days is the one applied, stated here so it cannot be chosen after the fact. The rate is an EVENT rate (a bid ≤ 0.90 × its previous value), not a STATE rate — see qualification 1.** Three denominators (the read-out script v2, corrected on the fresh reader's re-derivation: zone minutes 195 / 435 / 285, not 180 / 420 / 270; the 09-02 after-hours partial day excluded): (a) snaps ÷ 4 — a coincidental proxy, the measured off-hours cadence is 2.5–4.6 snaps per quoting symbol-minute; (b) median quoting symbols per bucket × zone minutes; (c) **QUOTING symbol-minutes measured on 2026-09-01** — two-sided quotes only, 60,629 / 51,274 / 55,516 — the denominator that counts only names that actually quoted.
| session body | median drops (n) | (a) | (b) | (c) | worst day, (c) |
|---|---|---|---|---|---|
| pre-market (4:45–9:15 ET) | **220** (20) | 0.39% | 0.19% | **0.36%** | 661 → **1.09%** (08-05) |
| after-hours (4:45–7:45 PM ET) | 65 (19) | 0.20% | 0.08% | **0.13%** | 425 → 0.83% (08-31) |
| overnight (8:45 PM–3:45 AM ET) | 41 (20) | 0.06% | 0.03% | **0.07%** | 184 → 0.33% |
| *the handoffs, per MINUTE* | 8:15 PM 2.43 · 4:15 AM 1.47 · 4:15 PM 1.23 · bodies 0.09–0.77 | | | | |
⛔ **BEFORE THE BRANCH LINE — WHAT THE NUMBERS ARE AND ARE NOT (Langston (a), 22:36Z):** Kyle's question was about STATE (*"is the book a stub for most of the day?"*); every rate above is an EVENT rate (a bid ≤ 0.90 × its previous value), not a state rate. On the state side, the same object says: a quarter to a third of the 8:15 PM collapses persist for more than an hour, some until 4 AM (§15.4 — 11 of 47 on 09-01, 27 of 85 on 08-05), and the wide-snap SHARE (spread > 20%, a state) is 4.3% / 1.6% / 1.2% at the three handoffs against 1.6% / 0.8% / 0.1% in the after-hours / pre-market / overnight bodies. So the collapsed STATE extends into one session body for a minority of names, while the collapse EVENTS sit at the handoffs.
⛔ **THE REGISTERED RULE IS AMBIGUOUS ON THIS READ-OUT, AND I RESOLVED IT — stated, not hidden (Langston (a)):** arm 1's parenthetical is satisfied (bodies 0.36 / 0.13 / 0.07% at the median), AND arm 2's plain text is satisfied too — *"drops recurring through the session"* is what 68% of the strict drops by count and the all-night collapses are. **Resolution, on the ground that actually holds:** arm 2's only OUTPUT is *"a session-behaviour decision, Kyle's — the stub question"*, and the premise of that question is REFUTED by this run (it is a stub for most NAMES at three MOMENTS, and for a minority of names for the rest of one session — not for most of the day); and the remedy's SHAPE is invariant to which arm fires (a per-tick book-state guard covers a handoff burst, a persisting collapse and a pre-market flicker alike). The statistic is the MEDIAN over weekday-days — chosen after the read, declared here; **the worst single pre-market day is 1.09% (08-05, on the strictest denominator) and that figure travels with the summary line permanently.**
⇒ ✅ **BRANCH: TRANSITION-DOMINATED BY RATE AND ONSET — every session body is under the 1% line at the median on all three denominators (worst day 1.09%, 08-05); per minute the handoffs run 4.1× the bodies; 8:15 PM ET carries the widest reach (65 of ~479 names on a median night) and the 9:30 AM open carries none.** ⛔ **NOT by COUNT: 68% of all strict drops pooled over the month (7,477 of 11,017) fall inside the session bodies — "concentrated at the handoffs" is a statement about intensity, not about where most events are.** ⇒ **This is the SMALL batch. Kyle is NOT asked the stub question.**

⚠️ **EIGHT QUALIFICATIONS THAT TRAVEL WITH THE CALL, none of which flips it:**
1. **"Instant" describes the ONSET, not the duration** (the state side is stated above the branch line, where it belongs). The guard therefore has to be a per-tick test of the BOOK, not a rule about the minute (§15.7) — which is what the branch's "small batch" already means.
2. **The pre-market body is the largest absolute count (220 median) and still under the line because it is a FLICKER on ~40 thin names that are never held** (§15.6). ✅ **The exposure leg is now RE-DERIVED BY THE AUTHOR at the object (Langston (c), 22:37Z): the held-position join re-run as CC-C — 102 position-pre-market-days, 67 positions, 0 collapse events, 0 positions with an event; positive control 142,330 snaps scanned, 98 of 102 position-days with snaps, worst held-name one-step bid move −6.63% (PWR/USD 08-03, mid −2.99%, stop far below).** It is under the threshold by rate, and irrelevant by exposure; both are stated because either alone would be read as the whole story.
3. **The registered predicate UNDER-COUNTS the damaging shape.** The trade record's worst rows moved BOTH sides (§15.5); the ask-holds test does not see them. A post-hoc hollow-book count (spread > 20% of mid, bid ≤ 0.90 × prior mid, `last` unchanged) is running on three days and is published in §16.1 when it lands — as POST-HOC, beside the registered figure, never in its place.
4. **Three weekdays are missing** (timeouts on partitions no larger than the ones that completed — not size-driven) and 62 of 1,368 weekday buckets were excluded for reconnect minutes; adding three days to a 20-day median can move it only between the current 9th and 12th ranked values (pre-market 177–240 drops), so the call is robust to both, but n = 20 weekdays, not 23 weekdays (a different object from §15.6's 23 stop-outs — Langston's disambiguation, 22:46Z).
5. **The registered predicate under-counts the HANDOFFS three- to four-fold relative to the bodies** (fresh reader R4, one day, re-derived): in the 00:15 minute on 09-01 there were 163 bid collapses ≥ 10% with a prior snap ≤ 5 min old, and the strict rule kept 47 (29%) because the ask moved UP by more than 2% on 107 of them; at 20:15 it kept 8 of 32, at 08:15 8 of 17; in the bodies it keeps 97% (235 of 242 pre-market). **The bias runs AGAINST the branch call** — relaxing the ask condition makes the handoffs larger, not smaller. Two blind spots stated: a bid that goes to ZERO is removed before the comparison and registers later as a RISE, never a drop (a no-bid handoff is invisible to this census); and 1.8–2.3% of body snaps arrive after a > 5-minute gap and are ineligible (24 / 1 / 1 drops on 09-01 — small).
6. **Bucket assignment is even for 8:15 PM ET and uneven for the other two:** 72% of the `00:15` bucket's drops fall in minute 00:15 (46 land at 00:15:00 exactly), so that handoff IS the first minute; the `20:15` bucket holds only 8 of 20 in its first minute with clusters at 20:19 and 20:25 (full-universe re-emissions with no reconnect logged — an unexplained regularity, §15.3), and the `08:00–08:30` zone starts fifteen minutes BEFORE the 4:15 AM handoff and carries ~8 drops/day in its pre-handoff bucket; the `00:00` and `20:00` pre-handoff buckets belong to no zone. Reassigning the late-bucket drops to the bodies adds ~a dozen a day — immaterial to the 1% line.
7. **On 09-01 the 235 pre-market drops occupy 114 distinct symbol-minutes and 27 of 479 names — WST/USD alone 157 (67%), the top ten 91%.** A pooled symbol-minute rate dilutes a few flapping names into a broad low number; the exposure statement in qualification 2 is why that dilution does not matter here.
8. **The reconnect exclusion list is keyed to the equity socket — checked at the object after R4 questioned it:** the 09-01 06:01:37 entry is `[B74][equity-spot] disconnected code=1006` + `reconnecting (attempt 1)` in `error__2026-09-02_00-00-00.log`, a network event that dropped all four archivers at once; the list's 129 minutes come from `equity-spot` disconnect / reconnect / STALL lines only, and none of them sits inside a weekday handoff minute.

- `REVIEWER: object + claim (the CSV, the read-out script, the two exclusion lists; "session bodies ≤ 1% of symbol-minutes ⇒ transition-dominated") · HIT ×5 — event-vs-state wording, the denominators (quoting-only measured; max day 1.09%), zone-minute arithmetic (one bucket short each), a partial day counted whole, the predicate's 3–4× under-count of the handoffs (bias against the call), bucket-assignment unevenness; one hypothesis (exclusion list keyed to the crypto socket) REFUTED at the object · re-derived y (the script re-run as v2 on staging; the socket question re-read in the error log 22:45Z)`

✅ **LANGSTON, 2026-09-02 22:36Z — STEP-1 RE-CLEARANCE: CLEAR WITH FIVE CONDITIONS (`Review = Approved` set on the card):** (a) the ambiguous rule, resolved and stated — applied above; (b) write the revision now, but **the guard's trigger predicate and threshold stay UNFIXED until §16.1 (the post-hoc hollow count) lands, and the guard must handle an ABSENT / ZERO bid explicitly — a no-bid handoff is invisible to every number in §16** (the census keeps `bid > 0` rows only); (c) the exposure leg re-derived by the author — applied above; (d) the three labels/reconciliations — applied above; (e) **OBJ-4's remedy needs a DIRECTION: with the guard in place forward contamination ends at the guard, and the remaining need is a HISTORICAL RE-CUT — the revision states whether history is re-cut, on which identifier (§14's market-state predicate is computable from the archive for any instant from 08-03; rows 07-17 → 08-02 only by the minute proxy), and whether the re-cut reaches the daily-loss-budget window at all.** Plus one line for the revision: the RIOT fill refusal `1d1573c7` fired at 20:18:23Z, three minutes past the 4:15 PM ET handoff — check it against that handoff's damage cohort (3b.f-c).

### 16.1 THE POST-HOC HOLLOW-BOOK COUNT — A *STATE* MEASURE, PUBLISHED BESIDE THE REGISTERED EVENT COUNT, NEVER IN ITS PLACE (Langston (b): the guard's trigger and threshold are designed on THIS, and stay unfixed until it is read)

**Definition (chosen after the run, on the fresh reader's finding that the registered predicate cannot see the shape that reaches `closed_trades`):** a snap is HOLLOW when `spread > 20% of mid` AND `bid ≤ 0.90 × the prior snap's mid` AND `last` unchanged — the bid has fallen away from where the book was, the ask has not followed, and the underlying's tape has not moved. ⚠️ **Because the comparison is against the PRIOR snap's mid, a book that STAYS hollow keeps qualifying on every snap (a hollow mid still sits ≥ 10% above its own bid), so this counts hollow SNAPS, i.e. time spent in the state — an approximate state measure, unlike the registered predicate, which counts onsets.** Whole-day form on 08-05; **windowed form on 08-27 and 09-01** (the whole-day query died on the 900 s statement timeout for 08-27 — the error is named — so those two days carry the three handoff windows ±15 min plus ONE sampled hour per session body: 10:00–11:00, 21:30–22:30, 03:00–04:00 UTC).

| zone | 08-05 (whole day) hollow snaps / symbols | registered onsets | 08-27 (windowed) hollow / symbols | registered | 09-01 (windowed) |
|---|---|---|---|---|---|
| T 8:15 PM ET (00:15–00:30Z) | **1,223 / 235** | 85 | **997 / 223** | 72 | *pending* |
| T 4:15 AM ET (08:00–08:30Z) | 579 / 91 | 124 | 230 / 61 | 47 | *pending* |
| T 4:15 PM ET (20:15–20:30Z) | 404 / 52 | 54 | 214 / 26 | 27 | *pending* |
| pre-market body | 1,630 / 171 (4.5 h) | 661 | 360 / 34 (1 h sample) | 27 | *pending* |
| after-hours body | **2,106 / 154** (3 h) | 94 | 402 / 33 (1 h sample) | 29 | *pending* |
| overnight body | 394 / 77 (7 h) | 5 | 3 / 2 (1 h sample) | 1 | *pending* |

⇒ ⛔ **THE STATE MEASURE SAYS SOMETHING THE EVENT MEASURE DOES NOT, AND BOTH ARE TRUE:** (i) at the 8:15 PM ET handoff **roughly HALF the universe is hollow at once** (235 and 223 of ~479 names — the same fact as §12.2's *"82% of the book goes stub"* at a different threshold); (ii) **the hollow STATE is widespread through the after-hours and pre-market bodies — 154 and 171 names carried hollow snaps on 08-05, and the after-hours body held MORE hollow snaps than the 8:15 PM handoff itself** — while the overnight (Blue Ocean) body is the calm one; (iii) the registered EVENT predicate saw 94 onsets in that same after-hours body against 2,106 hollow snaps — **the bodies are quiet in onsets and busy in state**, which is exactly the gap Langston's condition (a) named and Kyle's original claim was half-right about: *the spreads ARE much wider outside 8:15* (state) *and the dramatic bid drop IS the 8:15 event* (onset). (iv) **The branch call does not move** — it was resolved on the ground that the remedy shape is invariant, and the state measure makes that ground firmer: a clock rule at three moments would leave 150+ names' hollow snaps in the bodies unguarded, so **only a per-tick book-state test covers what these two tables show together.** (v) What the state measure does NOT tell us, stated: whether HELD names are hollow in the bodies (the exposure join in §15.6 was run on the EVENT predicate; the state version is owed before the trigger is fixed — Langston (b)/(c) again), and nothing here sees an ABSENT bid (`bid > 0` filter). ⚠️ **Two and a half days, post-hoc — a design input for the guard's trigger, never a branch input.**

⇒ **WHAT THE BATCH NOW IS:** OBJ-0 closes the investigation half. The remedy is scoped next — Step 1 re-dispatch to Langston with §2.1b (the revived band, re-triggered on book state), §13.1b (the daily-loss-budget consumer), §15 (the three handoffs and the feed's quarter-hour lag) and this section — after a fresh reader on this read-out, per Kyle's instruction. **Build now, deploy after the 09-07 window closes.**

