# xSTOCK PRICING — THE PLAN (DRAFT 2)

**Owner CC-C · Kyle-directed · Draft 1 2026-08-30, attacked and rewritten same day**

> ⛔ **NOT FOR ACTION YET.** Kyle's process: **draft → second reader → converge → Langston → then him.** Draft 1 has had **one** reader round; this is the correction. It goes to a **fresh** reader, then Langston.
> ⭐⭐ **ROUND 1 FOUND SOMETHING LARGER THAN ANYTHING ON DRAFT 1's LIST, AND DRAFT 1 CALLED THAT LIST COMPLETE.** Kyle asked *"make sure those are the only items."* **The answer was no.** Every correction below is re-derived by me at the ref.

---

## 0. ⛔⛔ THE ONE THING TO READ IF YOU READ NOTHING ELSE

**THE EXIT TRIGGER AND THE EXIT FILL READ DIFFERENT PRICES, FROM DIFFERENT SAMPLES.**

| | reads | from | cadence |
|---|---|---|---|
| **decide to exit** | the in-memory **MID** | `active-execution-engine.ts:1163` | **unthrottled** |
| **what we book** | a depth-walked **BID** | `:1997` → `depth-source.ts:49-70` → the **4-second-throttled archive** | **≤1 row / 4 s** |

**MEASURED (all `closed_trades` rows carrying both columns), with a control:**

| class | n | mean abs gap | max | **`stop_hit`, SIGNED** |
|---|---|---|---|---|
| ⛔ **xStock** | 9 | **14.038%** | **48.01%** | ⛔⛔ **+17.16%** |
| ✅ **crypto (CONTROL)** | 15 | **0.209%** | 1.08% | ✅ **−0.28%** |

⭐⭐ **THE SIGN IS THE FINDING.** A stop-out is a forced sale — it must fill **at or worse than** the stop. **Crypto does (−0.28%). xStock fills 17% BETTER than its own stop, which books a GAIN.**
**`TGT/USD`: stop triggered at 106.075. Booked at 157.00.**

⇒ ⭐ **THIS IS THE MACHINE BEHIND THE CONTAMINATED P&L.** We had recorded that 77% of overnight profit sits in the burst window and attributed it to *"a false stop above entry books a win."* **Half right. The win is booked because the FILL COMES FROM A DIFFERENT SAMPLE than the trigger.**
⚠️ **LIMITS: n=9, and the stamp only ships from 2026-08-26, so the historical cohort is NOT recoverable — correcting `#958`.**

---

## 1. ⛔ WHAT IS WRONG — THE CORRECTED LIST

| # | what is wrong | status |
|---|---|---|
| ⛔ **W1** | **The exit trigger and the exit fill read different samples** (§0). `#959` | **certain, and largest** |
| **W2** | **We never receive the order book for xStock.** Depth and spread come from one top-of-book row. | certain |
| **W3** | **Every exit *trigger* reads a midpoint**, both classes, both lanes. ⚠️ *Draft 1 said "every exit decision" — that was the trigger only, and not asking what the fill read is how W1 was missed.* | certain |
| **W4** | **A venue re-quote at each session boundary reaches the decision path.** | ⚠️ **event certain; *"is treated as a tradeable price"* is the judgement `#958` itself says is unearned. See §3 step 1 — now cheaply earnable.** |
| ⛔ **W5** | **The 4-second sampling is a TRADING defect, not a measurement one.** ⚠️ **DRAFT 1 SAID THE OPPOSITE AND WAS WRONG.** The archive is a **live gating input**: it is the denominator of **σ**, which sets the exit staleness ceiling (`sigma-rate.ts:89-105` → `active-execution-engine.ts:1202-1213`, cap **300 s**); it feeds **both fills**; and it drives the scanner's spread gate and its **20-minute depth median**. ⛔⛔ **AND THE BIAS RUNS FAIL-OPEN: tick loss scales with symbol speed, so σ is understated most on the fastest names — the staleness window is WIDEST exactly where a stale mark costs most.** | **certain** |
| **W6** | **There are FOUR price definitions, not three.** The ranking price is **not** the ticker `last` — that column is selected at `scanner.ts:641` and **never consumed**; the eval price is `:910` `latestBar.close`, a **15-minute aggregated bar** off the **`ohlc` channel**. | certain |
| **W7** | **An xStock instance of the `#951` laundering, on the exit path.** `:1239` preserves the honest age (`priceObservedAtMs = _eqTick.tsMs`), then `:1244` republishes that mark via `updateCache`, which stamps `observedAt: now` — and it passes the venue gate. **A mark up to 300 s old becomes an "observed-now venue read."** | certain |
| **W8** | **We cannot tell which session a price came from at the decision point.** ⚠️ *Reclassified: a missing CAPABILITY, not a defect — and §3 does NOT moot it.* | certain |

