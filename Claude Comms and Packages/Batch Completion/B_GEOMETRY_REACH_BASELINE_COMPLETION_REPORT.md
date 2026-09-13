# B-GEOMETRY-REACH-BASELINE — COMPLETION REPORT

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 · **Owner:** CC-B
**change-class: architecture** · **2026-09-13**
**Deployed:** `022fd27ada7fc149ec910adeb5d9ea92a971a29f` · **window opens 2026-09-13T05:33:17.640Z** (pm2 `pm_uptime`)
**CI:** run `34740307488`, **4/4 per job** — TypeScript Check (baseline gate) · Test Suite · Build · Docker Build
**Reviews:** Step-1 APPROVED `d174ed7a9` · Step-2 APPROVED-WITH-CONDITIONS · Step-4 APPROVED `5ab4748c6` · Step-8 CONFIRMED `022fd27ad`

---

## ✅ CLOSED 2026-09-13 — AND THE ROW THAT BLOCKED IT IS DISCHARGED, WITH THE READ-BACK RECORDED

⛔ **THIS SECTION READ *"NOT YET CLOSED"* UNTIL 07:17:55Z.** `Langston's /home/langston/MEMORY.md` is a REQUIRED Tier-1 row in every change class and cannot take `N/A`; `langston-memory-write` **REFUSED** the write because `MEMORY.md` had been written **outside the composer**. I did not force it.
- **CAUSE, MEASURED:** the part was untouched (`976948ee`); the composed file carried **one inserted line at 52, 1,373 B** — Langston's own *"8c HOLD, REASON 3 — STRUCK"* retraction, written into the composed file rather than the part. Stamp-stripped diff `51a52`, 2 diff lines. **Three sessions' figures matched exactly.**
- ✅ **DISCHARGED:** Infra Claude reconciled the part at **07:17:55Z**, merging that retraction **verbatim** at line 52. My write then landed — part `cae023ef→df6a5fe7`, `MEMORY.md` `ef964018→57601171`, **retractions 10→10 and ledger bullets 26→26, exactly the 0/0 deltas I declared.**
- ✅ **READ BACK AGAINST LANGSTON'S OWN TWO CONDITIONS, not the tool's success line:** **(1)** `strip_stamp(MEMORY.md)` ≡ `00-legacy.md` **byte-for-byte by `cmp`**; **(2)** the retraction present at part line 52, verbatim; and my block present.
- ⚠️ **AND THE THING A CLEAN WRITE WOULD HIDE: his `MEMORY.md` is now 76,573 B against a 24,576 B cap — over by 51,997.** My addition is 2,622 B of that and the overage is **Infra's `#946`**, not this batch's doing. **Recorded because *"the write succeeded"* and *"the file is healthy"* are different statements and only one is true.**
✅ **Every other Tier-1 and Tier-2 row landed at `cf535acb2`, filled ledger in that commit message.** **Step 11 CONFIRMED by Langston.**

---

## 1. WHAT THE BATCH WAS FOR, AND WHAT IT ACTUALLY DELIVERED

**THE PROBLEM AS SCOPED.** `expectancy_gates.reach_atr_max` had exactly TWO rows (crypto 4.0 / xStock 4.0). The bound is `c·√H` — a **holding-horizon statement** — and crypto median holds run from 1.8 h to 15.4 h per strategy, so one ceiling was serving ten materially different horizons.

**THE STRUCTURAL DEFECT FOUND AT STEP 2, WHICH CHANGED THE BATCH.** `expectancy.ts` hardcoded `strategy:'*'` in the key it read `reach_atr_max` with, and that was **the only read site tree-wide** ⇒ **seeding a per-strategy reach row was a NO-OP.** The batch was scoped as a calibration; it was really a code fix wearing a calibration's clothes.

⛔⛔ **AND THE CALIBRATION LEG SHIPPED ZERO ROWS. THE REFUSAL IS THIS BATCH'S PRINCIPAL RESULT.**

---

## 2. OBJECTIVES

