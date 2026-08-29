# F-G-1 / B-GRID-REPRESENTABILITY — BATCH PROGRESS REPORT

## **OPEN — awaiting (a) the visual UI check, which needs Kyle, and (b) an observation window on post-deploy trade geometry**

> **Owner:** CC-C (Claude Analyst) · **Phase 19, plan row 3** · **Issues `#916`–`#930`, `#933`**
> **Deployed sha:** `ca909072490786e414caade527ac9ff61f7745ab` — live on staging `2026-08-28T16:08:02Z`, `dt-deploy` asserted sha-identity and ENGINE RESUMED before recording.
> **Rollback sha (known before deploying, per the step-6 rule):** `ed86a758e69136434aad98d777d184dfebec3a62`.
> ⛔ **THIS IS NOT A COMPLETION REPORT AND THE BATCH IS NOT CLOSED.** Steps 8–11 are outstanding. It exists because the work is done and deployed and the remaining evidence is a *waiting* problem, not a *doing* one — and because the close criterion below has to be written **before** the data arrives.

---

## 1. WHAT THE BATCH IS FOR

An exchange only accepts prices on a **grid** — a smallest permitted increment, published per pair. **Measured 2026-08-27 across 406 closed crypto trades, each against its own published Kraken `tick_size`: entry 80.8% representable, STOP 2.7%, TARGET 9.9%.** Stops and targets are ATR-derived floats and are overwhelmingly prices the venue cannot quote.

Two consequences, and they are different:
- **LIVE-PARITY DEBT** — in live mode these become real order prices, rejected or silently re-priced, so paper and live part company at the exact moment of exit.
- **MEASUREMENT** — an exit test of the form *"did price trade THROUGH our limit?"* cannot discriminate at all when the limit is off-grid, because `high > limit` and `high >= limit` are then the same predicate.

**What shipped:** **the VPG (Venue Price Grid)** — *can the venue express this price, and if not what is the nearest one that can?* — feeding **the VOG (Venue Order Gate)**, which asks Kraken *would you accept this order?*. Plus the bar-archive writer's silent dropped batches (`#705`/`#704`), and grid refusals surfaced as their own Filter Diagnostics category.

---

## 2. STEPS COMPLETED, WITH EVIDENCE

| step | state | evidence |
|---|---|---|
| 1 Scope · 2 Audit | ✅ | Langston-approved before code existed |
| 3 Implementation | ✅ | 23 files, **+2,928 / −8** at the deployed sha (`git diff --shortstat 98cd011c7..ca9090724 -- server/ shared/ client/`) |
| 4 Code review | ✅ **APPROVED** | **Eight rounds. Twelve blockers, every one real.** Approved at `f280e9c6b`; two residuals landed at `ca9090724` |
| 5 CI | ✅ | **4/4 green** on the deployed sha — TypeScript Check, Test Suite, Build, Docker Build |
| 6 Deploy | ✅ | `dt-deploy` record written **only after** its own post-condition assertions passed |
| 7 Verification | ⏳ **PART DONE** | runtime evidence below; **the visual UI check is outstanding and needs Kyle** |
| 8–11 | ☐ | Langston second pass, iterate, governance, completion report |

### Runtime evidence captured post-deploy (§3 of this report is the part that is NOT yet evidence)

- **The grid resolver warmed at boot: 452 of 476 xStock symbols derived, 24 skipped** — read from the live log, not from a stored figure.
- **79 real signals evaluated against the venue grid** in the first ~12 minutes — 58 xStock, 21 crypto — **and ALL 79 returned `would_round`. Zero were already on grid.** That is the batch's premise reproducing in production.
- **3 signals refused** with `stop_distance_after_rounding`, and **the funnel counter matches the log exactly: 3 logged, 3 counted.** Two independent instruments agreeing, not one reading.
- **`gridEvaluated` / `gridTags` reach the API on both lanes** (xStock 58, crypto 21) — the five-step counter chain Langston found dead-ended at `BLOCKER-10`, now carrying a live non-zero number end to end.
- **The corrected log wording renders as intended:** `verdict=grid_unknown — OURS, not the signal's`.

⚠️ **WHAT THAT EVIDENCE DOES *NOT* SHOW, stated because a reader will otherwise assume it does:** it shows the machinery runs, counts and refuses. **It does NOT yet show that trades opened after the deploy have on-grid prices** — that is §3, and it is unmeasured.

---

## 3. ⛔ THE PRE-REGISTERED CLOSE CRITERION — WRITTEN BEFORE THE DATA ARRIVES

> **DO NOT DATA-MINE THIS.** A criterion chosen after seeing the window can always be made to pass. Written 2026-08-28, with **1 open and 1 close** in the post-deploy population at the time of writing.

**THE WINDOW — a set QUANTITY, not a period:** the **first 30 crypto positions opened after `2026-08-28T16:08:02Z`**, or **7 days**, whichever comes first. If 7 days elapse with fewer than 30, that is reported as an underpowered read, **not** as a pass.

**THE INSTRUMENT:** each position's `entry_price` / `stop_price` / `target_price` matched to **its own** published Kraken `tick_size` (fetched live from `/0/public/AssetPairs`; 1,437 pairs carry one). Representability tested as an exact multiple, relative tolerance at float precision. ✅ **The instrument is already proved** — run 2026-08-28 with a positive control (a constructed on-grid price → true) and a negative control (the same price plus a third of a tick → false), both correct.

| | PASS | FAIL |
|---|---|---|
| **CRYPTO** | **100% of entry, stop and target on their published grid. No tolerance.** | ⛔ **ANY single off-grid leg.** The seam refuses or rounds — there is no third outcome — so one exception is not noise, it is **a live bypass path** — one of `#927`/`#928`/`#929` **or a fourth nobody has named yet**, and which one is the investigation, not the conclusion. It is itself the finding |
| **xSTOCK** | on-grid **OR** the symbol absent from the derived map at open time — the passthrough arm is *designed* to ship unrounded when our own archive has no grid | an off-grid leg on a symbol that **did** have a derived grid |

★ **WHY CRYPTO'S BAR IS ABSOLUTE:** for crypto the tick is the venue's own published statement, so the seam either rounds to it or refuses. A crypto trade that opens off-grid therefore did not come through the seam.

⛔⛔ **STRUCK 2026-08-28, BEFORE ANY DATA READ — Langston's attack 1, and it is the sentence that would have been quoted.** This paragraph continued: *"…which makes this criterion a live test of the three named bypass paths as well as of the rounding."* **THAT IS AN OVERCLAIM.** The instrument reads `entry/stop/target` off **opened positions**, and a PASS would have laundered into *"the three holes are clean."* **Per-hole reachability, pre-registered:**

| hole | reachable by this instrument? |
|---|---|
| `#927` — fabricated `entry * 1.02` in the **RTB ranking key** | ⛔ **UNREACHABLE BY THIS INSTRUMENT.** It is a *ranking input* and never becomes a stored position leg. Structurally invisible in **either** direction — a PASS says nothing about it |
| `#927` — fabricated target that DOES persist | ◐ **PARTIAL.** Counted, not inferred: positions where `target_price / entry_price` sits within float tolerance of exactly `1.02`. Reported as a count, never as an absence |
| `#928` — HTTP intent path | ⛔ **UNREACHABLE UNLESS INVOKED, and nothing counts invocations.** A never-exercised path is silent at **zero opportunity**, however loud the check — Langston's own `#661` leg 3. **A PASS is not evidence about this path** |
| `#929` — second position-sizing caller | ⛔ **Same. UNREACHABLE UNLESS INVOKED, uncounted** |

⇒ **THE CRITERION TESTS THE ROUNDING. IT DOES NOT CLEAR THE THREE HOLES**, and no reading of it may be written as though it did.

**BASELINE FOR THE COMPARISON:** entry 80.8% / stop 2.7% / target 9.9%, n=406 closed crypto trades, pre-batch.

---

### 3a. ⛔ WHAT "UNDERPOWERED" MUST DISCRIMINATE (Langston attack 2)

