# `B-GEOMETRY-REACH-BASELINE` — HANDOVER PACKAGE FOR CC-C

**Written by CC-B, 2026-09-13, at CC-C's request (relayed as Kyle-directed: *"maybe we make those changes"*).**
⛔ **NOTHING IS TRANSFERRED BY THIS FILE. It answers five questions and corrects the premise of two of them.**
Everything below re-derived at `origin/migration/aws-supabase` in the turn it was written.

---

## ⛔⛔ 0. THE PREMISE CORRECTION, FIRST, BECAUSE TWO OF THE FIVE QUESTIONS ASSUME AN OPEN BATCH

**THE BATCH IS CLOSED. It is not at a step of eleven, and there is no pending diff.**

| evidence | says |
|---|---|
| `Batch Completion/B_GEOMETRY_REACH_BASELINE_COMPLETION_REPORT.md` | **`✅ CLOSED 2026-09-13`** · deployed `022fd27ada7fc149ec910adeb5d9ea92a971a29f` · CI run `34740307488` 4/4 · **Step-4 APPROVED `5ab4748c6`, Step-8 CONFIRMED `022fd27ad`** |
| observation window | **opens 2026-09-13T05:33:17.640Z** (pm2 `pm_uptime`) |

### ⛔ AND THE `PHASE_19_PLAN` ROW CONTRADICTS IT — THAT IS A REAL DEFECT, NOT A HANDOVER DETAIL
`PHASE_19_PLAN.md:538`, row `2.4g-2`, status cell still reads
**`✅ STEP 4 of 11 — code review, revised diff with Langston`** and **`NEXT: 3 of 11`**.

⛔⛔ **SO THE PLAN SAYS STEP 4, THE PLAN ALSO SAYS NEXT IS STEP 3, AND THE COMPLETION REPORT SAYS CLOSED. THREE STATES, ONE BATCH.**
★ **This is exactly what would mislead a session taking the batch over — and CC-C's question 1 is evidence it already did.** A reader arriving at the plan would start work on a closed batch.
✅ **CORRECTED IN THE SAME COMMIT AS THIS FILE. Recorded here rather than fixed silently, because the plan is the authority and a silent fix would hide that it had been wrong.**

⚠️ **Byte note (`#1043`): CC-C quoted the scope at 38,471 B; at the ref it is 38,236 B.** The 235 B gap is consistent with a CRLF working-tree read. **Same r15, same content — but neither of us should quote a worktree size at the other.**

---

## 1. WHICH STEP OF 11, AND WHAT WAS NEXT
**None — the batch is closed (§0).** What remains is **not** this batch:
- **`2.4g-3` `B-EXCURSION-RECORD`** — **PLACED, NOT STARTED.** Carries forward the five non-shipping tightening rows and `vwap_pullback`.
- **`2.4g-4` `B-TRADE-RECORD-JOINABILITY`** — **PLACED, NOT STARTED.**

⛔ **AND THE "CLOSE TO MAKING CHANGES" READING IS A CONFLATION, STATED PLAINLY SO IT DOES NOT PROPAGATE.** My recent messages to Kyle about pending changes were about **`PRICE_FEED_MAP.md` / `B-PRICE-DOC-CONSOLIDATE`**, a different piece of work in the same session. **No change was pending on this batch.**

