# B-GEOMETRY-REACH-BASELINE — SCOPE **r13**

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 · **Owner:** CC-B
**change-class: architecture** · **r13, 2026-09-13**

> ⛔⛔ **KYLE RE-SCOPED THIS AND HE WAS RIGHT ON ALL SIX COUNTS. r1–r5 WERE BUILT ON 29 SEPTEMBER PAPER TRADES WHILE 78,304 VTS TRADES SAT UNUSED SINCE 10 MAY.** His words: *"Using paper mode data limits us tremendously."* **I used roughly 0.04 % of the available trade record.**
> ⛔⛔ **r7 — THE REVERSAL IS RELABELLED A *HYPOTHESIS*, NOT A FINDING (Langston BLOCKER-2, and he is right).** r6 claimed the VTS data shows the ceiling is nearly right and the strategy's target wrong. **It does not show that, because I measured the wrong quantity: `closed_at − opened_at` is time-to-ANY-exit, and the ceiling encodes time-to-TARGET.** `strong_bull_trend`'s 1,652 trades were **all tagged `unreachable`**, so their 15.44 h is the median time to stop-out-or-timeout of trades that mostly never reached 6 ATR. ⇒ **“6 ATR implies 36 h; it resolves in 15.44 h” compares a MODELLED time-to-reach against an OBSERVED time-to-exit-by-other-means. Two different objects.**
> ⭐ **THE HYPOTHESIS IS STILL WORTH CARRYING and r1–r5's opposite framing stays struck — but neither is established, and r7 says so rather than choosing the one that flatters the re-scope.** ⚠️ **This is the seventh instance today of the same class: the shape of the measurement decided the answer.**

---

## 0. WHAT THE RE-SCOPE CHANGED — PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED (r1–r5) | NOW (r6, on VTS) | EVIDENCE |
|---|---|---|---|
| 1 | *(r6)* **REVERSED — the ceiling is ~correct, the TARGET is wrong.** | ⚠️ **r7: HYPOTHESIS, NOT ESTABLISHED.** Both r1–r5's framing and r6's reversal are unproven; r7 asserts neither. | ⛔ **The estimand was wrong.** `closed_at − opened_at` is time-to-any-exit; the gate encodes time-to-target, and §1d proves exit reason cannot be joined. The 15.44 h is time-to-stop-or-timeout for trades that mostly never reached 6 ATR. **Settling it needs realised excursion — see §1e-bis.** |
| 2 | The ceiling is *"an untraced value"*, tone: arbitrary. | ⚠️ **Untraced as to how 4.0 was picked. THE “within 2 %” COMPARISON IS WITHDRAWN** — it rested on the wrong estimand (§1b). Per-CLASS is the defect, not the value. | §1a below |
| 3 | OBJ-2: change live paper behaviour to observe the blocked strategy. | ⛔⛔ **WITHDRAWN AS A DATA-GATHERING STEP — THE EXPERIMENT HAS ALREADY RUN 4,675 TIMES.** | `strong_bull_trend`: **4,717 VTS trades, 4,675 closed, 2026-05-10 → 09-12, at avg target 6.000 / stop 3.000 ATR.** 1,652 closed since 01-08, **every one tagged `unreachable`.** |
| 4 | Maker share 50 %, from 58 paper trades. | **VTS crypto 18.2 %** (716 maker / 3,938 stamped); **xStock 0.92 %** (19 / 2,072). | `vts_open_trades.chosen_entry_mode` |
| 5 | OBJ-1: establish the fee basis and read the account rung. | ⚠️ **SHRUNK. The schedule is already documented and the split was already observed.** The xStock 0.92 % appears to satisfy an existing ≤1.0 % observation criterion at n≥300 — **an observation window CC-B already owns and had not read.** | `KRAKEN_FEE_SCHEDULE_REFERENCE` §1–§6; the P8 criterion |
| 6 | `B-EV-TARGET-PROBABILITY` as a new batch. | ✅ **CONFIRMED DUPLICATE — WITHDRAWN, not deferred (§1e(i)).** The scoring rebuild is already the ratified Phase-25 blueprint (`P25_SCORING_STACK_PRESTUDY` PART II: `finalScore` RETIRE, `hybridScore` two-layer model + Platt). | Kyle: *"we have plans to change it in an upcoming batch"* |

---

## 1. THE PROBLEM, RESTATED ON FOUR MONTHS OF DATA

### 1a. ⭐⭐ THE CEILING IS KEYED PER CLASS **BY DESIGN** — and this batch AMENDS that design rather than fixing a bug