| # | objective | verdict | evidence |
|---|---|---|---|
| **OBJ-A.1** | `reach_atr_max` resolves per-(strategy × class) | ✅ **YES** | `expectancy.ts` — one canonicalization feeds BOTH floors; `_resolvePerStrategyMinRR` DELETED (rule 18, `DELETED_COMPONENTS_LOG`). 36 unit cases. |
| **OBJ-A.2** | fail-closed `reach_atr_max_unknown_floor` on the full key set | ✅ **YES** | 3 rows (crypto / xStock / global) at 4.0, read back at the DB post-deploy. Migration invariant loops **data-derived** classes + a global relationship; **4 arms mutation-proved** against live staging in a rolled-back transaction. |
| **OBJ-A.3** | seed the per-strategy tightening rows | ⛔ **NO — REFUSED, and this is the finding** | Blast radius measured (§3). Per-strategy `reach_atr_max` count = **0**, verified at the DB. |
| **OBJ-A.4** | rewrite `signal-target-normalizer.ts:24-29` in the same commit | ✅ **YES** | Docstring described reachability as per-CLASS **by design**; shipping the code without it would have left a comment describing the opposite of the shipped behaviour. |
| **OBJ-B** | read the existing fee findings rather than re-deriving them | ✅ **YES** | Discharged at Step 2 (`..._OBJ1_AUDIT.md`), Kyle's own objection. |
| **OBJ-C** | name the record defects, fix none here | ✅ **YES** | Three named, members listed, all carried to 2.4g-4. |
| **OBJ-D** | correct the governed artifacts carrying withdrawn claims | ✅ **YES** | Class greps with positive controls; the surviving hits are inside their own withdrawal banners. |
| **OBJ-E** | governance | ⚠️ **PARTIAL** | All rows but Langston's memory — see the blocked row above. |

---

## 3. THE FINDING THAT REFUSED OBJ-A.3 — `atrsToTarget` IS A SPIKE ON A CONSTANT, NOT A DISTRIBUTION

**MEASURED, crypto shadow lane, 27,370 rows since 2026-08-01.** Every multiplier-derived strategy computes `targetPrice = entryPrice + target_exit_atr_multiplier × effectiveATR`, so **`atrsToTarget` IS that multiplier** × (effectiveATR / rawATR) — which is the entire source of the ±0.01 spread.

| strategy | p90−p10 of `atrsToTarget` | modal share |
|---|---|---|
| `morning_star` | **0.001** | 84.62 % on exactly 2.500 |
| `support_bounce` | 0.002 | 80.00 % on 2.000 |
| `inside_bar_reversal` | 0.008 | 62.55 % |
| `volatility_edge` | 0.008 | 74.79 % |

⇒ ⛔ **THE CEILING IS A KNIFE EDGE: above the spike it refuses nothing, below it the strategy is OFF, and there is no intermediate regime because there is nothing in between.**

**NEWLY-REFUSED SHARE at the derived ceilings** — the number Langston's CONDITION-1 demanded before shipping, and the one that decided the batch:

| strategy | ceiling | newly refused |
|---|---|---|
| `inside_bar_reversal` | 2.36 | ⛔ **95.32 %** (509 / 534) |
| `sma_trend_ride` | 1.97 | ⛔ **57.49 %** (783 / 1,362) |
| `pivot_shift` | 2.72 | ⛔ **55.43 %** (240 / 433) |
| `morning_star` | 2.52 | ⚠️ 0.64 % — **not safety: 0.02 ATR above a spike holding 84.62 % of its signals** |

⛔⛔ **TWO REFUSAL REASONS, RECORDED SEPARATELY — merging them would plant a false citation.**
- **REASON A — redundant re-encoding** (`morning_star`, `inside_bar_reversal`, `pivot_shift`): the ceiling and `target_exit_atr_multiplier` are **the same knob**.
- **REASON B — a live throttle on a genuinely continuous distribution** (`sma_trend_ride`): it has **NO ATR term** (`strategy-engine.ts:520-533`); 560 distinct values, **p90−p10 = 2.991**. Its levers are `break_target_r_multiple` / `trailing_strength_factor`. ⚠️ **Reason A does not apply to it.**

