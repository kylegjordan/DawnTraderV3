# P19-B5a — Completion Report: active-path reject/admit data-capture hooks

**Batch:** P19-B5a · **Date:** 2026-06-16 · **Author:** Claude New (CC-B) · **Commit:** `1e119531a` · **CI:** run 27614885978 (all 4 GREEN) · **Deploy:** staging HTTP 200, clean boot.

> **⚠️ DORMANT-UNTIL-ACTIVE (not a §9.1 scaffolding case, but disclosed):** these hooks write NOTHING until **active paper trading is turned on (P19-B7b)**. They are the active-pipeline reject/admit sites; in the current VTS/passive state they are dormant by construction — live-verified ZERO rows from the new sources on staging. This is correct design (the data only exists when the active pipeline runs), not an inert-pending-future-batch capability.

---

## PREVIOUSLY-STATED-VS-NOW (§9.2)
- **Chunk-A capture sites: PREVIOUSLY 11 (signed reject-site list incl. `core_imf_lq_vn`, `pattern_imf`@1259). NOW 11 but CORRECTED — REASON:** Step-3 verify-before-edit found `core_imf_lq_vn` (fx5:1089) vestigial post-Batch-43 (`passesMetricFilter` never drops → DROPPED), `pattern_imf` real drop is the :1228 filter not the :1259 re-count (MOVED), and `pattern_high_price` (market-scanner:944) is a real reject that was un-enumerated (ADDED). Langston re-signed the corrected table before any hook was written.
- **TCL capture: PREVIOUSLY "duplicate_position + max_open_trades". NOW duplicate_position ONLY. REASON:** `max_open_trades` (paper-engine:1708) is a cycle-level promotion defer (signals stay queued), not a per-signal reject — capturing it would be semantically-false telemetry. Langston ratified.

## Scope objectives
| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | pre_filter capture at the active-path scanner reject sites | ✅ YES | 11 hooks (market-scanner ×7, fx5 ×4) gated `if(!isPassiveLearning)`/`if(isEngineActive)`, scores null, via centralized `capturePreFilterReject`. |
| OBJ-2 | sqe / rtb / tcl reject capture with REAL scores (NO-PATCHES) | ✅ YES | SQE @ orchestrator captures failing `finalScore`; RTB @ reEvaluateQueue captures `confidence_modulated`; TCL @ paper-engine duplicate_position captures `confidence_modulated`. |
| OBJ-3 | paper-engine terminal admit hook | ✅ YES | `rejectStage:'admitted', source:'paper-execution-engine'` after `createPaperSimOpenPosition` — distinct funnel endpoint from the orchestrator admit (source-disambiguated). |
| OBJ-4 | ZERO migration | ✅ YES | `signal_eval_archive` already carries the `reject_stage` enum + nullable `final_score`/`confidence_modulated` (`2026-05-05-b70-data-archive-tables.sql:96-97`). No `ALTER`. |
| OBJ-5 | synthetic-fire + NEGATIVE dormancy tests | ✅ YES | `server/tests/unit/p19-b5a-reject-capture.test.ts` — 8 tests (helper positive, family-name, fire-and-forget, sqe/rtb real-score capture, admit row, kill-switch dormancy, call-site gate contract). |
| OBJ-6 | live dormancy proof (zero-live-risk) | ✅ YES | Staging `signal_eval_archive`: **0 rows** from `market-scanner`/`fx5-scanner`/`ready-to-buy`/(paper-engine tcl+admitted) since deploy; all 15,520 recent rows are `mode='vts'` (VTS pipeline unaffected). |

## Verification evidence
- **Bench:** `check-tsc-baseline.mjs` → no regressions above baseline; `vitest run` → **174 files / 1987 tests passed** (1979 + 8 new).
- **CI:** run 27614885978 — Build / Test Suite / TypeScript Check (baseline gate) / Docker Build all `success`.
- **Deploy:** `1e119531a` pulled + built + PM2 restart → HTTP 200, no errors/`B70.ARCH`/FATAL in boot logs.
- **Live dormancy (Step-7):** `B5A_NEW_SOURCE_ROWS: []`; `JOIN_KEY_COLS: captured_at,id,mode,symbol`; `ALL_RECENT_BY_MODE: [{mode:vts, n:15520}]`.
- **Langston Step-4:** APPROVE for push (independently traced the un-gated paper-engine/orchestrator/RTB hooks to their `engine.start()` callers → confirmed dormant-by-construction in code, not just on assertion). All 6 ratifications confirmed.

## Langston Step-8 conditions (pre-satisfied at Step-7)
1. SIM `:1794` content update with the new sources/stages **and the two-admit-milestone double-count rule** — DONE (SIM B70 P19-B5a sub-entry).
2. Join key for tcl-null-finalScore recovery — CONFIRMED present (`id`, `symbol`, `mode`, `captured_at`).

## WHY System Manual is OUT OF SCOPE (mandatory statement, 2026-06-16 rule)
B5a is **pure fire-and-forget observability**: it adds reject/admit telemetry rows and changes NOTHING in signal selection, regime detection, strategy logic, filter design, the signal pipeline's control flow, or any quantitative math. Every hook is gated/dormant and wrapped in try/catch so it can never affect a trading decision. The reject taxonomy is component/state metadata → **SIM's lane, not the System Manual's.** Langston agreed with this justification at Step-4. (Optional future nicety: a one-line cross-ref in the Manual's pipeline chapter pointing at the SIM taxonomy — not required for close.)

## Governance files changed
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — B70 §1794 deferred-bullet update + new P19-B5a content sub-entry (sources, stages, double-count rule, score-recovery-by-join).
- `1-system-manual/BATCH_CATALOG.md` — P19-B5a row.
- `1-system-manual/PHASE_HISTORY.md` — P19-B5a narrative.
- `1-system-manual/PHASE_19_PLAN.md` — §1 status board + §5 decision log (B5a closed; B5b/B5c next).
- `1-system-manual/RUNNING_ISSUES.md` — #56 update (active-path capture landed; active-path `strategy_internal` still deferred).
- `.claude/memory/MEMORY.md` (+ user-cache truth + Langston Helsinki) — volatile state.
- **System Manual: N/A (justified above).**

## Follow-ups homed (§9.4)
- **Active-path `strategy_internal` capture** (orchestrator strategy-detect-null) — NOT in B5a; **homed to RUNNING_ISSUES #56 (remains open, scoped as a small follow-up; revisit at the B5b/B5c touch or next data-capture batch).**
- **B5b** (#94 xStock VIX+DXY macro snapshot — capture-only, non-dormant) and **B5c** (#86 continuous Q-D probe) — next in the B5 split.

**STATUS: B5a code + governance COMPLETE; pending Langston Step-8 second-pass confirmation, then Kyle acknowledgment to formally close.**