⛔⛔ **r12 — THE POPULATION PREDICATE WAS MISSING FROM THIS TABLE AND `vts_open_trades` IS TWO POPULATIONS (Langston's BLOCKER, answered at the data in the pre-audit's §1b-bis).** The line below said *"VTS crypto"* and named **no lane**; the pooled n reproduces to the row, so **reorg-B4's shadow lane was IN.**
✅ **THE FULL PREDICATE, now stated: `vts_open_trades`, `asset_class='crypto_spot'`, `closed_at IS NOT NULL`, `opened_at ≥ 2026-08-01`, BOTH LANES POOLED, n = 28,020, strategies with n ≥ 100 (the threshold was previously unwritten).**
⚠️ **SEVEN OF THE TEN ROWS TURN OUT TO BE SINGLE-LANE, so the numbers below are mostly unchanged — BY LUCK, NOT METHOD.** ⛔ **THE LANE-SPLIT TABLE IN §1b-bis IS THE ONE TO READ, AND IT CARRIES THE THREE ROWS THAT MOVE PLUS THE 48 h / 168 h CENSORING WALLS.**

The ceiling is `c·√H`. **`H` per strategy, POOLED ACROSS BOTH LANES, median (never mean — the mean is censored by the TTL walls):

| strategy | n | median hold | **ceiling its own hold implies (√H)** | vs the live 4.0 |
|---|---|---|---|---|
| `reverse_impulse` | 560 | 1.77 h | **1.33** | 3.0× too generous |
| `sma_trend_ride` | 1,369 | 3.89 h | **1.97** | 2.0× too generous |
| `range_trade` | 156 | 5.22 h | **2.28** | 1.8× |
| `inside_bar_reversal` | 524 | 5.55 h | **2.36** | 1.7× |
| `volatility_edge` | 19,133 | 6.01 h | **2.45** | 1.6× |
| `morning_star` | 3,390 | 6.02 h | **2.45** | 1.6× |
| `pivot_shift` | 436 | 7.40 h | **2.72** | 1.5× |
| `support_bounce` | 142 | 13.27 h | **3.64** | ~right |
| `strong_bull_trend` | 1,652 | 15.44 h | 3.93 | ~at the default |
| ⚠️ `vwap_pullback` | 580 | 40.97 h | 6.40 | ⛔ **DOES NOT SHIP — and r12 REPLACES THE REASON: this pooled value is a BIMODAL ARTIFACT (shadow 328 rows at 14.10 h, VTS 252 rows at 46.36 h, 3.3x apart). On the shadow lane its implied ceiling is 3.75, which TIGHTENS. The disqualifier is now LANE DISAGREEMENT, not direction.** |

⇒ ✅ **WHAT THIS STILL SUPPORTS, AND IT SURVIVES THE LANE SPLIT UNCHANGED: one ceiling is serving ten materially different DURATIONS, and for seven strategies it sits 1.5–3.0x looser than their own holding time.** ⭐ **The spread between 1.77 h and 15.44 h is present WITHIN either lane read alone, so the headline does not depend on the pooling.**
⛔⛔ **WHAT IS STRUCK: *"`vwap_pullback` is the only row that would LOOSEN the ceiling, and it is disqualified by DIRECTION."* THAT WAS A POOLING ARTIFACT.** Split, its shadow lane TIGHTENS (3.75) and its VTS lane loosens (6.81). It still does not ship; the reason is lane disagreement.
⛔⛔ **AND THE OPEN QUESTION THAT DECIDES WHETHER OBJ-A SHIPS AS SEVEN ROWS, AS FOUR, OR NOT AT ALL: WHICH LANE IS THE RIGHT ONE TO DERIVE `H` FROM.** **On the clean VTS lane, five of the seven tightening strategies have no usable sample** (`inside_bar_reversal` 0, `pivot_shift` 3, `support_bounce` 7, `sma_trend_ride` 8, `volatility_edge` 10). ⭐ **This is a DESIGN call, not a measurement — the shadow lane shadows real RTB promotions, the VTS lane owns the gate verdict field — and I am not making it unilaterally. Langston's, or Kyle's.**
⛔ **THE r6 SENTENCE THAT STOOD HERE IS DELETED, NOT ANNOTATED.** It read: *“strong_bull_trend's 6-ATR target is not justified by its own hold — the ceiling is correctly refusing a target the strategy's own horizon cannot reach.”* ⛔ **That compared a MODELLED time-to-reach against an OBSERVED time-to-exit-by-other-means.** The 15.44 h is the median time to stop-out or timeout of trades that were **all tagged `unreachable`** and mostly never approached 6 ATR. ⇒ **Settling it needs time-to-target, which §1d shows this corpus cannot yield, and §1e shows the excursion record does not exist. NEITHER r1–r5's framing NOR r6's reversal is asserted.**

### 1b. ⛔ DELETED — r6's *“the gate is doing its job”* claim

