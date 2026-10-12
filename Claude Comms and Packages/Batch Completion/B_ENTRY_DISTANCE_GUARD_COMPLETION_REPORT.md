# B-ENTRY-DISTANCE-GUARD — Completion Report (row 59 increment 1) — ✅ CLOSED 2026-10-12 (Langston Step-11 CONFIRMED)

**Owner:** CC-B (NEW Claude) · **change-class:** `architecture` · **Sprint plan row:** 59 `B-ENTRY-LEVEL-RECHECK`, increment 1, pre-sprint P1a · **Issues:** `#915` (closed here), `#1168` (its dead-on-arrival half closed here; the frozen-levels half stays in row 59)
**Scope / pre-audit:** `Claude Comms and Packages/Scope Files/B_ENTRY_DISTANCE_GUARD_SCOPE.md` r1, `…_PRE_AUDIT.md` r2 · **Change list:** `Change Lists/B_ENTRY_DISTANCE_GUARD_STEP4_CHANGE_LIST.md` (r1 + r2)
**Code:** `c285745e9` (Step 3) → `42f56e063` (Step-4 r2) → `fdcaff411` (the r2 condition) · **CI:** run `38101871492` at the deployed `a52f16a52`, 4/4 green per job (TypeScript Check, Test Suite, Build, Docker Build) · **Deployed:** `a52f16a5263fd146cfe8f5cbad961d67b9cf28b7`, 2026-10-11T01:30:39Z (`pm_uptime` 01:30:29Z). The running tree since 2026-10-12 00:42Z is CC-C's `78f62ed01`, in which the row-59 block is byte-identical (Langston, Step 8).

> ⚠️ **TWO SCOPE OBJECTIVES ARE NOT DONE IN THIS INCREMENT, BOTH HELD BY LANGSTON AT STEP 2 AND HOMED:**
> - **OBJ-3, the shadow distance band** — its ATR input is absent on every xStock open (0 of 117) → `B-ENTRY-BAND-SHADOW`, `#1186`, owner CC-B, row **59c**, after 59b. Closing condition: the band line on every taker open with its inputs logged separately and the leg refused when ATR is absent. Failure condition: a band computed from a missing ATR as zero.
> - **OBJ-4, no fabricated target** — the 2 % default exists at three sites, not one → `B-NO-TARGET-FAIL-CLOSED`, `#1187`, owner CC-B, row **59d**, after 59c. Closing condition: all three fail closed together. Failure condition: any one copy left in place.

## 1. What it was for
The active open bought at whatever the market offered and never compared that price with the trade's own plan. So a trade could open already at or past its stop: four post-reset xStocks (STZ, CEG, INTC, CRCL) opened below their stops and closed within a second (`#1168`), and 7 of 295 crypto `stop_hit` closes had the stop at or above the entry, each born passing the safety check, with only the fill moving it (`#915`). The batch makes the open check the price it actually got.

## 2. What shipped
| item | change |
|---|---|
| the refusal (live) | `active-execution-engine.ts`, the taker branch of `executeSimulatedTrade`: `refuseTakerBooking(fill, stop, target)` straight after the fill, before any write; a refusal logs `[ENTRY_GEOMETRY][REFUSED]`, records `ENTRY_GEOMETRY`, writes a `signal_eval_archive` row (`reject_stage='entry_fill'`) and returns `{opened:false}` like its three sibling refusals |
| the shadow measurement | the floor read once per taker open through `getPerClassTargetGate` before the fill, inside a catch (`floor_unresolved` on a throw — the open proceeds and is counted); `entryFillShadow()` in `server/core/trading/entry-booking.ts`; the `[ENTRY_GEOMETRY][SHADOW]` line; the same keys durably on both archive rows, and `entryArm` on every admitted row |
| the stage | `ENTRY_GEOMETRY` in `OpenFailStage` and its zero-init list (`rtb-metrics-service.ts`); `'entry_fill'` in `RejectStage` (`signal-eval-archiver.ts`) |
| tests | `server/tests/unit/b-entry-distance-guard.test.ts` (20): six replays from the post-reset window (STZ, CEG, INTC, CRCL ⇒ `ask_at_or_through_stop`; ANET, BBY ⇒ `ask_at_or_through_target`), the inside case, the knife-edge shadow case, the floor-null and below-stop cases, the `morning_star` case, source fences on ordering and on the archive rows. Mutants: the call removed ⇒ 2 fail; the stage reverted ⇒ 1 fail. at r2, 43 engine/archiver test files: 696 pass; tsc baseline 337 = 337. Re-run 2026-10-12 on the fence file: 20 of 20 pass |