**`UNDERPOWERED` as first written collapsed two different worlds:** fewer than 30 opens can mean a **net-EV drought** (`#570` — `rtb_signals` sat empty for 2+ days in July) **or the seam refusing at volume.** The first is weather; **the second is a finding**, and one label cannot carry both.

⛔ **THE EXPECTED RATE, STATED NOW BECAUSE I PICKED 30 WITHOUT ONE — which makes a quantity a period wearing a quantity's clothes.** Measured over the 8 days to 2026-08-28, crypto opens/day: **23, 7, 6, 5, 5, 5, 4, 2 — median 5, mean ~7.** ⇒ **30 opens at the median needs ~6 days against a 7-day cap.** The window is therefore **marginal by design and likely to terminate at or near the cap.**
★ **THE THRESHOLD IS NOT BEING LOWERED NOW THAT THE RATE IS KNOWN.** Moving it after the attack is exactly the goalpost-shift this section exists to prevent. What changes is that the **co-denominators carry the read** when n is short.

**MANDATORY AT READ TIME — all four over the SAME window, or the read is not reportable:**
`grid evaluations` · `grid refusals by reason` · `crypto positions opened` · `signals generated`.
⇒ **few opens + many evaluations + many refusals = a FINDING. Few opens + few evaluations = weather.**

### 3b. ✅ POSITIVE CONTROL ON THE **LIVE** CLASSIFIER — RUN, NOT ASSUMED (Langston attack 3)