⛔ **REMOVED FROM THE LIST:** `#953` (the `Math.random()` live route). **It is not an xStock price-path item** — it is one HTTP route, class-agnostic, Phase-21 gated, already placed at **21.1**, and excluded from this plan. *Listing it made the list look longer while it was the only provenance item and was not being worked.*
⚠️ **A LEAD, NOT A FINDING:** the feed's subscription universe comes from a **static JSON file** read once at boot, while the trading universe is bulk-replaced daily by cron. **476 symbols wrote rows on 08-28 against 496 in the universe table.** ⇒ **Settles with one check: does the cron rewrite the file, or only the table?**

---

## 2. ⭐ WHAT THE OUTSIDE WORLD ALREADY DOES *(unchanged from draft 1 — round 1 did not fault it)*

**(a) VALIDATE THE TICK AT INGEST AND HOLD THE LAST GOOD VALUE** — *"ignore a fresh bad print and keep the last valid value until inputs normalize."* **Causal, not temporal.**
**(b) A SEPARATE MARK PRICE FOR RISK — AND KRAKEN PUBLISH IT THEMSELVES** (*"Last price vs. Mark price"*, futures).
**(c) ⚠️ Mainstream brokers do not run stops overnight at all** — **the conservative end, recorded, NOT recommended.** Kyle's call is to keep trading all four sessions.

---

## 3. ✅ THE PLAN — CORRECTED

### ⭐ STEP 0 — **FIX THE TRIGGER/FILL DIVERGENCE (W1). NEW, AND IT GOES FIRST.**
**Blocked on nothing.** Readable from `closed_trades` today. **It is the largest live distortion in the population Phase 25 will calibrate from.**
⛔ **NO FIX PRE-JUDGED, and the first question is NOT "which price is right":** it is **which of the two reads is SUPPOSED to be authoritative** — and `BATCH_65` already ruled that VTS and paper keep **different fill conventions on purpose**. **Search that record before calling either one wrong.**
**OWNER:** CC-C + Langston. `B-EXIT-TRIGGER-FILL-PARITY`, plan row **3b.c**.

### STEP 1 — **SEE THE TICKS** *(makes W4's judgement earnable)*
⭐⭐ **CORRECTED TWICE BY ROUND 1:**
- ⛔ **The raw capture was armed for the WRONG NIGHT.** It pointed at **Monday 00:15 UTC = Sunday 20:15 ET, the weekly OPEN.** **Measured: of 66 cohort closes since 1 July — Sat 18, Thu 15, Tue 13, Fri 11, Wed 9, and MONDAY ZERO.** ✅ **RE-ARMED DAILY, with a 10-day retention prune.**
- ⭐ **AND IT IS NO LONGER THE ONLY INSTRUMENT.** The **`ohlc` channel already exists, is already archived, and carries `trade_count`** — so the venue's own printed trades for the same minute are available **today**. Specimens: `INTU` booked a `target_hit` at **374.96** while the venue printed **3 trades, all at 350.51**; `AMZN` **in regular hours** booked at **278.99** against **787 trades** inside 285.90-287.00.
⚠️ **CONTROL STATED HONESTLY: the same test flags 52.7% of crypto exits, so "outside the bar" is partly quote-vs-trade-range and is NOT by itself proof of non-transactability.** ⇒ **It settles the extreme specimens, not the general case.**
⇒ ⛔ **THEREFORE STEP 1 NO LONGER BLOCKS STEP 3.**

### STEP 2 — **SUBSCRIBE TO THE BOOK, STORE IT, CONSUME NOTHING** *(fixes W2)*
⛔⛔ **DRAFT 1's JUSTIFICATION FOR RESTRAINT WAS ARITHMETICALLY FALSE AND IS WITHDRAWN.** It claimed consuming 20 levels shifts the liquidity score **"+10 points per name."** Since `LQ = log10(depth)×10`, **+10 points is exactly a 10× ladder — an assumption presented as a calibration fact, from a ladder observed ONCE, in May.** And the stated consequence was wrong anyway: **saturation needs ≈$10 billion**, while the module's own scale puts $1M at 60. **60→70 re-creates nothing.**
✅ **THE REAL REASON FOR RESTRAINT, which round 1 supplied: the risk is a NON-UNIFORM shift** (thin names carry proportionally less behind top-of-book), **and two gates read this input, not one** — LQ **and** the two-sided depth gate. **And the input is a 20-minute rolling median, so consuming a ladder changes the STATISTIC's definition, not just its scale.**
⛔ **AND STORING IT IS NOT SMALL, WHICH DRAFT 1 DID NOT COST:** there is **no order-book table anywhere in the schema**; `xstock_spot_ticker_snap` already writes **2.85 M rows / 880 MB per trading day** at **one level per side**, and its July partition is **26 GB**. A 20-level ladder is 40 pairs against 2, arriving as **per-change deltas**. ⛔ **And the batch writer CANNOT be reused: it drops by elapsed time, which is coherent for a snapshot and CORRUPTING for a delta.**
⚠️ **AND THE COUPLING IS THE PROCESS, NOT THE TABLE: that socket is the class's only price source, and the stall watchdog FORCE-CLOSES it on a data-clock stall.**

