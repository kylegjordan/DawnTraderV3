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

★ **THE FIX IS ONE STAMP, AND IT DISSOLVES BOTH: the signal records what it saw AT BIRTH.** Every signal through the seam now carries `metadata.gridAtBirth` — `{resolved:true, tick, provenance}` on the rounded path, `{resolved:false, reason, provenance}` on the passthrough — and `rawSignal.metadata` spreads into `rtb_signals.metadata` at the birth insert, so it is **durable per row, immune to log rotation, to later re-derivation, and to restarts.**
⇒ **BOTH arms stamp deliberately.** If only the passthrough did, *"no stamp"* would have to mean **both** *"rounded normally"* **and** *"born before this shipped"* — an absent value wearing a valid one's clothes, which is the failure this batch has met at every level.
⇒ **THE COLD-START EXCLUSION IS NOW AUTOMATIC:** an open during the warm-up carries `resolved:false` on its own row and is classified by that, with no boundary line to find.

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
