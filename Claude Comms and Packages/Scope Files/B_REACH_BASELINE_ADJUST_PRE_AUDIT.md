# B-REACH-BASELINE-ADJUST — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (Step 2 of 11) · **r1**

**change-class: architecture** · `PHASE_19_PLAN` row **`3n.v`** · owner **CC-B** · **STEP: 2 of 11 · NEXT STEP: 3 of 11**
**Scope approved:** Langston, 2026-09-20 11:46Z — *"PROCEED to Step 2"*, six conditions (C-1…C-6), all discharged in §0.
**Scope at the ref:** `c156ac72f` · `Scope Files/B_REACH_BASELINE_ADJUST_SCOPE.md`

---

## ⛔⛔ THE HEADLINE, WRITTEN FIRST BECAUSE IT OVERTURNS THE SCOPE'S OWN PLAN
**The scope proposed raising the reachability ceiling on five cells. THE AUDIT SAYS FOUR OF THEM SHOULD NOT MOVE, and it says so on realised outcomes rather than on gate counts.** A counterfactual cohort exists that nobody had joined: the VTS lane TAGS a refused signal and simulates it to close, and those closes are recorded with their realised P&L. **Read against the right control — what the gates ADMIT today — the refused cohorts split cleanly into "the gate is costing us money" and "the gate is doing its job", and most of OBJ-3's cells are the second.**
✅ **This is Step 2 working as designed: the audit arrived before a plan was built on it.**

