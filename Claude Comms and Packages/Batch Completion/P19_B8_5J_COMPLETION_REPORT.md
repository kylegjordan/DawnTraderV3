# P19-B8.5j — COMPLETION REPORT
## The maximum-hold master switch (paper / live / VTS)

**Batch:** P19-B8.5j · **change-class:** architecture (per scope header) · **Owner:** CC-B
**Reviewer:** Langston (Step-1/2 + Step-4 + Step-8) · **Issue:** #577
**Head:** `58fb15c84` · **CI:** 4/4 GREEN on headSha `58fb15c84` (run 30130023740, verified by sha)
**Deployed:** staging 2026-07-24 ~22:36 UTC, migration-FIRST · **Status:** COMPLETE (behavioural 24h-cross verify armed)

---

## 🚨 SCAFFOLDING/BEHAVIOUR DECLARATION
This batch **turns the 24h max-hold force-close OFF** for paper + live and leaves it switchable. It does
**NOT** decide any max-hold value — that debate is deferred (Kyle). The VTS 7-day valve is a separate
memory-safety mechanism and **stays ON**.

## WHAT KYLE ASKED
2026-07-24: "I don't want there to be a maximum hold until we all have a chance to sit around, debate it…
just turn that functionality off altogether" + "a switch for active trading in paper mode and one for live
mode, and one switch for VTS."

