# B-TEC-SELFHEAL — Completion Report

**Owner:** OLD Claude (CC-A). **Closed:** 2026-06-25. **change-class:** architecture (touches the trailing-exit-controller kill-switch safety path + VTS cycle control flow). **Reviewer:** Langston (Step-1 + Step-2 + Step-4 + Step-8). **Source:** RUNNING_ISSUES #349 (B-NEW-40 soak finding). **Kyle-greenlit** 2026-06-25. **Phase-19 sub-batch** (supersedes the mis-scoped `B-XSTOCK-TEC-WARMUP`).

---

## Outcome: ✅ CLOSED + LIVE — the TEC staleness fence self-heals + is per-trade isolated; the fence itself is unchanged

The per-asset-class TEC (trailing-exit-controller) config cache had a deliberate, correct fail-closed staleness fence, but two implementation defects: (1) it **latched until a process restart** (the staleness throw sat before the refresh trigger, so a stale consult could never schedule its own recovery), and (2) one stale-class open trade **aborted the whole VTS cycle** (no per-trade isolation in the exit loop). Live proof of impact: the 06-22 xStock weekend reopen stuck ~17h continuous (`TEC_STALE_FAIL_CLOSED` at 120/hr, 00:03→~17:00 UTC) until a deploy restart; crypto_spot also stuck ~5h on an unrelated gap. This batch fixes both — **the fail-closed fence is byte-identical (the safety property is preserved); it just self-heals + is isolated now.**

## Objectives + evidence

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Self-heal the latch (refresh-before-throw) | ✅ | Extracted the lazy-refresh trigger to a single-call-site helper `scheduleBackgroundRefresh` invoked at the TOP of `resolveTECConfig`, before both throws. A stale-past-ceiling consult now schedules its own coalesced, non-awaited refresh (through the existing inFlight coalescer + B-NEW-40 45s fence) → self-heals in ~1 cycle. The fail-closed throw is byte-identical (Langston Step-4 De Morgan + byte-diff verified). Unit: SUCCESS-half (heals), HUNG-half (still throws while hung), COALESCER (N→1 via `consecutiveFailCount===1`). |
| OBJ-2 | Per-trade isolation in the VTS exit loop | ✅ | Wrapped `evaluateTECExit` (`vts-runner.ts:2421`) in a per-trade try/catch mirroring the already-correct `paper-execution-engine.ts:794`; `decision` declared (typed via `Awaited<ReturnType<…>>`) before the try, catch logs `[TEC_VTS_EXIT_EVAL_ISOLATED]` + `continue`; post-processing + exit logic unchanged. One stale-class trade no longer aborts the cycle. |
| OBJ-3 | Bounded periodic re-warm timer | ❌ OMITTED | Langston Step-1 call — gold-plating on a safety path (OBJ-1+OBJ-2 are the complete fix). Considered-and-declined with a conditional reopen trigger, recorded in RUNNING_ISSUES #349. |
| OBJ-4 | Tests | ✅ | 4 new cases + the existing (a)-(e) + b65-parity + b79/b80 all green (48 TEC tests, 5 files). Also fixed a real cross-test isolation gap: `_testClearEngineConfigCache` now clears inFlight/lastSuccess/failCount (was leaking a prior test's hung-refresh inFlight entry). tsc baseline clean. |
| OBJ-5 | Verification (runtime/staging) | ✅ + scheduled | CI 4-green (run 28181014927). Deployed staging restart#417, HTTP 200. Live tec-config: all 4 classes fresh (staleByCeiling false, failCount 0), **zero `TEC_STALE_FAIL_CLOSED` since restart**. Deterministic self-heal proven by the test suite; the real-world latch-vs-self-heal proof is the 06-28 xStock weekend reopen — scheduled §10.5 alert `tec_selfheal_verify` (fires 06-29 06:00 UTC) checks it self-heals vs the old 17h cascade. **OBJ-5(c) safety property:** the genuinely-stale consult STILL throws (preserved + tested). |
| OBJ-6 | Governance | ✅ | This report + the docs below. |

## Workflow (honest record)
Scope (Step-1, Langston APPROVE — OBJ-3 OMIT + change-class architecture + OBJ-1 ordering locked) → pre-audit (Step-2, Langston CLEARED — 6+2 caller re-walk against the final ordering) → implement → bench (tsc baseline clean + 48 TEC tests green; proved the 9 full-suite failures PRE-EXISTING on the 15-commit-stale bench / no local test-db, by reverting + re-running) → **Langston Step-4 APPROVED** (De Morgan + byte-identical throw + unprimed-delta note + no-prod-caller confirm) → push `5b9180120` → CI 4-green → deploy restart#417 → Step-7 verify (healthy) → Step-8 (Langston) → governance.

## Files changed (code)
- `server/services/trailing-exit-controller.ts` — OBJ-1 helper extraction + relocated call + unprimed guard; `_testClearEngineConfigCache` isolation fix.
- `server/services/vts-runner.ts` — OBJ-2 per-trade try/catch in the exit loop.
- `server/tests/unit/b-new-40-tec-refresh-hang.test.ts` — 4 new cases.

## Governance files changed
- `1-system-manual/RUNNING_ISSUES.md` — #349 RESOLVED.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — TEC config-cache subsystem: latch→transient-fence self-heal semantics + the VTS exit-loop isolation (content update, not reformat — §16).
- `1-system-manual/SYSTEM_MANUAL.md` — TEC / trailing-exit fence-semantics content update (latch→self-heal; the fail-closed behavior preserved).
- `1-system-manual/BATCH_CATALOG.md` — this batch row.
- `1-system-manual/PHASE_19_PLAN.md` — re-scoped the `B-XSTOCK-TEC-WARMUP` row → B-TEC-SELFHEAL, closed.
- `1-system-manual/GOVERNANCE_EXCEPTIONS.md` — the B-TEC-SELFHEAL `open` declaration cleared (batch closed; doc-set landed).
- Langston `/home/langston/MEMORY.md` (§10.b sync).
- `Claude Comms and Packages/Scope Files/B_TEC_SELFHEAL_{SCOPE,PRE_AUDIT}.md` + this report.

## Rollback
Pure-code, no migration → revert the commit + redeploy. The fail-closed fence + B-NEW-40 45s timeout fence + inFlight coalescer are all preserved, so a revert restores the exact prior (latching) behavior with no data risk.