The `0 of 79 already on grid` reading came from the **live** `evaluateGridForTagging`, a different object on a different path from the offline `tick_size` matcher I had proved. **A 79/79 unanimous result is exactly the shape of an arm that cannot return the other value** (`#704`'s lesson: a control must match the stream it licenses an absence about).

**RUN 2026-08-28 against the DEPLOYED source at `ca9090724`, on staging:**
```
ON-GRID triple  -> verdict = on_grid       (must be on_grid)
OFF-GRID triple -> verdict = would_round   (must be would_round)
CONTROL RESULT: BOTH ARMS FIRE
```
⇒ **the unanimity is a measurement, not a stuck arm.** ⚠️ It remains a control on the *classifier*, not on the *population*: it licenses reading 79/79 as real; it says nothing about whether 79 is a representative sample.

★★ **UPGRADED FROM A CONSTRUCTED CONTROL TO A LIVE ONE, 2026-08-28 17:37Z — the other arm has now fired on REAL SIGNALS.** At n=187 on the xStock lane the live counters read **`{would_round: 183, on_grid: 4}`**. ⇒ **the 79/79 unanimity was a SMALL-SAMPLE ARTIFACT, not a stuck arm** — which is what Langston suspected and would not ratify on *"probably fine"*. **The population control now exists and no longer rests on a fixture.**

### 3c. ⛔ THE xSTOCK PASS ARM'S DENOMINATOR, PRE-REGISTERED (Langston attack 4)

*"on-grid **OR** absent from the derived map"* is an unbounded escape hatch unless the absent set is fixed in advance — otherwise **the arm can pass by its denominator quietly shrinking.** Per `#933` the map is rebuilt only at boot and on a 6-hour timer, so the set is knowable.

**MEASURED AT THE DEPLOY BOOT: 452 derived / 24 skipped of 476.** ⚠️ **The list below is an ILLUSTRATIVE SNAPSHOT, not the denominator** — 22 names read from the refresher's own SQL after the boot, against a boot count of 24. It is kept because `ROOT/USD` reconciles against a real event, **not because it defines the PASS arm:**

`AMBR/USD · BHC/USD · BLDP/USD · BMBL/USD · EVGO/USD · EWN/USD · EWS/USD · FUFU/USD · GOTU/USD · KRAQ/USD · LIDR/USD · PARA/USD · ROOT/USD · SLMT/USD · STRK/USD · SUIG/USD · TAL/USD · TBLL/USD · TONX/USD · TOTL/USD · TRON/USD · UWMC/USD`

⛔⛔ **THE DENOMINATOR IS THE LIVE MAP, NOT THIS LIST — CORRECTED 2026-08-28 BEFORE THE WINDOW ACCUMULATED (Langston's two residuals).** My first wording said *"on this list **or on a later boot's equivalent list**"*, and **that clause reopened the hatch this section exists to close: NO LATER LIST EXISTED.** The refresher emitted `derived N, skipped N` — **counts only; the skipped NAMES were never logged, never returned, never stored** — so at read time the clause resolved to re-deriving from a **rolling 24h SQL window that has since moved.** The shrinking denominator, arriving inside the sentence meant to prevent it. **And the list below is 22 names against a boot measurement of 24 skipped: two symbols were unnamed and would have been undecidable.**

★ **THE CORRECT DENOMINATOR, and it is better than any snapshot: `absent from the LIVE derived map at open time`.** Nothing in the resolver ever REMOVES an entry — `setDerivedGrid` is the only writer and is called only on success, the refresher's failure path leaves the cache untouched, and its skips `continue`. ⇒ **within a process lifetime the derived map only GROWS, so the absent set is MONOTONICALLY SHRINKING and is a strict subset of the boot 24. No rolling window appears anywhere in it.**

⚠️ **AND IT WAS NOT READABLE, WHICH IS THE SAME DEFECT ONE LEVEL DOWN.** The map lives in memory — a separate script reads a fresh EMPTY one — and only a **count** was exposed. **A better denominator nobody can read is not a better denominator.** Landed in the same pass: the resolver now exposes the derived **keys**; the refresher **names** the symbols it skipped in both its return and its log; and the running process emits the **complement** (`gridAbsentSymbols`) on the xStock diagnostics payload, so the absent set is enumerable from outside at read time.

⛔⛔ **RECONCILIATION READS THE ROW'S OWN STAMP — NOT A LIVE MAP AT READ TIME. CORRECTED AGAIN 2026-08-28, still before any data read (Langston catches 1 and 2, and one change closes both).**

**Why the live-map version was wrong, and it was wrong in only ONE direction — which is worse than being wrong in both, because it looks sound:**
- **Sound in PASS:** the map only grows, so a passthrough symbol *still* absent at read time is genuinely an escape. ✅
- ⛔ **UNSOUND in FAIL:** a symbol that has **since derived** produces a **FALSE FAIL** — and a restart resets the map to empty, so monotonicity holds only *within one process lifetime*. `gridTags` cannot rescue it: it is an aggregate verdict→count map with **no per-symbol record**.
- ⛔ **And the cold-start exclusion leaned on a boundary line in STDOUT, which rotates roughly every two days against a 7-day window.** A missing boundary at close time would have read as *"there was no cold-start window"* rather than *"I cannot see it"* — **silence with no reach**, on the instrument meant to bound the silence.

★ **THE FIX IS ONE STAMP: the signal records what it saw AT BIRTH.** Every signal through the seam carries `metadata.gridAtBirth` — `{resolved:true, tick, provenance}` on the rounded path, `{resolved:false, reason, provenance}` on the passthrough.

⛔⛔ **AND THE SENTENCE THAT WAS HERE WAS WRONG, CORRECTED IN THE BODY RATHER THAN BELOW IT.** It read: *"`rawSignal.metadata` spreads into `rtb_signals.metadata` at the birth insert, so it is durable per row, immune to log rotation, to later re-derivation, and to restarts."* **It does not spread.** The RTB metadata is a **fresh object from an explicit field list**; the stamp died there and a post-deploy row at 17:59:29Z carried no `gridAtBirth` key. **Measured, not reasoned.** The field is now named in that list, and a row at 18:08:09Z reads `{"tick":0.001,"resolved":true,"provenance":"venue_published"}`.
⚠️ **AND "DURABLE" WAS OVERSTATED EVEN ONCE FIXED (Langston, measured on staging): `rtb_signals` is a TRANSIENT pool** — it held **1 row table-wide** at his check, and neither row quoted above still exists. **It is durable for the life of a row that lives minutes.** The criterion grades **POSITIONS**, so `rtb_signals` is a waypoint, not the evidence.
⛔ **THE ONE UNPROVEN HOP, AND IT IS A GATE ON STEP 8:** `rtb_signals` row → promoted signal object, a **fourth** curated rebuild in the same family as `enrichedMetadata`, `maxHoldingMs` and `atr_at_open`. **Code evidence:** that conversion **spreads** (`active-execution-engine.ts` — `metadata: { ...((signal.metadata as any) ?? {}), … }`) and its own comment records it being fixed at P19-B8.5 for exactly this class of dropped stamp. ⇒ **the hop should hold — and "should" is not evidence.** **0 of 5 open positions carry the stamp (all opened 16:25Z, pre-fix), so the position layer has ZERO positive control.**
✅ **GATE: one promoted position carrying `gridAtBirth` must be observed before Step 8 is asked for.** Until then the criterion has no readable instrument at the layer it grades.
⇒ **BOTH arms stamp deliberately.** If only the passthrough did, *"no stamp"* would have to mean **both** *"rounded normally"* **and** *"born before this shipped"* — an absent value wearing a valid one's clothes, which is the failure this batch has met at every level.
⛔⛔ **THE COLD-START EXCLUSION IS AUTOMATIC ON xSTOCK ONLY — AND I STATED IT AS THOUGH IT COVERED BOTH LANES (Langston).** `passthrough` is gated on `gridIsDerivedForClass`, so **`resolved:false` is reachable only for xStock.** A cold **crypto** map returns `service_unready` → `reject` → `return null` ⇒ **no row is created at all.**
★ **The EFFECT is cleaner than I claimed — a cold crypto signal never becomes a row — but the stated MECHANISM would have misled a Step-8 reader into treating an unstamped post-deploy crypto row as benign warm-up.** At a 100%-absolute crypto bar it is the opposite:
⇒ ⛔ **POST-DEPLOY CRYPTO IS `resolved:true` OR IT IS A DEFECT.** An unstamped post-deploy crypto position did not come through the seam and is a **bypass-path finding** (`#927`/`#928`/`#929`, or a fourth), **never a cold-start exclusion.**
⇒ **The cold-start exclusion applies to xStock, where `resolved:false` is a real and expected value.**

⛔ **RECONCILIATION AT READ TIME:** read `metadata.gridAtBirth` off each position in the window.
- xStock passthrough (`resolved:false`) → **PASS**, and it names its own reason.
- xStock **off-grid while `resolved:true`** → **FAIL.** The grid was there and the price still missed it.
- **Stamp missing entirely** → the row predates this change ⇒ **EXCLUDED and counted separately**, never silently passed.
⚠️ `gridAbsentSymbols` on the diagnostics payload **stays** — it is a useful live operational read of coverage. **It is no longer the criterion's instrument**, and must not be used as one.

### ✅ VERIFIED LIVE AT THE RE-DEPLOY (`9150e2174`, 17:26:27Z) — and it moved two numbers

- **The named skips work.** 25 seconds after restart: `derived 453 grids, skipped 23 … — skipped: AMBR/USD,BHC/USD,…,WBD/USD`. **`WBD/USD` was NOT in the 22-name snapshot taken an hour earlier** — the rolling window had moved, which is exactly the drift that made the snapshot unusable as a denominator.
- ⛔⛔ **THE LIVE MAP'S COMPLEMENT IS 30, THE LOG'S SKIP LIST IS 23, AND THE DIFFERENCE IS NOT AN ERROR — IT IS THE POINT.** The refresher's SQL only sees symbols that HAVE ticker rows in the window; a symbol with **no rows at all** is neither derived nor "skipped" — it is never considered. ⇒ **absent-from-map (30) = skipped (23) + never-observed (7).** **The log's skip list is a strict SUBSET of the denominator and must never be used as it.** Langston's live-map complement is the correct instrument, for a reason neither of us had stated.
- ⛔ **A COLD-START HOLE THE MONOTONIC ARGUMENT DOES NOT COVER, now pre-registered:** the map grows from **EMPTY**, so between process start and the refresher's first completion (**measured ~25s at this deploy, ~20s at the previous**) the absent set is **the entire universe** — read directly during that window and it returned **483**. **An xStock position opening then would satisfy the PASS arm trivially.** ⇒ **AT READ TIME, any xStock open earlier than the first `[xstock-grid] derived` line following its process start is EXCLUDED and reported separately as cold-start — never counted as a pass.**
★ **ONE ALREADY RECONCILES:** the live log at 16:10:57 shows `ROOT/USD/sma_trend_ride verdict=grid_unknown` — and `ROOT/USD` is on the list above. The mechanism and the denominator agree on a real event.

### 3d. ➕ AMENDMENT 1 — xSTOCK OPENS NOW COUNT TOWARD THE WINDOW (Kyle, 2026-08-28; **APPENDED, NOT EDITED; STILL PRE-DATA**)

⛔⛔ **§3 ABOVE IS UNTOUCHED AND STAYS UNTOUCHED.** Langston froze this document because *"a pre-registered criterion that keeps moving while the data accrues is NOT pre-registered."* **This is appended beneath it** — the `B-TOKEN-WATCH` AMENDMENT-1 shape — so both the original and the change are readable, in order, by anyone auditing whether the bar moved to fit a result.

✅ **PRE-DATA PROOF, MEASURED AT THE MOMENT OF WRITING (2026-08-28T20:23:25Z), NOT ASSERTED:**
```
opens since the 17:49Z deploy, by asset class  ->  ZERO IN BOTH CLASSES
positions carrying metadata.gridAtBirth        ->  0
```
⇒ **NOT ONE OBSERVATION OF EITHER CLASS EXISTS IN THE POST-DEPLOY POPULATION.** ⛔⛔ **THIS SENTENCE IS FALSE AND IS CORRECTED IN §3e — IT MEASURES THE DEPLOY REF, NOT THIS CRITERION'S OWN ANCHOR. Read §3e before relying on any of this section.** *(Pointer inserted 2026-08-28; no claim in §3d is altered — the wrong reasoning is left standing on purpose so the sequence is auditable.)* The amendment is therefore a prediction, not a reaction — which is the ONLY property that makes amending a pre-registration legitimate, and it is perishable: **after the first open this could not honestly have been written.**

**WHAT KYLE FOUND** (his words: *"the way you need to see an Xstock trade also open, why only crypto?"*): §3's window counts **crypto positions only.** ⚠️ **And I had reported it to him more narrowly still — as though xStock were not graded at all. It is: §3's PASS/FAIL table has always carried an xStock row.** The defect is the COUNTER, not the grading.

**WHAT CHANGES — ONE THING ONLY:**
| | §3 as written | AMENDED |
|---|---|---|
| **the window** | first **30 crypto** positions opened after `2026-08-28T16:08:02Z`, or 7 days | ➕ **first 30 positions of EITHER CLASS**, same start, same 7-day cap |
| **crypto PASS/FAIL** | 100% on the published grid, no tolerance; any off-grid leg is the finding | ⬜ **UNCHANGED** |
| **xStock PASS/FAIL** | on-grid **OR** absent from the derived map at open time | ⬜ **UNCHANGED** |
| **§3a co-denominators, §3b control, §3c denominator** | mandatory | ⬜ **UNCHANGED** |

★ **THE ARGUMENT, WHICH IS HIS AND IS CORRECT: xStock is half the system, ALL FIVE currently-open positions are xStock, and a window denominated only in crypto structurally under-samples the class we are least sure about.** ⚠️ **Least sure precisely because its grid is OUR INFERENCE rather than the venue's statement** — so the softer standard and the thinner sampling were compounding, in the same direction, on the same class.

⛔⛔ **THE COST, STATED WITH ITS ARITHMETIC RATHER THAN GLOSSED — THIS AMENDMENT BUYS COVERAGE BY SPENDING CRYPTO DEPTH.**
Measured 7-day cadence: **crypto ≈5/day, xStock ≈2/day.** At that ratio 30 combined opens resolve to **≈21 crypto + ≈9 xStock in ≈4.3 days**, against §3's original **30 crypto in ≈6 days.** ⇒ **we trade ≈9 crypto observations for ≈9 xStock observations and a faster close.** ★ **At the OBSERVED ratio crypto still supplies ~71% of the window, so the absolute crypto bar keeps most of its power** — that is what makes the trade acceptable, and it is a fact about the current cadence, **not a guarantee.**

⚠️ **SO THE FAILURE MODE THE AMENDMENT INTRODUCES IS PRE-REGISTERED HERE RATHER THAN DISCOVERED LATER: A CRYPTO DROUGHT OR AN xSTOCK BURST NOW ENDS THE WINDOW EARLY ON A THIN CRYPTO LEG.** Under §3 that was impossible — the counter could not advance without crypto.
⇒ ⛔ **BINDING AT READ TIME: report the two legs SEPARATELY, each with its own n, and NEVER pooled into one percentage.** The classes are graded by different standards against different kinds of truth; a combined figure would be an averaging artifact of exactly the kind I have produced before.
⇒ ⛔ **AND IF THE CRYPTO LEG ARRIVES WITH `n < 15` — half the original 30 — THE CRYPTO RESULT IS REPORTED AS `UNDERPOWERED`, PASS OR FAIL.** ★ **The number is set NOW, before any open, and it is deliberately mechanical: at the observed cadence ~21 is expected, so 15 is the point at which the cadence assumption this amendment rests on has visibly broken.** ⚠️ **`UNDERPOWERED` here means the same as in §3a and carries the same duty: state the §3a co-denominators so a drought is distinguishable from the seam refusing.**

**AUTHORITY:** Kyle, 2026-08-28, after he found the gap himself. **Langston rules on it** — he set the freeze, and an amendment to a frozen criterion is his gate, not mine. ⚠️ **If he rejects it, §3 stands unamended and this section is struck rather than quietly deleted.**

---

### 3e. ➕ AMENDMENT 2 — DECOUPLED COUNTERS, AND §3d's PRE-DATA CLAIM WAS MEASURED ON THE WRONG POPULATION (Langston CHANGES-NEEDED, 2026-08-28; **APPENDED, NOT EDITED**)

⛔⛔ **FIRST, THE BLOCKER, BECAUSE IT IS MINE AND IT IS THE SAME SHAPE I HAVE BEEN BURNED BY TWICE TODAY.** §3d claims *"NOT ONE OBSERVATION OF EITHER CLASS EXISTS."* **FALSE.** I measured **opens since the 17:49Z DEPLOY**; the window anchor in §3 — **and in §3d's own table** — is **`2026-08-28T16:08:02Z`**. ★ **I raced to capture a perishable pre-data property and captured it against the wrong ref, inside the amendment whose entire warrant is that property.**

✅ **RE-DERIVED AT THE CRITERION'S OWN ANCHOR (by me, 20:30:25Z, after Langston named it):**
```
active_open_positions, opened_at > 2026-08-28T16:08:02Z
  xstock_spot  WEN/USD  2026-08-28T16:25:28.380Z  gridAtBirth = NULL
closed_trades opened since anchor:  xstock_spot = 1   crypto_spot = 0
```
⇒ **THE POPULATION §3d CREATES IS NOT EMPTY: n=1, NAMED — `WEN/USD`.** ★ **Enumerated here rather than described, because that property is exactly as perishable as the pre-data claim I was racing.** The crypto leg IS still empty at the anchor; only the newly-admitted class is not.
✅ **IT DOES NOT SINK THE AMENDMENT:** `WEN/USD` carries no stamp and is disposed by §3c's missing-stamp exclusion. **But the amendment must be honest about being written with one observation already inside its window, not zero.**

⛔⛔ **AND ADMITTING xSTOCK INHERITED A LIVE RULE COLLISION — TWO STANDING RULES GIVE OPPOSITE DISPOSITIONS TO THE SAME ROWS (Langston).** For the **1h41m between the window anchor `16:08:02Z` and the stamp becoming durable at the `17:49Z` deploy**, §3c says *"stamp missing ⇒ EXCLUDED, predates the change"* while the standing rule says *"post-deploy crypto is `resolved:true` or it is a defect."* **Same rows, opposite readings.**
⇒ ✅ **DECLARED NOW: `2026-08-28T16:08:02Z → 17:49:00Z` IS A NAMED EXCLUSION INTERVAL FOR BOTH CLASSES.** ⛔⛔ **THE END REF IS WRONG — CORRECTED TO `18:05:22Z` IN §3f. DO NOT IMPLEMENT FROM THIS LINE.** *(Pointer added 2026-08-28; the wrong value is left standing so the sequence stays auditable.)* The stamp **could not persist** in that interval, so an absent stamp there is not evidence of anything. **The defect reading begins at the STAMP-DURABLE ref (`17:49Z`), not at the window anchor.** ⚠️ `WEN/USD` falls inside it and is excluded on that ground as well as §3c's.

---

➕ **THE COUNTER CHANGE — §3d's SHARED WINDOW IS WITHDRAWN AND REPLACED. Langston's attack 1, and he is right that I did not have to make the trade at all.**

| | §3d as written | **AMENDED (binding)** |
|---|---|---|
| window | first **30 of EITHER class**, one shared counter | ➕ **TWO INDEPENDENT COUNTERS: crypto = first 30 crypto or 7 days · xStock = first 30 xStock or 7 days.** Same anchor, same cap |
| crypto leg | ≈**21** (diluted by sharing) | ✅ **keeps all 30** |
| xStock leg | ≈**9** opens | ✅ **a full 7 days of accrual** |
| pooling | forbidden by a read-time rule I wrote for myself | ✅ **ARITHMETICALLY UNAVAILABLE — separate denominators. A mechanism, not a promise** |
| `n < 15` UNDERPOWERED floor | needed | ⬜ **MOOT and withdrawn** — ~~the crypto leg now terminates on its own count, so the floor is unreachable~~ ⛔ **THAT REASON IS FALSE — see §3f RIDER-1. The withdrawal STANDS, on REDUNDANCY (§3's blanket n<30 rule is strictly stronger), not on unreachability.** |

★★ **WHY THIS IS STRICTLY BETTER AND NOT A COMPROMISE: BOTH LEGS GO UP.** §3d bought xStock coverage by spending crypto depth. **Decoupling buys both.** ⚠️ **Kyle asked that xStock be COUNTED; he did not ask that the two SHARE A WINDOW — I introduced the sharing, and it was never load-bearing on his instruction.**
✅ **AND IT ANSWERS MY OWN ATTACK 3 PROPERLY:** I flagged *"never pool the legs"* as a rule I was asking myself to follow at read time — **the weakest kind.** Separate denominators make pooling impossible instead of forbidden. ★ **Impossible over intercepted, again.**

⛔ **MY ≈9 xSTOCK WAS ALSO OPTIMISTIC, AND THE REASON IS A DENOMINATOR ERROR I SHOULD HAVE CAUGHT: THE WINDOW OPENS ON A FRIDAY AND RUNS INTO A WEEKEND.** xStock booked **ZERO opens on 08-22 and 08-23**. **A blended daily rate does not describe a window whose first two days are a weekend** — combined-30 plausibly resolved to ≈**23 crypto + ≈7 xStock**, i.e. §3d **bought less of the very thing it existed for than its own arithmetic promised.** Decoupling removes that failure mode with the sharing.

⚠️ **THE ONE COST, STATED PLAINLY AND FLAGGED TO KYLE: THE BATCH CLOSES LATER — ≈6-7 days rather than ≈4.3.** ★ **A faster close was a benefit to the SCHEDULE, never to the CRITERION** (Langston). **Kyle authorised counting xStock while we wait; he did not authorise trading evidence for speed, and this is his to reverse if he wants the earlier close.**

**AUTHORITY:** Kyle authorised admitting xStock (§3d). **This revision is Langston's CHANGES-NEEDED ruling on the FORM of that admission**, appended per his instruction. **§3d is superseded on the counter and the pre-data claim; everything else in it stands.**

---

### 3f. ➕ AMENDMENT 3 — THE EXCLUSION INTERVAL ENDED 16m39s TOO EARLY, AND THE UNDERPOWERED RULE MUST APPLY PER LEG (Langston CHANGES-NEEDED; **APPENDED, NOT EDITED**)

⛔⛔ **BLOCKER-1 — §3e's EXCLUSION INTERVAL ENDS AT THE WRONG REF, AND IT ERRS IN THE ONE DIRECTION THAT MANUFACTURES A FALSE DEFECT ON THE ABSOLUTE-BAR CLASS.**
§3e declared `16:08:02Z → 17:49:00Z` stamp-non-durable. **The stamp did NOT become durable at 17:49Z.** That reset is `bf1ac9620`; durability arrives with **`56ac8067a` — the RTB field-list fix**, whose own subject is *"F-G-1: the birth stamp DIED at the RTB rebuild -- measured, not assumed"* and which adds `gridAtBirth: rawSignal.metadata?.gridAtBirth` to the rebuild.
✅ **RE-DERIVED FROM THE DEPLOY CLONE'S REFLOG (`/home/deploy/dawntrader`), not from the deploy narrative:**
```
56ac8067a  HEAD@{18:05:22Z}: reset
bf1ac9620  HEAD@{17:48:43Z}: reset
```
⇒ **THE TRUE END IS `2026-08-28T18:05:22Z`. §3e WAS 16m39s SHORT**, and §3c's own measurement already showed a row at **17:59:29Z carrying no `gridAtBirth`** — ten minutes *after* my interval closed. ★ **In that gap an unstamped CRYPTO row falls OUTSIDE the exclusion, where the standing rule reads it as *"did not come through the seam ⇒ bypass-path finding"* — a FALSE DEFECT on the 100%-no-tolerance leg. Which is the exact collision §3e was written to kill, reintroduced by §3e.**
✅ **CORRECTED: THE EXCLUSION INTERVAL IS `2026-08-28T16:08:02Z → 18:05:22Z`, FOR BOTH CLASSES**, cited to the reflog line above.
⚠️ **IT BITES ZERO ROWS TODAY — nothing opened in the gap — which is precisely why fixing it is free and why leaving it would not have been defensible.** A latent false-defect trigger costs nothing until it fires.

---

⛔ **RIDER-1 — MY REASON FOR WITHDRAWING THE `n < 15` FLOOR WAS FALSE. RIGHT DISPOSITION, WRONG REASON, AND THE REASON IS CORRECTED RATHER THAN LEFT STANDING.**
§3e said the floor became *"unreachable"*. **It does not.** The crypto leg terminates on **30 crypto OR 7 days** — so under a `#570`-class drought it terminates on the **cap**, at n=12 or any value below 30, and the floor is squarely reachable.
✅ **THE FLOOR IS `REDUNDANT`, NOT UNREACHABLE:** §3's blanket rule — *"If 7 days elapse with fewer than 30, that is reported as an underpowered read, **not** as a pass"* — is **strictly stronger**, catching every n<30, not merely n<15. ★ **The withdrawal survives on that mechanism.** ⚠️ Corrected here because this document's warrant is auditable reasoning; a right answer resting on a false premise is the shape Langston retracted `#675` over.

⛔⛔ **AND THE GAP THAT WITHDRAWAL LEFT, WHICH IS THE PART THAT ACTUALLY MATTERS: I REMOVED THE ONLY EXPLICIT SHORT-n LABEL AT THE EXACT MOMENT DECOUPLING MADE THE xSTOCK LEG TERMINATE ON THE CAP.**
At ≈2/day **into a weekend** (xStock booked ZERO on 08-22 and 08-23), the xStock leg ends at **n≈7-10 of 30 — near-certain, not a tail risk.** ⚠️ **And §3's underpowered rule and §3a's co-denominators are written in CRYPTO's terms.**
⇒ ✅ **PRE-REGISTERED NOW, BEFORE ANY READ: §3's UNDERPOWERED RULE AND §3a's FOUR CO-DENOMINATORS APPLY *PER LEG, PER CLASS*.** An xStock leg that ends short is reported `UNDERPOWERED` in its own right, with its own four co-denominators.
★ **WITHOUT THIS, A PASS ON 7 xSTOCK ROWS WOULD READ AS *"the class we are least sure about was tested"* — KYLE'S AMENDMENT DEFEATED THROUGH THE BACK DOOR, by the very decoupling that was supposed to serve it.**

---

⚠️ **RIDER-2 — NAME THE COUNTER'S SOURCE TABLE. §3e's EVIDENCE BLOCK IS COUNTABLE TWICE.**
§3e prints `active_open_positions … WEN/USD` above `closed_trades … xstock_spot = 1`. **Those are the SAME POSITION, mirrored across two tables**, and a Step-8 reader unioning them gets **2**.
✅ **MEASURED, and the identity is the quantity to 8 dp plus a 111 ms write gap:**
```
closed_trades       03edb8e1  WEN/USD  qty 19.44708601  opened 16:25:28.269Z
active_open_positions e74a9a7c  WEN/USD  qty 19.44708601  opened 16:25:28.380Z
```
⇒ **n=1 IS CORRECT; THE SECOND ROW IS A MIRROR, NOT AN OBSERVATION.**
⇒ ⛔ **BINDING: THE WINDOW COUNTER IS DENOMINATED IN `closed_trades` ROWS (which are written AT OPEN), AND THE TWO TABLES ARE NEVER UNIONED.** ★ Naming the source table is the fix; *"count positions"* is ambiguous across a schema that mirrors them.

**AUTHORITY:** Langston's CHANGES-NEEDED on §3e, all three legs re-derived by me at the ref before acting. **§3e is superseded on the interval end and on the floor's REASONING; its decoupling, its `WEN/USD` enumeration and its withdrawal of the floor all stand.** ✅ **Still pre-data on the crypto leg; the xStock leg holds the one excluded row.**

---
### 3g. ➕ AMENDMENT 3b — THE THIRD RESET, AND THE POSITIVE CONTROL THE DURABILITY REF STILL LACKS (Langston, on re-derivation; **APPENDED**)

✅ **(1) THE THIRD RESET, NAMED SO IT STOPS BEING A QUESTION.** The deploy clone's reflog carries a reset **AFTER** §3f's corrected interval end: **`0e5ad6d62 HEAD@{19:11:13Z}`**, an hour past `18:05:22Z`.
⇒ **IT DOES NOT MOVE THE DURABILITY REF.** It is HOTFIX `#935` (trust-proxy): three files — `server/index.ts`, `PHASE_19_PLAN.md`, `RUNNING_ISSUES.md` — and **ZERO occurrences of `gridAtBirth`.**
★ **POSITIVE CONTROL ON THAT GREP, because a zero is exactly what needs one: the identical grep returns 11 on `56ac8067a`.** The instrument discriminates; the zero is a measurement, not a silence.
⚠️ **Recorded because a Step-8 reader who finds a reset an hour past the exclusion end will reopen a settled question** — and re-deriving it costs more than this paragraph.

⛔⛔ **(2) THE RESIDUAL THAT IS ACTUALLY LOAD-BEARING, AND IT IS A CAPABILITY INFERENCE — THE THING I HAVE BEEN CAUGHT ON ALL DAY.**
**`18:05:22Z` IS DATED FROM THE COMMIT THAT FIXES DURABILITY, NOT FROM AN OBSERVED DURABLE STAMP.** ★ *"The commit that makes X possible landed at T"* is **not** *"X was observed working from T"* — that is `capability ≠ coverage`, my own standing lesson, applied to a boundary rather than to an instrument.
✅ **THE NEGATIVE CONTROL EXISTS:** §3c's `17:59:29Z` row, unstamped, correctly INSIDE the interval.
⛔ **THE POSITIVE CONTROL DOES NOT: no row opened after `18:05:22Z` has yet been observed CARRYING `gridAtBirth: {resolved: …}`.** ⚠️ **On the 100%-no-tolerance leg the cost of being wrong is the THIRD recurrence of the same collision** — §3e reintroduced it once already after §3e existed to kill it.
⇒ ✅ **PRE-REGISTERED, §9.4 DISPOSITION 1 — FOLD INTO THE WORK IN HAND: STEP 8 OPENS WITH THAT READ, BEFORE ANY PASS OR FAIL IS STATED.** The first `closed_trades` row opened after `18:05:22Z` is inspected for a populated `gridAtBirth`; **until it is, the exclusion boundary is asserted rather than proved and no result may be reported against the criterion.**
★ **AND IT IS THE SAME READ AS GATE 2 — they are one observation, not two.** Gate 2 asks *"does the stamp reach a real position?"*; this asks *"and from when?"* **One row answers both, which is why this costs nothing to add and why neither can be discharged by argument.**
⚠️ **Rule 29(b), and Langston named the precedent as my own `#704`: the control must match the thing whose absence it licenses.** A boundary justified by a diff needs a row, not a diff.

---
### 3h. ➕ READ-TIME OBLIGATIONS — CLASS COMPOSITION, AND SAYING **n** OUT LOUD (Langston-directed; **APPENDED, NOT EDITED; POST-DATA ON THE xSTOCK LEG**)

⛔⛔ **THIS CANNOT LOOSEN THE CRITERION, AND THE REASON IS SPELLED OUT RATHER THAN LEFT ON TRUST — because a POST-DATA append to a pre-registered artifact must justify its own harmlessness.** §3's bar is **100% of entry/stop/target on the published grid, for crypto opens, no tolerance.** Everything below concerns **CO-DENOMINATORS and POPULATION LABELLING** — the context a result is read in. ★ **A class breakdown on a co-denominator cannot move a pass/fail bar that is denominated in on-grid legs of opened positions. Nothing here adds an exemption, widens a tolerance, or excuses a single off-grid leg.**

**(1) THE CLASS SPLIT IS MANDATORY AT READ TIME, and it exists because a sentence I wrote three times is false.** I reported *“ZERO crypto refusals.”* **`USDC/CAD` is `asset_class = crypto_spot`**, so by our own label crypto refusals are **not** zero. ⇒ **every refusal figure is reported split: (a) volatile crypto assets, (b) stablecoin-vs-fiat (`USDC/*`, `USDT/*`), (c) pure fiat-fiat.** ⚠️ **“crypto refusals = 0” is not a sentence this batch may print again without the split behind it.**

**(2) ⛔ PIN THE CLASS COMPOSITION — THE POPULATION CAN CHANGE UNDER THE WINDOW (Langston, and I had not seen it).** Sets **A** (stablecoin-leg, 20 closes) and **B** (fiat-fiat, 13) are labelled `crypto_spot`, **so they are INSIDE this criterion's population.** ★ **`#937` may remove them from the tradeable universe MID-WINDOW** — which would **silently swap the composition of “the first 30 crypto positions”** between the day the criterion was written and the day it is read. ⇒ ⛔ **RECORD THE PER-CLASS COMPOSITION OF THE WINDOW AT READ TIME, and state whether any universe change landed inside it.** A criterion whose population was redefined during the observation is not the criterion that was pre-registered.

**(3) ⛔ SAY `n` OUT LOUD, AND SAY WHICH ARM FIRED.** At 22:14Z: **9h since the last crypto open, capital 97.6% deployed across 5 xStock positions** ⇒ **the 7-day arm is likely to fire before the 30-open arm.** ★ **“100%, no tolerance” ON n=3 IS A MUCH WEAKER STATEMENT THAN ON n=30, AND MUST NOT BE READ AS THE STRONG ONE.** ⇒ the result prints **`PASS (n=…)`** or **`UNDERPOWERED (n=…)`**, never a bare PASS — per leg, per §3f RIDER-1.

**(4) ➕ MY OWN INSTRUMENT CORRECTION, found chasing a counter that went DOWN by one.** §3a's co-denominators come from `/api/vts/filter-diagnostics`, whose `vtsEvaluation` is **`getVTSEvalRolling24h()`** (`vts-runner.ts:282`) — it **prunes to a trailing 24h and aggregates**, so it **CAN decrease** and is **NOT cumulative-since-start.**
⛔⛔ **AND ITS HISTORY IS AN IN-MEMORY ARRAY THAT RESETS ON RESTART, SO THE WINDOW IS 24h NOMINAL BUT BOUNDED BELOW BY PROCESS UPTIME.** At 22:14Z the process had been up since **19:11Z** ⇒ **`gridEvaluated: 943` is ≈943 in THREE HOURS, not in 24.** ★ **A reader taking it as a 24-hour figure understates the rate by ~8×.** ⇒ ⛔ **every co-denominator read states BOTH the nominal window AND the process start, and takes the SMALLER as its true reach.**

**AUTHORITY:** Langston, on the `USDC/CAD` correction — *“the wording is the small part; your instrument is the finding.”* Items (1)–(3) are his; (4) is mine. ⚠️ **§3 and §3a are BYTE-UNTOUCHED; this is an addendum below them, and it is POST-DATA on the xStock leg** — which is exactly why its non-loosening is argued above rather than asserted.

---
### 3i. ✅ FIRST POST-DURABILITY ROW OBSERVED — GATE 2 AND §3g's POSITIVE CONTROL BOTH DISCHARGED, **ON n=1**

**`TRUMP/USD` · `crypto_spot` · opened `2026-08-29T00:15:02.176Z` — the FIRST row of any class opened after the durability ref `18:05:22Z`.**
```
gridAtBirth = {"tick": 0.001, "resolved": true, "provenance": "venue_published"}
entry  2.795 / 0.001 = 2795   ON GRID
stop   2.644 / 0.001 = 2644   ON GRID
target 3.031 / 0.001 = 3031   ON GRID
NEGATIVE CONTROL: 2.7955 / 0.001 = 2795.5 -> OFF GRID (the test discriminates)
```
✅ **§3g's POSITIVE CONTROL IS DISCHARGED: the `18:05:22Z` boundary is now OBSERVED, not inferred from a commit.** ✅ **GATE 2 is discharged: the stamp reaches a real promoted position.** ★ **One row answered both, exactly as §3g predicted.**
★ **AND IT IS A GENUINE VOLATILE CRYPTO ASSET** — not a currency-like pair — so it is the first observation that speaks to the crypto leg at all.

⛔⛔ **`n = 1`. THIS IS NOT A PASS AGAINST §3, AND MUST NEVER BE READ AS ONE.** §3's bar is the **first 30 crypto opens or 7 days**, whichever comes first. **One on-grid position is one observation** — per §3h(3) the result prints `PASS (n=…)` / `UNDERPOWERED (n=…)` and this is neither yet. ⚠️ **It discharges the two MECHANISM gates; it does not touch the criterion.**

⛔⛔ **CORRECTED 2026-08-29 (Langston, re-derived by me) — MY FIRST RIDER GRADED THE WRONG COLUMN, AND IT IS THE DEFECT THIS WHOLE BATCH EXISTS TO FENCE: A TEST THAT CANNOT FAIL.**
**`closed_trades.entry_price` = `2.795` is the FILL, not the seam's output.** The seam's own number is `active_open_positions.intended_entry_price` = **`2.789`**. ✅ **VERIFIED EXACTLY: `2.795 − 2.789 = 0.006`, and `entry_slippage 0.11470578 ÷ qty 19.11763 = 0.006`.**
★ **A VENUE FILL IS ON THE VENUE'S GRID BY CONSTRUCTION — so grading the entry leg on `entry_price` GRADES KRAKEN, NOT US, AND CAN NEVER RETURN A FAILURE.** ⚠️ **Exactly the objection I raised against a control-free pass, committed by me one column over, inside the rider meant to make the read sound.**

⛔ **AND MY CROSS-TABLE FIX WAS OVER-WIDE.** `closed_trades.take_profit` carries `3.031` **in the same row, at open** — so the split is **NOT** open-table-vs-closed-table. ★ **THE REAL PATTERN IS INTENT-SIDE vs FILL-SIDE:** `intended_entry_price` / `actual_entry_price` / `target_exit_price` / `actual_exit_price` are NULL here **as one family**, because none of them is known until the fill or the close.

✅ **BINDING — THE CRITERION IS READ ON THE THREE INTENT-SIDE COLUMNS, ALL PRESENT AT OPEN IN `active_open_positions`, NO CROSS-TABLE HOP AND NO CLOSE-TIME SWITCH:**

| leg | column | TRUMP/USD | on 0.001 grid |
|---|---|---|---|
| entry | **`intended_entry_price`** | `2.789` | ✅ 2789 |
| stop | **`stop_loss`** | `2.644` | ✅ 2644 |
| target | **`take_profit`** | `3.031` | ✅ 3031 |

★ **THE §3i VERDICT IS UNCHANGED — both entry values happen to sit on the grid — but the TEST changed, and that is the point: a right answer from an instrument that could not have said otherwise is not evidence.**

⚠️ **SUPERSEDED BELOW — the original rider is kept for the sequence:** ⛔ **INSTRUMENT TRAP FOUND IN THE SAME READ, and it would have produced a FALSE FAIL:** `closed_trades.target_exit_price` is **NULL at open** — the live target lives in **`active_open_positions.take_profit`** (`3.031`). ★ **A read that takes all three legs from `closed_trades` alone at open time sees a missing target and scores the row as failing.** ⇒ ⛔ **BINDING, extending §3f RIDER-2: entry + stop from `closed_trades`; TARGET from `active_open_positions.take_profit` while the position is open, and from `closed_trades.target_exit_price` only once closed. Name the source table per leg.**

---
### 3j. ✅ OBSERVATION 2 — AND THE WATCH THAT SHOULD HAVE REPORTED IT WAS DEAD ON ARRIVAL

**`SPX/USD` · `crypto_spot` · opened `2026-08-29T01:35:30.320Z` · `{tick 0.0001, resolved true, venue_published}`** — read on the §3i intent-side columns:
```
entry(intended) 0.5287 / 0.0001 = 5287   ON GRID
stop            0.5091 / 0.0001 = 5091   ON GRID
target          0.5613 / 0.0001 = 5613   ON GRID
```
✅ **n = 2 crypto opens, 2 on-grid, 0 off-grid.** ⛔ **Still not a pass — §3's bar is 30 or 7 days.**

⛔⛔ **THE PART THAT MATTERS: MY KILL-CRITERION WATCH DID NOT REPORT THIS POSITION, AND HAD NOT BEEN WORKING SINCE THE MOMENT IT WAS ARMED.**
**Root cause, measured by re-running its own command with stderr restored:** the nested `ssh → su -c → psql -c` quoting collapsed — `psql` never received the SQL (`invalid command \`, `bash: SELECT: command not found`). ★ **AND I HAD WRITTEN `2>/dev/null` INTO IT, so a total failure printed nothing and was INDISTINGUISHABLE FROM “no new positions.”**
⚠️ **TWO HOURS ARMED, ZERO CAPABILITY.** A `KILL-CRITERION HIT` could have passed through it unseen — on the one condition that would sink the batch.
★★ **AND IT IS THE SAME DEFECT CLASS THE BATCH EXISTS TO FENCE, ON THE ALARM BUILT TO FENCE IT** — `control-enumerates-the-observed`'s sibling: **an instrument whose silence is read as a result, never proved able to speak.** ⛔ **I found it only because I refused to trust the silence and queried the DB directly.**

✅ **REBUILT AND PROVED BEFORE ARMING, which is what I failed to do the first time:**
- **SQL moved to a FILE on staging** (`/home/deploy/fg1check.sql` + `fg1check.sh`) — **no nested quoting to collapse.**
- ⛔ **NO stderr suppression.** A non-zero exit or an error string now emits **`WATCH-BROKEN (rc=…)`** as an event — **the watch reports its own death.**
- ✅ **FOUR POSITIVE CONTROLS RUN, all fired:** off-grid leg · `ABSENT` stamp · `resolved:false` · missing intent-side leg. ✅ **NEGATIVE CONTROL: the real `SPX/USD` row passes.** ★ **The alarm is now proved able to say both words.**

---
### 3k. ➕ `never_filled` ROWS COUNT — THE DENOMINATOR DECIDED **BEFORE** MORE DATA ARRIVES (Langston-directed)

⚠️ **BODY REWRITTEN 2026-08-29 TO THE SURVIVING VERSION (Langston).** §3l falsified five load-bearing sentences in the original, and **this file BECOMES `F_G_1_COMPLETION_REPORT.md` (§6) — so a correction STACKED on wrong text would convert the wrong text verbatim into the completion report's argument.** ★ **The error record lives in the commit (`98e365bfc`) and in the mistake log, NOT here.** ⛔ **This is the same standard he applied to my `#937` body, and it is right for the same reason.**

⛔⛔ **DECIDED NOW BECAUSE OTHERWISE THE WINDOW'S SIZE IS DATA-DEPENDENT** — i.e. settleable later by whichever answer helps. **Langston: *“Decide it now, in writing.”***

✅ **MEASURED:** August crypto, truly closed — **121 rows; 109 carry `intended_entry_price`; 12 do NOT, and ALL TWELVE are `close_reason = never_filled`** (all 12 retain `stop_loss` and `take_profit`).

✅ **DECISION: `never_filled` ROWS **DO** COUNT toward §3's “first 30 crypto positions opened”.**
★★ **THE REASON IS LANGSTON'S AND IT IS STRONGER THAN THE ONE I FIRST GAVE: `never_filled` IS NOT INDEPENDENT OF THE PROPERTY UNDER TEST.** If the seam ever emitted an off-grid entry, **an unfillable price is a plausible signature of exactly that.** ⚠️ **He states he has NOT verified that mechanism and does not assert it** — but it cannot be ruled out, **and that alone forbids excluding the slice: excluding it would be SELECTING ON THE OUTCOME**, removing the rows most enriched for the defect.
⇒ ⛔ **BINDING COROLLARY: A `never_filled` ROW WHOSE STOP OR TARGET IS OFF GRID IS *THE FINDING*, NOT A DATA GAP.**

✅ **AND THE DECISION COSTS NOTHING, because the entry leg is DURABLY READABLE for every row — see §3l.** `rtb_shadow_pairings` carries `entry_price` for all 12, and it equals `intended_entry_price` on **109 of 109** filled rows where both exist. ⛔ **No row is stamped `UNREADABLE`; that label was withdrawn before it was ever applied.**

✅ **PER-LEG `n` STANDS (condition 2), and it is a guard rather than a live constraint:** the bar is reported per leg — `entry n=…`, `stop n=…`, `target n=…` — and **the entry leg needs `n ≥ 20` readable or it prints `UNDERPOWERED` and the window extends FOR THAT LEG ONLY.** ⚠️ **This makes the DENOMINATOR honest, never the THRESHOLD: every readable leg must still be on grid, 100%, no tolerance.** ★ Kept though currently non-binding, because it guards a future retention change.

⚠️ **AND `closed_trades` HOLDS A ROW FOR THESE POSITIONS TOO, WRITTEN AT OPEN** — a retrospective read unioning both tables would report **n=4** for the two positions observed so far. **It is n=2.** *(§3f RIDER-2's never-union rule, biting a second time.)*

---
### 3l. ⛔ THE `UNREADABLE (entry)` LABEL IS WITHDRAWN — IT WAS AN ASSERTED ABSENCE AND IT IS NOW FALSIFIED (Langston condition 1)

⛔⛔ **§3k SAID: *“`intended_entry_price` lives on the `active_open_positions` row, which is gone”* — AND I NEVER CENSUSED THE OTHER TABLES BEFORE SAYING IT.** ★ **Langston: *“the UNREADABLE label is not earned yet — it's an asserted absence.”*** ⚠️ **Rule 22, in the section I wrote to be careful about exactly this.**

✅ **THE CENSUS, RUN:**
| table | rows | verdict |
|---|---|---|
| `rtb_signals` | **0** | ⛔ a LIVE queue, not a history — rows are removed on promote/expire. **Langston's first candidate cannot recover anything, on retention.** |
| `rtb_shadow_pairings` | **50,232**, `2026-07-14 → 2026-08-29` | ✅ **DURABLE.** Carries `entry_price` / `stop_price` / `target_price`, snapshotted at promotion |

✅✅ **AND `DURABLE` IS NOW *EARNED*, NOT ASSUMED — Langston ran the census neither of us had: `rtb_shadow_pairings` HAS NO DELETER ANYWHERE IN THE TREE.** One writer (`rtb-shadow-store.ts`, INSERT + UPDATE), four readers in `routes.ts`, plus migrations and tests — **zero sweep / prune / retention references, and the table is ABSENT from the retention sweep's list.** ★ **Independent corroboration: `routes.ts:2796` records 14,232 rows on 2026-07-22 against 50,232 today — monotone, no trim.** ⚠️ **AND THE `2026-07-14` START IS THE CRYPTO PAPER-ACTIVE SWITCH-ON, NOT A RETENTION FLOOR** — that distinction is the `B-ARM-REMOVAL` trap (an mtime read as an origin) **and it does not bite here, because it was checked rather than assumed.**
| join key | — | `closed_trades.metadata->>'originalSignalId'` → `rtb_shadow_pairings.signal_id`. **`closed_trades` has no `signal_id` COLUMN** — the key is in the metadata |

✅ **POSITIVE CONTROL — HIS, AND IT IS THE ONE THAT MATTERS, because a value EXISTING is not the RIGHT value existing:** on the **109** August crypto rows that DID fill and carry both numbers — **`rtb_shadow_pairings.entry_price = intended_entry_price` on 109 of 109. 0 differ, 0 null.**
✅ **AND ALL TWELVE `never_filled` ROWS HAVE A SHADOW ROW CARRYING `entry_price` — 12 of 12.**

⇒ ✅ **THE ENTRY LEG IS DURABLY READABLE FOR EVERY ROW, INCLUDING `never_filled`. `UNREADABLE (entry)` IS WITHDRAWN — no row will be stamped with it.** §3k's decision to COUNT `never_filled` **stands and is now free of its only cost.**

★★ **AND LANGSTON'S REASON FOR COUNTING THEM SUPERSEDES MINE — recorded because it is stronger and mine was merely adequate.** I argued *“two of three legs stay testable.”* **His: `never_filled` is NOT INDEPENDENT OF THE PROPERTY UNDER TEST** — **if the seam ever emitted an off-grid entry, an unfillable price is a plausible signature of exactly that.** ⚠️ **He states he has NOT verified that mechanism and does not assert it** — but it cannot be ruled out, **and that alone forbids excluding the slice: excluding it would be SELECTING ON THE OUTCOME**, removing the rows most enriched for the defect.
⇒ ⛔ **COROLLARY, BINDING: A `never_filled` ROW WHOSE STOP OR TARGET IS OFF GRID IS *THE FINDING*, NOT A DATA GAP.**

➕ **ENTRY-LEG FLOOR, PRE-REGISTERED (condition 2):** per-leg `n` reported honestly would still permit **entry closing at n=3 while stop/target close at n=30** — and **entry is precisely the leg carrying `#927`/`#928`/`#929`.** ⇒ **the entry leg needs `n ≥ 20` READABLE or it prints `UNDERPOWERED` and the window extends FOR THAT LEG ONLY**; stop and target close on their own `n`. ✅ **Kept even though the census just made it non-binding in practice — it costs nothing and it guards a future retention change.**

➕ **WHO READS THE HEARTBEAT (condition 3) — ANSWERED HONESTLY RATHER THAN INVENTED.** **Reader: THIS SESSION, at its own hourly crew heartbeat**, which already prompts a watcher check. ⛔ **RESIDUAL, NAMED: if the session dies, the watch dies with it and NOTHING NOTICES.** ✅✅ **CLOSED 2026-08-29 (Langston's five-minute fix): the window is now ARMED AS A SELF-RESCHEDULING SYSTEM ALERT, `2093a98a-1439-49cb-a8c6-27687c87ed77`, `triggers_at 2026-09-04T16:08:02Z`, owner CC-C, dedupe `f-g-1-close-window`.** ★ **AND THE ENTIRE READ PROCEDURE TRAVELS INSIDE THE ALERT BODY — all nine pre-registered rules, 2,233 chars — so whoever picks it up does not need this file, this session, or me.** ⚠️ **§9.4 SANCTIONS THE DATE HERE and it is the one legitimate case: a window whose LENGTH IS THE CONTENT** (30 crypto opens or 7 days from `2026-08-28T16:08:02Z`) — **a measurement parameter, not a fake commitment.** ⇒ **the criterion no longer depends on a session staying alive.** ★ **What makes that survivable is the census above, not a second watcher: the criterion reads DURABLE rows — `closed_trades` + `rtb_shadow_pairings` — so a dead watch now costs LATENCY ONLY, on every slice.** ⚠️ **That was NOT true an hour ago**, when the `never_filled` entry leg was believed perishable and the watch was genuinely load-bearing.

---
## 4. WHAT IS UNPROVEN, AND WHAT WOULD FALSIFY IT

- ⛔ **THE HEADLINE IS NOT "ONE ROUNDING SEAM".** It is **"one seam on the signal-birth path; three entry points bypass it, named"** — `#928` an HTTP intent path taking a triple straight from the request body, `#929` a second position-sizing caller, `#927` a fabricated `entry * 1.02` target in three places, one of them the RTB **ranking** key. All homed with owners and plan positions. **Langston approved the batch shipping with them named; he did not approve it shipping under the old headline.**
- **`#933`** — the published venue map is fetched **once at boot** and nothing retries it. F-G-1 introduced the first consumer whose empty-map behaviour is *stop trading*. **The detection half shipped** (distinct reason + one critical alert naming the restart); **the recovery half did not** and is `B-VENUE-PAIRS-REINIT`, plan row 3k. ⚠️ **Frequency unmeasured — the mechanism is cited, not a rate.**
- **`#918`'s measured impact is NIL at n=4.** It ships because wiring an existing function into shutdown is trivially correct, **not** because it is load-bearing, and it must not become OBJ-9's headline.
- **Steps 4 and 5 of the xStock counter chain are text-protected only** — the `as any` that made `BLOCKER-10` possible still exists at two sites, moved rather than removed. **The claim is that the two hardcoded lists carry the keys, not that the value flows.**
- **Five controls in this batch did not fire on first writing** and were rewritten until the mutation killed them. **Of those, two were found by running the mutation, two by Langston naming them, one by a fresh reader — and none by reading my own test.**

---

## 5. GOVERNANCE FILES CHANGED SO FAR

`SYSTEM_IMPACT_MAP.md` (§9.14b the VPG, §9.14c the VOG, and the bypass table) · `SYSTEM_MANUAL.md` (Chapter 5 representability section + the same bypass table) · `RUNNING_ISSUES.md` (`#916`–`#930`, `#933`; `#925` amended) · `PHASE_19_PLAN.md` (rows 3, 3b–3k) · `MISTAKE_PATTERNS.md` (`fix-follows-pointer`) · `MEMORY_CC_C.md` · the change list in `Claude Comms and Packages/Change Lists/`.

☐ **Still owed at Step 10:** `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN` §1 status board + §5 decision log, the shared `MEMORY.md`, and Langston's `/home/langston/MEMORY.md` (10.b).

---

## 6. CONVERSION

When the window closes this file **becomes** `F_G_1_COMPLETION_REPORT.md` — same batch, recording **both halves**: what the data showed **against the criterion quoted as written above**, and **what decision or action was taken on it, and by whom.** A completion report that states the data and not the decision has not closed the loop.
