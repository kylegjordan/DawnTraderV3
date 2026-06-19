# B-XSTOCK-GLOBALS — Completion Report

**Batch:** B-XSTOCK-GLOBALS (CC-A / Claude Old implemented; Kyle reassigned from CC-B 2026-06-18)
**Change-class:** non_architecture (telemetry-completeness; reads existing per-class outputs, touches no gate/regime/filter/EV math)
**Status:** CLOSED — code deployed + verified; governance landed. Pending Langston Step-8 confirm.

---

## 1. Objective
xStock VTS trades persisted blank `globalRegime` / `globalFriction` / `globalDirectionalBias(+Score)` ("—" / "pending" on the ML page) while the per-class market-wide calc was healthy upstream. Restore the at-open global snapshot on xStock VTS opens so each trade carries the whole-xStock-market regime/friction/DBS, matching crypto.

## 2. Root cause (verified)
`B-4.7` made `registerOpenVtsTrade` (vts-runner.ts:3062, 3076-3078) **caller-pass-only** — `input.X ?? undefined`, no cache back-fill (kept the fill only for `pairFriction`). The crypto inline open-path (vts-runner.ts:1561-1576) passes the four globals; the **xStock caller** (`eval-cycle.ts` xOpenTrade) set only `pairDirectionalBias[Score]`, never the four globals → they defaulted `undefined` → persisted blank. Upstream was healthy throughout: `getMarketIndicators('xstock_spot')` caches `cachedGlobalRegime/Friction/DBSCategory/Score` every cycle (live PM2 evidence).

## 3. Fix
`server/asset_classes/xstock_spot/eval-cycle.ts` — xOpenTrade now reads the same per-class cache the crypto stamp uses: `getCurrentRegime / getGlobalFriction / getLastGlobalDBSCategory / getLastGlobalDBSScore('xstock_spot')` (1 import + 4 fields). Langston Step-4 APPROVED; Q1 (regime via `getCurrentRegime`, with an idle-staleness comment) and Q2 (guardrail tripwire = SPLIT to a follow-up) ruled.

## 4. Objectives checklist
| # | Objective | Result | Evidence |
|---|---|---|---|
| 1 | xStock VTS opens carry global regime/friction/DBS | ✅ YES | Staging UI (ML page) + DB context jsonb now populated |
| 2 | Values are correct (not per-pair miscalc) | ✅ YES | Integrity check: trades opened in the SAME minute have IDENTICAL globals (shared at-open snapshot); values track the live market-wide time series |
| 3 | No regression to crypto / no gate impact | ✅ YES | tsc baseline clean; xStock opens unaffected; globals are telemetry, not a gate |
| 4 | Guardrail tripwire (blank-while-LIVE) | DEFERRED | §13 home → RUNNING_ISSUES follow-up (Langston Q2 split) |

## 5. Evidence
- **Commit:** `a93e274c8` (eval-cycle.ts, +22). **CI:** all-4 green (run 27758799577). **Deploy:** staging restart #405, HTTP 200, commit confirmed.
- **Bench:** tsc baseline gate clean (no regressions); unit suite 1924 pass / 0 fail; 9 integ/system files fail on no-DB bench (#226, env).
- **UI/data verify (§9.3):** xStock rows render Glbl Regime/Fric/DBS; DB query confirms `context->>'globalRegime'/'globalFriction'/'globalDirectionalBias(Score)'` populated on post-deploy opens; same-minute integrity = 1 distinct value.

## 6. Governance files changed
- `Claude Comms and Packages/Batch Completion/B_XSTOCK_GLOBALS_COMPLETION_REPORT.md` (this)
- `1-system-manual/BATCH_CATALOG.md` (entry), `PHASE_HISTORY.md` (narrative), `PHASE_19_PLAN.md` (§1 board + §5 log)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` (telemetry-completeness note: xStock eval-cycle now reads the per-class global-indicator cache at open — SIM-scope, non-arch)
- `1-system-manual/RUNNING_ISSUES.md` (NEW: guardrail-tripwire follow-up with §13 home)
- `.claude/memory/MEMORY.md` + user-cache MEMORY; Langston MEMORY (10.b)
- System Manual: N/A (no architecture/regime/filter/pipeline/math change — reads existing per-class outputs).

## 7. Follow-up (§13 homed)
**Guardrail tripwire** — alert if an xStock VTS row opens with blank globals while `getMarketIndicators('xstock_spot')` voteStatus=LIVE (catch a 3rd regression at the source). Langston Q2: SPLIT to a fast follow-up; correct home = a centralized witness in `registerOpenVtsTrade` (catches ANY caller). RUNNING_ISSUES entry + named home.
