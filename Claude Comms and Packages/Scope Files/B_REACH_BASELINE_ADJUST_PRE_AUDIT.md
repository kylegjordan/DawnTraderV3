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
⛔⛔ ~~**EPOCH: every one of the 8,669 rows carries one `calibration_state`. ONE epoch — no split is needed.**~~ **STRUCK — SEE AD-2. The claim is TRUE and MEANS NOTHING:** that column is a `NOT NULL DEFAULT` and **a repo-wide grep finds no writer that sets it on `vts_open_trades`** — the only writes are to `exit_strategy_alternates`, and every `vts_open_trades` reference is a READ. *(Grep reach stated: `server/**/*.ts`, tests excluded; a raw-SQL write from outside `server/` would not appear.)* **The real stamp moved three times inside the window — 2026-09-11, 09-15 and 09-19 — so every pooled figure here spans at least one boundary.**

### A-2 ⛔⛔ — THE CONTROL, AND IT CHANGES EVERY READING BELOW
**What the two gates ADMIT today, realised:** crypto **−1.606 % avg, 26.6 % win (n = 398)** · xStock **−0.700 % avg, 31.1 % win (n = 630)**.
★ **SO "THE REFUSED COHORT LOST MONEY" IS NOT A JUSTIFICATION FOR A GATE.** The admitted cohort also loses money. **Every judgement in A-3 and A-4 is made against a control, never against zero.**
⛔⛔ **BUT NOT AGAINST *THIS* CONTROL WHERE A BETTER ONE EXISTS — CORRECTED AT STEP 4.** ~~Pooled is the control.~~ **The pooled xStock figure is 63 % ONE STRATEGY (`morning_star`, 398 of 630), and judging cells against it REVERSED one withdrawal its own admitted cohort does not support (A-4, xStock `vwap_pullback`). PER-CELL IS THE DEFAULT; the pooled control is used only where a cell's admitted set is EMPTY, and that is said where it happens.**
⚠️ **BIAS, KNOWN SIGN, NOT DISCLOSED AS A CAVEAT (Langston condition ii):** crypto VTS books the observed MARK at exit, which is favourable by roughly half a spread. **It applies to the cohort and the control identically, so the RELATIVE comparison is robust and the ABSOLUTE levels are optimistic.** No absolute level is load-bearing below.

### A-3 — THE `min_rr` REFUSALS, AGAINST THE CONTROL
| class · strategy | floor | refused cohort | vs control | verdict |
|---|---|---|---|---|
| crypto `vwap_pullback` | 2.44 | **RR 2.00: +4.85 %, 63.6 % win (n=66)** · RR 0.80: −3.63 %, 10 % win (n=10) | control −1.61 % / 26.6 % | ⛔ **THE FLOOR IS COSTING MONEY.** Two-point distribution ⇒ **any floor in (0.80, 2.00] admits the good cohort and keeps refusing the bad one.** |
| xStock `strong_bull_trend` | 2.00 (class default) | ~~+8.84 %, 100 % win (n=22)~~ ⛔ **WITHDRAWN AS AN ARTIFACT — AD-3** | — | ⛔ **STILL SHIPS, ON THE CORRECTNESS ARGUMENT ALONE:** its floor EQUALS its own constant RR, so the comparison is decided by float noise whatever the outcomes are. ~~"the strongest single result in the audit"~~ was mine and it was wrong. |
| crypto `reverse_impulse` | 2.40 | **−4.06 %, 0 % win (n=14)** | control −1.61 % / 26.6 % | ✅ **CORRECTLY REFUSED — the scope proposed lowering this and the evidence says do not.** |
| crypto `morning_star` | 1.39 | −1.98 %, 50.0 % win (n=24) | control −1.61 % / 26.6 % | ⚠️ **Ambiguous** — worse on P&L, better on win rate. **No change; it is a 25-20 question.** |
| xStock `pivot_shift` | 2.16 | −0.53 %, 30.4 % win (n=69) | control −0.70 % / 31.1 % | ✅ **Indistinguishable from the control. No case either way; no change.** |
| xStock `morning_star` | 1.00 | **no cohort rows (n < 10)** | — | ⛔ **NO EVIDENCE ⇒ NO CHANGE.** The scope proposed one. |