## §0. PREVIOUSLY STATED / NOW — every number that moved since the scope
| # | PREVIOUSLY STATED (scope r4) | NOW | REASON |
|---|---|---|---|
| 1 | OBJ-3 raises the ceiling on **5 cells** | **1 cell, and it is not one of the five** (crypto `strong_bull_trend`, which is OBJ-1's) | **A-4:** the refused cohorts on xStock `vwap_pullback` and xStock `sma_trend_ride` realise **worse** outcomes than the cohort the gates admit. `vwap_bounce` / `range_trade` xStock have **no cohort rows at all** (n < 10). |
| 2 | OBJ-2 re-seeds **3** `min_rr` floors | **1** (crypto `vwap_pullback`), **+1 correctness seed** (crypto `vwap_bounce`, C-2) **+1 new** (xStock `strong_bull_trend`, OBJ-1) | **A-3:** crypto `reverse_impulse`'s refused cohort is **−4.06 %, 0 % win (n=14)** — correctly refused. xStock `morning_star` has **no cohort rows** (n < 10). |
| 3 | xStock `strong_bull_trend` knife edge **≈17.5 %** | **≈11.9–15.1 %** | **C-1:** the pre-seed identification holds on **three** cells, not one; the two siblings bracket the calendar fraction and crypto is the outlier I had generalised from. |
| 4 | F-4's asymmetry **"23×"** | **≈15×** | Same correction. |
| 5 | *"that 47.71 % is ULP noise"* | **a HYPOTHESIS; what carries 6.5 is the moment bound** `Σ(x−6)² < ~1e-7` on xStock | **C-4:** `attSumSq` accumulates 131 terms of ~36, so its own rounding floor is the same order as the residual. **"EXACTLY ZERO" struck.** |
| 6 | OBJ-1 ships a ceiling and a floor | **same, plus a NAMED ROLLBACK TRIGGER and a stated post-admission volume** | **C-3:** the document was meticulous upstream of the gate and silent downstream of it. |

## §1 AUDIT

### A-1 — THE INSTRUMENT NOBODY HAD JOINED, AND ITS COVERAGE
**OBJECT:** `vts_open_trades` (the tagged signal, carrying `context.vtsGateVerdict`, and its own entry/stop/target) **JOINED BY `trade_id` TO `exit_decision_archive`** (the realised close: `pnl_pct`, `r_multiple`, `exit_reason`, `duration_min`).
**POPULATION:** **8,669** closed VTS rows carrying a verdict; **4,776 (55.1 %)** have a joined outcome. **Coverage is bounded by the archive's own retention window — 2026-08-01 → 2026-09-20, 5,175 rows total** — not by the join.
⛔ **THE JOIN THAT DOES NOT WORK, MEASURED WITH A POSITIVE CONTROL, BECAUSE THE SCOPE PROPOSED IT:** `exit_strategy_alternates` matches **0 of 8,669**, and **0 of ALL `vts_open_trades` rows** — the id spaces are disjoint (`vts_SYM_USD_ts` there against `vts_SYM_USD_STRATEGY_ts` here). **That is `2.4g-4` (i) reproduced on this batch's own cohort.** The archive is a different table and it joins.
✅ **EPOCH (C-6 / Langston condition iii): every one of the 8,669 rows carries `calibration_state = pre_calibration_xstock_2026_05`. ONE epoch — no split is needed, and this is recorded so the absence of a split is not read as an omission.**

### A-2 ⛔⛔ — THE CONTROL, AND IT CHANGES EVERY READING BELOW
**What the two gates ADMIT today, realised:** crypto **−1.606 % avg, 26.6 % win (n = 398)** · xStock **−0.700 % avg, 31.1 % win (n = 630)**.
★ **SO "THE REFUSED COHORT LOST MONEY" IS NOT A JUSTIFICATION FOR A GATE.** The admitted cohort also loses money. **Every judgement in A-3 and A-4 is made against this control, never against zero.**
⚠️ **BIAS, KNOWN SIGN, NOT DISCLOSED AS A CAVEAT (Langston condition ii):** crypto VTS books the observed MARK at exit, which is favourable by roughly half a spread. **It applies to the cohort and the control identically, so the RELATIVE comparison is robust and the ABSOLUTE levels are optimistic.** No absolute level is load-bearing below.

### A-3 — THE `min_rr` REFUSALS, AGAINST THE CONTROL
| class · strategy | floor | refused cohort | vs control | verdict |
|---|---|---|---|---|
| crypto `vwap_pullback` | 2.44 | **RR 2.00: +4.85 %, 63.6 % win (n=66)** · RR 0.80: −3.63 %, 10 % win (n=10) | control −1.61 % / 26.6 % | ⛔ **THE FLOOR IS COSTING MONEY.** Two-point distribution ⇒ **any floor in (0.80, 2.00] admits the good cohort and keeps refusing the bad one.** |
| xStock `strong_bull_trend` | 2.00 (class default) | **+8.84 %, 100 % win (n=22)** | control −0.70 % / 31.1 % | ⛔ **THE STRONGEST SINGLE RESULT IN THE AUDIT** — and it is refused by an undefined comparison (F-1). |
| crypto `reverse_impulse` | 2.40 | **−4.06 %, 0 % win (n=14)** | control −1.61 % / 26.6 % | ✅ **CORRECTLY REFUSED — the scope proposed lowering this and the evidence says do not.** |
| crypto `morning_star` | 1.39 | −1.98 %, 50.0 % win (n=24) | control −1.61 % / 26.6 % | ⚠️ **Ambiguous** — worse on P&L, better on win rate. **No change; it is a 25-20 question.** |
| xStock `pivot_shift` | 2.16 | −0.53 %, 30.4 % win (n=69) | control −0.70 % / 31.1 % | ✅ **Indistinguishable from the control. No case either way; no change.** |
| xStock `morning_star` | 1.00 | **no cohort rows (n < 10)** | — | ⛔ **NO EVIDENCE ⇒ NO CHANGE.** The scope proposed one. |

### A-4 ⛔⛔ — THE REACHABILITY REFUSALS, AND THIS IS WHERE THE SCOPE WAS WRONG
| class · strategy | band | refused cohort | vs control | verdict |
|---|---|---|---|---|
| xStock `strong_bull_trend` | att 5–6 / 6–7 | **+8.86 % (n=36) / +8.09 % (n=31), 100 % win both** | −0.70 % / 31.1 % | ⛔ **ADMIT. Two independent cohorts, same answer as A-3.** |
| crypto `strong_bull_trend` | att 5–6 / 6–7 | **−1.10 % (n=885) / −0.89 % (n=883), ~41 % win** | −1.61 % / 26.6 % | ⚠️ **BETTER than the control on BOTH axes, and still NEGATIVE.** See P-1's honest statement and its rollback trigger. |
| xStock `vwap_pullback` | 4–5 · 5–6 · 6–7 · 7+ | −1.42 / −1.59 / −1.64 / −1.27 %, **23–31 % win (n=860)** | −0.70 % / 31.1 % | ✅ **WORSE than what the gates admit, at every band. THE CEILING IS DOING ITS JOB — WITHDRAWN from the plan.** |
| xStock `sma_trend_ride` | 4–5 · 5–6 · 6–7 · 7+ | −1.38 / −1.31 / −2.13 / −1.78 %, **25–38 % win (n=547)** | −0.70 % / 31.1 % | ✅ **WORSE at every band, and it gets worse as the target gets further. WITHDRAWN.** |
| crypto `vwap_pullback` | 7+ | −0.02 %, 40.1 % win (n=232) | −1.61 % / 26.6 % | ⚠️ **Better than control — but the band is `att ≈ 12`, far outside any ceiling this batch would set. Recorded, not acted on.** |
| crypto `range_trade` | 4–5 | −2.48 %, **4.3 % win (n=23)** | −1.61 % / 26.6 % | ✅ **Correctly refused.** |
| xStock `vwap_bounce`, xStock `range_trade` | — | **no cohort rows (n < 10)** | — | ⛔ **NO EVIDENCE ⇒ NO CHANGE.** The scope proposed both. |

### A-5 — C-1 DISCHARGED: THE PRE-SEED FRACTION IS IDENTIFIED ON THREE CELLS, NOT ONE
A floor strictly below a constant RR makes a post-seed `rr` refusal impossible, so those drops are all pre-seed. **crypto `strong_bull_trend` 0.707 % (2,580/364,862) · xStock `sma_trend_ride` 3.684 % (4,725/128,253) · xStock `vwap_bounce` 7.154 % (871/12,175).** The latter two bracket the **3.93 %** calendar fraction; **crypto is the outlier, and r4 generalised from it.** ⇒ **xStock `strong_bull_trend` pre-seed ≈ 15–29 of 406, so its live knife-edge rate is ≈ 11.9–15.1 %** and F-4's asymmetry against crypto `vwap_bounce` (0.75 %) is **≈15×**, not 23×.

### A-6 — C-5 DISCHARGED: THE UNKNOWN-TOKEN FLOORS ARE **OUT**, EXPLICITLY
`min_rr_unknown_floor` (2.88 crypto / 2.16 xStock) and `reach_atr_max_unknown_floor` (4.0, all keys) are the **fail-CLOSED substitutions for a drifted token**, not baselines for a known one. They are **derived from the values being re-based**, so leaving them is a real choice: after this batch the unknown-token reach floor (4.0) is **stricter than a seeded known-token ceiling (6.5)**, which is the correct direction — **a drifted token must never be treated more permissively than a known one.** ⛔ **OUT OF SCOPE, deliberately, and the direction is verified rather than assumed.**

### A-7 — C-3 DISCHARGED: WHAT LANDS DOWNSTREAM, AND WHAT WOULD MAKE US STOP
Crypto `strong_bull_trend` evaluates at **≈4,120/day** (367,009 over 89 days) and OBJ-1 takes its reachability refusals to ~0. ⛔ **A guard pass is not a trade:** the second application still gates, the SQE, EV gate, RTB ranking and sizing all still apply, and the RTB pool runs at ~4–5 % ideal occupancy (`#596`/`#597`). **I do not have a defensible forecast of admitted VOLUME and I am not inventing one.** What I state instead is the **trigger**:
> ⛔ **NAMED ROLLBACK TRIGGER (pre-registered, this document, before the deploy): if within 7 days of the deploy `strong_bull_trend` exceeds 25 % of all active-path signal ADMISSIONS on its class, or the active pool's realised 7-day P&L on that class falls below its pre-deploy 7-day figure by more than 2 percentage points, the two `reach_atr_max` rows are reverted to 4.0 by the rollback migration and the batch returns to Step 2.** Both numbers are readable without new instrumentation.

### A-8 — THE DELETION CENSUS FOR `target_floor_pct` (OBJ-6, rule 18 + §9.5(a-ii))
**Readers, enumerated at the ref, tests excluded:** the gate resolver's unconditional first read · its return-shape field · the `b72-warmup` boot assertion list · the `decision-provenance` resolved-set stamp (inside the hashed triple) · the normalizer's dead `floorPct` input field + its docblock · a pinning unit test · the reorg-B2 migration's invariants. **DB: exactly two rows (crypto / xStock, both 0.040, written 2026-06-20).**
⛔ **THE STATE IT WRITES THAT SURVIVES THE CUT: the fail-HARD throw on an unresolved asset class.** It is read FIRST, before canonicalization, so it — not `min_rr` — is what refuses an unknown class. **P-6 replaces it with an explicit assertion in the same commit; the deletion does not ship alone.**
⚠️ **The constants-hash cohort split is NOT attributable to this deletion** — P-1/P-2 change two members of the same hashed triple, so the split happens at this deploy regardless.

## §2 PLAN — every item back-references its finding

| # | item | from |
|---|---|---|
| **P-1** | **Seed `reach_atr_max = 6.5` for `strong_bull_trend`, both classes.** xStock on two independent cohorts at +8.1 to +8.9 %, 100 % win; crypto on 1,768 rows that beat the control on both axes while still negative — **stated as such, and carried by Kyle's own replay evidence plus the A-7 rollback trigger, not by the cohort alone.** | A-4, A-7, scope F-1 |
| **P-2** | **Seed the missing `min_rr` rows at 1.95: xStock `strong_bull_trend` (A-3: +8.84 %, 100 % win, refused by an undefined comparison) and crypto `vwap_bounce` (C-2: floor EQUALS its spike — a live instance of the clause OBJ-4 ships).** | A-3, A-5, C-2 |
| **P-3** | **Re-seed crypto `vwap_pullback` `min_rr` 2.44 → 1.95.** Two-point cohort: admits RR 2.00 (+4.85 %, 63.6 % win) and still refuses RR 0.80 (−3.63 %, 10 % win). | A-3 |
| **P-4** | ⛔ **WITHDRAW the four other OBJ-3 ceilings and the two other OBJ-2 floors.** Each carries its reason in the migration header: evidence against (xStock `vwap_pullback`, xStock `sma_trend_ride`, crypto `reverse_impulse`) or no evidence (xStock `vwap_bounce`, xStock `range_trade`, xStock `morning_star`). | A-3, A-4 |
| **P-5** | **`ADJUSTMENT_FRAMEWORK`: strike the one-way lock per Kyle 2026-09-15; widen the spread rule to ANY geometry threshold; add Langston's third clause verbatim** (*no geometry threshold may be set equal to, or within float-noise of, a value the strategy's geometry produces identically*); **and add the control rule this audit earned** — *a refused cohort's outcome is judged against what the gates ADMIT, never against zero.* Live citations only. | scope OBJ-4, Langston ruling 4, A-2 |
| **P-6** | **Delete `target_floor_pct` WITH its replacement fail-hard assertion**, all readers in one commit, `DELETED_COMPONENTS_LOG` entry carrying A-8's census, and a test proving an unresolved asset class still fails hard. | A-8 |
| **P-7** | **Governance + placements:** `dhma` → Phase-25 25-20 with BOTH gates' numbers · `B-SILENT-STRATEGY-CENSUS` (F-5) and `B-OPEN-OBLIGATION-SWEEP` (F-7) placed after `3n.v` · the `#696` cross-reference filed, decision left with CC-C · `2.4g-3`'s ratchet restated verbatim in the row as inherited by the shipped values · `SYSTEM_IMPACT_MAP`'s stale floor-LIFT line and `2.4g-3`'s refused-signal premise corrected. | scope OBJ-5/7, F-5/F-6/F-7, rulings 1–3 |
| **P-8** | **`B-FEED-MISMATCH-FIX` window (Kyle's `stuck` definition):** give the per-class no-fill-on-hit-stop count **a threshold that means investigate**, and record that **a zero is unreadable without a positive control** — if the cold-book path is never invoked, the counter proves nothing. Written before the window closes, not after. | Kyle 2026-09-20, Langston's closing note |

## §3 WHAT THE PLAN DELIBERATELY DOES NOT DO
- ⛔ **No multiplier moves.** `2.4g-5` is discharged for `strong_bull_trend` only, and the lever chosen there is the ceiling.
- ⛔ **crypto `sma_trend_ride` is untouched** — its decision lives at `#696` with CC-C, whose recorded options are revert-the-row or a volatility-CONDITIONED allowance.
- ⛔ **No unknown-token floor changes** (A-6), and **no ceiling below a class default** (ruling 1, binding forward).
- ⛔ **Nothing derived from the holding horizon.**

## §4 RISK, AND THE ONE I AM LEAST COMFORTABLE WITH
**P-1's crypto leg admits a cohort whose realised average is negative (−1.0 %) — better than the control (−1.6 %), but negative.** The honest summary: **on xStock the evidence is overwhelming; on crypto it is "less bad than what we trade today", and it is Kyle's ruling plus his replay evidence that carries it, not this cohort.** That is why A-7's rollback trigger is pre-registered here rather than described later, and why this paragraph exists instead of an average of the two classes.
