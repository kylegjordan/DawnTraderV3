# P19-B-FEEVIABILITY — PRE-IMPLEMENTATION AUDIT

**CC-C, 2026-08-11. Kyle-directed, emphatic: full code review of everything the batch touches, plus SIM, System Manual, the Phase-19 active-trading-path audit, batch completion reports, batch history, and the pre-governance corpus in `bridge/canonical/`. Understand intent, original purpose, decisions made, and why.**

> **PART 1 OF 2 — SOURCES COMPLETED: `SYSTEM_IMPACT_MAP.md`, `RUNNING_ISSUES.md`, direct code read.**
> **STILL OUTSTANDING (part 2): `SYSTEM_MANUAL.md`, `ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`, the reorg-B2/B2.1/B2.2/B2.3 completion reports, `bridge/canonical/`, and the pre-governance batch folders.** Stated so no reader mistakes this for the finished article.

---

## ⛔ HEADLINE: **OBJ-3 CANNOT BE DONE AS SCOPED.** The reachability ceiling is a DOUBLE gate over two DIFFERENT ATR values.

The scope treats `reach_atr_max` as one uncalibrated number. **It is one number read by two independent gates that feed it two different ATR inputs**, with a documented one-directional over-rejection between them, on a component already scheduled for deletion, and with the measurement that would quantify the bias **unbuilt and unowned**.

### A.1 The two gates — both verified in code

| | site | ATR it uses |
|---|---|---|
| **GUARD-5** (signal-gen) | `strategy-helpers.ts:386` `validateReachability(entry, target, effectiveATR, reachAtrMax)`, called from `applyGlobalGuards:422` | **`effectiveATR`** — the strategy's own **clamped** ATR |
| **The normalizer** (downstream bridge) | `signal-target-normalizer.ts` `normalizeAndGateTarget` | **`mceContext.indicators.atr`** |

Both compare against the **same** `expectancy_gates.reach_atr_max` (`expectancy.ts:204-211`, per-class, `strategy:'*'`).
**SIM:232 states the relationship verbatim:** *"`signal-target-normalizer.ts` KEPT as a NET-NEUTRAL downstream bridge (no longer lifts; RR/reachability there are now **redundant double-gates**), to be **RETIRED in reorg-B2.2 OBJ-C**."*

### A.2 The divergence is KNOWN, DOCUMENTED, and points at our own candidate — **#371**
Verbatim from `RUNNING_ISSUES:1932`: GUARD-5 uses `getEffectiveATR` (clamped) *"while the normalizer's reachability uses `mceContext.indicators.atr`… the risk is **one-directional over-rejection** where `effectiveATR < mceContext.atr` makes `atrsToTarget` larger → **a signal GUARD-5 drops that the normalizer would have passed**."*
**★ AND IT NAMES OUR STRATEGY:** *"this divergence covers ALL guard-wired in-class strategies — including the 3 non-ATR-geometry ones (**`sma_trend_ride`**, `vwap_bounce`, `dhma`) which feed the reachability a **`computeATR(priceHistory)` pair-ATR** (their geometry is SMA/VWAP/realizedVol-based; reachability is a path-invariant PAIR property)."*
⇒ **`sma_trend_ride` builds its target as an R-multiple off a STRUCTURAL stop, then has that target judged against a PAIR ATR it never used.** This is the most likely mechanism behind the **926 `sma_trend_ride` unreachable drops in 5.2h** recorded at scope §1.3 — **a candidate cause, not an established one; the divergence has never been measured** (§A.3).