### STEP 3 — **A PLAUSIBILITY GATE AT INGEST** *(addresses W4)*
⛔⛔ **DRAFT 1 CLAIMED THIS MOOTS W8. IT DOES NOT, AND THE CLAIM IS WITHDRAWN.** Gating *"does not become the mark"* protects **exactly one consumer — the exit trigger.** **The fill, σ, the scanner's spread and depth gates, the ticker-witness and the probe cron all read the DB table and bypass it entirely; the ranking price is on another channel altogether (W6).**
⛔ **AND "HOLD THE LAST GOOD VALUE" HAS FIVE FAILURE MODES, ALL SPECIFIC:** (1) **if the hold refreshes the timestamp it defeats the staleness ceiling — re-creating `#951` as the fix for W4**; (2) **if it does not, the gate converts "closes on a bad price" into "cannot close at all"** — the burst ran **30 s** against a 15 s floor; (3) **the first tick after any restart has no predecessor, and pm2 reports 584 restarts**; (4) **the weekly reopen legitimately gaps after 48 h shut**; (5) ⛔ **a per-tick gate is blind to a RAMP — `WEN` walked 8.01 → 13.31 in steps.**
⇒ **The gate must sit where BOTH writes pass, must not drop the archive row (that is the forensic trace), and needs a false-positive budget.** **Threshold philosophy → Kyle.**

### STEP 4 — **DECIDE THE NUMBER FOR EACH JOB** *(fixes W3, W6)*
⛔ **DRAFT 1 BLOCKED THIS TWICE AND WAS WRONG.** It is a **specification** task: it needs a **correct inventory**, not clean data.
⚠️ **BUT IT CANNOT START TODAY EITHER, FOR A REASON DRAFT 1 DID NOT NAME: the inventory is WRONG. There are four prices, not three (W6).** ⇒ **Fix the inventory, then it is startable immediately.**

---

## 4. ⛔⛔ THE BIGGEST RISK — AND IT IS IN THE PLAN'S OWN SHAPE

> **Step 3 makes the exit TRIGGER honest and leaves the exit FILL dishonest — and they are wired in series.**

**Today the burst produces a visible absurdity: a stop at 106.075 that books at 157.00. Both numbers are wrong, and the PAIR is obviously wrong, which is why anyone noticed.** After step 3 the trigger is validated, the burst stops firing stops, **and the loud specimens disappear.** The fill path is untouched — it still walks a 4-second-old archived bid — so **every ordinary exit keeps booking at a price the decision was not made on** (crypto 0.209% vs xStock 14.038%).

⇒ ⛔⛔ **THE PLAN AS DRAFTED WOULD REMOVE THE EVIDENCE OF A DEFECT AND LEAVE THE DEFECT — immediately before Phase 25 calibrates on this population. A gate that suppresses the symptom that makes a second defect findable is worse than no gate.**
✅ **THAT IS WHY W1 IS NOW STEP 0.**

**AND A SECOND, STRUCTURAL RISK:** §1 presents eight items as certain wrongs, **while every *"this is unintended"* verdict is uncertified until `B-DECIDED-INTENT-INDEX` lands.** Steps 2 and 3 commit code. ⛔ **There must be a gate between "certain" and "build": each step states, before it ships, which record it searched for a prior decision.** *(`BATCH_65` is the worked example — it already rules on fill conventions.)*

---

## 5. ⚠️ WHAT THIS PLAN STILL DOES NOT DO

1. It does not stop us trading any session. **Kyle's decision.**
2. It does not exclude 00:15. **The gate is causal.**
3. It does not consume the order book. **That re-calibrates two live gates and is its own batch.**
4. ⛔ **It no longer claims W5 is a measurement problem — that was wrong and is corrected.** **But it still does not FIX the sampling**; it fixes what the sampling feeds, one consumer at a time.
5. It does not answer refactor-vs-rip-out for the exit path. **Separate question; answer stands at large-refactor-small-ripout.**