## 3. Objectives
| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | LIVE — a taker open at or through its stop or target is refused, both classes, through the shared primitive | **YES** (code + tests); **live refusal UNEXERCISED** | the replays and the mutant; on staging the first taker open after the deploy (CLSK/USD xStock, 2026-10-12 06:22:10Z) was strictly inside its levels and admitted. With zero refusals the refusal leg is unmeasurable live, not "none observed" |
| 2 | reward-to-risk at the fill vs the live `min_rr` — LIVE only if the pre-registered read passed, otherwise SHADOW | **YES — SHADOW, by its own rule** | Step 2 §1.2: rule (a) fails (≈0.017 R headroom on the constant-RR cells against a ≈0.57 R p90 slip), rule (b) 7 of 24 crypto and 31 of 104 xStock would refuse. Staging: `rr_fill=2.3349 floor=1.95 adverse_r=-0.1004 would_refuse=false` on CLSK; the archive row carries all nine keys; the floor resolved per strategy (`sma_trend_ride` 1.95, against the class wildcard 2.0) |
| 3 | SHADOW — the distance band | **NO** | held at Step 2 (BLOCKER-2); homed `#1186`, row 59c |
| 4 | no fabricated target at promotion | **NO** | held at Step 2 (BLOCKER-1, three copies); homed `#1187`, row 59d |
| 5 | every refusal visible and durable | **YES** (wiring) | the stage and the `entry_fill` archive row in code and tests; `/api/diagnostics/rtb-metrics` returns `ENTRY_GEOMETRY: 0` — **the zero-initialised slot, which proves the wiring and nothing about refusals** (Langston); `attempts 4 = opened 1 + blocked 0 + openFailed 3` (`#325` invariant) |
| 6 | documented | **YES** | System Manual and System Impact Map (§7) |