### A.3 ★ THE LEDGER SAYS THE MEASUREMENT IS IMPOSSIBLE. **IT IS NOT — it is a two-argument change.** (CC-C, new finding)
`RUNNING_ISSUES:1935` (#373) records condition (1) as **never built**, concluding *"condition (3) 'divergence QUANTIFIED' is **unreachable by construction**."* Its evidence: `recordGuardEval(strategy, rr, pass, dropReason, assetClass)` takes **no ATR parameters**. That is true.
**⚠️ BUT THE VALUES ARE ALREADY COMPUTED AND IN SCOPE AT EVERY CALL SITE.** Verified at `strategies/morning-star.ts:177-180` and the ~18 in-class sites (`strategy-engine.ts:302/437/571/683/…`), the shape is uniformly:
```ts
const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
recordGuardEval('morning_star', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
```
`GuardResult.atrsToTarget` is returned by `applyGlobalGuards` and is commented at `strategy-helpers.ts:398` **"reachability metric (for the #371 ATR-divergence measurement)"** — i.e. it was *built for this exact purpose* — and `effectiveATR` is a local one line above. **Both are dropped at the recording boundary.**
⇒ **#371 is a signature widening plus two arguments at ~18 sites, not a build.** *"Unreachable by construction" overstates it and should be corrected in the ledger.* **Recommend CC-C owns #371 and lands it as part of this batch** — it is the instrument OBJ-3 needs anyway, and it simultaneously unblocks #373 → reorg-B2.2 OBJ-C.
⚠️ **NOT ASSERTED:** I checked the tracker signature and a sample of call sites; I have **not** proven no other route already captures the magnitude. Same caveat CC-B recorded.

### A.4 What this does to OBJ-3
**Changing `reach_atr_max` changes BOTH gates at once**, and they will still disagree with each other by an unmeasured amount, biased in one direction. **A recalibrated ceiling on an unreconciled pair of inputs is not a calibration — it is a second guess on top of the first.**
**⇒ OBJ-3 MUST BE RE-SEQUENCED:** (i) land the #371 magnitude capture; (ii) read the divergence over a real window — *note the persisted tracker already holds* **576,787 evals across 6+ strategies since 2026-06-23**, so a window exists the moment the magnitudes are recorded; (iii) reconcile the ATR source **or** accept one as canonical **with evidence**; (iv) only then set the value.
**⚠️ AND OBJ-3 TOUCHES A COMPONENT WITH A PENDING DELETION** (`signal-target-normalizer.ts`, reorg-B2.2 OBJ-C). Whether we tune a gate inside a file scheduled for retirement is a sequencing question for Langston.
**★ OWNERSHIP GAP, §9.4:** `RUNNING_ISSUES:1935` states #371 is *"Pending Langston's assignment; until it has one, #373 CANNOT open."* **It has been unowned since 2026-06-21.** This batch is the natural home.

---

## ⛔⛔ A.5 — **THE SCOPE'S §1.3 REACHABILITY MEASUREMENT IS RETRACTED. I COUNTED THE WRONG LANE.** (Kyle-directed re-check, 2026-08-11)

**WHAT I CLAIMED (scope §1.3, and part 1 of this audit built on it):** *"`unreachable` 1,452 drops in 5.2h — falling on `sma_trend_ride` 926, `vwap_pullback` 512."*

**⛔ FALSE. Every one of those lines is a VTS TAG, not a drop.** Verified: **100% of `unreachable` occurrences in the log carry the marker `[reorg-B3.3x][VTS][TAG_NO_DROP]`**, whose own text reads:
> *"`VIA/USD/sma_trend_ride would-gate=unreachable rr=2.00 — simulating anyway for learning data (active path still suppresses)`."*

The crypto VTS lane runs `gateDisposition='tag'` (SIM:241 — *"ONLY the crypto VTS path passes `'tag'`"*), so it **marks and simulates anyway**. **Active-path drops surface as `Global guards failed` and carry no reason on that line.** ⇒ **I measured a lane that by construction does not drop, and reported it as the drop rate.** Same wrong-population class as the four earlier corrections; the log-grep was never the right instrument.

### ★ THE RIGHT INSTRUMENT EXISTS AND IS PURPOSE-BUILT — `GET /api/diagnostics/guard-eval-stats` (schema `guard-eval-stats/v3`)
**OBJECT:** the persisted `guard-eval-tracker`. **POPULATION:** every guard evaluation since `trackerStartedAt = 2026-06-23T19:51:53Z` — **a seven-week window, persisted across restarts** (#374 OBJ-A), **not a 5-hour log slice.**

| strategy | evals | passes | **reachDrops** | **reach %** | rrDrops | meanRR |
|---|---|---|---|---|---|---|
| **`sma_trend_ride`** | 97,975 | 12,002 | **80,233** | **81.9%** | 4,869 (5.0%) | **2.00** (rrMin=rrMax=2.00) |
| **`vwap_pullback`** | 241,263 | 13,254 | **129,628** | **53.7%** | 88,043 (36.5%) | 2.21 |
| **`morning_star`** | 503,233 | 168,779 | **0** | **0%** | **333,566 (66.3%)** | **1.05** |

### ★★ THE CORRECTED FINDING IS **STRONGER** THAN THE ONE IT REPLACES — and it re-points the batch again
1. **The reachability ceiling drops 82% of `sma_trend_ride` and 54% of `vwap_pullback`** — the two strategies carrying the largest targets — measured over seven weeks on the instrument built for it. **My retracted figure understated this by orders of magnitude while attributing it to the wrong lane.**
2. **`morning_star` has ZERO reachability drops.** It is killed **entirely by the RR floor** — 333,566 drops, and its **meanRR is 1.05** against a floor of 2.5. ⇒ **it is not remotely near viable on reward-to-risk**, a *third* independent instrument agreeing with the 2.0% hit rate and the 68% suppression rate. **The retire-or-rebuild question is now firmly evidenced.**
3. **`sma_trend_ride`'s RR is invariant at exactly 2.00** (`rrMin == rrMax == 2.0`) — it is the 2R-off-structural-stop construction, confirmed empirically. Its rrDrops are only 5%, so **its per-`(strategy×class)` minRR was already recalibrated below 2.0 at reorg-B2.3** — consistent with §B and further reason not to touch `min_rr`.

### WHAT SURVIVES OF §A.1–A.4, AND WHAT DOES NOT
- **SURVIVES:** the double-gate itself (`strategy-helpers.ts:386` vs the normalizer, two ATR sources, one constant), the #371 divergence, and the finding that **#371's capture is a two-argument change, not a build** (§A.3). Those are code reads, not log counts.
- **SURVIVES AND STRENGTHENS:** the OBJ-3 re-sequencing argument. The ceiling is now shown to suppress **82%/54%** of our two best-target strategies on a seven-week instrument — so recalibrating it matters *more*, and doing it on an unreconciled ATR pair matters more too.
- **DOES NOT SURVIVE:** any figure sourced from the `unreachable` log grep, in the scope or in this document. **`reachDrops` from the tracker is the only admissible number.**
- ⚠️ **STILL UNKNOWN:** whether these `reachDrops` are attributable to GUARD-5, to the normalizer, or to both. The tracker records the **guard's** verdict. **The normalizer-side count remains unmeasured — which is exactly #371.**

---

## A.6 — **THE CORRECTED FIGURE HAS THE SAME FLAW. Retracted a second time, and the honest position is that the live reachability rate is UNMEASURED BY DESIGN.** (Kyle-directed re-check #2)

**The tracker records the guard's VERDICT, not an enforced drop.** Verified at `strategies/morning-star.ts:179-180`:
```ts
recordGuardEval('morning_star', _gr.rr, _gr.pass, _gr.dropReason, assetClass);   // ← records FIRST
if (guardForcesDrop(_gr, gateDisposition)) { … }                                  // ← decides SECOND
```
And `guardForcesDrop` (`strategy-helpers.ts:454-458`) returns **false** under `disposition='tag'` for taggable reasons — **VTS does not drop, but the counter has already scored it as a drop.** ⇒ **`reachDrops` = "times the guard said unreachable, across BOTH lanes", and VTS supplies most of the volume.**
⛔ **So §A.5's 81.9% / 53.7% are NOT active-path drop rates either. Retracted.** *(Second instance of the same error in one hour, on the instrument I introduced to fix the first.)*

### ★ AND THERE IS NO ACTIVE-PATH SOURCE — IT IS INTENTIONAL, NOT A GAP
`signal_eval_archive` `strategy_internal` rows, crypto, 24h: **every source is `vts-runner`** (`breakout_fail` 9,161 · `indicator_filter` 4,129 · … · `guard_fail` 654). And `stage-attrition-cache.ts:25` states the design verbatim:
> *"`strategy_internal` has **no active-path writer at all — it is a VTS-only stage. A blank active cell there is correct**, and the client says so rather than rendering a bare 0."*
⇒ **Working-as-designed (rule 24 outcome 2), NOT a defect and NOT a recording gap to fix.** My "second recording gap" hypothesis is **refuted before it was filed** — §9.5(b-ii) doing its job.

### ★★ THE USABLE CONSEQUENCE — OBJ-3 does not need the drop count
We cannot count what the ceiling rejects on the live path. **We do not need to.** The stage *after* it **is** recorded: `signal_eval_archive`, `source='signal-orchestrator'`, `reject_stage IN ('sqe','admitted')`. **A ceiling change shows up as PASS-THROUGH VOLUME arriving at the SQE.**
⇒ **OBJ-3's verification criterion is rewritten: measure the change in signals REACHING the SQE (per strategy, `source='signal-orchestrator'`), not the change in drops.** Same effect, a recorded object, no new instrumentation.
⚠️ **AND THIS WEAKENS THE #371 ARGUMENT AT §A.3** — the divergence capture is still worth having for the normalizer retirement, but **OBJ-3 no longer depends on it**, so it should not gate this batch. **Downgrade from blocker to recommendation.**

## A.7 — **`morning_star`: "BROKEN" WITHDRAWN. It is a COST MISMATCH, and it may be fine on xStock.**

Its target is volatility-scaled (`entry + 2.5×ATR`), but **its stop is STRUCTURAL** — `morning-star.ts:173`: `stopPrice = Math.min(c2Low, c1Low) * (1 − 0.003)`, i.e. **the low of the two prior candles**, minus a hardcoded 0.3% buffer *(one of the nine B72 "KEEP — geometric buffer" constants)*.
⇒ **On crypto those pattern lows sit far below entry, so reward-to-risk lands near 1:1 (measured meanRR 1.05).** At 1:1 you need >50% wins to break even **before** costs; after 0.80% round-trip, far more.
**⇒ NOT a malfunction — a mismatch between a pattern-defined stop and our cost base.** And **not dial-fixable**: the stop is the pattern. Moving it changes what the strategy *is*.
**⇒ CORRECT DISPOSITION: not "retire", but "does not fit crypto's cost structure — test whether it fits xStock's",** where the same patterns are tighter. Scope §4.2 amended.

---

## A.8 — **THERE IS A SECOND PAIR GUARD, AT THE OPEN STAGE, AND IT ARCHIVES. It has NEVER FIRED on the active path.**

Found via the Phase-19 audit Kyle named (`ACTIVE_TRADING_PIPELINE_AUDIT:208` — *"E8 | Dup-position guard | :2225-2240 | existing position same symbol"*). Verified in code at `active-execution-engine.ts:3214-3251`: it reads `getActiveOpenPositions`, and unlike the admission-stage block it **DOES archive** — `rejectStage:'tcl'`, `gateDecision:{gate:'tcl',accepted:false,reason:'duplicate_position',existingCount}` (P19-B5a reject capture) plus `recordOpenFailed(…,'DUP_POSITION',…)`.

**⇒ SO "PAIR-EXCLUSIVITY IS RECORDED NOWHERE" (scope §1.6) IS TOO BROAD.** It is true of the **admission** block (`hasActivePair` → bare `console.log`) and **false** of the **open-stage** one.

**MEASURED — and it never fires here.** `DUP_GUARD_BLOCK` in `out.log`: **0**, against a **positive control of 38,982** hits on the same `[I7-PM-FOCUS]` marker family ⇒ the family logs heavily; this branch does not. And `reject_stage='tcl'` over 7 days, **all classes**: **every row is `xstock_spot` + `vts-runner`** (`duplicate_position` 7,221 · `maker_marketable_dropped` 733 · `price_past_target` 415 · `reentry_cooldown` 15). **Zero from `active-execution-engine`. Zero crypto.**
**WHY — and it is by construction:** for the open-stage guard to fire, a promotion must reach the engine for a symbol **already held**. The **admission** guard stops such a signal entering the pool at all. ⇒ **the open-stage guard is largely unreachable on the active path** — defence-in-depth, not a live gate.

### ★ AND THIS CLOSES THE PUMP/EUR QUESTION — LANGSTON'S READ IS CONFIRMED, MINE IS NOT
He established the position was **created from the pooled row itself** (`rtbQueueId e6739c0a`, `queuedAt 07:46:19`, `source RTB_PROMOTION`). I have now eliminated the remaining candidate: **the open-stage guard never fired**, so the pooled row Kyle saw at 08:05 was **the same row that had already become the position**.
⇒ **The pool row was not evicted on promotion, or the UI served a stale snapshot.** Exactly Langston's *"pool-eviction or UI-staleness defect at the promotion stage."* **Neither pair guard explains it; both are eliminated.** ⇒ §5 Q5 stands as **its own issue**, and it is now better evidenced.

## A.9 — `bridge/canonical/` PROVENANCE READ (§9.5(b) recording rule — result stated even though it is a negative)

**CONSULTED. POSITIVE CONTROL PASSED:** 14 files present; **7 contain `expectancy`**, so the corpus is readable and topically adjacent.
**RESULT: NO COVERAGE of the reachability gate, `atrsToTarget`, or target-ATR-multiplier geometry.**
**EXPECTED, and the reason is dated:** the reachability gate and the per-class target gates were introduced by **reorg-B2 on 2026-06-20** — long after the 2026-01/02 governance change the canonical corpus predates. ⇒ **there is no pre-governance intent to recover for these constants; their entire provenance is `BATCH_CATALOG:378` + the reorg-B2 family.** *(Recorded per §9.5's rule that an absence is itself a finding.)*

## A.10 — WHAT THE PHASE-19 AUDIT ALREADY SAID, IN JUNE
- **`:111` — `F2 ★[11.8B] Net-Expectancy gate (defaulted DI)` ← labelled "THE BLOCKER".** The audit identified the netEV gate as the binding constraint **two months before this batch rediscovered it**. Independent corroboration; also a §9.5(b-ii) reminder that the ledger knew.
- **`:70` — the two netEV gates use DIFFERENT DI:** the inline `[HF9]` filter uses **real** DI, `[11.8B]` uses **defaulted** DI. *"Because real DI ≥ 40 caps at the same 0.60, the two are mathematically near-identical (the inline one is only stricter when real DI < 40)."* ⇒ **the DI-default concern raised at scope §5 batch-two item 3 is REAL and already characterised** — including the direction of the discrepancy.
- **`:203` — the "15" slots** is `guardrails_v2.max_open_positions` with **15 as the ENGINE FALLBACK**, not the configured value. Relevant to OBJ-4's slot-utilisation watch.

---

## ⛔⛔ A.11 — **`min_rr = 2.5` IS STALE. It was recalibrated to per-strategy floors in June, and the scope has been arguing against a value that no longer exists.**

**PROVENANCE, corrected.** `reach_atr_max` does **NOT** appear in the reorg-B2 completion report at all. The "4%/2.5/4.0" trio at `BATCH_CATALOG:378` is `target_floor_pct=4%` / `min_rr=2.5` / **`roi_absolute_max=4%`** (`P19_REORG_B2_COMPLETION_REPORT:30`, verbatim: *"a CONSERVATIVE starting placeholder; Phase-25 calibrates per-class"*). **`reach_atr_max` arrives at reorg-B2.1 OBJ-3**, whose entry also records a prior live **split-brain**: *"kill the live 1.5-vs-2.5 split-brain… the old `MIN_RR_RATIO=1.5` demoted to a seed; the normalizer's 2.5 no longer a second source."* ⇒ **2.5 was the winner of a two-value conflict, not a calibrated number.** *(`POST_AUDIT_ROADMAP:326` attributes `reach_atr_max` to reorg-B2; the completion reports place it at B2.1. Minor doc discrepancy, flagged not fixed.)*

**★ AND THEN reorg-B2.3 CALIBRATED IT FROM DATA.** Its report: *"13 per-strategy floors + 2 class-default (**2.0, lowered from 2.5**) live in DB"*, 18 rows, set off the persisted guard-eval window.

**LIVE VALUES — `module_constants.expectancy_gates`, queried 2026-08-11:**

| asset_class | strategy | `min_rr` |
|---|---|---|
| crypto_spot | `*` | **2.0** |
| crypto_spot | `support_bounce` | **1.0** |
| crypto_spot | `volatility_edge` | **1.0** |
| crypto_spot | `morning_star` | **1.39** |
| crypto_spot | `range_trade` | 1.71 |
| crypto_spot | `strong_bull_trend` | 1.95 |
| crypto_spot | `reverse_impulse` | 2.40 |
| crypto_spot | `vwap_pullback` | 2.44 |
| crypto_spot | `mean_reversion` | 2.88 |
| **crypto_spot** | **`sma_trend_ride`** | **ABSENT → falls back to `*` = 2.0** |

`reach_atr_max` = **4.0** both classes (confirmed); `target_floor_pct` = **0.040** both classes (confirmed — though the LIFT that consumed it is dead, `signal-target-normalizer.ts:93`).

### ★★ THE NEW FINDING — `sma_trend_ride` SITS EXACTLY ON ITS FLOOR
Its measured reward-to-risk is **`rrMin = rrMax = meanRR = 2.00`** — invariant, because it is the 2R-off-a-structural-stop construction. **Its floor is exactly 2.0** (no crypto per-strategy row; it inherits the class default). ⇒ **RR 2.00 against a floor of 2.00.** The 4,869 `rrDrops` (5.0%) are the ones landing a floating-point hair below.
**⇒ A KNIFE-EDGE OF A SECOND KIND, and it matters for OBJ-4:** any change touching either its target or its stop moves an equality. **And note `sma_trend_ride` is the ONLY crypto strategy in the candidate set with no per-strategy floor** — reorg-B2.3 set 13 and skipped it. Whether that was deliberate (an invariant RR needs no distribution-derived floor) or an omission **is a question for the B2.3 record and Langston, not an assumption for me.**

### ⛔ WHAT THIS RETRACTS IN THE SCOPE
- **"`min_rr` 2.5" is WRONG throughout §3.** The live class default is **2.0** with 13 per-strategy floors.
- **"`morning_star` … meanRR 1.05 against a floor of 2.5" is WRONG.** Its floor is **1.39**. It still fails — but **by 0.34, not 1.45** — and **34% of its evaluations DO clear the RR gate.** ⇒ **it is materially closer to viable than I reported, which strengthens A.7's "test it on xStock" over any retire framing.**
- ✅ **THE OUT-OF-SCOPE RULING ON `min_rr` STANDS — and is now much better evidenced.** It is the one knob of the three that has genuinely had a **data-driven, per-strategy** pass. **Nothing in this batch should touch it.**

---

## A.12 — **THE REACHABILITY GATE'S ORIGINAL INTENT: A SANITY VALIDATION, NOT A VOLUME DIAL.** (§2 1.b provenance — the answer to "why 4.0")

`P19_REORG_B2_1_COMPLETION_REPORT:30`, verbatim — **and it is a response to Kyle's own question at the time:**
> *"**Kyle asked why the floor-lift / RR / reachability lived in a post-hoc normalizer rather than in the strategy modules where the signal is generated** — a strategy *'would never have produced a signal with a target like that.'* Investigation across all **19** canonical strategies confirmed the gates belonged at signal-gen: the floor-lift was a **mutation** of the target (redundant with the Net-Expectancy gate that already judges cost-coverage), and **the RR/reachability checks are *validations* that every strategy should answer for its own geometry.** Consensus (CC-B + Langston): drop the lift, move the two validations into the shared guard each strategy already calls, keep ONE per-class SSOT for the thresholds, and surface every drop by-reason (no hidden gates)."*

**⇒ INTENT ESTABLISHED: reachability is a SANITY CHECK on a strategy's own geometry — "is this target absurd relative to volatility?" — explicitly NOT a profitability filter and NOT a trade-volume knob.** The cost-coverage job was deliberately left to the Net-Expectancy gate.

**★ THE HONEST TENSION THIS CREATES FOR OBJ-3 — stated, not resolved:**
- **Against the change:** recalibrating `reach_atr_max` to admit more trades **repurposes a sanity validation as a volume dial**, which is contrary to its stated intent and is the "turning dials until something squeezes out" posture Kyle has ruled against.
- **For the change:** if the validation rejects a large share of a strategy whose geometry is *legitimate by construction* (`sma_trend_ride` = 2R off a structural stop, RR invariant at exactly 2.00), then **the validation is mis-calibrated for that geometry** — which is not repurposing it, it is fixing it.
⇒ **This is a rule-24 three-way question and it belongs to Langston + Kyle, not to me.** **No value should be proposed until it is answered.**
*(Also from B2.1: Langston's Step-4 already caught "active reachability fed `atr=0`" — fixed in-batch by carrying ATR on `SizingContext` + a loud `invalid_atr`. The gate has been reviewed once and hardened once.)*

## ⛔ A.13 — **THE `rrDrops` RATIOS STRADDLE A DEPLOY BOUNDARY. Suppression rates retracted; the DISTRIBUTIONS survive.**

**MEASURED:** the tracker window starts **2026-06-23T19:51:53Z**. **reorg-B2.3 — which replaced the floors — deployed `47286ccfd` / `7b5512ec4` on 2026-06-27** (report: *"Closed: 2026-06-27"*).
⇒ **The floors changed FOUR DAYS INTO a 49-day window**, and the tracker is a **cumulative counter with no time dimension**, so the pre- and post-change populations **cannot be separated**. **Same boundary-straddling class Langston diagnosed; I did it again on the instrument I introduced to fix the previous error.**
**DIRECTION IS KNOWN:** B2.3's own report — *"most lower than 2.5 → **less suppression**"* ⇒ the ~8% pre-change slice was judged against **stricter** floors, so **every suppression RATE I quoted OVERSTATES the current one.**

**⛔ RETRACTED:** `morning_star` *"66.3% rrSuppressionRate"*, `vwap_pullback` *"36.5%"*, `sma_trend_ride` *"5.0%"* — all ratio figures.
**✅ SURVIVES UNAFFECTED — and it is the load-bearing half:** `meanRR`, `rrMin`, `rrMax` are **properties of the signals themselves, independent of any floor.** So **`morning_star` meanRR 1.05**, **`vwap_pullback` 2.21**, and **`sma_trend_ride` invariant at exactly 2.00** all stand. **The distributions are clean; only the pass/fail ratios are contaminated.**
**⇒ EVERY CONCLUSION IN THIS AUDIT RESTS ON THE DISTRIBUTIONS, NOT THE RATIOS** — `morning_star`'s 1.05-vs-1.39 miss, and `sma_trend_ride` sitting exactly on its floor, are both untouched.

---

## B. CORROBORATION FOUND IN THE LEDGER FOR SCOPE FINDINGS (§9.5(b-ii) — search before filing)

- **`morning_star` independently confirmed broken.** `RUNNING_ISSUES:1935` records the persisted tracker at **272,758 evals / 186,096 `rrDrops` — a 68% reward-to-risk drop rate.** That is an *entirely different instrument* from the scope's hit-rate replay (2.0% hit rate over 553 trades) and it points the same way. **Two independent measurements; the retire-or-rebuild question at scope §4.2 is well-founded.**
- **The RR floor's own history.** `min_rr = 2.5` was **already recalibrated once** — reorg-B2.3 set per-`(strategy × asset_class)` baselines off this same persisted window (`expectancy.ts:205`: *"floorPct + reachAtrMax stay PER-CLASS (strategy:'*'); only min_rr goes per-(strategy×class)"*). ⇒ **the scope's out-of-scope ruling on `min_rr` is right for a second reason: it is the ONE knob of the three that has already had a data-driven pass.**

---

## C. WHAT PART 2 MUST STILL COVER — named now so it cannot be quietly skipped

1. **`SYSTEM_MANUAL.md`** — target-setting + reachability math sections (SIM points at them for reorg-B2).
2. **`ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`** — the Phase-19-opening audit Kyle named specifically.
3. **Completion reports:** reorg-B2, B2.1, B2.2, B2.3 (the constants' birth + the one recalibration that happened), P19-B7.1 (the ranker), reorg-B4 (shadow layer), P19-B8.5a/b/c (gate topology + the deleted kernel calls).
4. **`bridge/canonical/`** — pre-governance intent for anything predating 2026-01/02, per §9.5(b). **Record the result even if it is "no coverage" — that is itself a finding.**
5. **The pre-governance batch folders** (`Archived Reports - Pre-Phase 12 Governance Implementation/`).
6. **§9.5(a) COMPONENT CENSUS at every hop** — writers / readers / mutators / **deleters** / schedulers, per component. **Not a path trace**: the scope's funnel was redrawn three times precisely because forward-tracing stops at the first sufficient explanation.
7. **§9.5(a-ii) DELETION-TIME STATE-WRITE CENSUS** — OBJ-1 may re-scope toward *why `rtb_signals.block_reason` is empty*; if anything is removed, enumerate the state it writes and grep for surviving readers.
