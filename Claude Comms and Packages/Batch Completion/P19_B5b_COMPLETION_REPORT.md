# P19-B5b — Completion Report: #94 xStock VIX+DXY macro snapshot on every decision record

**Batch:** P19-B5b · **Date:** 2026-06-16 · **Author:** Claude New (CC-B) · **Commit:** `c9f2e8285` · **CI:** run 27617011433 (all 4 GREEN on `bec57a096`, which has c9f2e8285 as ancestor) · **Deploy:** staging restart #396, HTTP 200.

> 🚨 **THIS BATCH IS NOT DORMANT (§9.1).** Unlike B5a, B5b **starts writing on merge** — the macro snapshot rides the xStock eval-cycle `archiveSignalEval` writes which fire EVERY cycle in the current VTS/passive path. It is live the moment it deployed (verified below). Low-risk (one added JSONB object on rows already written; sync read; the existing try/catch wraps the archive call), but live-on-merge, not gated.

## Scope objectives
| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Every xStock decision record carries a VIX+DXY snapshot at decision time | ✅ YES | `macro: buildMacroSnapshot()` threaded into ALL 4 xStock archive `features` (strategy_internal/sqe/tcl/admitted). |
| OBJ-2 | Capture-only (modifier build stays Phase-25 25-7) | ✅ YES | Snapshot is data-only; no modifier/gate logic. 25-7 remains the build home. |
| OBJ-3 | Capture set per Langston Q-A (all 8, incl. raw vix/dxy + freshness) | ✅ YES | `{vixZ,dxyZ,vix,dxy,ageSeconds,partialFeed,vixObservedAt,dxyEcbDate}`. Raw values = baseline-independent ground truth. |
| OBJ-4 | ZERO migration | ✅ YES | `features` is JSONB (schema_version-tolerant). No DDL. |
| OBJ-5 | Null preserved (explicit, distinct from 0) + freshness | ✅ YES | Straight field copy (no omit-on-null); `Infinity`/`NaN` age → explicit null. 5 unit tests assert it survives JSON. |
| OBJ-6 | crypto gets NO macro | ✅ YES | By construction — the helper lives in/is imported only by the xStock eval cycle; crypto archive writes untouched. |
| OBJ-7 | Live verification (non-dormant → confirm it WRITES) | ✅ YES | Post-deploy xStock rows: `macro=true`, `vixZ=-1.16`, `ageSeconds=57.1`, raw vix present. 441/1875 rows in the 5-min window carry it (post-deploy rows have it; older don't — additive, no backfill). |

## Implementation
- **NEW** `server/asset_classes/xstock_spot/macro-snapshot.ts` — `buildMacroSnapshot()`. **Extracted from eval-cycle.ts FOR testability** (imports only `getLatestEquitySnapshot`, so it unit-tests without eval-cycle's heavy chain). Langston ratified the extraction at Step-4 ("testable-by-design beats inline-but-untestable"). Straight-copy, null-preserving, sync, cannot-throw.
- **`eval-cycle.ts`** — `macro: buildMacroSnapshot()` added to all 4 `features` objects; distinct key from the existing `macroModifierValue` (AMR class-level modifier scalar — different concept, no collision).
- **5 new tests** `p19-b5b-macro-snapshot.test.ts`.

## Verification evidence
- **Bench:** tsc baseline no-regression; vitest **175 files / 1992 tests** (1987 + 5).
- **CI:** run 27617011433 — all 4 jobs `success` on `bec57a096` (B5b code is an ancestor).
- **Deploy:** restart #396, HTTP 200.
- **Step-7 (live, non-dormant):** macro field present + populated with real VIX z + freshness on post-deploy xStock rows (see OBJ-7).
- **Langston:** Step-1 ACK (all 4 Qs) + Step-2 PROCEED (keep all 8 + §14 PHASE_19_PLAN mandatory) + Step-4 APPROVE (3 checks verified against the diff; extraction ratified).

## WHY System Manual is OUT OF SCOPE (mandatory statement)
B5b is **VTS telemetry enrichment** — it adds one captured JSONB field (`features.macro`) to existing archive writes and changes NOTHING in signal selection, regime, strategy math, filter design, or pipeline control flow. The captured backdrop is component/state metadata → **SIM's lane, not the System Manual's.** Langston affirmed N/A at Step-2 and Step-4.

## Governance files changed
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — content note: `features.macro` (#94) capture on xStock archive writes.
- `1-system-manual/PHASE_19_PLAN.md` — §1 board (B5b → done) + §5 decision log (**per Langston's §14 catch — mandatory for a Phase-19 sub-batch**).
- `1-system-manual/RUNNING_ISSUES.md` — #94 capture precondition LANDED (build stays 25-7).
- `1-system-manual/BATCH_CATALOG.md` + `1-system-manual/PHASE_HISTORY.md` — P19-B5b entry/narrative.
- `.claude/memory/MEMORY.md` (+ truth + Helsinki) — volatile state.
- **System Manual: N/A (justified above).**

## Non-blocking forward-note (Langston Step-4)
The timestamp fields `vixObservedAt`/`dxyEcbDate` are `string | null` per the snapshot interface (so they won't be dropped). If the source ever returned `undefined`, JSON would drop those keys — acceptable absence-semantics for a timestamp; worth a glance when wiring the Phase-25 25-7 baseline recompute that reads these back.

## Next
- **B5c** (#86 continuous Q-D probe → `xstock_qd_probe_history`) — always-on, own batch (capture-now/build-later). Home confirmed (Langston Q3).

**STATUS: B5b code + governance COMPLETE + live-verified; pending Langston Step-8 second-pass + Kyle acknowledgment.**