### A-4 ⛔⛔ — THE REACHABILITY REFUSALS, AND THIS IS WHERE THE SCOPE WAS WRONG
| class · strategy | band | refused cohort | vs control | verdict |
|---|---|---|---|---|
| xStock `strong_bull_trend` | att 5–6 / 6–7 | ~~+8.86 % (n=36) / +8.09 % (n=31), 100 % win~~ ⛔ **WITHDRAWN AS AN ARTIFACT — AD-3** | — | ⛔ **SHIPS ON THE ARITHMETIC, RULED BY LANGSTON:** both multipliers are single `'*'` rows ⇒ the geometry is CLASS-INVARIANT ⇒ xStock is categorically off **by construction**, exactly as crypto. Evidence *against* overrides a placeholder; *absence* of evidence does not. |
| crypto `strong_bull_trend` | att 5–6 / 6–7 | **−1.10 % (n=885) / −0.89 % (n=883), ~41 % win** | −1.61 % / 26.6 % | ⚠️ **BETTER than the control on BOTH axes, and still NEGATIVE.** See P-1's honest statement and its rollback trigger. |
| xStock `vwap_pullback` | 4–5 · 5–6 · 6–7 · 7+ | −1.42 / −1.59 / −1.64 / −1.27 %, 23–31 % win (n=860) | ⛔ **ITS OWN: −1.605 % / 20.0 % (n=35)** | ⛔⛔ **WITHDRAWAL REVERSED AT STEP 4 — IT SHIPS at 6.0.** Against the POOLED control it looked worse; against **its own admitted cohort** it is better on **both** axes. ~~"the ceiling is doing its job"~~ was an artifact of a mixed control. |
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

---

# ⛔⛔ ADDENDUM r2 — A FRESH-READER ROUND OVERTURNED THREE OF THIS AUDIT'S OWN CLAIMS. ALL RE-DERIVED AT THE OBJECT BEFORE ANYTHING MOVED.
**Raised claim-only — the reviewer was handed the CLAIMS and never my objects. Every number below is my own re-derivation on staging, not the reviewer's.**

## AD-1 ⛔⛔ — THE CONTROL WAS THE WRONG OBJECT, AND IT INVERTS THE CRYPTO READING
**A-2 used the VTS `passed` cohort as "what the gates admit today". That is what the gates admit IN THE VTS LANE.** The same archive distinguishes the lanes, and the live one is a different number:

| control | crypto | xStock |
|---|---|---|
| `source = 'active-execution-engine'` — **what we actually trade** | **+0.340 %, 45.3 % win (n=223)** | −0.712 %, 36.9 % (n=176) |
| `source = 'vts-runner'` — the whole simulated lane | −0.881 %, 39.0 % (n=2,565) | −0.794 %, 33.9 % (n=2,212) |
| VTS `passed` only — **what A-2 used** | −1.606 %, 26.6 % (n=398) | −0.700 %, 31.1 % (n=630) |

⇒ **A-2's sentence — "the admitted cohort also loses money" — is TRUE of the simulated lane and FALSE of the live one on crypto.** Against the lane that actually trades, crypto `strong_bull_trend`'s pooled refused cohort (−1.0 %) is **worse, not better.**

## AD-2 ✅ — AND THEN THE EPOCH SPLIT REVERSES IT BACK, WHICH IS WHY AD-1 ALONE IS NOT THE ANSWER
**A-1 claimed one epoch because all 8,669 rows carry one `calibration_state`. THAT COLUMN IS A `NOT NULL DEFAULT` THAT NO WRITER SETS** — one value is what a constant looks like, not evidence of a single regime. **The real stamp (`module_constants.calibration_epoch`) moved INSIDE the outcome window: 2026-09-11, 2026-09-15 and 2026-09-19.** Split at the 09-11 bump:

| cell | PRE-epoch | POST-epoch | live-lane control (post) |
|---|---|---|---|
| crypto `strong_bull_trend` unreachable | −1.485 %, 38.0 % (n=1,309) | ✅ **+0.422 %, 51.4 % (n=459)** | −0.171 %, 42.4 % (n=59) |
| crypto `vwap_pullback` rr_below_min | +3.771 %, 52.5 % (n=61) | ✅ **+3.601 %, 73.3 % (n=15)** | −0.171 %, 42.4 % |

⇒ **Post-epoch, crypto `strong_bull_trend`'s refused cohort is POSITIVE and beats the live lane on both axes. The pooled −1.0 % in A-4 was two regimes averaged.** The bump is the price-side correction, so **post-epoch is the regime we are in, and the one the decision rests on.**

## AD-3 ⛔⛔ — THE xSTOCK EVIDENCE IS AN ARTIFACT. I AM WITHDRAWING IT ENTIRELY.
A-3 and A-4 called xStock `strong_bull_trend` **"the strongest single result in the audit"** (+8.84 %, 100 % win). Checked properly it is not a result at all:
- **89 of 89 rows exit `TP_target_hit`. Zero stops. Zero time-stops. Median hold 1.0 MINUTE** — against a target sitting ≥ 6 ATRs away.
- **The symbols are `STX/USD` and `STRK/USD` — CRYPTO pairs, on rows labelled `asset_class = 'xstock_spot'`.**
- **CONTROL, the same query on crypto `strong_bull_trend`: `SL_hit` 1,002 / `TP_target_hit` 715 / `time_stop` 51, median holds 855–1,022 min — a plausible distribution.** The xStock shape is unique to that cell.

⇒ ⛔ **A 100 %-win, one-minute, target-only cohort is the measuring apparatus, not the market.** **Every xStock `strong_bull_trend` outcome figure in this document is WITHDRAWN.**

**🟨 FINDING, larger than this batch: rows labelled `xstock_spot` are carrying crypto symbols and booking instant target hits.** It contaminates any per-class VTS statistic drawn over this window — including ones other batches may already have drawn.
**DISPOSITION: its own item, placed in `PHASE_19_PLAN` after `3n.v` — `B-VTS-CLASS-LABEL-INTEGRITY`, owner CC-B**, cross-referenced to CC-C because the price-side lane owns the writer. **Not folded in: a data-integrity defect is not a geometry threshold.**

## AD-4 — TWO MORE CONFOUNDS, STATED RATHER THAN CLOSED
- **DURATION IS NOT CONTROLLED AND THE COHORTS DIFFER ~3.5×** — crypto median holds: `passed` 295 min · `rr_below_min` 1,739 · `unreachable` 1,045. Under a concurrency cap, a percentage earned over triple the capital-time is a different economic object. **Nothing below rests on a percentage alone where that gap is large.**
- **COVERAGE IS NOT PURELY RETENTION.** Of the in-window rows that do not join, **849 are maker TWINS excluded from the archive BY DESIGN** — a structured, entry-mode-correlated subpopulation, not random loss. A-1's *"the 55.1 % is retention, not the join"* is corrected to *"retention plus a by-design twin exclusion."*

## AD-4b — THE TWO RIDERS LANGSTON PUT ON THE LEGS HE WAS NOT ASKED ABOUT, BOTH MEASURED
**(i) MY "POST-EPOCH" CUT STRADDLED TWO LATER BOUNDARIES.** I split at 09-11 and called the remainder one regime, while stating myself that the stamp moved three times. Recut at every bump, crypto `strong_bull_trend` unreachable against the live-lane control:

| segment | cohort | live-lane control |
|---|---|---|
| before 09-11 | −1.485 % (n=1,309) | +0.523 % (n=164) |
| 09-11 → 09-15 | −3.994 %, 21.1 % (n=90) | +1.237 % (n=12) |
| 09-15 → 09-19 | +2.090 %, 69.7 % (n=211) | +2.556 % (n=14) |
| after 09-19 | **+0.710 %, 44.3 % (n=158)** | **−1.840 % (n=33)** |

⇒ ⛔ **THE HONEST READING IS WEAKER THAN "POST-EPOCH IS POSITIVE", AND I AM STATING IT AS THE WEAKER ONE.** The cohort is positive in the two most recent segments and beats the control in the last; **but the control segments are n=12 / n=14 / n=33 and swing from +2.556 % to −1.840 %.** At this resolution **neither side supports a strong claim**, which is exactly why §4 says Kyle's replay evidence plus the pre-registered rollback trigger carry the crypto leg — not this cohort.
**(ii) THE POST-EPOCH CONTROL'S n IS PUBLISHED BESIDE IT, as asked: −0.171 % on n=59.** A 59-row comparator was being asked to reverse a pooled reading, and that is too much weight for it.

## AD-4c — C-2: THE PRE-DEPLOY BASELINE, RECORDED BEFORE THE DEPLOY RATHER THAN RECONSTRUCTED AFTER
**Live-lane realised P&L, trailing 7 days, read 2026-09-21 before any deploy: crypto −0.8981 % over n=50 (38.0 % win) · xStock −0.6664 % over n=41 (31.7 % win).** These are A-7's rollback-trigger baselines and both classes are recorded, not just the one the change is expected to move.
⚠️ **AND THE ADMISSIONS ARM MAY BE UNREADABLE ON xSTOCK: a 25 %-of-admissions threshold needs enough admissions to have a share at all.** If that class's volume stays where it is, **a zero there means "not measured", never "passed"** (#661 leg 3) — written down before the window opens.

## AD-5 — WHAT THE PLAN BECOMES
| # | was | now |
|---|---|---|
| **P-1 crypto ceiling 6.5** | shipped on a pooled cohort beating a VTS control | ✅ **SHIPS — on the POST-EPOCH cohort (+0.422 %, 51.4 %, n=459) against the live-lane control (−0.171 %, 42.4 %).** The pre-epoch half is stated beside it, not hidden. |
| **P-1 xStock ceiling 6.5** | shipped on "the strongest result" | ✅ **SHIPS — LANGSTON RULED IT, 2026-09-20, and on the arithmetic rather than the cohort:** both multipliers are single `'*'` rows, so the geometry is class-invariant and xStock is categorically off **by construction**. ⛔ **And the corpus a hold would wait for does not exist: all 256 rows ever written in that cell are three symbols, every one priced ≤ $7.43 — the integrity fix relabels it to n=0, not to a readable number.** Holding it would re-impose by hand the rule Kyle struck. |
| **P-2 xStock `strong_bull_trend` floor 1.95** | shipped on the same cohort | ✅ **SHIPS ON THE CORRECTNESS ARGUMENT ALONE, which never needed the cohort:** its floor EQUALS its own constant RR, so the comparison is decided by float noise. Identical footing to crypto `vwap_bounce`. |
| **P-3 crypto `vwap_pullback` 2.44 → 1.95** | *"admits the good half, refuses the bad half"* | ✅ **SHIPS, JUSTIFICATION CORRECTED.** The two RR points are **perfectly separated in TIME** — RR 0.80 ran 2026-06-25 → 08-05 (n=63), RR 2.00 ran 08-07 → 09-18 (n=82), **no overlap.** There is no bad half left to refuse: **the floor currently refuses 100 % of what the strategy now produces, and that population realises +3.6 to +3.8 % on BOTH sides of the epoch bump.** |
| **P-4 withdrawals** | six cells | **unchanged** — none of this touches them. |
