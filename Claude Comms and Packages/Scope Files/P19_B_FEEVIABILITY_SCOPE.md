# P19-B-FEEVIABILITY — SCOPE

**CC-C, 2026-08-10. Kyle-directed. For Langston Step-1 review.**
**change-class: `architecture`** — touches the SQE reject write path, a per-class gate constant, and per-strategy geometry levers. Declared strict per §2 1.b.
**Supersedes the shape in `STRATEGY_FEE_VIABILITY_TWO_BATCH_PROPOSAL.md` §1.** The investigation moved the batch's centre of gravity: it is **no longer primarily about tuning targets.**

---

## 0. WHAT CHANGED, AND WHY THE BATCH IS NOT WHAT WE PROPOSED THIS MORNING

**The arithmetic survey said which strategies COULD clear the fee. The hit-rate replay said what raising a target COSTS. Together they invert three of the four changes originally proposed.**

**★ THE FINDING THAT RESHAPED IT: two of the three best candidates are blocked by something OTHER than their own geometry.** `pivot_shift` is blocked by an uncalibrated placeholder ceiling; `volatility_edge` is blocked by a regime that occurs 2.1% of the time. **Removing an obstruction in front of a strategy that already works beats tuning one that does not.**

---

## 1. THE EVIDENCE THIS SCOPE RESTS ON (all measured this session; object + population stated)

### 1.1 The fee-viability survey — OBJECT `vts_open_trades` (ungated ⇒ no admission bias on geometry), POPULATION all crypto rows opened in the trailing 21 days, n≥20 per strategy
`T_required = ((1−p)·S + F) / p`, `p = maxPWin = 0.60`, `F` at both bounds (taker 1.60%, maker 0.80%).
**Crypto: 4 of 11 clear at their current settings; 7 do not.** ~**71% of crypto signal generation (≈22,000 of 31,000)** comes from strategies that cannot clear the fee as set.

### 1.2 The hit-rate decay — COUNTERFACTUAL REPLAY, no setting changed
**Method:** raising a target changes **neither the entry nor the stop**, so for every recorded trade we hold entry, stop and the actual subsequent prices — walk them forward and ask whether the larger target was reached before the stop. **Dodges Langston's break-case because VTS is UNGATED** (no admission selection on the swept axis). 24h forward window; both-hit scored as **loss** (conservative); August partition.

| strategy | n | current | +25% | +50% | +100% |
|---|---|---|---|---|---|
| **pivot_shift** | 135 | **73.3** | 69.6 | **69.6** | 10.4 |
| **volatility_edge** | 4,267 | **45.2** | **45.0** | 28.7 | 11.0 |
| **sma_trend_ride** | 376 | 14.9 | 14.9 | **14.6** | 10.1 |
| inside_bar_reversal | 299 | 52.2 | **6.4** | 6.4 | 0.0 |
| reverse_impulse | 169 | 23.1 | 11.2 | 8.9 | 8.9 |
| strong_bull_trend | 160 | 18.1 | 12.5 | 9.4 | 3.1 |
| morning_star | 553 | **2.0** | 0.7 | 0.7 | 0.7 |
| vwap_pullback | 40 | 0.0 | 0.0 | 0.0 | 0.0 |

⚠️ **CC-C's pooled "~10 points per half-multiple" is WITHDRAWN — it was meaningless.** Decay is wildly strategy-specific.
⚠️ **READ THESE COLUMNS AS A LOWER BOUND ON HIT RATE, NOT AN ESTIMATE (Langston Q4):** the 24h truncation and both-hit-as-loss both cut the same direction, the cut GROWS with target size, and its magnitude is strategy-specific (time-to-target differs) — so the bias can REORDER the candidates, not just shift them.

### 1.3 Two gates upstream of netEV that the earlier funnels MISSED
**⛔ THE ORIGINAL LOG-GREP FIGURES HERE ARE RETRACTED (pre-audit §A.5, 2026-08-11).** *"`unreachable` 1,452 in 5.2h, `sma_trend_ride` 926"* counted **`[reorg-B3.3x][VTS][TAG_NO_DROP]` lines — VTS TAGS, not drops.** The crypto VTS lane runs `gateDisposition='tag'` and **simulates anyway**; its own log text says so. **I measured a lane that by construction does not drop.**

**★ REPLACED BY THE PURPOSE-BUILT INSTRUMENT.** **OBJECT:** the persisted `guard-eval-tracker`, `GET /api/diagnostics/guard-eval-stats` (`guard-eval-stats/v3`). **POPULATION:** every guard evaluation since `trackerStartedAt 2026-06-23T19:51:53Z` — **a seven-week window persisted across restarts**, not a 5-hour slice.

| strategy | evals | passes | **reachDrops** | **reach %** | rrDrops | meanRR |
|---|---|---|---|---|---|---|
| **`sma_trend_ride`** | 97,975 | 12,002 | **80,233** | **81.9%** | 4,869 (5.0%) | **2.00** (rrMin=rrMax) |
| **`vwap_pullback`** | 241,263 | 13,254 | **129,628** | **53.7%** | 88,043 (36.5%) | 2.21 |
| **`morning_star`** | 503,233 | 168,779 | **0** | **0%** | **333,566 (66.3%)** | **1.05** |