## 4. Reviews
- **Step 1:** PROCEED (Langston), five findings carried into Step 2.
- **Step 2:** PROCEED on the audit, two plan blockers (items 3 and 4 held), three corrections, one finding (the two checks catch disjoint trades); homes `#1183` (59a) and `#1184` (59b).
- **Step 4:** CHANGES-NEEDED, bounded (a durable sink for the shadow; the refusal row's own stage) → r2 → APPROVED with one condition (`entryArm`, the realised arm, on every admitted row) → `fdcaff411`.
- **Step 7:** CC-B, `Scope Files/RELEASE_DEPLOY_2026-10-10_CCB_EVENING.md` "Row 59 Step 7" — the first taker open waited a day because all 20 slots were held from 2026-10-10 16:00Z until the xStock reopen let a position close.
- **Step 11:** **CONFIRMED** by Langston 2026-10-12, re-derived (per-job CI, the commit chain, the block's byte identity — 18 hunks above it, not 19 — the four call sites, the 20 tests, the N/A rows against the class matrix). Two record findings folded at the close: the parity magnitude in the System Manual now carries its population, and two bare file names in this report carry their paths. A third — the plan-line checker does not enrol row 59 — is OLD Claude's to place with Langston.
- **Step 8:** **CONFIRMED** by Langston 2026-10-12, re-derived: the shadow line byte-exact, the only `[ENTRY_GEOMETRY]` line since 05:57:06Z; the arithmetic recomputed from the four prices; the archive row the only engine admit row since the deploy; the fill equal to the best ask of a real two-sided book (0.1874 % spread, 11 quotes in six minutes); the plan 5 h 06 m old at the fill; the slot freed by DRV/USD's stop 62 s before.

## 5. Numeric corrections
- **PREVIOUSLY STATED** (scope §0): "6 of 160 crypto `stop_hit` closes". **NOW:** 7 of 295. **REASON:** Langston's re-measure at Step 1 on a later read time.
- **PREVIOUSLY STATED** (my Step-8 dispatch): "row 59's files unchanged since `a52f16a52`". **NOW:** the engine file changed (CC-C's `78f62ed01`, 19 hunks above line 4646); the row-59 block is byte-identical. **REASON:** identity stated at the file instead of the block.

## 6. New findings / dispositions
- **The parity direction.** Paper now refuses after the fill what live mode cannot (a live taker order has filled when its price is known), removing from the record, on W1's taker opens, 13 of 117 xStock (11 `stop_hit`, 2 `target_hit`) and 0 of 24 crypto; over all closes since 2026-07-15 the stop side is crypto 7 of 296 and xStock 12 of 287 (Langston, Step 11). An interim until a pre-order check — `#1186`. Recorded in the System Manual; the paper standard rules `ENTRY_GEOMETRY` (b2) (`Claude Comms and Packages/Scope Files/PAPER_STANDARD_PROPOSAL.md` r13, `#1083` amendment 6).
- **`gate_decision.schema_version` (Langston's Step-4 record note, corrected).** The note said the decision record carries no version stamp. It does: `{ schema_version: 1, … }` since B70 (`0dc7c470b`, `server/services/data-archive/signal-eval-archiver.ts:375`), measured on 105,967 of 105,967 rows in an hour. His point stands: a constant stamp cannot mark the deploy boundary, so the promotion read filters on `entryArm`'s presence or on `captured_at`.
- **§9.4 disposition 5 — no work, withdrawn (Langston, Step 8):** `closed_trades.intended_entry_price` NULL on the open CLSK row is written at close (`active-execution-engine.ts:4470`); the open writes it to `active_open_positions` (present, 10.70136).

## 7. Governance ledger
CHANGE-CLASS: architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry, at Step 11 |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 59) | ✅ | increment 1 CLOSED with this report in the report column; rows 59c and 59d placed. ⚠️ **The plan-line checker does not grade this row** (it enrols on the batch cell, which holds the umbrella `B-ENTRY-LEVEL-RECHECK`); its currency rests on Langston's read of the row at Step 11 (his Step-11 FINDING 1, §9.4 disposition 2 into OLD Claude's plan-currency work, placed by OLD Claude with Langston) |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the row is sprint row 59 (its Phase-19 origin 3n.u2 is closed into it) |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ mine / N/A shared | mine: position |
| T1 | the batch SCOPE | ✅ | r1, with Langston's Step-1 findings |
| T1 | the batch PRE_AUDIT | ✅ | r2, the pre-registration and the audit |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B: row 59 at Step 11; 59c and 59d added |
| T1 | Langston's MEMORY.md | ✅ | written by Langston with his Step-11 confirm, 2026-10-12 |
| T2 | SYSTEM_MANUAL.md | ✅ | §5 Cost Model: "WHAT THE ACTIVE OPEN CHECKS AT THE FILL" — what it refuses, what it only logs and why, the parity direction, how to read the data |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | §6.1: the fill-time checks, the primitive's fourth caller, the new stage and reject stage, the per-open gate call, the invariant `riskAmount` now relies on |
| T2 | RUNNING_ISSUES.md | ✅ | `#915` closed; `#1168` note; `#1083` amendment 6; `#1186` and `#1187` opened and homed |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-11-A |
| T2 | `Claude Comms and Packages/Scope Files/PAPER_STANDARD_PROPOSAL.md` | ✅ | r13: `ENTRY_GEOMETRY` ruled (b2), denominator named |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no new constant — the floor is the existing `min_rr`; the band's `k` was not built |
| T2 | STORAGE_POLICY.md | N/A | new keys inside an existing JSON column; no new table or retention |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed (the 2 % target is `#1187`) |
| T2 | POST_AUDIT_ROADMAP.md · AUTHORITY_BASELINE.md · MULTI_ASSET_VTS_EXPANSION_PLAN.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md · BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · PRE_LIVE_SPRINT.md | N/A | not touched by a fill-time check on the paper open |
| T2 | MISTAKE_PATTERNS.md | N/A | the one instance (`wrong-object`, the file-level identity claim) carries its trailer on `ff04d45db` |

## 8. Honest residual
- **The refusal has never fired live.** Its proof is the replay tests and the source fences; the first live refusal is the evidence still to come.
- The shadow measurement has n = 1 on staging (CLSK: a 5-hour-old plan filled 0.1 R better than planned). Nothing is sized off it.
- Paper's record now differs from what live would hold on refused trades (§6) until `#1186`'s pre-order check exists.
