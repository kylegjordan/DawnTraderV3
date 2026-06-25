# B-TEC-SELFHEAL — Scope

**Owner:** OLD Claude (CC-A). **Drafted:** 2026-06-25. **change-class: architecture** (touches the core trailing-exit-controller / kill-switch safety path + control-flow + possibly adds always-on runtime state → fail-closed declaration; Langston may down-declare). **Phase-19 sub-batch** (Langston-suggested 2026-06-25). **Supersedes / re-scopes:** the mis-framed `B-XSTOCK-TEC-WARMUP` row in PHASE_19_PLAN + RUNNING_ISSUES #349 (the reopen-warm framing is dropped — the real fix is general self-heal + isolation).

---

## Problem (confirmed diagnosis — CC-A + Langston, 2026-06-25)

The per-asset-class TEC (trailing-exit-controller) config cache has a deliberate, CORRECT staleness fence: `resolveTECConfig(assetClass)` THROWS `[TEC_STALE_FAIL_CLOSED]` if the cached config is older than `CONFIG_MAX_STALENESS_MS` (300000ms / 5min), refusing to make a trailing-exit decision on config it can't trust (e.g. an operator just flipped `break_even_enabled`). **The fence is intended (B79.TEC, §8 #10 no-silent-fallbacks) and STAYS.**

**Two implementation defects against that intent (both confirmed in code + the 06-22 staging logs):**

1. **THE LATCH.** In `resolveTECConfig` (`trailing-exit-controller.ts`) the stale-past-ceiling THROW is at ~line 248, BEFORE the lazy background-refresh trigger at ~line 271. So once a class crosses the ceiling, every consult throws and NEVER reaches the refresh → the cache cannot self-heal. The ONLY recovery is boot `primeTECConfig()` (a process restart). There is NO periodic refresh timer. So a class whose consultation pauses >5min (weekend xStock pause; any quiet stretch; crypto observed too) gets STUCK until a restart. Live proof: 06-22 Sunday reopen → ~17h continuous `TEC_STALE_FAIL_CLOSED` (00:03→~17:00 UTC, 120/hr) until a deploy restart; crypto_spot also stuck ~5h on an unrelated gap.

2. **THE BLAST RADIUS (VTS path only).** The VTS exit-management loop (`vts-runner.ts:2421`, inside `resolveOpenVirtualTrades`) has NO per-trade try/catch. A single open trade of a stale class throws → aborts the whole loop → propagates to `runPhase10SimulationCycle` (which calls `resolveOpenVirtualTrades` FIRST at ~line 3273, before the scan/open phase at ~3293) → the WHOLE cycle aborts (exits AND new opens) → caught only by the outer `[ITEM4]` cycle catch. So one open position of one stale asset-class freezes the entire multi-class VTS cycle. **The active/paper path is already correctly isolated** (`paper-execution-engine.ts:794` per-position try/catch) — there a stale-config throw only skips that one position's exit-eval, opens unaffected.

**Net real-world impact:** in VTS (active OFF) the simulation cycle froze for ~17h+ each weekend reopen; when active xStock/crypto trading turns on, the latch would freeze trailing-exit management of all open positions for the same window (and, on the VTS-shaped paths, opens too) until a restart — a pre-go-live blocker.

## Architectural read (Step 1.a — SIM + code; full up/downstream is the Step-2 pre-audit)

- **SIM:** the TEC config-cache subsystem is documented in `SYSTEM_IMPACT_MAP.md` (B79.TEC + B-NEW-40 sections, ~lines 1035-1051): boot prime, HARD-FAIL invariant, the B-NEW-40 `Promise.race(45s)` timeout fence, the `CONFIG_MAX_STALENESS_MS` ceiling semantics, mode-SHARED (not split-brain, like S2/S5/S15). `getTrailingState`/`evaluateTECExit` consumer rows at ~957-958.
- **resolveTECConfig callers (6):** `isMoonbagQualifier` (444), `canEnterMoonbag` (466), `getResolvedTECConfig` (478, diagnostic), `updatePosition` (1022), `tec-evaluator.ts:208` (`resolveTECConstants` inside `evaluateTECExit`), and the moonbag calls at tec-evaluator 309-321 — all reached through `evaluateTECExit`.
- **evaluateTECExit callers (2):** `vts-runner.ts:2421` (NO per-trade catch — the defect) + `paper-execution-engine.ts:1029` (per-position try/catch at 794 — already correct).
- **Lifecycle:** boot `primeTECConfig` (index.ts:815, HARD-FAIL→process.exit) + lazy `refreshTECConfigForClass` on TTL expiry (the coalesced, 45s-timeout-fenced background refresh). No periodic timer. Maps: `tecConfigCache`/`tecConfigExpiresAt`/`tecConfigLastSuccessAt`/`tecConfigRefreshInFlight`/`tecRefreshFailCount` (trailing-exit-controller.ts:156-168). `CONFIG_TTL_MS=60000`, `CONFIG_MAX_STALENESS_MS=300000`.
- **B-NEW-40 history:** the 45s `Promise.race` fence already fixed the hung-pg-promise-pins-the-inFlight-Map cascade (2026-05-15/16). THIS batch fixes a DIFFERENT defect (throw short-circuits the refresh trigger + no per-trade isolation), which B-NEW-40 did not address.