⛔ **RETRACTED A SECOND TIME (pre-audit §A.6).** `recordGuardEval` fires **BEFORE** `guardForcesDrop`, and VTS (`disposition='tag'`) does **not** drop — so `reachDrops` counts the guard's **verdict across BOTH lanes**, not enforced active-path drops. **81.9%/53.7% are not the live drop rate.**
**★ AND THERE IS NO LIVE SOURCE — BY DESIGN.** `stage-attrition-cache.ts:25`: *"`strategy_internal` has no active-path writer at all — it is a VTS-only stage. A blank active cell there is correct."* Working-as-designed, not a gap.
**⇒ WHAT SURVIVES:** the ceiling demonstrably suppresses these two strategies **heavily in the population we can see**, and `morning_star` takes **zero** reachability drops while dying on RR at meanRR **1.05** — that contrast is lane-independent and stands.
⇒ **`morning_star` has ZERO reachability drops; it dies ENTIRELY on the RR floor at meanRR 1.05 against 2.5.** A **third** independent instrument agreeing with the 2.0% hit rate — the retire-or-rebuild call at §4.2 is now firmly evidenced.
⚠️ **STILL UNMEASURED:** whether those `reachDrops` come from GUARD-5, the normalizer, or both — the tracker records the **guard's** verdict only. **That is #371, and pre-audit §A.4 re-sequences OBJ-3 behind it.**

### 1.4 Provenance of the blocking constants — **they were never calibrated**
⚠️ **PROVENANCE CORRECTED (pre-audit A.11; Langston ground 2):** the `BATCH_CATALOG:378` trio "4%/2.5/4.0" is `target_floor_pct` / `min_rr` / **`roi_absolute_max`** — **NOT `reach_atr_max`, which arrives at reorg-B2.1 OBJ-3**, where its 2.5-sibling was *"the winner of a two-value conflict, not a calibrated number."* Homed at roadmap **25-17** (*"calibrate the floor and reach_atr_max DOWN on its own realized paper-active data"*) + `RUNNING_ISSUES` **#336**.
**★ The placeholder's stated rationale no longer holds:** it was justified by the **taker** fee wall. **MEASURED, `closed_trades` post-2026-07-28 cutover: crypto fills MAKER 44 of 46 = 96%** at 0.40%/side; xStock fills **TAKER 82 of 96 = 85%**. Crypto pays **half** xStock's friction and still cannot clear.
**★ INDUSTRY RE-DERIVATION (Kyle-directed):** practitioner literature uses **1.5–2× ATR as a target SETTING** and 3–4× for position trading — **nowhere as a maximum-reachable CEILING.** We appear to have borrowed a number from a context where it means close to the opposite. *Reasoning only; no source states a cost basis.*

### 1.5 `volatility_edge` — not killed, rarely ELIGIBLE
6,681 log events, **every categorised one VTS/MCE — zero active-path.** Cause at `canonical-regime-strategy-map.ts:139`: it is **IE-registered**. **MEASURED regime distribution** (`signal_eval_archive`, crypto, 24h, all 22,196 labelled rows): RBS 7,893 · TFS 7,089 · ST 6,427 · **IE 462 (2.1%, six pairs)** · HVU 293.

### 1.6 Pair-exclusivity — a real exit, recorded NOWHERE
**122 blocks in 5.2h** (`hasActivePair`, strategy-agnostic) on VVV 56 / ICNT 46 / XMR 20 — **all three genuinely held; the block is CORRECT behaviour.** Ten of fifteen slots were free ⇒ **not capacity, exclusivity.** **POSITIVE CONTROL:** `signal_eval_archive` over all **369,409** crypto rows in the same window returns **4,010** rows matching `netev` and **ZERO** matching `duplicate`/`pair`. ⇒ the funnel is blind to it, and **shadows cannot recover it** (no pool entry ⇒ no shadow row).

**★ WORKED EXAMPLE — ⛔ RETRACTED 2026-08-11 (Langston). IT DOES NOT SHOW WHAT CC-C CLAIMED. Kept visible because the retraction is the useful part.**
A **PUMP/EUR** signal sat in the Ready-to-Buy pool for **18 minutes**, `pivot_shift`, netEV **0.000003**, **Maker** mode, **10 of 15 slots free** — and was never promoted.
**CAUSE, verified in `closed_trades`: PUMP/EUR was ALREADY AN OPEN POSITION at that instant** — opened `07:46:49Z`, closed `08:10:43Z` on `stop_hit`, lane **`organic`**. ⇒ **capacity was never the constraint; pair exclusivity was.**
**⛔ WHY IT IS RETRACTED — Langston pulled the closed trade's own `metadata`:** `source: RTB_PROMOTION`, `queuedAt 07:46:19.322Z`, `netEvAtAdmit 0.0000033017`, `admissionBasis organic`, `rtbQueueId e6739c0a…`. Queued 07:46:19 → screenshot 08:05 = **18m41s**; netEV rounds to **0.000003**; strategy `pivot_shift`; lane organic. ⇒ **every number CC-C attributed to a "blocked signal" is a property of the row that BECAME the position. It is the same queue row seen twice, not an independent witness.**
**AND THE MECHANISM CANNOT DO IT:** `ready_to_buy_service.ts:2104-2109` — `hasActivePair(...)` → log → **`return null`**, at **admission** inside `queueSQESignal`. **A signal blocked there never enters the pool, so it cannot sit in the pool for 18 minutes.** What was screenshotted was **admitted at 07:46:19, thirty seconds BEFORE the position existed.**
**⇒ HONEST READING: a pool-eviction or UI-staleness defect at the PROMOTION stage — a different site, which OBJ-1 does NOT address.** Homed as its own item (§5 Q5).