⛔ **The section that stood here is REMOVED, not struck.** It reported that refused trades take ~3.8× longer to resolve than passed ones and concluded the gate separates good from bad. **Two independent faults, either fatal:**
1. **It was one strategy wearing a crowd's clothes** — `unreachable` n=1,857 of which `strong_bull_trend` is **1,652 = 88.9 %.**
2. ⛔ **It was TAUTOLOGICAL before it was confounded** — the `passed` bucket passed **because its targets were nearer**, and nearer targets are reached sooner **by definition.** Controlled for `atrsToTarget` the effect has nowhere to come from.

⇒ **It may be re-run stratified by strategy AND target distance. Until then it supports nothing, and nothing in §3 cites it.**

### 1c. ⛔ THE COST PROBLEM IS UNCHANGED AND STILL REAL

Friction is **44 % of the risk unit**; fees are proportional so size cannot help; only rate, round-trip count and reward per round trip can. **⇒ fewer, larger-expected-move trades.** Unchanged from r2 §1d and unaffected by the re-scope.

### 1d. ⛔⛔ AND A STRUCTURAL FINDING THAT BOUNDS WHAT VTS CAN ANSWER — MEASURED, WITH CONTROLS

**The two VTS corpora cannot be joined, and never could.**
- `vts_open_trades` — **78,304 rows**, carries **geometry + gate verdict + strategy + entry mode + open-state context (all 52 keys enumerated)**. ⛔ **NO OUTCOME FIELD OF ANY KIND.** Every key is at-open (`atrAtOpen`, `diAtOpen`, `netEvAtOpen`, `predictedPwinAtOpen`). Only `closed` (bool) and `closed_at`.
- `exit_strategy_alternates` — **174,144 rows / 14,510 trades**, carries **outcomes** (`baseline_pnl_pct`, `virtual_exit_reason`). ⛔ **NO GATE VERDICT.**
- ⛔ **AND THE ID SPACES ARE DISJOINT: 0 of 200 sampled alternate `trade_id`s match `vts_open_trades.id` — CONTROL: the same probe also matched 0 in `closed_trades`, and the formats explain it.** `vts_open_trades` is `shadow_*` (64,203) or `vts_SYM_STRATEGY_ts` (7,133); the alternates are **100 % `vts_SYM_ts`** (14,510) across the whole 2026-05-01 → 09-12 span. **Zero rows on either side share the other's format in any era.**

⇒ ⛔ **SO "DO REFUSED TRADES MAKE LESS MONEY?" IS UNANSWERABLE FROM VTS AS STORED.** ✅ **BUT "DO THEY TAKE LONGER?" IS ANSWERABLE, AND IT IS THE QUESTION THE CEILING ACTUALLY ENCODES** — §1b answers it on 2,428 verdict-bearing closed trades without needing a single P&L figure.
⭐ **THIS IS THE SAME DEFECT AS THE ARCHIVE'S** (probability at `pre_filter`, geometry at `sqe`, joint empty). **Two instances, one class: our records are captured per stage and never keyed to each other.** ⇒ `HOME: B-TRADE-RECORD-JOINABILITY, owner CC-B, PHASE_19_PLAN, placed after 2.4g-2` — **name it now, because every future measurement hits it.**

---

### 1e. ⭐⭐ THE TWO ITEMS r6 LEFT OPEN, NOW CLOSED — AND ONE OF THEM BOUNDS THIS RE-SCOPE

**(i) `B-EV-TARGET-PROBABILITY` IS A CONFIRMED DUPLICATE. WITHDRAWN, NOT DEFERRED.** Kyle said the probability-score rebuild is already planned; it is, and it has been since **2026-07-13**. `P25_SCORING_STACK_PRESTUDY.md` **FIX-3**, verbatim: *"pWin is a placeholder AND its calibration data is thinner than assumed (verified). `pWin = clamp(0.40 + DI/200, 0.40..0.60)` (strong-trend `0.40+|dbs|/2`) — **never validated.**"* ⇒ ⛔ **the batch I proposed re-derives a finding that has been on the books for two months, inside a document I have in my own memory as the ratified Phase-25 blueprint.** ✅ **The §1c EV-bias identity still stands and is still worth carrying — it is the MECHANISM behind FIX-3's "never validated", stated as an identity rather than an observation. It belongs as evidence ON FIX-3, not as a new batch.**

**(ii) ⚠️ AND THE SAME DOCUMENT'S FIX-2 BOUNDS WHAT VTS MAY BE USED FOR — I MEASURED IT RATHER THAN INHERITING IT.** FIX-2 (2026-07-13, marked verified) says the VTS kernel is fed a **fake DI** — `predictiveConfidence × 100` at `vts-runner.ts:1657`, with `diAtOpen` **hardcoded 50** at `:2043` — concluding *"VTS calibration data ≠ active behavior."*
**MEASURED TODAY, `vts_open_trades`, `opened_at ≥ 2026-08-01`, n = 32,084 rows carrying `diAtOpen`:**

