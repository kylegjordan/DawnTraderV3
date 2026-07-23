# B-RETIRED-SCORE-REMOVAL — PRE-IMPLEMENTATION AUDIT (#558)

**change-class: architecture** · **Owner:** CC-A · **Review:** Langston · **Date:** 2026-07-23
**All citations at `origin/migration/aws-supabase`** (#545 rule 2). Greps exclude tests, `_archive/`, `.removed`.

> **KYLE'S MANDATE:** *"The success of this batch will be based on the pre-implementation audit… dig deep into the code… all the historical documentation… the batch completion reports… the old canonical bridge files as well as the old batch reports prior to the new governance system… the systems impact map… the Phase-19 active-trading-path audit… the audit done at the very beginning of our new governance system."* This document is §9.5 (component census at every hop + provenance read) applied at maximum depth.
>
> **DECISION IN FORCE (Kyle, 2026-07-23):** **REMOVE EVERYTHING NOW** — including the control/diagnostic ranker arms (bucket C). *"Even if the old system performed better than this system, the old system was not good. So we would have to start looking at what is a better way of ranking and scoring."* A new ranking/scoring design is a SEPARATE future effort, not part of #558.

---

## 0. CORRECTION TO MY OWN SCOPE FILE (fix #1, landed before any trace)

The scope's bucket-B paragraph claimed `rtb_signals.final_score` *"was already dropped in #555."* **FALSE.** Verified at origin, `shared/schema.ts:1943-1945`:

- `:1943` — `finalScore: decimal("final_score", …).notNull()` — **SURVIVES, and is NOT NULL.**
- `:1944-1945` — the #555 comment records that **`regime_weight` / `hybrid_score` / `decay_penalty`** were the columns dropped.

**Consequence had it stood:** the audit would have skipped the single largest surviving data contract, and a NOT-NULL column drop (which needs a real forward+rollback migration, not a no-op) would have gone unplanned. The error was mine. Scope corrected in the same turn.

---

## 1. ★★★ FINDING 1 — THE FORMULA HAS **FIVE** COMPUTATION SITES, NOT ONE

A named-function trace on `calculateFinalScore` finds two callers and would declare the job nearly done. It is not. The same formula is independently re-implemented five times:

| # | Site | Reachability |
|---|---|---|
| 1 | `calculateFinalScore` — `server/core/utils/score-calculator.ts:44` | **LIVE**, 2 callers: `signal_quality_evaluator.ts:524`, `quality_index.ts:319` |
| 2 | **INLINE copy** — `server/core/rtb/ready_to_buy_service.ts:805-810` (`W.HYBRID/W.CONFIDENCE/W.REGIME/W.DECAY` off `SCORE_WEIGHTS`, imported `:63`) | **LIVE** — the RTB refresh's `refreshedFinalScore` |
| 3 | xStock `computeFinalScore` — `server/asset_classes/xstock_spot/eval-cycle.ts:656` | **LIVE** on the xStock eval path |
| 4 | `calculateAdaptiveFinalScore` — `server/core/metrics/adaptive-goals-weight.ts:146` (adaptive weights variant) | **SCRIPT-ONLY** — see Finding 4 |
| 5 | `computeRankingScore` — `server/config/ranking-weights.ts:82` — *consumes* finalScore as its `qualityWeight` term | **LIVE via VTS only** — see Finding 5 |

**⇒ Any plan built on "delete `calculateFinalScore` and its callers" is incomplete by three sites.** Site 2 is the one Kyle's handoff specifically flagged: it is an inlined arithmetic copy that carries no function name, so it is invisible to a symbol search. Sites 3 and 4 are separate re-implementations under different names.

---

## 2. ★★★ FINDING 2 — `score-calculator.ts` IS A **MIXED** FILE. A REGION CUT REPEATS THE B8.10 FAILURE

Exports (`grep '^export' at origin`):

| Line | Symbol | Disposition |
|---|---|---|
| `:28` | `interface SignalMetrics` | shared by all three functions — **cannot be deleted with `calculateFinalScore`** |
| `:44` | **`calculateFinalScore`** | **REMOVE** (this batch) |
| `:142` | `type RegimeWeightResult` | **KEEP** |
| `:146` | **`calculateRegimeWeight`** | **KEEP — LIVE ADMISSION GATE** (regimeWeight floor 0.30). 3 callers: SQE `:548`, `quality_index:299`, `ready_to_buy_service:868` |
| `:191` | **`getPredictiveConfidence`** | **KEEP — see Finding 3** |
| `:226` | `clearPredictiveConfidenceCache` | KEEP (serves `:191`) |

**This is precisely the B8.10 OBJ-5c over-scoop failure mode** (Langston Step-4 finding ①: the first archive cut took five live methods by copying a region). Here a region cut would take the RegimeWeight gate — one of only two gates that can reject on the active path, and the very thing B-REGIME-INPUTS-LIVE spent a batch making functional.

**⚠️ ADDITIONAL DELETION HAZARD — NAME COLLISION.** A *different* `calculateRegimeWeight(candles: Candle[])` exists at `server/services/multi-timeframe-scanner.ts:172` (called `:224`). Same name, different signature, different body. The file's own comment warns about it (`score-calculator.ts:113`). **A repo-wide symbol sweep must be word-boundary AND file-scoped**, or it will either delete the wrong function or produce a false caller count.

---

## 3. ★★★ FINDING 3 — `predictiveConfidence` IS **NOT** ONLY A finalScore INPUT. IT GATES ADMISSION INDEPENDENTLY

This one **partially qualifies the argument I gave Kyle** and must be on the record before any cut.

I told Kyle that keeping finalScore means keeping a four-input formula whose 30% `predictiveConfidence` input has a known inversion problem homed to Phase 25. That was true as far as it went, and his remove-everything decision stands. **But the converse does not follow:** removing finalScore does **not** remove `predictiveConfidence`, because it has a live consumer that has nothing to do with the formula.

`signal_quality_evaluator.ts`:
- `:375` — `const predictiveConf = getPredictiveConfidence(input.assetClass, canonicalSymbol, input.regime, input.strategy)`
- `:378` — feeds **`isSignalProfitable(…, predictiveConf, _b45Fee)`**
- `:380` — feeds **`getDynamicROIThreshold(input.regime, input.assetClass, predictiveConf)`**
- `:381/:394` — the resulting ROI failure is **pushed to `failures`** ⇒ **a real rejection, not a shadow log**

**⇒ `getPredictiveConfidence` SURVIVES this batch. The dynamic-ROI gate is a live admission gate that reads it directly.** Its other two callers (`xstock_spot/eval-cycle.ts:649`, `vts-runner.ts:1595`) feed their own finalScore variants and go with those sites.

**Scope consequence:** the known confidence-inversion problem is **not** resolved by #558 and must stay homed to Phase 25. Claiming otherwise in the completion report would be false. **Recorded here so the batch does not accidentally advertise a fix it does not deliver.**

---

## 4. FINDING 4 — `adaptive-goals-weight.ts` IS REACHABLE ONLY FROM A SCRIPT

`calculateAdaptiveFinalScore` (`:146`) + `computeAdaptiveGoalsWeights` (`:65`): the **only** importer outside the module is `server/scripts/audit_goals_weights.ts` (`:13/:16`) — a diagnostic script, not the runtime.

⚠️ **One reference needs disposition, not assumption:** `server/startup/b72-warmup.ts:42` warms a DB settings key `'goals_weighting'` with the comment *"adaptive-goals-weight.ts AI weight cap"* (`AI_WEIGHT_CAP`, `:37`). That is a **string settings key**, not an import — so it does not make the functions reachable, but **deleting the module without also retiring the `goals_weighting` warm entry and its `module_constants` row leaves a warm pointing at nothing.** Cluster = module + script + warm entry + DB row, deleted **as a unit** (B8.10 method (a)).

---

## 5. FINDING 5 — TWO DEAD IMPORTS, AND rankingScore's ONLY LIVE PRODUCER IS VTS

- **`ready_to_buy_service.ts:35`** imports `calculateFinalScore` — and **never calls it** (the file's only other match, `:1014`, is a comment). The RTB uses its own inline copy (site 2). *Dead import — and the reason my earlier "equivalent via `calculateFinalScore`" claim was false.*
- **`signal-orchestrator.ts:149`** imports `computeRankingScore`, `normalizeNetReturn`, `CONTEXT_BONUS` — and **calls none of them** (grep over the file returns the import line only). *Three dead imports.*
- **`computeRankingScore` has exactly one live call site: `vts-runner.ts:5609`.** ⇒ rankingScore is produced by VTS alone; the RTB `ranking_score` control arm merely *reads* `metadata.rankingScore` off a signal.

---

## 6. BUCKET C — THE CONTROL ARMS (Kyle: REMOVE)

`ready_to_buy_service.ts:1705` `computeRankKey`:
```
if (ranker === 'confidence')     return parseFloat(signal.finalScore || '0');   // control
if (ranker === 'ranking_score')  { …meta.rankingScore… ?? parseFloat(signal.finalScore || '0'); } // control
return this.signalRMultiple(signal, assetClass).r;                              // r_multiple — LIVE DEFAULT
```
`RANKER_STRATEGIES = ['r_multiple','confidence','ranking_score']` (`:256`); active arm is DB-resolved, fail-hard, no hidden default (`getActiveRanker` `:260-262` ← `module_constants.rtb_ranking.active_ranker`).

**Removing both control arms collapses the enum to a single member.** That raises one genuine design question I will not decide unilaterally — **for Langston (Q1):** does the pluggable ranker survive as a one-arm plug-point (so a future ranker slots in without re-architecting, and the DB constant + `getDisplayRankKey`'s `arm` field stay meaningful), or does it collapse to a direct `signalRMultiple` call with the enum, `getActiveRanker`, and the `active_ranker` DB row all retired? **Both are defensible; collapsing is more honest today, keeping the plug-point is cheaper when the new ranker Kyle described gets designed.** Note `getDisplayRankKey` (`:1731`) returns `{value, arm}` to a UI surface — a collapse changes that response shape.

---

## 7. ★★ FINDING 6 — THE SHADOW LOG WAS BUILT TO DECIDE **EXACTLY THIS**, POST-PAPER (§9.5(b-ii) provenance)

Per §9.5(b-ii) I searched the ledger before filing anything as a finding — and the code names its own provenance, so I followed it rather than reading past it.

`signal_quality_evaluator.ts:338-347`:
> *"P19-B8.5a (OBJ-5): the finalScore GATE is RETIRED (Kyle-ratified crew consensus 2026-07-13, P25_SCORING_STACK_PRESTUDY §7: intent REDUNDANT — composites feed EV gates, never replace them; finalScore measured **anti-predictive r=−0.140**). finalScore keeps being COMPUTED and its would-have-rejected verdict is **SHADOW-LOGGED through the paper period — the formal field-kill ruling comes post-paper on this log's evidence.** The thresholds stay resolvable as shadow-only knobs; NOTHING is pushed to failures here."*

The shadow verdict is **durably captured** (B-EVIDENCE-SINK dual-write, `:348+`), not just a console line.

**⇒ This is not legacy drift and not a defect (rule-24 outcome 2 → now a scope call Kyle has made).** A deliberate, governed plan exists: keep computing, shadow-log, decide after the paper period. **Kyle's remove-everything decision is that field-kill ruling arriving early**, and his stated reasoning covers it — the replacement argument in P19-B7.1 was **structural** (finalScore is friction-blind and reward:risk-blind *by construction*, so it can rank a net-negative signal above a net-positive one), which calibration cannot repair, and the measured `r=−0.140` says the shadow log is not going to rescue it either.

**What ending it costs, stated plainly rather than buried:** the post-paper evidence file closes early, so there will be no measured "how often would the retired gate have been right" number from the paper period. **Langston (Q2): confirm this is understood and intended before Phase A cuts the shadow-log block**, since a governed plan is being ended ahead of its own schedule. I am not treating this as a blocker — Kyle decided with the structural argument in view — but per §9.5(b-ii) a governed decision must be *cited and closed*, not silently overwritten.

---

## 8. BUCKET B — STORED-DATA CONTRACTS ENUMERATED (Phase B, its own sub-batch)

Not a code delete. Each needs: readers? history worth keeping? forward+rollback migration.

| Contract | Note |
|---|---|
| `rtb_signals.final_score` | **`.notNull()`** (`schema.ts:1943`) — a real NOT-NULL drop; every writer must go in the same migration |
| `screener_filters.final_score_min` | live column, `0.3500` across all seeded rows (crypto + xStock, paper + live) |
| `module_constants` `rtb_ranking.finalscore_decay_lambda` | `0.03`; read by `getFinalscoreDecayLambda` (`:237-245`), env-overridable via `FINALSCORE_DECAY_RATE` |
| `module_constants` `rtb_ranking.active_ranker` | disposition follows Q1 |
| `module_constants` `pattern_pool_gates.pattern_final_score_min` | `0.45`; reached via `getPatternPoolGuardrailsForAssetClass(...).FINAL_SCORE_FLOOR` (SQE `:335`) |
| `module_constants` `goals_weighting` | see Finding 4 |
| shadow sinks — `rtb_shadow_pairings`, `rtb_shadow_pool_members` | `final_score` populated 14,232/14,232; `hybrid_score`/`regime_weight`/`decay_penalty` dropped at #555 |
| VTS + telemetry tables | `vts-service.ts`, `telemetry-aggregator.ts` (33 hits), `telemetry-repository.ts`, `signal-eval-archiver`, `switch-on-evidence-sink`, `would-admit-cache` |
| **rule-20 KEEP-AS-DATA precedent** | the persisted `'paper_sim'` discriminator stays as data; **historical rows here are kept as inert data per Kyle — we STOP COMPUTING, we do not erase history** |

---

## 9. METHOD ADOPTED FROM B8.10 (both, from the start)

1. **Delete clusters as a unit**, with blast-radius proof = repo-wide grep **non-test, non-archive**, word-boundary, per symbol. Every "zero callers" claim is stated with its evidence (rule 22: an asserted absence needs presence-evidence).
2. **Generate the archive file programmatically from git HEAD, with an assertion that no live method leaked in** — B8.10's first archive cut took five live methods by copying a region, and Findings 2 and 4 show this batch has the same shape (mixed files, name collisions). Not optional here.
3. **#568 state-write census at deletion time:** for each deleted writer, enumerate the state it writes and grep for surviving readers. Caller-tracing + `tsc` + green CI **cannot** see a removed writer with a live reader — that is how the OBJ-1 latch regression shipped last night.

---

## 9.5 ★★★ SECOND PASS — THREE ORPHANS, ONE SIXTH FORMULA, AND A LIVE ORDER-BY THAT TURNS OUT INERT

Added after the first dispatch. **Every claim below was reachability-checked BEFORE being characterized** — last night's most expensive lesson was building a structural conclusion on `executeRefreshCycle`, which has never executed.

### 9.5.1 Three orphaned consumers (zero live callers — presence-evidence given)

| Module / symbol | Evidence | Disposition |
|---|---|---|
| **`server/core/criteria-limiter.ts`** — the whole module, incl. `export const criteriaLimiter = new CriteriaLimiter()` (`:178`) | Repo-wide grep for `CriteriaLimiter`/`criteriaLimiter` (non-test, non-archive) returns **only the two definition lines in the file itself**. The single other repo reference is a **comment** at `ready_to_buy_service.ts:994`. **Zero importers.** | **ORPHANED** — rule 18 delete |
| **`applyGovernance`** — `governance-engine.ts:76` (`adjustedScore = finalScore × multiplier`, `:115`) | Both former importers **explicitly removed it as dead**: `active-execution-engine.ts:181` *"HF9: applyGovernance + getGovernanceStateForUI removed (dead imports — never called in function body)"*; `vts-runner.ts:109` *"HF9: applyGovernance removed (dead import — governance gate moved to SQE)"* | **ORPHANED** |
| **`computePerformanceScore`** — `ml-calibration.ts:93` | Repo-wide grep returns **only its own definition**. | **ORPHANED** |

**⚠️ I nearly filed the first of these as a contradiction of the scope's central premise.** `criteria-limiter.ts` reads *"Directive 11.0B: Ranking is exclusively by FinalScore"* (`:18`) and requests `orderBy:'finalScore'` + `limit: openSlots` then promotes from the top (`:85-100`) — which, if live, would be a **finalScore-driven promotion decision** and would falsify "neither score drives a live admission, ranking, or sizing decision today." **It is not live.** The TCL is a mainstay component named in CLAUDE.md, but the live TCL is **not this class** — TCL functionality is referenced across ~20 files (`tcl_watchdog.ts`, `trading_scheduler.ts`, `active-engine-service.ts`, …). **Honest limit: I proved this module is orphaned; I did NOT map where the live TCL is implemented.** Not needed for this batch, but the claim stops where the evidence stops.

### 9.5.2 A SIXTH formula (orphaned)

`ml-calibration.ts:93` — `computePerformanceScore = finalScore×0.5 + predictiveConfidence×0.3 + regimeWeight×0.2`. A *different* weighted composite, distinct from all five in §1. **Zero callers.** ⇒ the formula-site count is **six**, five live/script-reachable and one dead.

### 9.5.3 ★ `getQueuedSignals` orders by finalScore — and it is INERT on the live path

`ready_to_buy_service.ts:1390` `getQueuedSignals` issues **three** queries each with `orderBy:'finalScore', orderDir:'desc'` (`:1400/:1408/:1416`) and then **re-sorts the merged list by finalScore descending** (`:1420-1425`). Fourteen call sites. This looked like a live finalScore-driven selection. **It is not — verified at each live consumer:**

- **`getRankedSignals:1799`** (the promotion path) — **re-ranks and re-sorts by `computeRankKey`** (`:1859-1860`), completely overwriting the incoming order. The comment at `:1864` confirms it is *"the SOLE live caller of the promotion path."*
- **`rtb-refresh-service.ts:326`** — consumes into a `Set` of signal keys. Order-irrelevant.
- **`rtb-refresh-service.ts:389`** + **`ready_to_buy_service.ts:902`** — filter by hash-assigned bucket membership. Order-irrelevant.
- **No `LIMIT`** on any of the three queries ⇒ the ordering cannot drop a signal either.

**⇒ Removing the ORDER BY is behaviourally safe on the promotion path.** But it is **not** a free deletion: `routes.ts:9324` and the c13/c14 validation services also consume `getQueuedSignals`, and their **displayed/reported row order will change**. **Langston (Q5): when finalScore goes, does `getQueuedSignals` order by the live rank key (`r_multiple`), or drop the ordering entirely and leave ordering to whoever needs it?** Ordering by the live rank key keeps display order meaningful and matches the "the number that ranks is the number displayed" principle from P19-B8.7 Step-9; dropping it is simpler but makes the RTB API surface return an arbitrary order.

*(Not-yet-checked, stated rather than assumed: the remaining in-file callers `:650`, `:1452`, `:1464`, `:1627`, `:2333`.)*

### 9.5.4 Decision-vs-telemetry sweep — result

Scanned `telemetry-aggregator`, `ml-calibration`, `governance-engine`, `c13`/`c14-validation-service`, `criteria-limiter`, `unified-core`, `trading-engine` for finalScore in a conditional/comparison/sort shape. **Every surviving live hit is aggregation or reporting** — `Math.max`, `reduce`→average, percentile sort for a report table, a markdown row. **No live `if (finalScore < X) → reject` outside the retired-and-shadow-logged SQE block of §7.** This is consistent with the scope's premise, now with evidence behind it rather than assertion.

---

## 10. OPEN — STILL TO TRACE BEFORE PHASE A CUTS

Stated as open rather than assumed clear (an unfinished trace reported as complete is the failure this document exists to prevent):

1. `telemetry-aggregator.ts` (33 finalScore hits) — decision-feeding, or reporting only?
2. `ml-calibration.ts` (11) / `governance-engine.ts` (7) / `c13`+`c14-validation-service.ts` (21) — does any consume finalScore in a *decision*?
3. `vts-runner.ts` (50) + `vts-service.ts` (15) — confirm **STORES-not-RANKS** (Langston Step-2 gate 4). My prior read says VTS selects nothing by old scoring and `captureShadowPool` is a selection-quality harness; this must be re-derived at code, not carried on my own summary.
4. Client surfaces (9 files) — which render finalScore/hybridScore, and what replaces the cell.
5. `criteria-limiter.ts` (7), `trace_service.ts` (6), `skipped-signals-logger.ts`, `cost-telemetry.ts`, `unified-core.ts` (8), `trading-engine.ts` (5).
6. The provenance read Kyle enumerated — `bridge/canonical/`, the pre-governance batch reports, the Phase-19 active-trading-path audit, and the original new-governance-era audit — **for the ORIGIN INTENT of finalScore itself** (why a composite gate was built at all), which is what tells us whether anything it was meant to do is left unowned once it is gone. Findings 3 and 7 are the first two answers; this is not yet complete.

---

## 11. QUESTIONS FOR LANGSTON (Step-2)

- **Q1 — one-arm plug-point or full collapse?** (§6)
- **Q2 — confirm the early end of the P19-B8.5a shadow-evidence plan is intended.** (§7)
- **Q3 — `SignalMetrics` (`score-calculator.ts:28`)**: shared by the two surviving functions. Keep as-is (carrying now-unused `hybridScore`/`decayPenalty` fields), or narrow it to the RegimeWeight inputs? Narrowing is cleaner but widens the diff into live-gate code.
- **Q4 — Phase-A boundary**: does the xStock `computeFinalScore` site (`eval-cycle.ts:656`) and its `computeRealHybridScore`/`computeRealDecayPenalty` cluster (`vts-real-score.ts:43/:209`) land in Phase A with the rest, or as its own slice? It is the same removal but a different asset-class path and a separate review surface.