## 2. WORKING DATA NOT IN THE REPO
⛔ **THE HONEST ANSWER IS THAT THE LOAD-BEARING RESULTS ARE ALL COMMITTED, AND WHAT IS NOT COMMITTED IS NOT WORTH INHERITING.**
- **Committed and authoritative:** the completion report · `B_GEOMETRY_REACH_BASELINE_SCOPE.md` (r15) · `B_GEOMETRY_REACH_BASELINE_PRE_AUDIT.md` · `B_GEOMETRY_REACH_BASELINE_OBJ1_AUDIT.md` · `Langston Design Asks/RR_AND_REACHABILITY_BASELINE_STUDY_r1.md` · `Scope Files/TARGET_GEOMETRY_STUDY_PLAN.md`.
- **NOT committed:** the ad-hoc staging SQL behind individual figures. **They were single-shot `psql -f` scripts against the live DB, and every number they produced that survived review is quoted with its population in the documents above.** ⇒ **re-run from the documents' stated populations rather than inheriting a script.**
- ✅ **COLTRANE IS IN THIS BATCH'S LINEAGE — CORRECTED BEFORE SENDING, AND THE FIRST DRAFT OF THIS FILE HAD IT WRONG.** I wrote *“Coltrane is in CC-C's and CC-INFRA's lanes, not mine”* from a repo-wide grep, and **my own ledger entry says otherwise: `RUNNING_ISSUES` `#1052` opens *“(CC-B, Kyle-directed; problem and plan from Coltrane, arithmetic re-derived by CC-B)”*.** ⚠️ **An asserted absence with no presence-evidence, about my own batch, in a handover — the same class of error this session has made repeatedly today, and I caught it only because annotating `#1052` put the line in front of me.**
  ⇒ **WHAT THAT MEANS FOR YOUR QUESTION: the PROBLEM STATEMENT AND THE PLAN came from Coltrane; the ARITHMETIC IS MINE AND WAS RE-DERIVED.** ⛔ **I did not retain separate raw Coltrane outputs — what survived review is quoted, with populations, in `#1052` and the scope.** ✅ **So the artefact to inherit is the re-derivation, not a raw dump; and if you want Coltrane's original framing, it is in the `#1052` entry, not with me.**

⛔⛔ **STANDING CONSTRAINT ON ANY RE-RUN, AND IT IS MINE TO HAND OVER (`#1062`): NO UNBOUNDED SCANS ON THE LIVE DB.** Serially, timeouts in MINUTES, full-history work to exported data. **My analytical queries exhausted the live connection pool and dropped 202 ticker + 28 archive rows.** A read-only query is not harmless — it eats the pool slot writes need.

## 3. THE EXACT CHANGE I WAS ABOUT TO MAKE
**None on this batch.** What SHIPPED (parts 1, 2, 4) is in the deployed diff at `022fd27ad`: the resolver fix, the fail-closed `reach_atr_max_unknown_floor`, and the docstring.
⛔⛔ **WHAT DELIBERATELY DID NOT SHIP IS THE MORE IMPORTANT HALF: OBJ-A PART 3 SEEDED *ZERO* ROWS.** All four derived ceilings were **REFUSED on a measured blast radius** (Langston CONDITION-1, refusal APPROVED) — `inside_bar_reversal` 2.36 would have newly refused **95.32 %** of its signals · `sma_trend_ride` 1.97 **57.49 %** · `pivot_shift` 2.72 **55.43 %** · `morning_star` 0.64 % sitting 0.02 ATR above a spike holding 84.62 %.
★ **TWO SEPARATE REASONS, recorded separately: a redundant re-encoding of `target_exit_atr_multiplier` against a SPIKE for three of them, and a live throttle on a genuinely CONTINUOUS distribution for `sma_trend_ride`.**

⛔⛔ **AND THE RATCHET IS THE THING TO INHERIT (`2.4g-3`, Langston CONDITION-2): THOSE FOUR CEILINGS AND ANY SUCCESSOR MAY NOT BE RE-DERIVED FROM POST-DEPLOY HOLDS UNTIL REALISED-EXCURSION DATA EXISTS.**
★ **Why a ratchet and not a caveat: `H` is ENDOGENOUS to the gate** — a tighter ceiling blocks far targets, those trades exit sooner, `H` shortens, and the next derivation reads a corpus the last one narrowed. ⛔ **The gate applies to the VTS lane too (`vts-runner.ts:1719`), so there is no untouched population to appeal to.**
✅ **The ratchet is NOT yet engaged, because zero ceilings shipped.**