**★ OBJ-1 SURVIVES ON THE MECHANISM, NOT THE ANECDOTE — and Langston made it stronger AND cheaper:**
- `:2107` is a **bare `console.log`** — no row, no archive — and `out.log` rotates in **~2 days** on this box. *"Erases itself"* is true and now has a citing line rather than a story.
- ⚠️ **AND THE SINK ALREADY EXISTS:** `rtb_signals` carries a purpose-built **`block_reason`** column with a **live writer at `ready_to_buy_service.ts:2325`** — and Langston's query returned **`count(*) = 0`**. *(A snapshot, not history — he explicitly declines to claim zero-rows-ever.)*
- ⇒ **OBJ-1 IS PROBABLY NOT "BUILD CAPTURE." IT IS "FIND OUT WHY THE DESIGNED SINK IS EMPTY"** — a rule-24 three-way question (real defect / working-as-designed-unaddressed / legacy), not a fix. **Re-scoped accordingly; it gets cheaper, not bigger.**

---

## 2. OBJECTIVES

> **Sequenced. OBJ-1 and OBJ-2 are PRECONDITIONS — nothing else deploys before them. OBJ-0 runs CONCURRENT with them and gates OBJ-4/OBJ-5 (Langston 2026-08-11).**

**★ OBJ-0 — RUN THE OBSERVATIONAL DECISION GATE, ROADMAP ITEM 25-5. Runs BEFORE OBJ-1. (Kyle-flagged 2026-08-11; CC-C had wrongly filed this to batch two with NO DATE — the §9.4 vague-deferral failure, on an item whose triggers are ALREADY MET.)**

**⚠️ NAMING CORRECTED — Kyle was right and CC-C was using a dead label.** It is **roadmap item `25-5`**, **Phase-25-homed**. `POST_AUDIT_ROADMAP:310` catalogues it as `| 25-5 | §19.4.5 Observational Decision Gate |`, and `:291` states the four calibration sections *"keep their original anchor numbers but are Phase-25-homed."* ⇒ **`19.4.5` is a preserved SECTION ANCHOR, not its phase.** This makes OBJ-0 **the same kind of phase-move as OBJ-3 (25-17), not a special case** — both pull a Phase-25 item forward because paper-active data now exists and the item gates work in front of it. *(⚠️ `:245` still positions the gate in the Phase-19 run order — an internal inconsistency in the roadmap; flagging, not fixing, in this batch.)*

**WHAT IT IS:** created 2026-04-26 after B65.6 closed via SKIP; nine items to decide once 1–2 weeks of clean active-paper data exist. Reference: `Claude Comms and Packages/Scope Files/B65_6_FINDINGS_PAPER.md`.
**STATE: NEVER RUN.** No `PHASE_19_OBSERVATIONAL_DECISIONS.md` exists anywhere in the repo — **Langston-verified at the ref with a passing positive control.**
⚠️ **CC-C CORRECTION (Langston, 2026-08-11): my claim that `19.4.5` returns "zero hits in `PHASE_19_PLAN.md`" was FALSE at `3561ed94d`.** `PHASE_19_PLAN.md:18` carries it — **and the hit is MY OWN batch-two line, written the previous day.** I measured a document against a line I had just put in it, and the line additionally still filed the gate to batch two, contradicting this §2. **Fixed in the same commit** per §14.

**TWO OF ITS NINE TRIGGERS ARE ALREADY MET:**
- **Item 2 — fewer than 5 signals/day** ⇒ trigger is to **widen the pair universe**. **Crypto is at 3 organic trades in 21 days.** Met by a wide margin.
- **Item 3 — outcome-vs-confidence inversion** ⇒ trigger is to **reopen B65.6 as a PRE-LAUNCH fix**.
  ⚠️ **CC-C CORRECTION (Langston):** the **TFS 13.8% / STR 83.3%** figures are **the roadmap's own 04-22 COMPARATOR** (`:421`) — **CC-C quoted the yardstick and glossed it as the measurement.** No object, population or window of its own.
  **★ AND IT IS LIKELY NOT EVALUABLE:** a per-regime win-rate inversion is not estimable at **3 organic trades**, and ruling it from VTS is **circular** (the trigger exists *because* active filters are stricter than VTS). ⇒ **expected honest output: `NOT EVALUABLE — insufficient active-paper population`.** That is decision-grade. **Item 2's condition is precisely what destroys item 3's evidence base.**

