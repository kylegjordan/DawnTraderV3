# B-REGIME-INPUTS-LIVE — COMPLETION REPORT (RETROACTIVE — written 2026-09-02, 44 days after the code shipped; NOT back-dated)

**Batch:** `B-REGIME-INPUTS-LIVE` · **Closes:** #543 + #538 (jointly, per OBJ-0) · **Implementer:** CC-A (Claude Old), Steps 1–4 and the deploy, 2026-07-19 → 07-20 · **Closer:** CC-B (Claude New), Steps 10–11, at Kyle's direction 2026-09-02 after Claude Old confirmed it was *finished-but-ungoverned* and Kyle transferred the close · **change-class:** `architecture` (declared in the scope header 2026-07-19; stands — the diff is `server/core` signal-pipeline math)

---

## ⛔ READ THIS FIRST — WHAT THIS DOCUMENT IS AND IS NOT

This is a **retroactive** completion report. The code shipped on 2026-07-20 in two commits, Langston reviewed it at the reference the same day, and it has been running on staging since. **Nobody wrote the closing record**, so the governance checker raised `8aa095a2` and re-surfaced it **23 times over 44 days** while it sat acknowledged. Every claim below is either (a) quoted from a dated record with a reference, or (b) **re-measured by CC-B on 2026-09-02** and labelled so. Nothing is reconstructed from memory.

## 1. WHAT THE BATCH WAS FOR

The RegimeWeight gate — one of only two SQE checks that can refuse a signal — scores a market on **trend strength (70%)** and **volatility (30%)**. Both inputs were placeholders: `trendStrength` was the literal `0.5` at three genesis sites and one refresh site, and `volatility` came from a cache with **no writer**, so its read fell through to the literal `0.015`. `0.5×0.70 + (1−0.015)×0.30 = 0.6455` — **every signal scored the same number and the gate had never refused one.** #543 (volatility) and #538 (trendStrength) are the two halves; OBJ-0 said they are fixed together or not at all, because fixing one leaves the score 70% pinned and *looking* alive.

## 2. WHAT SHIPPED — with references

| commit | date | what |
|---|---|---|
| `441296617` | 2026-07-19 | Step-1 scope (`B_REGIME_INPUTS_LIVE_SCOPE.md`) |
| `c763ba33c` → `c13ec7c89` | 2026-07-19/20 | Step-2 pre-audit; **amended post-approval by CC-A himself — the five-site table was wrong, there are eleven, three in shared math** |
| **`9ee4f1271`** | 2026-07-20 | *"route the RegimeWeight gate at the MCE + refuse-on-absence"* — new `server/core/metrics/regime-inputs.ts` (202 lines), `ready_to_buy_service.ts`, `score-calculator.ts`, `signal-orchestrator.ts`, 3 tests; 9 files, +533/−42 |
| **`6d22a9b63`** | 2026-07-20 | *"wire the RTB REFRESH path at the MCE — unpins the last 31/37"* — `ready_to_buy_service.ts` +57/−4 |

**Deployed:** both commits are ancestors of the sha running on staging at close (`2af2e0bac…`, verified `git merge-base --is-ancestor` 2026-09-02). **The SEAL leg — the refresh path's own regime-input computation — shipped the next day in the sibling batch `B-REGIME-REFRESH-PIPE`** (`86d39e00d`+`c4010f538`+`eaf0d98cf`, CC-A, closed 2026-07-21), whose completion report opens *"Follows / closes the gap exposed by: B-REGIME-INPUTS-LIVE (`6d22a9b63`)."*

## 3. LANGSTON'S REVIEW RECORD — it exists, and Claude Old's hand-over undersold it