| finding | value |
|---|---|
| `diAtOpen` **exactly 50** | **4,733 (14.8 %)** |
| distinct values | **3,095** |
| median | **28.32** |
| `realDiAtOpen` — key present | 3,685 |
| ⛔ **`realDiAtOpen` — value NON-NULL** | ⛔ **0 of 3,685** |

⇒ ⚠️ **FIX-2's "hardcoded 50 on EVERY VTS trade" no longer holds universally — it holds on 14.8 %.** Either it was partly repaired since July or the 50 is a fallback that fires one row in seven. **Whichever it is, VTS's directional input is real on ~85 % of rows and a SENTINEL on ~15 %.**
⇒ ⛔⛔ **SO VTS MAY NOT CARRY ANY DI-, PROBABILITY- OR SELECTION-BASED CLAIM WITHOUT EXCLUDING THE SENTINEL ROWS — and the field built to hold the real value, `realDiAtOpen`, IS STAMPED ON 3,685 ROWS AND NULL ON ALL 3,685.** ⇒ **there is no clean alternative column. That is a writer defect.** `HOME: folded into B-TRADE-RECORD-JOINABILITY (OBJ-D) as its second item — same class, same tables, a field written but never populated.`
✅ **WHAT THIS DOES *NOT* TOUCH, AND IT IS WHY §1a AND §1b SURVIVE INTACT: the hold measurements do not read DI at all.** `closed_at − opened_at` has **3,933 distinct values across 28,020 trades** — measured, as a control against the reading being degenerate. ⇒ ⛔ **VTS is a HORIZON instrument. It is not a probability instrument, and after (ii) it is not a selection instrument either.** **Every number in §1a/§1b is a duration; none is a DI, a pWin or a P&L.**

---

### 1e-bis. ⛔⛔ THE EXCURSION RECORD DOES NOT EXIST, AND IT MUST BE **DESIGNED** — NOT WIRED

**This is what moves the target re-derivation out of this batch, so it is in the body rather than an annex.**

✅ **MEASURED, WITH A POSITIVE CONTROL.** The columns **DO** exist: `shared/schema.ts:734-735` on **`trades`** and `:1237-1238` on **`paper_trades`** — `mfe`, commented *"Maximum Favorable Excursion (max profit while open)"*, and `mae`. ⛔ **BOTH TABLES HOLD ZERO ROWS.** **CONTROL: the same query returns 0 for `symbol` on both, so the zero is an empty table and not a failed read** — and `paper_trades` is already recorded **RETIRED** at `#573`.

⛔ **r7 CONCLUDED *“it needs WIRING, not designing”*. THAT WAS WRONG, AND WRONG IN THE DIRECTION THAT SHRANK THE WORK.** Whole-tree at the ref: `mfe`/`mae` are **exactly four lines in 308 KB of `shared/schema.ts`**; **`closed_trades`, `active_open_positions` and `active_trade_logs` carry no excursion field**; **`vts_open_trades` and `exit_strategy_alternates` — this batch's entire corpus — have NO `pgTable` at the ref at all**; and there are **ZERO code references to `mfe` tree-wide.** ⇒ **two comments on two dead tables, and no writer to re-point.**

⛔⛔ **AND THE SAMPLING IS A REAL DESIGN CALL, NOT CLERICAL** — citing the existing ruling rather than re-deriving it. `RUNNING_ISSUES:1495`: `latestEquityTick` is a **last-write-wins map with no history**, which the exit monitor **polls on its own cycle**. **Three samplings of one stream — and a sub-4-second excursion that reverts is invisible to all of them.** ⇒ ⭐ **an MFE written off that instrument is the MFE of the SAMPLER, not of the price path.** The second design call is the **basis** — mid vs bid — which is F-G-2's live subject.

⇒ ⛔ **THEREFORE THE TARGET RE-DERIVATION CANNOT SHIP IN THIS BATCH, and r6's OBJ-B is withdrawn.** `HOME: B-EXCURSION-RECORD, owner CC-B, PHASE_19_PLAN placed after 2.4g-2 and AHEAD of B-TRADE-RECORD-JOINABILITY` — same tables, and the joinability work must not land first and be re-opened.
✅ **Kyle's binding objection survives this: OBJ-A still ships live configuration AND a code change. The batch is not measure-only.**

### 1f. ✅ WHERE THE CORRECTIONS LIVE NOW

⛔⛔ **r7 CARRIED THREE ANNEX SECTIONS (1f/1g/1h) HOLDING THE BLOCKER ANSWERS WHILE THE BODY STILL ASSERTED THE WITHDRAWN TEXT. THEY ARE REMOVED.** Langston's ruling, and it is the whole of r8: ***a correction stacked on wrong text is not a correction.*** ⇒ **every answer is now APPLIED where it belongs** — §1a carries the design amendment, §1b carries the deletion and the five binding limits, §1c the dimensional problem, §1d the corpus bound, §1e the excursion finding, §2 the provenance, and OBJ-A the code change with its fail-closed floor and its policy-tightening label.
✅ **The error record lives in `RUNNING_ISSUES` `#1052` and the commit messages — not in this document's body, which is what gets built from.**