✅ **AND IT EXPLAINS THE OBSERVATION THE BATCH STARTED FROM:** `strong_bull_trend` declares **6.0** against a 4.0 ceiling ⇒ **0 passed of 298,731 evaluations, 293,871 `Target Unreachable`** (live Reachability Gate panel). **Categorically off, not occasionally unreachable — and nobody decided that.** Homed at **2.4g-5 `B-TARGET-MULTIPLE-VS-HORIZON`, owner Kyle (decider), gated on 2.4g-3.**

---

## 4. METHOD WORTH REUSING

1. ⭐ **THE LANE ARBITER WAS PRE-REGISTERED IN ITS OWN COMMIT** (`d2c0fd65e`) **and resolved in the next** (`07d3bc705`). **The commit boundary is what makes "pre-registered" checkable** rather than a description of intent.
2. ⛔ **`vts_open_trades` IS TWO POPULATIONS** — reorg-B4's shadow lane (27,370 crypto rows since 08-01) and the VTS learning lane (2,503) — **and the predicate was missing from every revision before Langston's blocker.** Both discriminators agree on 29,873 of 29,873.
3. **`H` IS TAKEN AS A MEDIAN, NEVER A MEAN:** both lanes are right-censored at **different** TTL walls (shadow 48 h, VTS 168 h, set by `max_hold_switch`: `enabled_vts` TRUE / paper+live FALSE). The median survives; the mean is a statistic the TTL chose.

---

## 5. HONEST RESIDUAL — WHAT THIS BATCH DID **NOT** ESTABLISH

- ⚠️ **THE FAIL-CLOSED PATH IS UNEXERCISED IN PRODUCTION.** It requires a drifted token, which should never occur. **36 unit cases cover it; its live silence is NOT evidence and may not be cited as such.**
- ⚠️ **THE `gateConstantsVersion` VERIFICATION IS A *PARTIAL*, AND ITS REACH IS FALLING.** 114 of 45,879 post-restart rows = **0.248 %**, against 0.272 % nine minutes earlier — **denominator +33 %, numerator +21 %.** ⛔ **Waiting does not discharge it.** What would: a post-restart observation of **`reverse_impulse`** (`99a40535`, 165 pre / 0 post), **or** a ceiling ship moving a resolved value **off `826db698`**.
- ⚠️ **THE `√H` FORM ITSELF IS UNRULED** — `INFERRED-FROM-CODE-AND-FORM`, exactly as `4.0` is. Langston checked its **consistency**, not its **merit**. The four rows would have tightened under any monotone scaling, so it did not block; it must not firm up by repetition.
- ⛔ **THE MIGRATION'S NULL ARM IS LABELLED UNPROVED-BY-MUTATION IN THE FILE.** Two mutants that appeared to prove it were caught by an earlier count check and never reached the arm. **It ships as defence in depth behind two stronger checks. A later session may not quietly promote it.**
- ⛔ **RATCHET (`PHASE_19_PLAN` 2.4g-3):** the four refused ceilings **may not be re-derived from post-deploy holds until realised-excursion data exists** — `H` is endogenous to the gate, and the gate applies to the VTS learning lane too, so there is no untouched population to appeal to.

---

## 6. GOVERNANCE FILES CHANGED — TRANSCRIBED FROM THE STEP-10 TIER LEDGER AT `cf535acb2`, NOT FROM MEMORY