## WHY IT WAS FIRING (measured)
Four xStock `vwap_pullback` positions closed `max_holding_period` at **exactly 24.00h** (3 at a loss).
The 24h is a wildcard `module_constants` row + a hardcoded `DEFAULT_MAX_HOLDING_MS`, chosen (per the code
comment) to preserve the crypto-era "24 bars × 60-min" — but **xStocks run 15-min bars ⇒ 24 bars = 6h**,
and there is no xStock row. **P19-B8.5f (#550) repaired the `maxHoldingMs` carry**, so the exit fired for
the first time in `closed_trades` history — a latent, mis-calibrated, undebated rule went live.
**Rule-24 outcome (2): working-as-designed-but-UNADDRESSED — a policy decision, not a defect to re-tune.**

## OBJECTIVES

| # | Objective | Result | Evidence |
|---|---|---|---|
| OBJ-1 | Three DB-governed switches (`enabled_paper/live/vts`) | ✅ | `module_constants.max_hold_switch`, GLOBAL_KEY (lane-keyed, not asset-class). |
| OBJ-2 | Gate the active (paper/live) enforcement | ✅ | `active-execution-engine.ts` `checkExitConditions` `if (maxHoldingMs !== undefined && this.isMaxHoldEnabled())`; `isMaxHoldEnabled` resolves `enabled_live`/`enabled_paper` by `this.mode`. |
| OBJ-3 | Gate the VTS enforcement at the call site, evaluator untouched | ✅ | `vts-runner.ts` real `:2990` + shadow `:3715` pass `maxHoldMs: isVtsMaxHoldEnabled() ? X : Infinity` (mirrors the active path's own `:1523 Infinity` idiom). `evaluateTECExit` unchanged. |
| OBJ-3a | VTS seed = ON, not off (Langston + B63→B64 provenance) | ✅ + Kyle-confirmed | See "The find" below; `enabled_vts` seeded `true`. Kyle confirmed keeping the valve on **before** the migration ran. |
| OBJ-4 | Fail-safe: absent/cold → OFF, documented | ✅ | Readers `try {…getCachedConstant<boolean>(…)===true} catch { false }`. Documented at both sites + the caveat "OFF is fail-safe ONLY because non-enforcement is non-destructive HERE" (Langston). |
| OBJ-5 | Warmup | ✅ | `max_hold_switch` added to `b72-warmup.ts PREFETCH_MODULES`; live-verified 0 "not warm" throws. |
| OBJ-6 | Migration (+rollback+MANIFEST) | ✅ | 3 rows; paper/live `'false'::jsonb`, vts `'true'::jsonb`; rollback out of MANIFEST. |

## THE FIND (Langston Step-1/2, provenance the scope first missed)
My scope proposed seeding all three OFF, honouring Kyle's words literally. **Langston flagged a known
regression:** `BATCH_64_SCOPE.md:91` records a B63 hotfix that set VTS `MAX_HOLD_MS = Infinity`,
re-introducing the pre-Batch-18I unbounded-trade-map bug (illiquid sims stop getting price updates and
accumulate forever); B64 restored the valve. `enabled_vts=false → Infinity` regresses that exact fix. The
VTS "max hold" is memory-safety infrastructure, **not** a 24h trade rule — so it ships ON, the switch still
exists for the debate, and the default carries no regression. **Surfaced to Kyle before deploy (Langston's
before-migration condition); Kyle confirmed "leave the 7-day memory-safety cleanup on."**

## VERIFICATION
- **tsc baseline:** OK, no regressions.
- **FULL vitest A/B (my clone, `C:\DawnTraderV3-new`):** baseline (my code reverted) **2427 passed**; with
  changes **2437 passed** = exactly **+10** (my new suite), **165 skipped unchanged, zero pre-existing pass
  lost**. The 10 failed *files* are pre-existing pg-pool collection failures (integration/system DB tests),
  identical both runs, none touched by this batch.
- **Test blast-radius censused (git grep at ref, the B8.5i lesson):** the only collateral was
  `reorg-b4-shadow-isolation.test.ts`, which source-asserted the literal `maxHoldMs: SHADOW_MAX_HOLD_MS`
  that my gate rewrote — updated to assert `SHADOW_MAX_HOLD_MS` + the gate present + NOT the real 7d cap.
- **CI:** 4/4 green on headSha `58fb15c84`.
- **Deploy (migration-FIRST):** pulled → `db:migrate` → **verified all 3 rows present, correct values, jsonb
  booleans** (paper=false, live=false, vts=true) → THEN build+restart. `max_hold_switch` warmed (0 "not
  warm"). **ZERO `max_holding_period` closes since 22:36Z.** HTTPS 200.
- **§9.3 UI:** Paper dashboard renders clean — Open Trades 12/15 (reconciles with DB), balances, per-strategy
  table (incl. `vwap_pullback` −$88.53, the strategy the 24h was cutting short) — no crash, no `--`.
- **⏳ BEHAVIOURAL 24h-CROSS VERIFY — ARMED, NOT YET OBSERVED (honest caveat).** No stamped position has
  crossed 24h since deploy (oldest ~9h; VVV closed `target_hit` at 16.6h, never at risk). So "held past 24h
  and NOT closed" is proven at the mechanism level (warmed + seeded off + gated + 0 closes) but not yet
  behaviourally. Verification alert `0979b2fd` armed to fire ~2026-07-25 14:40Z (the next crossing) to
  confirm the position stays open. This mirrors B8.5f's "carry unproven until a fresh position" honesty.

## NOTE (not caused by this batch)
A brief `TEC_CACHE_MISS_FATAL` burst fired on crypto exit checks at the restart instant (22:36:28Z only),
then self-healed within a minute — the documented B79.TEC cold-start fence (primeTECConfig not-yet-awaited),
a transient triggered by any restart, a different cache from `max_hold_switch`. Exit monitor evaluating 12
positions cleanly by 22:37:40Z.

## GOVERNANCE FILES CHANGED
BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN, RUNNING_ISSUES (#577 + the deferred max-hold-policy home),
SYSTEM_IMPACT_MAP (new `max_hold_switch` module + two gated sites), SYSTEM_MANUAL (the switch, the fail-safe
+ its non-destructive-direction caveat, the VTS memory-safety distinction), this report, the scope +
pre_audit (committed at Step-1/2), MEMORY_CC_B.