## 2. PROVENANCE OF `reach_atr_max` (mandatory 1.b) — FOUR ITEMS

**Searched:** the reorg-B2 scope + pre-audit, the reorg-B2/B2.1/B2.3 completion reports, `P19_B_FEEVIABILITY` scope + pre-audit, `SYSTEM_MANUAL` §reorg-B2*, `POST_AUDIT_ROADMAP`, `RUNNING_ISSUES`, `git log -S`.

1. **INTRODUCED.** `reorg-B2` Piece C states the form — *"path-INVARIANT reachability bound (c·√H), per class only (not per-filterPath)"* (`expectancy.ts:210`). ⛔ **But `reach_atr_max` does NOT appear in the reorg-B2 completion report; it arrives at `reorg-B2.1 OBJ-3`** (`P19_B_FEEVIABILITY_PRE_AUDIT.md:136`), with an acknowledged attribution discrepancy against `POST_AUDIT_ROADMAP:326`.
2. ⭐ **INTENT, VERBATIM — AND THIS IS THE STATEMENT OBJ-A AMENDS.** `signal-target-normalizer.ts:24-29`: *"Reachability is PATH-INVARIANT by design — it is a FEASIBILITY check, not a quality bar, so it is per-CLASS (BTC vs xStock ATR scales genuinely differ) but NOT per-filterPath … (Langston)."*
3. **DISPOSITION: (2) relevant but needs updating to today's intent.** ⛔ **Per-class keying is a STATED DESIGN, not a storage accident — r6 called it *"the defect"* and that was wrong.** The feasibility framing is sound; it is **silent on horizon being a strategy property**, and that silence is what OBJ-A fills. ⚠️ **So OBJ-A changes the gate's CHARACTER** — from a feasibility statement about pair + horizon into a **per-strategy declared-horizon knob** — which is arguable because a holding horizon genuinely is a strategy property, and which is **why the standing no-looser rule exists.**
4. ⚠️ **THE VALUE `4.0` IS `INFERRED-FROM-CODE-AND-FORM`, NOT ESTABLISHED, AND MUST NOT QUIETLY FIRM UP.** `P19_REORG_B2_PRE_AUDIT.md:41`'s general rule governs a target distance (`K ≲ c·√H`, `H = 12–24`, `√H ≈ 3.5–4.9`, so 4.0 is in band) — **but its worked example specialises `K` to the FLOOR and outputs a volatility-admission bound, a different quantity. How 4.0 itself was chosen is recorded NOWHERE.**
⛔⛔ **THE WITHDRAWN CLAIM WAS LIVE IN **TWO** GOVERNED ARTIFACTS, AND r9 CLAIMED “DISCHARGED” ON THE STRENGTH OF FIXING ONE.** ⛔ **A false DISCHARGED removes the work from the plan, which is why this blocked rather than annotated.** **NAMED, not counted:** **(1) `PHASE_19_PLAN` row 2.4g-2** — corrected in the r8 commit; **(2) `RUNNING_ISSUES` `#1052`** — which asserted it flatly with no banner **and was frozen at the r1–r5 plan entirely**, including the withdrawn paper-only release and the record of how Kyle's binding objection is met. **Both corrected in the r10 commit; OBJ-D item 1 is discharged ONLY as of r11, when the last surviving instance (`RUNNING_ISSUES:8941`, operative prose eight lines below its own banner) was corrected.**.

---

## 3. THE PLAN

### OBJ-A — Make the ceiling per-(strategy × class), CRYPTO ONLY, as a POLICY TIGHTENING
**From §1a, §1b, §1c.**

⛔⛔ **THIS IS A CODE CHANGE, NOT A SEED — AND r6's MECHANISM CLAIM IS DELETED AS FALSE.** r6 said *"the resolver already supports the strategy dimension (`min_rr` uses it)."* **The GENERIC resolver does; the `reach_atr_max` READ SITE does not.** `expectancy.ts:205` states *"floorPct + reachAtrMax stay PER-CLASS (strategy:'\*'); only min_rr goes per-(strategy×class)"*; `:206` hardcodes `_classKey = { exchange:'*', assetClass, strategy:'*', regime:'*' }`; `:211` reads with it. **`reach_atr_max` has no other read site tree-wide.** ⇒ **seeding rows without the code change ships a NO-OP.**