**CHANGE-CLASS: architecture**

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Entry leads with the REFUSAL, not the ship. |
| T1 | `PHASE_HISTORY.md` | ✅ | What Phase 19 gained, what it learned, the sequencing consequence. |
| T1 | `PHASE_19_PLAN.md` | ✅ | 2.4g-2 status; 2.4g-3 / -4 / -5 PLACED; ratchet into 2.4g-3; disk slope into 2.4f. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | ✅ | Shared: a pointer to the spike rule. Mine: position + hold discharged. |
| T1 | the batch `SCOPE` | ✅ | r15 — part 3 seeds ZERO, both reasons, floor bound to the shipped set. |
| T1 | the batch `PRE_AUDIT` | ✅ | r10 — verification record, log evidence struck, hash instrument PARTIAL. |
| T1 | `COMPLETION_REPORT` | ✅ | This file. |
| T1 | the four session task lists | ✅ mine / N/A ×3 | Mine RENAMED to `CC_B_SESSION_TASK_LIST.md` with the OPEN-AND-STALLED lead; the other three are not mine to touch. |
| T1 | **Langston's `MEMORY.md`** | ✅ | Landed 07:17:55Z after Infra Claude reconciled the part; read back against both of Langston's conditions. **Was BLOCKED — see the banner; a required row was never allowed to take `N/A`.** |
| T2 | `SYSTEM_MANUAL.md` | ✅ | "reach stays per-class" SUPERSEDED in place + a subsection carrying the spike finding. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Gate entry: both floors from one canonicalization, the new row, and that the counter counts GATE CALLS. |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1052` zero-rows outcome + the pre-registered false positive. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | The §8 #10 fix, with its residual risk stated. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | ✅ | New standing rule: measure a geometry threshold's blast radius, and check the gated quantity is distributed at all. |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | `_resolvePerStrategyMinRR`, blast radius verified at the KEYS. |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | `summary-not-object` filed, n=3, marked not-a-guard. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | The three new items are phase-plan rows under 2.4g, not roadmap entries. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | The diff changes one resolver and three DB rows. |
| T2 | `STORAGE_POLICY.md` | N/A | The migration writes `module_constants` only — no table, tier or retention. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | Crypto-only; zero xStock ceilings, no threshold-table population changed. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | No asset class onboarded. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | No role, gate or method changed; whether the pre-registration technique is a METHOD change is Langston's call, not mine to assert. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | No model, runtime, invocation, read path or file of his changed. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable rule changed — the new rule is parameter-adjustment governance. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | Follows the row above. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | None requested or granted. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | Process unchanged; I acked nothing and resolved nothing. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | Columns/fields/ownership unchanged — I moved a card through them. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | The daily check is CC-A's and ran this morning. |

---

## 7. FINDINGS OUTSIDE SCOPE — EACH WITH ITS DISPOSITION

| finding | disposition |
|---|---|
| `strong_bull_trend`: **0 passed of 298,731** — categorically off | **2.4g-5 `B-TARGET-MULTIPLE-VS-HORIZON`**, owner **Kyle (decider)** + CC-B on the options paper, gated on 2.4g-3. Bug-taxonomy outcome **(2)**. |
| xStock **shadow** writer stamps `atrAtOpen = 0` on **1,029 of 1,029** rows (crypto clean at 0 of 29,873) | **2.4g-4 `B-TRADE-RECORD-JOINABILITY`**, writer class, member (iv). |
| `weekend_suspended` is a **non-terminal** xStock row class (113 rows) | **2.4g-3** + named at 2.4g-4. |
| The composed-memory stamp's `body-sha` detects **part drift only** and is blind to out-of-band writes to the composed file | **`B-MEMORY-STAMP-REACH`**, owner **Infra Claude** — row text handed over; placement theirs. |
| Session task-list estate inconsistent (CC-C's in `Scope Files/`, Infra's in both folders) | **CC-A's open `B-TASK-LIST-SLOT`** (row 4.57) — reported, not touched. |
| Shared `MEMORY.md` has **11 bytes** of headroom, so a REQUIRED row now forces a prune every batch | Flagged to the crew; structural, not mine to solve unilaterally. |

---

## 8. NUMERIC DELTAS

> **PREVIOUSLY STATED:** seven crypto tightening rows ship. **NOW:** **zero.** **REASON:** blast radius measured at Langston's CONDITION-1 — three of four would have refused 55–95 % of their strategy's signals, and the fourth was a hair-trigger.
> **PREVIOUSLY STATED:** the window opens at 05:33:27Z. **NOW:** **05:33:17.640Z.** **REASON:** that was dt-deploy's post-check stamp, not the restart; pm2 `pm_uptime` is the restart.
> **PREVIOUSLY STATED:** database at 65.3 % of cap. **NOW:** **65.82 %, 132 GB, measured live** (Langston independently 131.67 GB / 65.83 %). **REASON:** the alert body is frozen at its 09-11 mint and replays on resurface; the number that row needs is the **slope, +1.07 GB / ~2 days**.