**★ WHY IT CANNOT SIT IN BATCH TWO — this is a SEQUENCING constraint, not a priority preference:**
1. **Item 3's remedy changes the confidence inputs → changes pWin → changes what clears the netEV gate — which is exactly what OBJ-4 measures.** Landing it *during* the marked window is a second, undeclared change inside a controlled experiment. It must land **before the mark or after the window closes; never during.**
2. **Item 2's remedy — widen the pair universe — is the SAME PROBLEM as §1.6 pair-exclusivity.** Only ~7 crypto pairs qualify; holding one blocks every strategy on it. Deciding OBJ-4's change set without first deciding whether the universe widens risks measuring strategy changes against a pair ceiling we were about to lift.
⇒ **BOTH triggered items DECIDE WHAT BATCH ONE CONTAINS. Running the gate afterwards means either contaminating the window or delaying its answers by the full window length.**

**⚠️ THE GATE'S OWN PRECONDITION IS UNMET — DECLARED, NOT SKIPPED (Langston).** `:412` requires it run *"after… SQE recalibration is complete (19.4)"* — **19.4 is Phase-25-homed and NOT complete** — on *"1–2 weeks of clean active-paper data."* **3 organic trades in 21 days is not that.** Running it anyway is defensible **because** the data is starved, which is item 2's own answer — **but it is written down here rather than passed over.**

**SCOPE OF OBJ-0 — narrow, with Langston's three conditions ADOPTED:**
- **(a) NOT named `PHASE_19_OBSERVATIONAL_DECISIONS.md`** — that is the gate's **terminal** artifact, and a two-item file under it reads as *"the gate ran"* to the next reader (the #546 shape, and the same invisibility that left this sitting since April). **Output: `PHASE_25_5_PARTIAL_DECISIONS_2026-08.md`.**
- **(b) CARRY A STATUS TABLE OF ALL NINE**, one line each. Cheap, and it permanently kills the *"did it ever run?"* ambiguity. **Items 1, 7 and 8 are blocked by the SAME starvation** (item 7 needs ≥30 laddered trades, `:426`) — *"not evaluable, population n=X"* is decision-grade.
- **(c) ENUMERATE, DO NOT COUNT — ★ item 9 is ALREADY CLOSED** (P19-B6 restored the kill-switch auto-trip, `SYSTEM_IMPACT_MAP.md:1710`; `:430` re-homed it to 19.0.B). **Nine minus two is NOT seven live ones.**
**★ PLACEMENT — RE-HOMED BY LANGSTON 2026-08-11, and he is right: my argument did not reach OBJ-1.** Both legs establish precedence over **OBJ-4 and OBJ-5 only** — OBJ-1 is instrumentation and OBJ-2 is retention; **neither touches admission, and the mark has not been laid.** Gating two declared blocking preconditions behind an analysis task that contains a Kyle escalation is **a stall with no sequencing justification** — and **OBJ-1 IMPROVES the record the gate reads.**
⇒ **OBJ-0 GATES OBJ-4 AND OBJ-5; RUNS CONCURRENT WITH OBJ-1 AND OBJ-2.**
**OWNER:** CC-C. **DUE: before OBJ-4 begins.**
**OUTPUT:** `1-system-manual/PHASE_19_OBSERVATIONAL_DECISIONS.md`, stating per item what was observed, whether the threshold for moving work pre-launch was met, the decision, and the justification (the format the gate itself specifies).
**VERIFY:** the document exists at the graded ref; `PHASE_19_PLAN.md` carries 19.4.5 with its status; `RUNNING_ISSUES` #336 and the B65.6 record cross-reference it.
**⚠️ ESCALATION — ★ KYLE RULED 2026-08-11. BOTH ANSWERED; OBJ-0 no longer carries an open escalation.**
- **Item 2 → widening to PERP FUTURES: NO. Deferred, explicitly.** Kyle: not until after go-live, or possibly late Phase 25 / Phase 19; a **VTS-only data-collection** turn-on is a *maybe*, undecided. **The decision itself is deferred — that IS the decision, and it is his.** *(Langston flagged this as the larger of the two escalations and he was right to; it is now closed by ruling, not by silence.)*
- **★ BUT SEPARATE THE FEED FROM THE TRADING — they are not the same question.** Ingesting the **Kraken crypto-perpetuals FEED** (data capture only, no trading) is a live question Kyle wants evaluated. **HOMED: batch two** (`P19-B-DROUGHT-2`), alongside the order-book-depth and volume-floor items it naturally groups with. **Nothing about perps enters batch one.**
- **Item 3 → reopening B65.6 pre-launch** remains a Kyle call **if** item 3 proves evaluable — which per §2 OBJ-0 it likely is not (see below).