**CHANGE, four parts and the second is not optional:**
1. `expectancy.ts` resolves `reach_atr_max` per-(strategy × class) through the same most-specific-wins path `min_rr` uses.
2. ⛔⛔ **ADD `reach_atr_max_unknown_floor`, PLUS the `recordUnknownStrategyAtGate` tripwire — AND SHIP IT ON THE FULL KEY SET, WHICH IS *NOT* CRYPTO-ONLY.** ⭐ **The precedent is measured, not assumed: `min_rr_unknown_floor` ships THREE rows — `crypto_spot` 2.88, `xstock_spot` 2.16, and a GLOBAL `*` 2.88** — because `getCachedNumberRequired` falls back to the global row when the **asset class itself** is unresolved. ⛔ **A crypto-only unknown floor therefore either THROWS IN FLIGHT on an unresolved class, or leaves xStock's unknown-token path on the permissive 4.0 — the exact trap part 2 exists to close.** ⚠️ **“CRYPTO ONLY” GOVERNS THE CALIBRATION ROWS AND MUST NOT BE READ ONTO THE SAFETY ROW.** ✅ **And the seed-completeness precedent lives at the MIGRATION, not at boot: `min_rr_unknown_floor` is NOT in `b72-warmup.ts:362`'s list; its migration carries its own `RAISE EXCEPTION` check. Mirror that.** `min_rr` fails **closed** (`expectancy.ts:239-240`) and **reach has no analogue**, so an uncanonicalized token would land on the **permissive** class `4.0` — the §8 #10 silent-fallback-for-a-DB-governed-setting trap.
⛔⛔ **r13 — ITS VALUE IS NOW BOUND TO A NAMED CONSTANT, BECAUSE *"THE MINIMUM ACROSS STRATEGIES"* WAS A FUNCTION OF THE CALIBRATION DECISION IT EXISTS TO BE INDEPENDENT OF (Langston).** That phrasing yields **1.33 if seven rows ship and 1.86 if two do** — so the SAFETY row would silently change meaning with the very argument it is meant to outlast.
✅ **BOUND: `reach_atr_max_unknown_floor` = the MINIMUM OVER THE ROWS ACTUALLY SEEDED BY THIS BATCH, computed at the migration and written as a LITERAL in it, never as a query.** ⭐ **Rationale, stated so the next session does not re-open it: the floor's job is to make an unknown token no more permissive than the tightest thing we have actually asserted — which is a statement about what SHIPPED, not about what was measured.** ⛔ **If OBJ-A part 3 seeds nothing, the floor row STILL SHIPS, at the class default 4.0 on the full key set — the fail-closed structure is a §8 #10 defect fix and does NOT depend on the calibration landing.**
3. Seed the **seven TIGHTENING crypto rows** only.
4. ⛔ **Rewrite `signal-target-normalizer.ts:24-29` IN THE SAME COMMIT**, or we ship a docstring describing the opposite design. *(Langston's own `active-position-sizing.ts:123-131` retraction is the precedent — he quoted a stale header and ratified a retired algorithm.)*

⛔ **SHIPS CRYPTO ONLY** (§1c: `c` is class-dependent — crypto 60-min bars vs xStock 15-min — and there are zero xStock rows).
⛔⛔ **r13 — THE SENTENCE THAT STOOD HERE WAS THE STRUCK ONE, AND THAT IS A CORRECTION STACKED ON WRONG TEXT: `stacked-correction`, MY OWN FILED PATTERN, CAUGHT BY LANGSTON.** §1a struck *"the only row that would LOOSEN — disqualified by DIRECTION"* at r12 and **OBJ-A did not get the edit — and OBJ-A is what gets read at implementation time.** ✅ **The cure I filed is the test: DELETE every correction section and re-read what is left. I did not run it on my own r12.**
✅ **CURRENT: `vwap_pullback` DOES NOT SHIP because its two lanes DISAGREE — shadow 14.10 h (implied 3.75, TIGHTER than live) vs VTS 46.36 h (6.81, looser), 3.3x apart — and its shadow cell is 48.17 % censored, so 14.10 h is a FLOOR and not an estimate.** It stays at the class default and moves to `B-EXCURSION-RECORD`.
✅ **STANDING RULE, generalised rather than applied case-by-case: NO per-strategy row may be LOOSER than the class default without realised-excursion evidence.** *(Tightening on a mis-derived number costs opportunity; loosening on one costs money.)*

⚠️ **AND THE SHIPPED VALUES ARE LABELLED A POLICY TIGHTENING WITH A MEASURED LOWER BOUND — NOT A DERIVATION.** `H` is **endogenous to the gate being calibrated**: the ceiling blocks far targets → those trades exit sooner → `H` is short → the derived ceiling is tight. **The same circularity that convicted §1b, one level up.** Tightening is the safe direction and 1.5–3.0× is robust to a lot of feedback, **but the label is not optional.**

⛔⛔ **VERIFICATION ORDER IS NOW BINDING — (b) LANDS BEFORE THE SEED, NOT AT CLOSE (Langston).** *"Tightening is the safe direction"* is an **assertion about COST**, and the implied refusal rate is the only test of it. ⭐ **It is what decides whether a 2.15x tightening on `reverse_impulse` is conservative or is a LIVE THROTTLE — and finding that out after the row is seeded is finding it out from production.**
**VERIFICATION:** (a) each value re-derived with n, denominator and a **bootstrapped CI**, carrying the **policy-tightening** label; **(b) ⛔ BEFORE ANY SEED: the implied refusal rate per strategy, published per ATR basis (Gate A clamped vs B/C/D raw), on the unfiltered population with the lane predicate stated;** (c) medians **split at the F-G-2 deploy boundaries** (`2cc4a03ec` 09-02, `f8870022f` 09-04, 3n OBJ-7 09-11) with both halves shown; (d) the **78-row** and **8.7 %** reconciliations answered; (e) the **absent nine strategies'** disposition stated — silence there is the permissive branch; (f) **negative control** — an unknown strategy token resolves to the *unknown floor*, not to 4.0, asserted by test; (g) the `:24-29` docstring matches shipped behaviour.

### OBJ-B — Read the fee work we already have, and stop re-deriving it
**From §0 rows 4–5.** The schedule is documented; the maker/taker split is observed (**crypto 18.2 %, xStock 0.92 %** on 3,938 / 2,072 stamped VTS rows). **Read the existing observation windows and the 2026-09-06 account capture BEFORE any new measurement.** ⛔ **Only if the account rung is genuinely absent from the record does the authenticated read happen — and then as a sourced rate with a refresh path, never a hardcoded number.**
**VERIFICATION:** the batch cites the existing findings rather than reproducing them; any gap is named as a gap.

### OBJ-C — Name the record defects; fix none of them here
**From §1d and §1e(ii).** File `B-TRADE-RECORD-JOINABILITY` with **three** instances: the VTS id-space split, the archive's stage split, and **`realDiAtOpen` stamped on 3,685 rows and NULL on every one of them** — a field written and never populated, which is the same class one layer down. ⛔ **Out of scope to fix — it is a schema-and-writer change across four tables.** ✅ **In scope to NAME, because every measurement in this batch and the next hits it.**

⛔ **WITHDRAWN FROM r1–r5:** the paper-only reachability release (§0 row 3 — already run 4,675 times in VTS); the per-strategy exemption (OBJ-A supersedes it); and `B-EV-TARGET-PROBABILITY` — ✅ **CONFIRMED duplicate of `P25_SCORING_STACK_PRESTUDY` FIX-3 (2026-07-13), verified at §1e(i); the check is DONE, not pending** — against the ratified Phase-25 scoring blueprint** (§0 row 6).

---

### OBJ-D — Correct the governed artifacts that still carry withdrawn claims
**From §2 item 4.** ⛔ **NAMED, not counted — a count is not a set.** **(1) `PHASE_19_PLAN` row 2.4g-2** (done, r8); **(2) `RUNNING_ISSUES` `#1052`** (done, r10 — the sixteen-hour assertion, the superseded four-objective plan, and the binding-objection record that rested on the withdrawn release). ✅ **GREP THE CLASS BEFORE FIXING THE INSTANCE** — that is what found the second one, and it is the cure filed as `stacked-correction`.
**VERIFICATION — the grep is SPECIFIED here, not described elsewhere, because an unspecified grep is what failed three times:** over `1-system-manual/`, `Claude Comms and Packages/` and `.claude/`, for **all six patterns** — `ENCODES A SIXTEEN-HOUR`, `IT ENCODES SIXTEEN HOURS`, `ceiling asserting sixteen`, `PAPER path only`, `Objective 2 changes live paper`, `pending a duplication check` — **excluding lines containing a withdrawal marker** (`WITHDRAWN`, `stood here`, `SUPERSEDED`, `NOT established`). ⛔⛔ **AND A POSITIVE CONTROL IS MANDATORY: the same grep WITHOUT the exclusion must return the banners.** Without it a zero is unreadable (`#661` leg 1). **Both runs pasted at close.**

### OBJ-E — Governance
**Tier-1, unconditional:** completion report · `BATCH_CATALOG` · `PHASE_HISTORY` · `RUNNING_ISSUES` `#1052` · `MEMORY_CC_B` · `PHASE_19_PLAN` row 2.4g-2 · the task-list row (`gov-ledgerrow`).
**Tier-2, judged explicitly, not skipped by default:** **`SYSTEM_MANUAL` — YES.** OBJ-A changes the gate's CHARACTER (a per-class feasibility check becomes a per-strategy declared-horizon knob) and §reorg-B2/B2.1 document it. **`SYSTEM_IMPACT_MAP` — YES** (§4.1 Signal Orchestrator, §4.3 RTB Service).

---

## 4. OUT OF SCOPE — NAMED, NOT SILENT

| item | home |
|---|---|
| **The target re-derivation** (needs realised excursion) | `B-EXCURSION-RECORD`, owner CC-B, after 2.4g-2 and **ahead of** `B-TRADE-RECORD-JOINABILITY` |
| **THREE members, TWO classes, all named:** *joinability* — **(i)** the `vts_open_trades` ↔ `exit_strategy_alternates` id-space split and **(ii)** the archive stage split; *writer* — **(iii)** `realDiAtOpen` NULL on all 3,685 | `B-TRADE-RECORD-JOINABILITY` |
| **The EV gate's target-distance bias** | ⛔ **NOT a new batch — duplicate of `P25_SCORING_STACK_PRESTUDY` FIX-3 (2026-07-13).** The §1c identity stands as **evidence ON FIX-3**. |
| **The model's entry-notional fee convention** (≤6 bps) | rule-24 outcome (2); a scope call about which basis the model carries |
| **Any `min_rr` change** | reorg-B2.3's floors are calibrated per strategy; nothing here justifies moving one |
| **A maximum hold** | ✅ **Kyle's decision: none.** Langston states plainly he does not have the 72-hour evidence. |
| **xStock ceilings** | ⛔ `c` is class-dependent and there are zero xStock rows (§1c) — **underived, does not ship** |

---

## 5. WHAT THIS BATCH NOW CHANGES, IN ORDER

1. ✅ **SEVEN crypto reachability ceilings replace one** — as a **policy tightening with a measured lower bound**, plus the `expectancy.ts` change that makes them readable at all and the fail-closed unknown-token floor. ⛔ **`vwap_pullback` and all xStock rows do NOT ship.**
2. ✅ **Two existing findings get USED instead of re-measured**, each carrying its fee era.
3. ✅ **THREE record defects get NAMED, and the MEMBERS are listed because a count is not a set:** **(i)** the **id-space split** between `vts_open_trades` and `exit_strategy_alternates`; **(ii)** the **archive stage split** (probability at `pre_filter`, geometry at `sqe`/`admitted`); **(iii)** **`realDiAtOpen` NULL on all 3,685 rows.** ⚠️ **The excursion record is NOT one of these three** — it is `B-EXCURSION-RECORD` (§4), a separate batch, and r10 wrongly imported it into this set while dropping the archive split.
4. ✅ **Two governed artifacts carrying withdrawn claims get CORRECTED.**
⛔ **WHAT IS NO LONGER HERE:** the target re-derivation (→ `B-EXCURSION-RECORD`), the paper-only reachability release (already simulated 4,675×), and `B-EV-TARGET-PROBABILITY` (duplicate of P25 FIX-3).

✅ **It changes live configuration on the first objective.** ⛔ **It does NOT change live admission behaviour to gather data that already exists — which is the error Kyle caught.**

⚠️ **THE LIMITS, STATED:** all hold figures are **VTS**, which books exits at the mark and has no maker fill-probability model, so it is a **horizon** instrument and not a P&L one. `vwap_pullback`'s 40.97 h median rests on **n=580** and is the one row most likely to move. And the paper corpus remains **n=29–58** — it is not the basis for anything here.

---

## 6. EVIDENCE INDEX

| claim | object | population | read |
|---|---|---|---|
| realised hold per strategy | `vts_open_trades`, closed | crypto_spot, opened_at >= 2026-08-01, **n=28,020** | 2026-09-12 |
| gate verdict distribution | `vts_open_trades.context.vtsGateVerdict` | same, verdict-bearing **n=2,428 (8.7 %)** | 2026-09-12 |
| `strong_bull_trend` geometry 6.000/3.000 ATR | `vts_open_trades` + the two seeded DB rows | **4,717 rows, 4,675 closed**, from 2026-05-10 | 2026-09-12 |
| corpora unjoinable | `vts_open_trades` vs `exit_strategy_alternates` | 200 sampled ids, **0 matched**; control 0 in `closed_trades` | 2026-09-12 |
| excursion columns exist and are empty | `shared/schema.ts:734-735`, `:1237-1238` | `trades`, `paper_trades` — **0 rows each**; control 0 for `symbol` | 2026-09-12 |
| the reach read site is class-keyed | `expectancy.ts:205/206/211` | whole-tree: **no other read site** | at the ref |
| per-class keying is a stated design | `signal-target-normalizer.ts:24-29` | verbatim | at the ref |
| maker share | `vts_open_trades.chosen_entry_mode` | crypto **716/3,938 = 18.2 %**; xStock **19/2,072 = 0.92 %, PRE-REBATE ERA** | 2026-09-12 |
| `diAtOpen` sentinel | `vts_open_trades` | **4,733 of 32,084 = 14.8 %** exactly 50 | 2026-09-12 |

⚠️ **RECONCILIATIONS OWED BEFORE ANY VALUE SHIPS** (OBJ-A verification (d)/(e)): the ten strategy rows sum to **27,942** against a stated **28,020**; the verdict-bearing subset is **8.7 %** and its representativeness is unestablished (`#596`); **ten rows cover nineteen strategies** (`#648`).