## 4. WHAT IS STILL UNMEASURED, AND WHAT WOULD SETTLE IT
**TIME-TO-TARGET.** `2.4g-2` established that **this corpus cannot yield it** — that is the batch's principal negative result, and it is why `B-EXCURSION-RECORD` exists.
⛔ **THE EXCURSION RECORD DOES NOT EXIST AND MUST BE *DESIGNED*, NOT WIRED.** `mfe`/`mae` are four lines of schema on two EMPTY tables (`trades`, `paper_trades` — the latter retired at `#573`), **ZERO code references tree-wide**, and the corpus tables have no `pgTable` at all.
⛔⛔ **SAMPLING IS A REAL DESIGN CALL, NOT AN IMPLEMENTATION DETAIL: `latestEquityTick` is last-write-wins on its own poll cycle (`RUNNING_ISSUES:1495`), so a sub-4s excursion is INVISIBLE and an MFE taken off it is THE MFE OF THE SAMPLER.**
⛔ **POPULATION BOUNDARY (`2.4g-3`, Langston rider on `#1063`): DO NOT POOL PRE- AND POST-ENUM EXCURSIONS.** The `B-PATTERN-ENUM-DRIFT` deploy admits pattern-confirmed `volatility_edge` signals the `ABCD` enum gap rejects today.

## 5. UNRESOLVED DISAGREEMENTS WITH LANGSTON OR COLTRANE
✅ **NONE OUTSTANDING ON THIS BATCH.** Step-4 APPROVED `5ab4748c6`; Step-8 CONFIRMED `022fd27ad`; the CONDITION-1 refusal was Langston's own and I adopted it; CONDITION-2's ratchet is written into `2.4g-3`.
⚠️ **The one thing I would flag as a live TENSION rather than a disagreement:** the zero-drift barrier benchmark gives **37.6 %** against an observed **41.4 % on n=29** — **~4 pp over a coin flip, not distinguishable from noise.** ⛔ **Neither I nor Langston has claimed that settles anything in either direction, and it should not be inherited as if it did.**

---

## ⭐ THE `#1052` COLLISION — I TAKE THE ANNOTATION ON MINE
CC-C is right: **two different issues carry `#1052`** — mine (reachability ceiling, `RUNNING_ISSUES:9493`) and theirs (`addFamilyPoolSurvivors` has zero callers, `:7886`). Per the ledger's own precedent **neither is renumbered**.
✅ **I annotate MINE; CC-C annotates theirs.** ⛔ **Until both carry the annotation, a bare `#1052` citation is ambiguous and every document in this batch's chain cites it.**

---

# ⭐⭐ KYLE'S THREE ADDITIONS — AND HE WAS RIGHT THAT IT IS NOT ALL IN THE REPORT

> *“we were also looking at the floor as well as the ceiling. And how we're pricing our targets. I think he had narrowed his focus to Stronghold trend and VWAP pullback.”*

✅ **ALL THREE ARE CORRECT, AND NONE OF IT IS IN r15 — because it came AFTER the batch closed, in the same session, under a different thread.** ⛔ **AND THE LEDGER ENTRIES FOR IT DID NOT EXIST UNTIL THIS COMMIT — see §9.**

## 6. THE FLOOR — `#1061`, AND IT IS THE BIGGER HALF OF THE CEILING STORY
**`min_rr` is a FLOOR on `reward / RISK`. `reach_atr_max` is a CEILING on `reward / ATR`. DIFFERENT UNITS.** ⇒ both can hold only if **`risk/ATR ≤ reachAtrMax / minRR`** — **a property of the STOP that neither constant mentions.**
**`strong_bull_trend`:** target `6.0`, stop ~3 ATR, `min_rr 1.95` ⇒ floor demands **≥ 5.85 ATR**, ceiling refuses **> 4.0 ATR** ⇒ ⛔⛔ **WINDOW EMPTY — `0 of 298,731` evaluations passed.**
⭐⭐ **AND THE COROLLARY IS THE THING TO CARRY: A HIGHER QUALITY DEMAND MAKES A STRATEGY *MORE* LIKELY TO BE REFUSED.** `strong_bull_trend` 1.95 ⇒ 2.05 ATR widest stop; `vwap_pullback` 2.44 ⇒ **1.64 ATR**.
✅ **THAT IS WHY KYLE'S FOCUS NARROWED TO THOSE TWO: they are the ONLY two strategies with ZERO live admissions, and this is why.**
**Authoritative:** `Langston Design Asks/TARGET_GATE_UNIT_MISMATCH_FINDING_r1.md` (artifact `9ec641072`), Langston re-derived.

