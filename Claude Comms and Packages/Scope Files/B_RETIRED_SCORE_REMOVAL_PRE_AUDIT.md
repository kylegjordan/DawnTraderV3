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

- **`ready_to_buy_service.ts:35`** imports `calculateFinalScore` — and **never calls it** (the file's only other match, `:1014`, is a comment). The RTB uses its own inline copy (site 2). *This is why my earlier "equivalent via `calculateFinalScore`" claim was false.*
  **⚠️ CORRECTION (Langston, Step-2 review — my wording was imprecise and dangerous):** I called this a *"dead import."* It is **a SHARED destructure**, not a dead line: `import { calculateFinalScore, calculateRegimeWeight } …`, and **`calculateRegimeWeight` is LIVE at `:868`** (the RegimeWeight admission gate). **The removal drops the `calculateFinalScore` SYMBOL from the destructure only — deleting line 35 breaks the live gate.** Exactly the class of error this batch exists to avoid, and it came from my own loose label. *(`signal-orchestrator.ts:149` genuinely is a fully-dead import — all three of its symbols are uncalled — so the two cases must not be treated alike.)*
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

### 8.1 ★★★ PHASE A AND PHASE B ARE **COUPLED** ON `rtb_signals.final_score` (Langston, Step-2 — the sharpest correction to my plan)

As I originally drew it, the phases **conflict and would break production either way round.** `final_score` is **NOT NULL**, and its writers are code:

- **`ready_to_buy_service.ts:1151`** — the reconfirm update writes `refreshedFinalScore` (formula site 2) to the column.
- **`ready_to_buy_service.ts:2234`** — the queue-insert writer.

I filed **the writers in Phase A (code)** and **the NOT-NULL column drop in Phase B (own sub-batch)**. Both orderings fail:

- **Writers dropped first** → every INSERT and every reconfirm hits a **NOT-NULL violation** — i.e. the RTB queue stops accepting signals, on day one.
- **Column dropped first** → the surviving writers **throw**.

**⇒ RULING: the writer removal and the column change must land TOGETHER** — either `final_score`'s column change moves up into Phase A with its writers, or the writers hold until Phase B. **Do not split them.** (A nullable-then-drop two-step, or an atomic writer-removal-plus-drop in a single deploy, both satisfy this.)

**This is the single most valuable correction in the review** — my own bucket-B note said *"every writer must go in the same migration,"* and then my phase split violated exactly that. Writing a correct principle and then contradicting it in the plan is a failure the phase diagram hid.

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

### 9.5.35 ★★★ LANGSTON'S STEP-2 GATE 4, RE-DERIVED — "VTS STORES, DOESN'T RANK" HOLDS, **BUT IT IS NOT THE WHOLE TRUTH**

**Gate 4 as stated: CONFIRMED.** Grepping `vts-runner.ts` + `vts-service.ts` for either score in a threshold comparison (`<`, `>`, `<=`, `>=`) returns **exactly one hit, and it is an average** (`vts-runner.ts:5005`, `avgFinalScore`). There is **no VTS gate, filter, or sort on finalScore or hybridScore.** The VTS selects nothing by old scoring — consistent with what I told Kyle about `captureShadowPool` being a selection-quality harness.

**★ BUT "stores-not-ranks" would license a deletion that breaks something.** The VTS does not *rank* on these scores — it **derives a live value from them**, in the hybrid-confluence path:

- **`vts-runner.ts:4929`** — a PATTERN trade is pushed into the hybrid-confluence buffer with **`strength: tradeRecord.hybridScore ?? 0.5`**. hybridScore *is* the buffer's strength.
- **`vts-runner.ts:4947`** — when a QUANT signal matches a buffered pattern:
  `hybridConfidence = (tradeRecord.finalScore × 0.4 + patternSig.strength × 0.4 + 0.2) × decayFactor`
  ⇒ **a hybrid signal's confidence is computed from finalScore and hybridScore.** That is a computational dependency, not storage.
- **`signal-orchestrator.ts:1924`** — `confidence: tradeSignal.confidence ?? patternSig.strength` ⇒ buffer strength can *become* a signal's confidence.

**⇒ #568 class, exactly: delete the writers and `strength`/`hybridConfidence` keep being read with their inputs gone** — no compile error, no failing test, green CI, and a hybrid signal silently confidence-rated off `?? 0.5` and a vanished `finalScore`.

**Two mitigating facts, both verified, neither of which dissolves the problem:**
1. The buffer is **namespaced** — VTS writes `sourceMode: 'vts'` (`:4926`, commented *"ITEM-4 step 2 (D1b): own namespace"*), so VTS entries do not leak into the active path's confluence matching.
2. **The active path does NOT use finalScore here** — `signal-orchestrator.ts:1798` computes the same hybridConfidence as `(signal.confidence × 0.4 + patternSig.strength × 0.4 + 0.2) × decayFactor`, i.e. **`confidence` where VTS uses `finalScore`.** The two paths already diverge, and the live one is already free of finalScore.

**⇒ Scope consequence (Langston Q6):** the VTS hybrid-confluence path needs a **replacement input**, not a deletion. The obvious candidate is to converge VTS onto the orchestrator's existing shape — `confidence` in place of `finalScore` at `:4947`, and a non-hybridScore strength at `:4929` — which makes the two paths consistent and removes the last VTS dependency. That is a **behaviour change inside the VTS**, so it is a decision, not a mechanical edit, and I will not make it unilaterally.

**Method note:** this was found by the #568 state-write census (§9.3 item 3), not by caller-tracing. Caller-tracing `computeRealHybridScore` says "one VTS caller, delete it"; only asking *what does the deleted code WRITE, and who still reads it* surfaces `strength` → `hybridConfidence`.

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

## 10.0 ★ SECTION-10 ITEM 4 CLOSED — CLIENT-SURFACE TRACE (Langston's stated CONDITION on the Q1 collapse)

**Result: the Q1 collapse is SAFE for the client. The `arm` field is never rendered.**

`getDisplayRankKey` returns `{value, arm}`; `routes.ts:5110` attaches it per-row as `rankScore`/`rankArm`. In `ready-to-buy-table.tsx`:

- **`rankArm`** — declared in the row type at **`:28` (`rankArm?: string`) and referenced NOWHERE else.** Not rendered, not sorted on, not in a header. **Dropping `arm` changes no rendered output.**
- **`rankScore`** — genuinely load-bearing: the **default sort field** (`:77`), a `SortField` member (`:68`), the sort comparator (`:155-159`), **two column headers** — "Rank" (`:339`) and "RankingScore" (`:342`) — and the rendered cell (`:427-429`). **It survives the collapse unchanged**, since under the live default arm it already *is* the `r_multiple` value.

⇒ **Condition satisfied: collapse `getDisplayRankKey` to return the scalar, drop `arm` from the response, drop `rankArm` from the client row type.** No replacement cell needed — there was never a cell.

**Other client surfaces that DO lose rendered content (Phase-A/B scope, not blockers):**

| Surface | Impact |
|---|---|
| `shadow-trades-tab.tsx:26,:226` | renders a `finalScore` column — **column goes** |
| `analytics.tsx:150,:3146,:3453-3456` | renders `decision.finalScore` conditionally — **block goes** |
| `vts-shared.tsx:35-36,:116-117` | type fields only; **`:381` already records** *"P19-B8.7 Step-9: 'finalScore' removed with its column (retired metric, piece 2.7)"* — precedent set |
| `paper-trade-adapter.ts:224-229,:312` | **already fenced** — comments deliberately OMIT finalScore/hybridScore as a *"retired metric… (piece 2.7 / #525)"*. **Nothing to do; and this is the pattern to follow** — the codebase has already removed these from one client path with explicit fences. |
| `ready-to-buy-table.tsx:379` | comment already calls finalScore **"inert"** |

**⇒ The client side is already half-retired by B8.7/#525, with fences naming the retirement.** That is corroborating provenance for Kyle's decision: the crew has been removing these from display surfaces for weeks; #558 finishes a retirement already in progress rather than starting one.

---

## 10.03 ★★★★ THE #568 CENSUS FOUND A **LIVE finalScore DECISION** — THE SCOPE'S CENTRAL PREMISE IS FALSE

**This is the single most consequential finding of the audit, and it was found by the state-write census — nothing else in this batch would have surfaced it.**

The scope §1 asserts: *"Neither score drives a live admission, ranking, or sizing decision today."* **That is FALSE.**

### `ready_to_buy_service.ts:2098-2113`, inside `queueSQESignal` (`:2071`)

```ts
const existingSignal = input.skipSelfCheck ? null
  : await this.getQueuedSignal(input.mode, normalizedSymbol, input.strategy);
if (existingSignal) {
  // If existing signal has higher FinalScore, keep it
  const existingScore = parseFloat(existingSignal.finalScore || '0');
  const newScore = input.finalScore;
  if (existingScore >= newScore) {
    …[RTB_SKIP] Keeping existing … FinalScore ${existingScore} >= new ${newScore}
    return existingSignal;                    // ← the NEW signal is DISCARDED
  }
  await this.expireSignal(existingSignal.id, 'Replaced by higher-FinalScore SQE signal');
}                                              // ← the EXISTING signal is EXPIRED
```

**⇒ finalScore is the TIEBREAKER deciding which of two competing signals for the same symbol+strategy occupies the ready-to-buy queue slot.** One of them is discarded and the other expired — **on finalScore, today, on the live path.**

### REACHABILITY — verified, not assumed (the `criteria-limiter` lesson applied in the opposite direction)

- **Live caller:** `signal-orchestrator.ts:1118` — `readyToBuyService.queueSQESignal(sqeSignalInput).catch(…)` (fire-and-forget).
- **The file says so itself:** `:2132` — *"`queueSQESignal` is the **SINGLE live RTB admission chokepoint**"*; `:88` — *"the live path is `queueSQESignal`"*; `:639` — *"The admission chokepoint (`queueSQESignal`)."*

**This is NOT an orphan.** It is the one door every SQE-passed signal walks through to reach the queue.

### WHY EVERY EARLIER CHECK MISSED IT

- It is **not a threshold comparison** (`finalScore < min`) — so the decision-shape sweep (§9.5.4) that scanned for rejection conditionals did not match it. It is a **comparison of two signals against each other.**
- It is **not a ranking** — so "the live ranker is `r_multiple`" is true and irrelevant here.
- It is **not the retired gate** — B8.5a retired the *admission threshold*; this duplicate-resolution rule was never part of that ruling and was left untouched.
- Caller-tracing `calculateFinalScore` never reaches it: this reads the **stored column**, written long before.

**⇒ The premise "neither score drives a live decision" was true of admission thresholds and ranking, and false of duplicate resolution. A narrower claim would have been correct; the broad one was not.** I wrote that premise, and it survived Step-1 review because it is *nearly* true.

### SCOPE CONSEQUENCE — A1 NEEDS A REPLACEMENT RULE, NOT A DELETION

Removing finalScore here **cannot be a deletion**: something must still decide which duplicate survives. Options, for Langston (**Q7**):

1. **Replace with the live rank key (`r_multiple`)** — consistent with Q5's "one truth for rank," and with the ranker being the system's live notion of "better."
2. **Replace with `netEV`** — the quantity the EV gate already trusts; simpler than a rank-key call at admission time.
3. **Drop the comparison and keep-first (or replace-always)** — a genuine behaviour change in queue composition; must be argued, not defaulted into.

**⚠️ The silent-failure trap if this is missed:** `parseFloat(signal.finalScore || '0')` on a column that has become NULL/absent yields **`0`** — so *every* incoming signal would beat *every* existing one, the queue would churn its entire contents on every duplicate, and **nothing would error.** That is the **#568 + absent-as-valid** classes compounding at the system's admission chokepoint. **This is exactly the failure Kyle's exhaustive-audit mandate exists to prevent**, and it would have shipped.

---

### 10.03.1 Q7 SETTLED — `r_multiple` IS COMPUTABLE ON BOTH SIDES; OPTION (1) CARRIES

Langston made Q7 turn on one checkable fact: **is the replacement key reliably available on BOTH sides of the comparison** (the *stored* `existingSignal` row AND the *incoming* `input`), the way `finalScore` was — or does using it just relocate the absent-as-valid landmine to a new column? Checked at the ref:

**`SQESignalInput` (`:120-200`) carries every input `signalRMultiple` needs:**

| Input | On `SQESignalInput` | On the stored row |
|---|---|---|
| `entryPrice` | **REQUIRED** `number` (`:129`) | in `insertData`; `.notNull()` |
| `stopPrice` | **REQUIRED** `number` (`:130`) | in `insertData`; `.notNull()` |
| `targetPrice` | optional (`:131`) — `signalRMultiple` already has a defined fallback (`entry × 1.02`, mirroring `executePromotedSignal`) | in `insertData` |
| `diAtQueue` / `dbsScoreAtQueue` | optional (`:160/:161`) — already `undefined`-tolerant in the kernel call | in `insertData` |
| `assetClass` | present; `queueSQESignal` **THROWS if absent** (`:194`) | first-class column |

**⇒ The two load-bearing inputs are REQUIRED on the input type and NOT-NULL on the stored row.** No new absent-as-valid surface is created. **Option (1) `r_multiple` carries**, and Q5's "one truth for rank" consistency is preserved — the same key decides which duplicate survives, which one ranks, and which one displays.

**Two honest implementation notes, neither a correctness objection:**
1. **A shape adapter is needed.** `signalRMultiple(signal: RtbSignal, …)` takes the **stored** shape (string prices, `metadata` blob); the incoming side is an `SQESignalInput` (number prices). So the new-signal side needs a small adapter or a narrowed helper taking the price quintuple directly. Real work, not a blocker.
2. **The absent branch is already explicit and observable** — `signalRMultiple` returns **`-Infinity`** on unpriceable input, deliberately, *"so it sorts to the bottom."* That satisfies Langston's hard requirement (**kill the `parseFloat(x || '0')` coerce**) by construction rather than by discipline — but `-Infinity` must NOT be allowed to silently mean "the new signal always loses": the replacement needs an **explicit keep-first branch plus a counter** when either side is unpriceable, exactly as he specified.

*(Noted in passing, supporting the alternative: `chosenNetEv` is documented on the input at `:49` as "the best (chosen-mode) net-EV — **what gates + ranks**". Option (2) would therefore also be well-founded; I am not arguing for it, only recording that it was not dismissed for lack of a basis.)*

---

## 10.04 ★★★ SECTION-10 ITEM 5 CLOSED — TWO NAME COLLISIONS AND A COLUMN-REUSE LANDMINE

The remaining consumer files produced three finds that **a grep-driven removal would get wrong**, in opposite directions: two false positives it would wrongly delete, and one true dependency it would wrongly ignore.

### 10.04.1 ★★ THE LANDMINE — `telemetry_history`'s FOUR SCORING COLUMNS STORE **COST DATA**

`server/core/telemetry/cost-telemetry.ts:109-113` inserts into `telemetryHistory` with the scoring columns **repurposed to carry cost metrics**:

```
finalScore:           totalCost.toString()
hybridScore:          stats.avgFee.toString()
regimeWeight:         stats.avgSlippage.toString()
predictiveConfidence: stats.avgSpread.toString()
```

and reads them back out at `:184-213` (`avgFee: parseFloat(r.hybridScore)`, `totalCost: parseFloat(r.finalScore)`). Rows are tagged with a `COST_METRICS_SYMBOL` sentinel and a non-meaningful regime (the `:100-107` comment says so outright: *"cost telemetry is not regime-conditional… but the `regime` field in the telemetry row is required"*).

**⇒ `telemetry_history.final_score` and `.hybrid_score` are NOT scoring columns on this path — they are cost and fee.** A bucket-B action reasoning purely about scoring ("nothing reads finalScore any more, drop the column") would **silently destroy cost telemetry**, a different subsystem entirely, with no compile error and no failing test. **This is the #568 shape at the SCHEMA level: a surviving reader of a column whose nominal owner is being removed.**

**⇒ HARD SCOPE RULE for Phase B: `telemetry_history` scoring columns are NOT in this batch's drop set.** They are a **rule-20 KEEP-AS-DATA case with a live second tenant.** *(Whether overloading four columns this way is itself a defect is a separate, legitimate question — §13 candidate, NOT #558. Do not fix it here.)*

### 10.04.2 FALSE POSITIVE — `unified-core.ts` `finalScore` is a DIFFERENT DOMAIN ENTIRELY

`:443`, `:458`, `:475`, `:499` compute local variables named `finalScore` from **`awarenessScore + autonomyBoost + planningScore`**, oversight/ethical-compliance rates, feedback accuracy, and memory-archive scores. This is **AI self-assessment scoring — nothing to do with trading signals.** Four hits that a symbol sweep would surface as in-scope. **EXCLUDE.** *(Third name collision in this batch, after the two `calculateRegimeWeight`s — the pattern is now established enough that the sweep must be reviewed by hand, not applied mechanically.)*

### 10.04.3 A **SEVENTH** FORMULA — `trading-engine.ts:241`, and it is NOT orphaned

`signal.finalScore = (signal.confidence × 0.7) + (goalAlignmentScore × 0.3)` — a seventh distinct composite, unlike any of the other six, blending confidence with **goal alignment**.

**⚠️ Unlike the three orphans, `TradingEngine` IS imported by live code:** `routes.ts:10` (static) + `:14704` (dynamic), `command-router.ts:3`, `intent-executor.ts:243/:482`, `config-change-handler.ts:53`, `pre-execution-validator.ts:3`. **⇒ Not a delete-on-sight.**

**OPEN — do not assume either way:** whether `TradingEngine` is a legacy engine superseded by `active-execution-engine.ts` (probable, given the active path) or still carries live responsibility. **Import-reachability is not execution-reachability** — that is the `criteria-limiter` lesson in reverse, and I will not repeat the `executeRefreshCycle` error by guessing in the other direction. **This must be resolved before A1 touches it.** *(Note `:428`/`:469` also propagate `signal.finalScore` outward — a state-write to census.)*

### 10.04.4 Benign — telemetry/diagnostic carriers only

`trace_service.ts` (`:25/:170/:192` — nullable raw carriers; `:192` falls back `finalScore ?? regimeWeight`), `skipped-signals-logger.ts` (`:20` a `'FinalScore_Low'` reason label + `:43` an optional field), `telemetry-repository.ts` (record shape + formatting), `active-funnel-tracker.ts:44` (a `'FinalScore'` funnel-stage string label). **No decisions. Cosmetic/record-shape edits at removal time**, plus the reason-label and stage-label strings, which are display strings and need a disposition (retire the label, or keep the historical rows' label meaningful).

---

## 10.05 ★★★ SECTION-10 ITEM 6 CLOSED — THE PROVENANCE READ (Kyle's explicitly-mandated source)

**§9.5(b) requires reading the ORIGIN INTENT, not just current state.** Kyle named `bridge/canonical/` directly. **The corpus DOES cover finalScore** — 7 of its 14 files mention it — so unlike the RTB-refresh case (where the canonical corpus documented only one of two mechanisms), there is no coverage gap here.

### What finalScore was BUILT to be

`DawnTrader_Mathematical_Architecture_v1.5.0.md` is unambiguous, and it is the strongest possible statement of intent:

- **`:238`** — *"[The SQE] uses **FinalScore** and **RegimeWeight** exclusively."*
- **`:244-247`** — the admission pair: `FinalScore ≥ 0.35 AND RegimeWeight ≥ 0.40`
- **`:252`** — the formula, under **Directive 11.0E**
- **`:256-262`** — the coefficients are labelled **"(Immutable)"**
- **`:322/:327`** — *"The Ready-to-Buy Queue holds all validated signals, **ranked purely by FinalScore**"* → `RTB.sort((a,b) => b.finalScore - a.finalScore)`
- **`:476-478`** — the component table: SQE *"Validate signals"* ← FinalScore, RegimeWeight; RTB Queue *"Rank signals"* ← FinalScore
- **`:489`** — the closing summary, at *"full maturity"*: **"Unified metric model: FinalScore + RegimeWeight as sole operational metrics"**

**⇒ ORIGIN INTENT: finalScore was a deliberate CONSOLIDATION — one unified quality number to do two jobs, (1) SQE admission and (2) RTB ranking — and it was presented as the framework's maturity milestone, with immutable coefficients.** This is emphatically *not* accidental legacy. Removing it is removing something the system was once architected around, and it deserves the weight of that.

### ★ THE SYNTHESIS — and it is what makes the removal SAFE rather than merely DECIDED

The question §9.5 actually demands is: **is anything finalScore was designed to do left UNOWNED once it is gone?** Answer, per job:

| finalScore's original job | Owner today | Status |
|---|---|---|
| **(1) SQE admission on quality** | the **EV / Net-Expectancy gates** | **OWNED** |
| **(2) RTB ranking** | **`r_multiple`** (`R = netEV ÷ risk_price`), P19-B7.1 | **OWNED** |

**Nothing is orphaned by the removal.** Both jobs have named, live successors.

**★ And the decisive detail is INSIDE the same canonical document.** Its closing summary lists, as a **separate pillar** alongside the unified metric model:

> *"**Profitability validation:** Net expectancy gate preventing unprofitable trades"* (`:490`)

**⇒ The net-expectancy gate was NOT a later replacement for finalScore — it co-existed with it from the original design.** That is what vindicates B8.5a's retirement rationale (*"intent REDUNDANT — composites feed EV gates, never replace them"*) **on the original architecture's own terms, not on today's preferences.** The composite was never meant to substitute for profitability validation; the framework always had both. So removing finalScore does not dismantle the designed framework — it removes a layer the framework's own other pillar had already subsumed.

**★ A second faithfulness check: RegimeWeight was finalScore's CO-EQUAL in the original pairing (`:238`, `:489`) — and it SURVIVES this batch, live at the 0.30 floor.** So "removing the old scoring system" is not tearing out half of a designed pair and leaving a stump: the pair's *other* member remains exactly where the architecture put it. This is precisely why Finding 2 (the mixed `score-calculator.ts`) is the highest-risk cut in the batch — the two were born together and still live in one file.

### The honest counter-weight, stated rather than buried

The corpus calls these coefficients **"Immutable"** and the metric model the system's **"full maturity."** Read cold, that is a strong argument *against* this batch, and it is exactly the trap Kyle warned about after the refresh-cadence episode — judging old architecture on how it looks today instead of finding out why it was built. **Here the provenance read cuts the other way and I want that on the record as a finding, not an assumption:** reading the intent *supports* the removal, because the same document that calls finalScore immutable also names the net-expectancy gate as an independent pillar. The measured `r=−0.140` (anti-predictive) and the P19-B7.1 structural argument (friction-blind and reward:risk-blind **by construction**) then say the consolidation did not deliver what it promised. **An "immutable" label is a statement of design intent, not of empirical result.**

**Recording rule satisfied (§9.5):** the canonical corpus is a **frozen historical record and is NOT edited** by this batch; the CURRENT docs (SIM / System Manual) carry the change.

---

## 10.1 ★ LANGSTON STEP-2 RULING — **APPROVED TO CONTINUE** (read at `8a237a0f4`, 2026-07-23)

> *"the audit is not yet complete and must not be reported as such, but nothing in it is blocked, and the plan may proceed to close Section 10."*

He independently re-read at the ref (not on reported fact): fix#1, F1 sites 1-2, F2 mixed file + collision, F3 the ROI-gate chain, F5, F7 provenance, and the bucket-C ranker surface. His two additions are folded in above (§5 correction, §8.1 phase coupling).

| Q | Ruling |
|---|---|
| **Q1 — ranker** | **COLLAPSE, don't keep the one-arm plug-point.** Kyle's decision is not merely "remove the arms" but "the whole ranking/scoring approach gets redesigned separately" — so a plug-point kept now is **fitted to the retired abstraction** (a scalar rank-key per signal), the very assumption the redesign is free to discard. §15 settles it: a single-member enum, a `getActiveRanker` that can only return one value, and a decorative `active_ranker` row are lingering by definition. **CONDITION: do the §10 item-4 client-surface trace FIRST** — collapsing drops `arm` from `getDisplayRankKey`'s `{value, arm}` UI contract; don't collapse blind into an untraced response shape. |
| **Q2 — shadow log** | **CONFIRMED, early end intended.** Basis holds (structural replacement + `r=−0.140`); the evidence would only matter if reinstatement were live, and it isn't. **REQUIREMENT: the completion report must CITE AND CLOSE the B8.5a governed plan explicitly** (§9.5(b-ii)) — field-kill ruling arrived early by Kyle's decision on the structural argument — **not a silent block deletion.** **§13 homes:** the confidence inversion (Finding 3, survives this batch) AND the now-unmeasured gate-accuracy number both home to the **Phase-25 scoring redesign**, stated in the report. |
| **Q3 — `SignalMetrics`** | **KEEP AS-IS this batch; do not narrow.** Narrowing touches every construction site feeding the live RegimeWeight gate for zero behavioural gain — diff surface in the one place a removal batch most wants untouched — and an unused optional field carries no §15 re-entry risk (a type field cannot be accidentally called). **BUT the #568 census must check the flip side:** any construction site populating `hybridScore`/`decayPenalty` **solely** to feed the removed `calculateFinalScore` is genuinely dead (writer-with-no-reader) and goes. Narrowing is a named §13 tidy follow-up if wanted — not smuggled into the removal diff. |
| **Q4 — xStock** | **OWN SLICE (A2), sequenced AFTER the core/crypto slice (A1).** Distinct reachability graph, distinct #568 census, distinct review + SIM/System-Manual surface. Prove the core removal green and behaviourally clean, then apply the validated pattern to the xStock cluster as a unit. Same batch #558, two slices, each its own diff and Step-4. |
| **Q5 — `getQueuedSignals` ordering** | *Asked in the second-pass dispatch; pending.* |
| **Q6 — VTS hybrid-confluence input** | *Raised by §9.5.35; pending.* |

**GATE ON PHASE A (his, explicit):** *no cut lands* until Section 10 is closed — **specifically item 3, the VTS stores-not-ranks re-derivation at code** — and the **#568 state-write census** is run. Bring him the closed Section 10 + census and he clears Phase A to implementation.

---

## 10.2 ★★★ THE SETTLED PHASE PLAN (Langston, 2026-07-23 — Q5/Q6/§8.1 ruled)

**Four slices, in this order. The ordering is a correctness constraint, not a preference.**

| Slice | Content | Why here |
|---|---|---|
| **A0 — VTS convergence** *(NEW — prerequisite gate)* | At `vts-runner.ts:4947`, use **`confidence` in place of `finalScore`**, mirroring the active path's proven shape at `signal-orchestrator.ts:1798` exactly; resolve the `:4929` `strength` input. | **The removal cannot safely land while `:4947`/`:4929` still read these scores.** Folding it into A1 would make one migration do a mechanical column removal AND a semantic VTS-learning behaviour change — muddying both blast radius and diff. Lands and bakes first. |
| **A1 — core/crypto logic** | Make `final_score` **NULLABLE** **+** remove the writers at `:1151`/`:2234`, in the same migration. Plus: `calculateFinalScore` + the two callers, the inline site 2, the shadow-gate block, the ranker collapse, the orphan cluster. | Resolves §8.1: once nullable, writers omitting the value insert NULL — **no NOT-NULL break** — and nothing ships a removal that still writes what it removes. |
| **A2 — xStock** | `eval-cycle.ts:656` + `vts-real-score.ts:43/:209` cluster. | Distinct reachability graph, census, and review surface. Apply the pattern validated by A1. |
| **B — schema** | **DROP** the `final_score` column (+ the remaining bucket-B contracts). | Drops a column **nobody writes** — internally consistent by construction. |

**Q5 ruled — order `getQueuedSignals` by the LIVE RANK KEY; do not drop the ordering.** Inert on the live path is agreed, but `routes.ts:9324` + c13/c14 are real display consumers, and dropping the ordering hands them **nondeterministic order — a data-quality regression dressed as a cleanup.** Converge display onto `computeRankKey` so pipeline rank and display rank are one truth. If the key is not cheaply SQL-expressible, order by its dominant term and let the consumer re-sort — but **display must reflect live rank, never vanished finalScore.**

**Q6 open sub-question, named so it is not silently dropped:** whether `hybridScore → strength` at `:4929` carried **learning signal that `confidence` does not**. Langston will not wave that through on reported fact. It is a **measured VTS-data-quality question and its own decision** — not a blocker on convergence, but it must be named in the A0 slice. *(Analyst Claude independently flagged the same site from their #568 lane, adding that `?? 0.5` makes it an **absent-as-valid** site: a missing hybridScore becomes a plausible 0.5 and then feeds the derived `hybridConfidence`. So the dependency is not merely "reader survives its writer" but "**and the absence is unobservable**" — which strengthens convergence over deletion.)*

**Orphans — §15 disposition:** `criteria-limiter` (module), `applyGovernance`, `computePerformanceScore` fold into the **#568 census unit** as delete-candidates with full caller-tracing + `tsc` blast-radius proof, **or a dated home. No lingering stubs.**

### ★★ AND THE CONSEQUENCE OF THE `criteria-limiter` ORPHAN — IT CHANGES WHAT "HOW RANKING WORKS" MEANS

Langston's sharpest closing point. `criteria-limiter.ts:18` declares *"Directive 11.0B: Ranking is exclusively by FinalScore"* and promotes from a finalScore-ordered `limit`. **That module is dead.** ⇒ **the scope's central premise was quoting dead code as live architecture.** Anyone reading the repo for "how does ranking work" can land on an authoritative-sounding directive comment in a module that has not executed in months. This is the §9.5 lesson in its purest form: *a complete narrative is not an exhaustive inventory*, and a confident comment is not evidence of reachability. **Recorded here as a finding in its own right, not just a deletion candidate.**

---

## 11. QUESTIONS FOR LANGSTON (Step-2)

- **Q1 — one-arm plug-point or full collapse?** (§6)
- **Q2 — confirm the early end of the P19-B8.5a shadow-evidence plan is intended.** (§7)
- **Q3 — `SignalMetrics` (`score-calculator.ts:28`)**: shared by the two surviving functions. Keep as-is (carrying now-unused `hybridScore`/`decayPenalty` fields), or narrow it to the RegimeWeight inputs? Narrowing is cleaner but widens the diff into live-gate code.
- **Q4 — Phase-A boundary**: does the xStock `computeFinalScore` site (`eval-cycle.ts:656`) and its `computeRealHybridScore`/`computeRealDecayPenalty` cluster (`vts-real-score.ts:43/:209`) land in Phase A with the rest, or as its own slice? It is the same removal but a different asset-class path and a separate review surface.