Claude Old wrote on 2026-09-02: *"no Langston Step-4 record I can find."* **There is one, in the Discord log:**
- **2026-07-20 01:53 — Step-1/2 ruling:** *"all three come INTO B-REGIME-INPUTS-LIVE, not a paired batch — but the disposition is a loud guard, NOT removal … `score-calculator.ts:72` is non-negotiably in-scope."* Scope grew 5 → 11 sites on his ruling.
- **2026-07-20 17:58 — Step-4 APPROVED at ref `0d07b6a05`:** *"Verified at ref, not on the diff's own narration. All load-bearing citations hold … `getNormalizedVolatility` returns 0.015 on cache miss. Orphan confirmed. 0.5×0.70 + (1−0.015)×0.30 = 0.6455 — exact … `Number.isFinite` guard on both inputs; undefined → `{ok:false, reason:'missing_inputs'}` … **APPROVED at Step 4. Ship it.** Confirm SYSTEM_MANUAL/SIM get the regime-input-wiring content update at batch close, and OBJ-4 (retire `getVolatility`) has its named home before B-REGIME-INPUTS-LIVE is closed."*
- **2026-07-20 21:05 — second Step-4 read on the RTB wire diff:** *"Read the diff and the code at the ref myself … so this is my own re-derivation … agreed, ship (1). Consensus reached, proceed."*
- **2026-08-31 06:17 — his own live re-measurement** (§5 below).

## 4. OBJECTIVES — each graded against evidence, retroactively

| # | objective | verdict | evidence |
|---|---|---|---|
| **OBJ-0** | #543 + #538 fixed together | ✅ **YES** | both inputs re-routed in `9ee4f1271`; the distribution test (§5) can only pass if both moved — one pinned input caps distinct values at a handful |
| **OBJ-1** | route `volatility` at the MCE on both paths | ✅ **YES** | genesis: `signal-orchestrator.ts` three sites; refresh: `ready_to_buy_service.ts` via `acquireRefreshedInputs` (`6d22a9b63`); Langston's 07-20 17:58 read confirms *"Separation holds — gate reads `_regime.inputs?.volatility` directly"* |
| **OBJ-2** | route `trendStrength` at the MCE | ✅ **YES, with a STATED INTERIM** | the ADX→trendStrength mapping `min(1, adx/50)` was ruled **PROVISIONAL** by Langston at Step 1 (pre-audit §3 Q1: *"documented as PROVISIONAL"*), and re-confirmed by him 2026-08-31: *"a placeholder conversion formula that I approved as a deliberate interim, on the record … marked in the code as provisional and parked for the later calibration phase. That's a known deferral, not a gap."* **Home: Phase 25 (calibration)** — see §7 |
| **OBJ-3** | fail loud on a missing input; never substitute | ✅ **YES (code-verified), live fail-loud NOT exercised** | `calculateRegimeWeight` `Number.isFinite` guard → `{ok:false, reason:'missing_inputs'}`; refresh rejects on null (Langston 07-20 17:58, at the ref). ⚠️ **Verification criterion 3 (MCE absent ⇒ alarm) was never run live.** Residual, §6 |
| **OBJ-4** | retire the orphan (`volatilityCache`, `updateVolatilityData`, `return 0.015`) per rule 18 | ⛔ **NO — NOT DONE, and not homed until today** | **Measured at the ref 2026-09-02:** `market-metrics.ts` (81 lines) still holds all three (`:25`, `:33`, `:36`); `ready_to_buy_service.ts:74-76` still imports `getVolatility` with the comment *"now UNUSED by the gate and is OBJ-4's retirement target"*; **a live reader survives at `server/routes/dse.ts:56`** (`getVolatilityCache()` on `/dse/metrics-cache`) and `tests/integration/dynamic_sizing.test.ts:267-270`. `DELETED_COMPONENTS_LOG`: 0 mentions (control: the log lists 45 other archives). Langston's approval condition — *"OBJ-4 has its named home before this is closed"* — **was never met.** ⇒ **HOME, placed today: `B-VOLATILITY-CACHE-RETIRE`, owner CC-B, `PHASE_19_PLAN` §1 STATUS BOARD after `B-TEC-REGIME-PARAM-REMOVAL`** (§7) |
| **OBJ-5** | governance: SIM + System Manual content; close #543 + #538; amend the "70% inert" text | ⚠️ **PARTIAL until this report** | SIM/System Manual content for the **refresh** side landed via `B-REGIME-REFRESH-PIPE`'s close (`ac5233e28`, 2026-07-21: *"REPAIRED by B-REGIME-REFRESH-PIPE … follows B-REGIME-INPUTS-LIVE"*). **The `regime-inputs.ts` component had no SIM entry of its own, and the genesis-side wiring had no System Manual paragraph** — both added in this close's Step 10. #543/#538 dispositioned in this close |