**OBJ-1 — PERSIST THE DECLINED-SIGNAL RECORD (blocking).**
Write geometry + **config VERSION** (not value — Langston r2.1(b)) at the **SQE reject hook**, by **write-site parity with the `vts-runner` writer** (which already writes `target`/`atrAtOpen` at 32/32 while `signal-orchestrator` writes 0 of 6,077).
**ALSO persist the pair-exclusivity rejection** (§1.6) with the blocking symbol + the holding strategy — same hook region, same job.
**VERIFY:** post-deploy, SQE-reject rows carry non-null geometry + version at ≥99%; pair-exclusivity blocks appear in `signal_eval_archive` with a count reconcilable to the `duplicate_pair_active` log line over the same window.

**OBJ-2 — RAISE `SHADOW_MAX_HOLD_MS` 6h → 48h (blocking, Langston-approved).**
**Change the CONSTANT, not the switch:** `isVtsMaxHoldEnabled()` is ONE boolean gating both the shadow TTL and the real VTS 7-day zombie valve — flipping it re-creates the B63 regression in one move.
**Cap interaction CLOSED by Langston's own event-replay:** peak concurrent shadows 1,405 @6h → **3,284 @48h** against `SHADOW_CAP=10000` = **3.0× headroom at the historical maximum**. CC-C's 23k–52k estimate **withdrawn** (it scaled a wrong code comment).
**VERIFY:** TTL-cut share of shadow closes falls materially below the measured 27.3%; `shadowDropCount` stays 0.

**OBJ-3 — ⛔ HELD OUT OF THE APPROVED SCOPE (Langston ruling 2026-08-11). Not started; conditions to re-enter below.**
**His four grounds, accepted in full:** (1) this objective's stated justification cited the **926/5.2h figure this same document retracts at §1.3** — a withdrawn measurement resurrected 90 lines downstream as the load-bearing rationale (fixed in this revision; the sentence is gone); (2) §1.4's provenance was misattributed — the `BATCH_CATALOG:378` "4.0" is `roi_absolute_max`; **`reach_atr_max` arrives at reorg-B2.1**, where the value was the winner of a two-value conflict (per pre-audit A.11; §1.4 corrected in this revision); (3) **this is not a pull-forward of 25-17 — it INVERTS it** (25-17 says calibrate DOWN, written for xStock; crypto wants the other direction, and the sign is untested) ⇒ **if it proceeds it is a NEW item, not a phase-move**; (4) **the #371 downgrade is REJECTED** — one constant read by two gates on two different ATR inputs with an unmeasured one-directional bias means a new value is a second guess on the first; **the divergence measurement is a precondition for the value to mean anything.**
**RE-ENTRY CONDITIONS (all, before OBJ-3 exists again in any form):** (a) the `pivot_shift` **measured target-in-ATRs distribution against 4.0** — the structural-exclusion claim is currently asserted and uncited (no `pivot_shift` row exists in the §1.3 table); (b) the #371 divergence capture landed and read; (c) the A.14 reach-curve measurement (replay re-cut in ATR units); (d) re-filed as a **new item** with its own §9.4 home, not as 25-17.**
Move roadmap item **25-17** into this batch **for `reach_atr_max` only**. Set from crypto's own realized distribution, per class.
*(The prior justification cited the retracted §1.3 figure and an uncited `pivot_shift` exclusion — both removed per Langston ground 1 and his answer Q1.)*
**VERIFY — REWRITTEN (pre-audit §A.6): measure PASS-THROUGH, not drops.** The live drop count is unrecorded by design, but the stage *after* it is: **the change in signals REACHING the SQE per strategy (`signal_eval_archive`, `source='signal-orchestrator'`)**. Same effect, a recorded object, no new instrumentation.
**⚠️ AND #371 IS DOWNGRADED FROM BLOCKER TO RECOMMENDATION** — the divergence capture is still worth having for the normalizer retirement, but **OBJ-3 no longer depends on it**, so it must not gate this batch.
**⛔ `min_rr` IS EXPLICITLY NOT IN SCOPE — see §3.**

**OBJ-4 — THE PER-STRATEGY GEOMETRY CHANGE SET, chosen on benefit AND cost.**
**Candidates: `pivot_shift`, `volatility_edge`, `sma_trend_ride`** — the three flattest decay curves.
**WITHDRAWN from the earlier proposal, each with its reason:** `morning_star` (**2.0% hit rate at its current target — but "BROKEN" IS WITHDRAWN, pre-audit §A.7.** Its target is volatility-scaled while its **stop is STRUCTURAL** — `morning-star.ts:173`, the low of the two prior candles — so on crypto reward-to-risk lands near **1:1** (meanRR 1.05). **A cost mismatch, not a malfunction, and NOT dial-fixable: the stop IS the pattern.** ⇒ disposition is *"does not fit crypto's cost structure — test whether it fits xStock's"*, not retire); `inside_bar_reversal` (**+25% costs 46 points**, 52.2→6.4); `support_bounce`, `reverse_impulse`, `vwap_bounce`, `defensive_hedge` (decay too steep or unmeasured).
**Per-class rows only** — the mechanism is proven live (`strategy.vwap_pullback/volume_confirmation_enabled` is `*`=1 **and** `xstock_spot`=0). **A DB row, not a code change.**
**VERIFY:** each changed strategy's post-mark signal count and fill count read separately by `strategy_name`; slot utilisation tracked as a first-class metric.