## Objectives (numbered, with verification criteria)

**OBJ-1 — Self-heal the latch (refresh-before-throw).** In `resolveTECConfig`, ensure a stale-past-ceiling consult FIRES the background refresh (subject to the existing inFlight coalescer + 45s timeout fence) BEFORE/independent of the fail-closed throw. The fence STILL throws for the current consult (fail-closed preserved); the cache reheats within ~1 refresh so the NEXT consult succeeds — converting latch-until-restart into a transient ~1-cycle fence. *Verify:* after a forced staleness (timer-advanced unit test + a staging runtime observation), the next consult succeeds without a restart; `tecConfigLastSuccessAt` advances; the genuinely-stale current consult still throws.

**OBJ-2 — Per-trade isolation in the VTS exit loop.** Wrap the per-trade `evaluateTECExit` call in `vts-runner.ts` `resolveOpenVirtualTrades` in a try/catch that logs + `continue`s (mirroring the proven `paper-execution-engine.ts:794` pattern), so one trade's exit-eval throw skips only that trade this cycle — the loop finishes, and `runPhase10SimulationCycle` proceeds to the scan/open phase. *Verify:* a unit test where one open trade's class is stale leaves the other trades' exit-eval + the scan/open phase intact (cycle does NOT abort); staging logs show no `[ITEM4][VTS] Cycle error` from a single stale-class trade.

**OBJ-3 — Bounded periodic re-warm (DESIGN DECISION for Langston).** A periodic timer re-warming each active class's config (interval DERIVED from the ceiling, strictly < 300000ms, e.g. ceiling/2) so a class can't go cold purely from a consult gap. **Open question:** is this needed given OBJ-1+OBJ-2 already break the circular dependency (the exit loop, once isolated, keeps consulting → OBJ-1 self-heals), or is it redundant defense-in-depth that adds an always-on timer (new SIM §17 cross-cutting state)? Langston decides INCLUDE vs OMIT at Step-1. If INCLUDE: register in SIM §17, interval-from-ceiling, re-warm only active/primed classes.

**OBJ-4 — Tests.** Update `b-new-40-tec-refresh-hang.test.ts` to reflect OBJ-1 (the stale consult STILL throws AND now schedules a refresh; next-consult-after-refresh succeeds). Add a VTS-isolation test for OBJ-2 (one stale-class trade does not abort the cycle). Keep `b65-tec-parity.test.ts` + `b79-*`/`b80-*` green (exit LOGIC unchanged). Bench: tsc-baseline-clean + full vitest.

**OBJ-5 — Verification (staging/runtime).** Demonstrate on staging (or via runtime logs / a controlled probe) that: (a) self-heal works — a class that goes stale recovers without a restart; (b) no whole-cycle abort from a single stale-class trade; (c) the fence still fails-closed for a genuinely-stale current consult (the safety property is intact). §9.3 evidence (logs/probe; UI N/A — this is engine-internal).

**OBJ-6 — Governance.** Update SIM (TEC subsystem section: the self-heal + isolation + any periodic timer in §17), System Manual (if the exit-architecture/fence semantics narrative changes — fence behavior preserved, but self-heal + isolation are architectural), RUNNING_ISSUES #349 (RESOLVED/superseded by this batch), BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN (re-scope the B-XSTOCK-TEC-WARMUP row → B-TEC-SELFHEAL). DELETED_COMPONENTS_LOG only if anything is removed (the reopen-warm idea was never built, so nothing to delete).

## Non-goals / invariants
- **The fail-closed fence STAYS** — we do NOT widen the 300000ms ceiling or weaken the throw for the genuinely-unsafe stale case (§11-prohibited). We make it self-heal + isolated, not lenient.
- The B-NEW-40 45s timeout fence + inFlight coalescer stay intact (OBJ-1 fires the refresh THROUGH them, not around them).
- Exit LOGIC (break-even/trailing/target-lock/moonbag decisions) is unchanged — parity tests must stay green.
- HARD-FAIL boot behavior unchanged.

## Workflow
Step 1 scope (this) → Langston Step-1 approve (incl. the OBJ-3 INCLUDE/OMIT call) → Step 2 pre-audit (full up/downstream SIM review — much already mapped) → implement → Langston Step-4 diff review → push + CI-4-green → deploy → Step-7 verify → Langston Step-8 → iterate → governance → completion report → Kyle ack.