## 5. THE PRE-REGISTERED VERIFICATION CRITERIA — graded

The scope pre-registered five criteria (*"a fix that cannot be faked"*). **Criterion 1 is the primary, and it was re-measured twice by two parties.**

**Criterion 1 — DISTRIBUTION TEST: ✅ PASS.** **Re-measured by CC-B, 2026-09-02, on the staging database.** Object: `closed_trades.metadata->>'regimeWeight'`. Population: every active-path closed trade since 2026-07-01 (`source_pool` not VTS — the VTS does not write this table at all, which is why my first "VTS control" returned 0 rows and was discarded as the wrong population; **the pre-fix era is the control, and it is the one the scope pre-registered**). Era boundary: `6d22a9b63`, 2026-07-20 ~22:00Z.

| era | class | trades | with a regimeWeight | **distinct values** | min | max | below the 0.30 floor |
|---|---|---|---|---|---|---|---|
| PRE-fix | crypto | 160 | 142 | **2** (`0.5`, `0.6455` — the two pinned constants) | 0.5 | 0.6455 | 0 |
| PRE-fix | xStock | 26 | 21 | **2** (same two) | 0.5 | 0.6455 | 0 |
| **POST-fix** | **crypto** | **273** | **273** | **273** | **0.3023** | **0.9998** | 0 |
| **POST-fix** | **xStock** | **229** | **221** | **211** | **0.3061** | **0.9982** | 0 |

*Langston's independent measurement, 2026-08-31 (different window, both classes pooled): "pre-fix 135 rows / 2 distinct; post-fix 501 admitted trades / 448 distinct regimeWeight, min 0.3022 vs a 0.3000 floor." Same shape, same conclusion.* **The two constants are gone; every admitted trade now carries its own score across the full range.**

**Criterion 2 — PROVE A REJECTION: ⛔ NOT MET, and not measurable from this table.** Rejected signals never become closed trades, so `below_floor = 0` here is *expected*, not evidence. The minimum admitted score sits **a hair above the floor and never below it** (0.3023 / 0.3061 vs 0.30), which is the shape of a gate that is *reading* the market — but a refusal has to be *observed* in the SQE rejection telemetry, and **as of 2026-08-10 none had been** (alert `f6ae5419`, CC-A: *"no genuine below-0.30 refresh rejection has been OBSERVED in-sample, all sampled ≥0.46"*). **This criterion is the standing VC-2 watch, owner CC-A, and it stays open there.** The batch is not held on it — Langston's 07-19 Q3 ruling: *"This batch makes that gate meetable; it does not lower it."*

**Criterion 3 — FAIL-LOUD with the MCE absent: ⚠️ code-verified at the ref (Langston 07-20), never exercised live.** Residual, §6.
**Criterion 4 — UI (§9.3) rejections visible: ⛔ NOT DONE** — no rejection has occurred to show. Follows criterion 2.
**Criterion 5 — NO SILENT VOLUME COLLAPSE: ✅ PASS by the same query.** 273 crypto + 229 xStock trades closed post-fix in the window; volume did not go to ~zero.

## 6. HONEST RESIDUAL — what this batch did not establish
- **No refusal by the gate has been observed.** Criterion 2 lives on as VC-2 (`f6ae5419`, CC-A).
- **The fail-loud path was proven by reading the guard, not by starving the MCE live.**
- **OBJ-4 is undone**: the orphan cache, its writer and the `0.015` fallback are still in the tree with one live diagnostics reader. Homed today, not fixed today.
- **The ADX→trendStrength mapping is a stated interim** (Phase 25).
- ⚠️ **A `metadata.regimeWeight ?? 0.5` survives at `ready_to_buy_service.ts:1014`** on the batch-refresh path. It feeds `acquireRefreshedInputs`, which **recomputes** the regime weight live from MCE inputs, so on a read of the code it is an input to a recompute rather than a gate value — **stated as a HYPOTHESIS, not a finding** (rule 24); it is checked in `B-VOLATILITY-CACHE-RETIRE`'s pre-audit as a sibling of the `?? 0.5` family this batch existed to kill.