**OBJ-5 — THE MARK.**
A **commit + UTC timestamp**, not a date. **PRE-REGISTERED BAN on cross-half comparison of admission-conditioned metrics** — win rate, average R, fill rate, hit rate — named in writing before the cut (Langston: labelling was never the missing half; attribution is necessary and *not sufficient*). **Post-mark row count measured before anything is called a population.** **Read `rtb_shadow_pairings`, NOT `rtb_signals.{hybrid_score,regime_weight,decay_penalty}`** — those columns are NULL from birth and the live reads are elsewhere.
**⚠️ STATE THE UNVERIFIED PREMISE:** #581's live ≥2-distinct-atr fence was DEFERRED-PENDING-SIGNAL-FLOW and **has never gone green** ⇒ post-mark `atr` is **code-correct, not live-verified.**

---

## 3. EXPLICITLY OUT OF SCOPE — with the reason, so none is silently revisited

- **`min_rr` 2.5.** Industry band is 1:2–1:3, so 2.5 sits **inside** the recommended range; the literature says that an algo rejecting most signals at 2.5 has a **geometry** problem, not a threshold problem — and our measured crypto R:R is 1.67–2.00. **★ Kyle's correction, which sharpens rather than softens it: their band EXCLUDES fees, so it does not transfer — at our friction we would need MORE than 2.5, not less.** Our strategies are industry-*normal* and industry-normal does not survive our costs. **Lowering it is moving away from the standard. CC-C's earlier argument for lowering is withdrawn.**
- **The Kraken+ subscription.** **RETRACTED IN FULL.** Kraken's own documentation: *"Kraken+ applies only to the Kraken platform (app and website). It does not apply to other Kraken products, such as Kraken Pro."* **API and Kraken Pro spot trades are explicitly excluded**, and spread applies regardless. We trade entirely by API. *(Error class: verified what the benefit DOES without verifying it applies to us.)*
- **The regime→strategy mapping.** **The provenance vindicates it:** RBS is documented as where *"mean-reversion and range-bound strategies have their strongest historical performance"*, with trades *"smaller and shorter, focusing on quick gains."* **Nothing is mis-assigned.** The conflict is that **RBS is the most common crypto regime and its designed trade style cannot survive 0.80% round-trip.** That is a Kyle scope call (§4), not a repair.
- **Changing venue**, the combinations study, and the SEVEN untriggered items of the 19.4.5 gate → **batch two.** ⚠️ **The TWO TRIGGERED 19.4.5 items are NOT deferred — they are OBJ-0 of THIS batch (§2), because both decide what this batch contains.**

---

## 4. DECISIONS THIS SCOPE DOES NOT MAKE — for Kyle, surfaced not buried

1. **Do we trade crypto in the Range-Bound regime at all?** It is the most common regime and its trade style is structurally unprofitable at our fees. Forcing bigger targets onto range strategies fights the regime's nature.
2. **`morning_star`'s disposition** — 2.0% hit rate over 553 trades. Retire for crypto, or rebuild?
3. **Is turnover itself the target?** **MEASURED: fees are $1,008/30d on a $2,250 portfolio = 45% of the account per month**, because we recycle the portfolio **~34×/month**. At live sizing ($800, 5 slots, ~$150/trade) that is **~$132/month = 16.5% of the account.** **Fee damage is rate × turnover, and every lever discussed today addressed only the rate.**

---

## 5. OPEN QUESTIONS FOR LANGSTON

1. **OBJ-3 phase-move:** does `reach_atr_max` move into this batch? The `pivot_shift` exclusion is my strongest argument — attack it.
2. **OBJ-1 scope:** does pair-exclusivity persistence belong here, or as its own issue?
3. **`vwap_pullback` returns 0.0% hit rate at every level (n=40).** I do not trust it and have not explained it. Does it block OBJ-4?
4. **The 24h replay window** counts slower winners as misses. Does that bias the decay curves enough to change the candidate set?
5. **★ NEW — the promotion-stage defect the retracted example actually exposed.** A signal was **admitted at 07:46:19** and was still shown in the pool at **08:05** while its pair held an open position from **07:46:49**. The pair-block sits at *admission*, so it cannot explain this. **Either the pool is not evicting on promotion, or the UI is stale.** Different site, not OBJ-1. **Does it belong in this batch or its own issue?** CC-C's read: **its own issue** — it is a correctness question about the pool, not about fee viability.

---

## 6. ITEMS HOMED TO CC-C BEFORE BATCH CLOSE (§9.4 — named now, not deferred)