## 7. HOW WE PRICE TARGETS — THE MEASUREMENT THAT NEVER ENTERED r15
**Retrospective excursion for crypto from RAW 1-MINUTE BARS — ⭐ no provenance and no archive needed, which was Kyle's own point when he asked why we could not just replay raw data.** **n = 1,288 crypto trades, maker-only, trailing OFF** *(trailing has been off since 2026-07-23 — do not re-introduce it)*:

| target | net per trade |
|---|---|
| 2R (current) | **−0.059** |
| 4R | **+0.052** |
| 6R | **+0.108** |

⛔⛔ **TAKER NEVER WORKS AT ANY TARGET.** ✅ **So the profitable configuration is one the gate currently REFUSES — that is the whole link between §6 and §7.**
⚠️ **LIMITATIONS, STATED BECAUSE THEY ARE WHY THIS IS NOT A DECISION:** the **48 h horizon was CHOSEN, NOT TUNED**; and **a 1-minute bar containing BOTH the target and the stop was scored a WIN — that optimism is UNQUANTIFIED.** ⛔ **Both must be closed before any target moves.**
➕ **AND A DEAD CONSTANT FOUND ON THE WAY: `target_floor_pct = 0.040` IS DEAD CODE.**

## 8. ⭐ WHAT I MEASURED THAT DID NOT MAKE r15 — INCLUDING THE THINGS THAT CAME OUT FLAT
*(CC-C asked for this explicitly: “a negative result you discarded is exactly the thing I would otherwise re-derive from scratch”. Agreed — here they are WITH their limitations.)*
- ⛔ **TRAILING STOPS — A DEAD END I SPENT REAL TIME ON. DO NOT REPEAT IT.** I read `exit_strategy_alternates` as history; **it is a SIMULATION table.** Both trailing flags have been FALSE since **2026-07-23**. **Trailing is not a variable in this problem.**
- ⛔ **A CENSORED TARGET CURVE — MY OWN APPARATUS.** I measured MFE up to `closed_at`, but **the trade closes AT its target**, so the curve cliffed at 2.5R by construction. **Re-run past the exit; the numbers in §7 already are.**
- ⛔ **`admitted` IS NOT AN OPPORTUNITY AND NOT A TRADE** (`signal-eval-archiver.ts:12-19`) — it is a per-strategy × per-pair **EVALUATION written EVERY SCAN CYCLE**. **Every `admitted` count in `#1051` and `#1061` is mislabelled; the distinct-pair count is UNMEASURED.** ⭐ **Kyle caught this: *“there's no way in paper mode that we had a thousand plus RTB pool signals.”*** ✅ **And his DEFINITIONAL RULING stands and is NOT yet implemented: *a signal should not be stamped `admitted` unless it gets into the RTB pool.*** ⚠️ **Today `admitted` is stamped at `signal-orchestrator.ts:1858`, BEFORE the target gate at `:1905` that can still return null.**
- ✅ **THE MAKER MACHINERY ALREADY SHIPS — nothing to build.** `core/trading/pending-maker-logic.ts`, `active-execution-engine.ts:1151-1220` (entry, call site `:1797`), `:1933-2004` (maker target-exit rest, `P19-B8.6`). **60-day crypto: 360 maker vs 104 taker (77.6 %), 82 `never_filled`; exit rests 171 fill / 13 convert.**
- ⚠️ **`market_regime` IS NOT LATENT** — I claimed it was from a ROW COUNT; a writer exists (`telemetry-repository.ts`). **A row count says nothing about a writer.**

## 9. ⛔⛔ AND THE THING THIS EXERCISE ITSELF SURFACED: `#1061` AND `#1062` HAD NO LEDGER ENTRIES
Both numbers were **minted, cited to Kyle, and cited in `PRICE_FEED_MAP.md` / `MISTAKE_PATTERNS.md` / the design ask — and NEVER WRITTEN INTO `RUNNING_ISSUES`.** A grep for `#1061` returned **one cross-reference and no entry**; `#1062` the same. ⭐ **§9.4 in its own words: *naming is not placing.*** ✅ **BOTH FILED IN THE SAME COMMIT AS THIS FILE.** ⚠️ **Until now, anything I handed you citing those numbers pointed at nothing.**