## 7. §9.4 — every deferral has a name and a place
| item | disposition |
|---|---|
| OBJ-4 orphan retirement | **own batch — `B-VOLATILITY-CACHE-RETIRE`, CC-B, `PHASE_19_PLAN` §1 STATUS BOARD, directly after `B-TEC-REGIME-PARAM-REMOVAL` (moved there from governance-queue row 2.10 on Kyle's instruction, 2026-09-02 — it is a code deletion, not governance).** ⚠️ **Langston's Step-11 census corrections (2026-09-02) are on the plan row: a second, MUTATING route site `routes/dse.ts:78` `clearVolatilityCache()`; a third orphan limb `getVolatilityClassification` needing an explicit disposition; test refs split subject-vs-probe.** Step 11 CONFIRMED by Langston 19:30 at `211e1e9d4`. Rule 18: delete on the spot **after** the blast-radius pass (`/dse/metrics-cache` reader, the integration test), log in `DELETED_COMPONENTS_LOG`, archive `.removed` |
| ADX→trendStrength interim | **Phase 25 calibration** — already Langston's ruling; recorded on #538 |
| VC-2, one observed rejection | **stays with CC-A** as alert `f6ae5419` / the `B-REGIME-REFRESH-PIPE` post-close watch |
| live fail-loud exercise | **folded into `B-VOLATILITY-CACHE-RETIRE`** — its pre-audit starves the MCE in the rig and observes the reject, since it touches the same file |

## 8. THE TIER LEDGER — `CHANGE-CLASS: architecture`
Transcribed into this report from the Step-10 governance commit for this close (see that commit body); required set under `architecture` = scope · pre-audit · completion report · `BATCH_CATALOG` · `PHASE_HISTORY` · `SYSTEM_MANUAL` · `SYSTEM_IMPACT_MAP`.

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | row added at this close (was absent 44 days) |
| T1 | `PHASE_HISTORY.md` | ✅ | Phase 19 entry added at this close |
| T1 | `PHASE_19_PLAN.md` | ✅ | `B-VOLATILITY-CACHE-RETIRE` placed at 2.10 |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | ✅ | own file: close recorded, new batch noted |
| T1 | batch SCOPE | ✅ | on file since 07-19 (`441296617`) |
| T1 | batch PRE_AUDIT | ✅ | on file since 07-19, amended 07-20 (`c13ec7c89`) |
| T1 | COMPLETION_REPORT | ✅ | this document, labelled retroactive |
| T1 | Langston's `MEMORY.md` | ✅ | close recorded in his file at this close |
| T2 | `SYSTEM_MANUAL.md` | ✅ | genesis-side regime-input wiring paragraph added (the refresh side was already there via REFRESH-PIPE) |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | `regime-inputs.ts` component entry added (it had none) |
| T2 | `RUNNING_ISSUES.md` | ✅ | #543 + #538 RESOLVED citing §5; #546 untouched (the wider `?? 0.5` family, its own item) |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | FIX entry for the pinned-gate defect |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | nothing deleted — OBJ-4 was NOT done; its deletion is `B-VOLATILITY-CACHE-RETIRE`'s |
| T2 | `MISTAKE_PATTERNS.md` | N/A | no `MISTAKE:` trailer on this close |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | no exception; the batch was never declared open |
| T2 | every other row | N/A | no roadmap, adjustment-framework, storage, onboarding, playbook, reviewer-build, rules-file or protocol content in the diff |

## 9. HOW IT WENT UNGOVERNED FOR 44 DAYS — recorded because it is the reusable part
CC-A acknowledged `8aa095a2` two hours after it first fired and never resolved it. **An acknowledgement claims an alert and suppresses a fresh one on the same key**, so for 44 days the checker could only nag through the re-surface path — 23 times, routed to CC-A on 15 of them, escalated to Kyle once (2026-08-17). Langston, 2026-08-31: *"Acknowledging is not the same as fixing … claiming an alarm should never be a way to quiet it."* That behaviour is the subject of `B-ALERT-ACTOR-ALLOWLIST` (#987) and #642.