| item | owner | due | note |
|---|---|---|---|
| **The sha-pinned-URL instrument trap** | CC-C | batch-one close | Langston supplies the account, CC-C files (he has no repo write). **State the OBSERVATION ONLY — a sha-pinned raw URL returned a different file's body; refetch correct; API `contents` endpoint correct. DO NOT NAME A MECHANISM** — neither of us has one, and an asserted absence needs presence-evidence (#453). **Label it unexplained.** |
| **`POST_AUDIT_ROADMAP:245` inconsistency** | CC-C | batch-one close | `:245` positions the gate in the **Phase-19** run order while `:80/:291/:310` home it to **Phase 25**. Out of scope to fix here; **gets a home now, not later.** |
| **The promotion-stage pool defect** (§5 Q5) | CC-C | batch-one close | Filed on Langston's ruling. |

**Langston's standing evidence request on §1.6, still owed:** the `rtbQueueId` of the screenshotted row shown **≠ `e6739c0a`**; the `duplicate_pair_active` log line for PUMP/EUR **between 07:46:49 and 08:10:43** (with a positive control from the same window on any symbol if PUMP produces none).

---

## 8. THE pivot_shift DISTRIBUTION ARTIFACT (Langston ruling 4 — "closes on the file, not on the word")

**Measured 2026-08-16/17. OBJECT:** `vts_open_trades`, `context->>'atrAtOpen'`. **POPULATION:** `strategy='pivot_shift'`, `asset_class='crypto_spot'`, opened in the trailing 21 days, `entry_price>0 AND take_profit>entry_price AND atrAtOpen>0`. **pivot_shift: 224 rows, 206 with valid ATR. sma_trend_ride (same instrument, for the paired column): 687 rows, 22 null/zero ATR excluded, n=665.**

| measure | pivot_shift (n=206) | sma_trend_ride (n=665) |
|---|---|---|
| `atrsToTarget` median NOW | **2.500** | 2.088 |
| p90 NOW | **3.000** | 3.134 |
| max NOW | 3.061 | 3.943 |
| over 4.0 NOW | **0** | 0 |
| p90 at fee-clearing raise | **4.74** (×1.58, PROJECTED) | 3.918 (×1.25) |
| over 4.0 post-raise | **p90 crosses the ceiling** | 60/665 = **9.0%** (tail only) |
| floor-binding share | — | 12.5% (inert) |

**Langston's independent reproduction (2026-08-16):** sma leg exact (n=665, median 2.0883, p90 3.1344, max 3.9428, 60 rows); pivot_shift p90-now **3.000** confirmed; the 4.74 reconciled as **projected-post-raise** (×4.74/3.0), not measured-now — his own item (3).
**⇒ THE EXCLUSION CRITERION, now cited not asserted: the ceiling bites the TAIL for `sma_trend_ride` (9%, the gate working) and goes THROUGH THE BODY for `pivot_shift` (p90 itself crosses).** `pivot_shift` re-enters only with the 25-17b ceiling decision.

## 9. THE 25-17b REACH CURVE (measured 2026-08-17 — the pre-agreed decision method, run)

**OBJECT:** `vts_open_trades` (context ATR) joined to `crypto_spot_ohlc_1m_2026_08` forward bars. **POPULATION:** all crypto VTS trades, trailing 21d, valid geometry+ATR; 48h forward window; **REACHED = target touched AND stop never touched in the window** (strict both-touch convention — a LOWER BOUND, same as §1.2).

| atrsToTarget | n | reached |
|---|---|---|
| 0.5–0.85 | 32 | 0.0% |
| 1.0–1.5 | 137 | 0.0% |
| 1.5–2.0 | 76 | 30.3% |
| 2.0–2.5 | 3,828 | 33.8% |
| 2.5–3.0 | 5,182 | 35.7% |
| 3.0–3.5 | 109 | 4.6% |
| **6.0–6.1** | **239** | **15.2–21.5%** |
| 9.1–16.5 | 52 | 7.7% |

**⇒ REACH DOES NOT DIE AT 4.0.** At 6 ATRs (the `strong_bull_trend` 6× population) **one in five to one in seven targets is still reached**; past 9 ATRs, ~8%. By the 25-17b pre-agreed method — *"if reach is material past 4.0, the constant moves"* — **the curve says MOVE.**
**⚠️ Caveats, stated:** the 3.0–3.5 bucket's 4.6% (n=109) against the 6-ATR cohort's 15–21% is a **composition confound** (different strategies occupy different buckets) — Langston's r2.2 per-stratum rule applies to the final value choice; the convention is a lower bound; August partition; VTS lane (tag-not-drop is what makes the >4 buckets observable at all).
**Remaining before the decision package: the #371 divergence read over its paired-n window (instrument deployed 2026-08-17T00:15Z, counting), and `pivot_shift`'s own days-to-readable per Langston ruling 3.**
**Package riders (Langston 2026-08-17, carried explicitly):** the twin strong_bull cells split at the **bucket edge [5.5,6.0)/[6.0,6.5)** — 6.12 is an **observed max**, never a boundary; quote the **combined cell n=238 / 18.1%** with the split disclosed. **Robustness statement owed in the package:** the split-at-6.0 story rests on the bucket edge coinciding with the strategy's fixed 6× multiplier — a future observation anywhere in [6.0,6.5) populates bucket 13 without touching the mechanism, and the package must say so rather than leave it implicit.
**Mark-2 fence spec (Langston, rider-1 close — independently re-read):** the third stamp site's fallback is `safeResolveAssetClass(signal.symbol, 'kraken')` — **two args, venue-pinned** (the hardcoded venue is a second input to the re-resolution and is in the fence's scope). The *null* outcome is already loud (`:3307` TRADE_SKIP + `UNCLASSIFIABLE`, refuses the open); **the fence must fire on FALLBACK-FIRED-AND-RETURNED-NON-NULL** — the silent valid-but-wrong-class case on a collision ticker — never on the null branch, which measures the path that already cannot hurt us. Ruling-3 restatement stands: the pivot_shift paired-n clock starts at the mark-2 deploy.

---

## VERIFICATION LEDGER — OBJ-1 pair-exclusivity 14:00Z check (2026-08-18, CC-C; alert b9b776e6)

**PASS, on live blocks (not the zero-blocks re-arm case).** Object: `signal_eval_archive` rows since the mark deploy (2026-08-16T22:08Z) matching the pair-exclusivity gate. **32 blocks persisted**, all 2026-08-18 09:15:31Z→11:03:02Z (block onset coincides with the post-freeze signal-flow resumption — the gate fired the first day it had traffic). **32/32 carry non-null `holdingStrategy`** (0 nulls); 2 distinct pairs, 2 distinct holder strategies (sample: ALLO/USD held by `sma_trend_ride`). **Cross-instrument agreement: DB 32 = today's `out.log` 32** (log reach = today only, rotates midnight — stated per 29(b)); **zero HOLDER_MISS lines.** The OBJ-1 persistence design works end-to-end on live traffic: every block is durable with a resolvable holder.

## VERIFICATION LEDGER — the 23:45Z MARK verification (2026-08-18, CC-C; alert 42be3ab7)

**Check 1 — unreachable share: REVISIT TRIGGERED (the >15% branch of Langston's pre-registered ruling).** Object: guard-eval tracker `statsByClass.crypto_spot.sma_trend_ride` (`/api/diagnostics/guard-eval-stats`; trackerStartedAt 2026-06-23T19:51Z — persisted across restarts, so the pre-registered delta formula is valid). Now: evals 7,394 / reachDrops 2,096 / rrDrops 144. Baseline at mark: 6,834 / 1,813 / 144. **Post-mark marginal: 560 evals, 283 reachDrops ⇒ delta share 50.5%** vs pre-registered ~9% expected, >15% revisit bar. Direction is exactly what bigger targets predict — **rrDrops moved 0 post-mark** (the RR floor stopped dropping anything) while reach drops doubled their rate. **CONFOUND for the revisit, stated up front: the post-mark window is the deepest volatility compression in months (#693 — crypto 1-minute movement −35% vs early August), and reachability drops scale inversely with ATR, so the drought inflates this share independently of the mark.** The 50.5% is real; how much belongs to the mark vs the market is the revisit's question.

**Check 2 — both-direction serving: PASS on live rows (volatility_edge leg still open).** Post-mark `vts_open_trades`: crypto_spot sma_trend_ride take_profit = entry + **2.500×(entry−stop) exactly** (e.g. entry 0.29780418 / stop 0.29004748 / target 0.31719595); xstock_spot sma_trend_ride **2.000R unchanged** (5 distinct symbol-times sampled, all exact). volatility_edge: **zero post-mark trades either class — the 3.125×ATR leg has no rows to verify yet; leg stays open**, completes at the first post-mark volatility_edge crypto trade.

**Check 3 — VTS movement: present but thin.** Post-mark new VTS trades: crypto sma_trend_ride 2 (both 2026-08-18, post-freeze), xStock sma_trend_ride 26, volatility_edge 0. The crypto VTS lane moves under the new geometry; n is far too small to read outcomes.

**Disposition:** revisit dispatched to Langston same-turn (keep 2.5R / soften / hold ruling until the drought lifts); tonight's deploys are UNAFFECTED (mark-2 = DSS normalizer + class-fallback fence; PERPFEED = capture — neither touches the geometry row).

## VERIFICATION LEDGER — OBJ-2 shadow TTL check (2026-08-19T14:0xZ, CC-C; alert c7457b75)

**PASS.** Object: `rtb_shadow_pairings` closes since the 48h-TTL deploy (2026-08-16T22:07Z; ~63h window), population 37. Close reasons: stop_hit 31 + target_hit 5 = **36/37 (97.3%) resolved on MERIT**; timeout **1/37 = 2.7% TTL-cut vs the 27.3% pre-change baseline** (10,804/39,641). Zero `shadow_max_hold` rows in the window, so Langston's label-split exclusion is moot (stated, not skipped). n is small — the same #693 drought that suppresses admissions suppresses shadow volume — but the direction and magnitude are unambiguous: the 6h→48h TTL removed the clock as the dominant close reason, which is exactly what OBJ-2 shipped for.

