# P19-B6 PRE-AUDIT (Step-2) — Daily Loss-Budget Kill Switch (RESTORE)

> **Author:** Claude New (CC-B) · **Date:** 2026-06-16 · **For:** Langston Step-2 review (PROCEED-to-Step-3 gate)
> Scope: `P19_B6_SCOPE.md` Rev-3. This pre-audit answers the three code-truth traces Langston set as Step-2 gates, plus the SIM consultation. **Headline: two findings materially simplify the design.**

---

## §1 — THE THREE CODE-TRUTH TRACES (all answered with code evidence)

### Trace 1 — Does `engineSessionStart` advance on `/api/trading/start`, AND does the kill switch reset there? ✅ BOTH YES.
- `engineSessionStart` is a per-mode module `Map` (`paper-execution-engine.ts:126`). Set to `new Date()` on engine **`.start()`** (`:347`); nulled on stop/reset (`:485`, `:666`).
- `/api/trading/start` handler (`routes.ts:3622`) → **`resetKillSwitch(mode)`** (`:3816`, clears `killSwitchTripped`) **AND** `startPaperSimulation(userId,…)` (`:3755`) → engine `.start()` → fresh `engineSessionStart`.
- **Consequence:** after a kill (trip + flatten + engine stopped → `engineSessionStart=null`), an operator restart clears the trip AND rebaselines the loss window. With the anchor `max(now−24h, engineSessionStart=now)` = `now`, realized P&L since `now` = 0 → **no immediate re-trip.** The circuit-breaker + session-anchor design (Q2/N4) is sound and needs NO new field — `engineSessionStart` already exists and advances correctly. **The de-dup epoch (Langston refinement) ties to this same `engineSessionStart`.**

### Trace 2 — Does `stopPaperSimulation` close open positions, or leave them? ✅ IT FORCE-CLOSES ALL — so the modern kill ALREADY FLATTENS.
- `tripKillSwitch('paper',…)` (`guardrail-policy.ts:442`) → (paper branch `:491`) `stopPaperSimulation` (`paper-sim-service.ts:794`).
- `stopPaperSimulation`'s Phase-8.8.3-I2 "CORRECTED STOP SEQUENCE" (`:835-883`): (1) `markStopInProgress()` (ENGINE_STOPPING blocks new trades), (2) `currentManager.stop()`, (3) **`forceCloseAllOpenPositionsOnStop()`** (`:852`) — force-closes ALL open positions, (4) DB verification that none remain (+ orphan cleanup).
- **★DESIGN SIMPLIFICATION:** the modern `tripKillSwitch` → `stopPaperSimulation` path **already flattens**. So B6 must **NOT** restore the Phase-8 `checkKillSwitch.closeAllTrades(mode)` — doing so would **double-close** (Langston's "don't restore the close-then-trip ordering verbatim" — now code-confirmed). The restored evaluator's kill branch = **`tripKillSwitch(...)` only**; the flatten is the existing stop sequence. Kyle's flatten-on-kill requirement (N3) is satisfied by the trip path that already exists.

### Trace 3 — Re-entrancy: does the flatten route through `closePosition` (firing the new hook → cascade)? ✅ YES → latch-first confirmed necessary; existing ordering + setImmediate make it robust.
- `forceCloseAllOpenPositionsOnStop` (`paper-portfolio-manager.ts:265`) loops open positions → `executionEngine.forceClosePosition(...)` (`:320,:335`) → public wrapper for the private **`closePosition`** (`paper-execution-engine.ts:599`/`:1156`). So the kill flatten DOES go through `closePosition` → would fire the new post-close hook for each closed position.
- **But the cascade is robustly prevented by three layers:**
  1. **`tripKillSwitch` persists the trip BEFORE the flatten:** it writes `killSwitchTripped=true` (`:463`) + `isEngineActive=false` (`:470`) **before** calling `stopPaperSimulation` (`:491`). So by the time any flatten-driven hook runs, both DB guards are already true.
  2. **The hook is `setImmediate`-deferred:** the flatten runs synchronously inside `tripKillSwitch`'s await; the deferred evaluators it schedules run on the NEXT tick, AFTER `tripKillSwitch` fully completes → they read `isKillSwitchTripped=true` / `isEngineActive=false` → no-op.
  3. **Synchronous in-memory `killInProgress[mode]` latch (Langston):** set at evaluator entry BEFORE any `await`, checked first — closes the only remaining window (two NORMAL closes in the SAME tick both crossing the threshold before the first's `tripKillSwitch` DB write lands).
- The existing fire-and-forget post-close tail (`closePosition` `:1292-1304`, "must never block closePosition") is the attach point — but the kill-switch hook must be **`setImmediate`-scheduled**, not appended synchronously in that tail (so it runs after `closePosition`'s frame + any lock release).

---

## §2 — SIM / SYSTEM-MANUAL CONSULTATION
- SIM "Kill-switch / daily-loss (confirmed safe)" (line 105-106): "`isKillSwitchTripped(mode)` reads per-mode DB; **No module-level in-memory daily-loss accumulator exists.** (Residual D5 check: confirm the trip-WRITE computes per-mode daily P&L.)" — B6 IS that accumulator. SIM line 1551 flags the gap as BLOCKING-for-live. Both get updated at Step-10.
- SIM liveness registry (S-table) + the 5-reader `isEngineActive` model: the evaluator's `isEngineActive` gate reads the DB SSOT (consistent with the B4b-D5 consolidation). `engineSessionStart` is a separate per-mode Map (not in the liveness registry) — Step-10 adds the new `daily-loss-budget.ts` component + the `engineSessionStart`-as-dedup-anchor note to SIM.
- System Manual Ch4 §9 Trigger #2 "Automatic: Daily P&L loss exceeds threshold" is documented-as-existing but is the deleted code — Step-10 makes it real (names `daily-loss-budget.ts`, the flatten-via-stop-sequence, the 2 warning tiers).

---

## §3 — REFINED IMPLEMENTATION SHAPE (for Langston Step-2 sign-off)
1. **New `server/services/daily-loss-budget.ts`** — restored `calculate24hPL(mode)` (mode-aware closed-trade query, session-anchored `max(now−24h, engineSessionStart)`, `getPortfolioBalanceV2` denominator, `≤0→breach` guard) + `evaluateDailyLossBudget(mode)` (the restored `checkKillSwitch` logic, re-pointed at `guardrails_v2`).
2. **Kill branch = `tripKillSwitch(...)` ONLY** (flatten is the existing stop sequence; NO `closeAllTrades`) + a `critical` system-alert (de-duped). Latch-first: set `killInProgress[mode]` synchronously, then `await tripKillSwitch`.
3. **Two warning tiers** (50/75% of kill threshold): `killSwitchEvent` + system-alert (warn-2 `warning`, warn-1 `info`); ratchet (highest tier wins); de-dup keyed by `engineSessionStart`; in-memory, reset on anchor advance.
4. **Trigger:** `setImmediate` fire-and-forget hook at the `closePosition` tail (or `onTradeClosed`), `killInProgress`/`isKillSwitchTripped` first-line guard, gated `isEngineActive`, observable failure counter.
5. **Migration:** `dailyLossWarning1Pct`(50)/`dailyLossWarning2Pct`(75) on `guardrails_v2` per-mode; paper-kill 15 / live-kill 7 seed; strict bounds `0<warn1<warn2<100` in the coherency engine.
6. **Delete F3 orphan** `paper-metrics.ts::calculate24hPL()` (zero callers; §15).
7. **Force-trip test (gate 7):** lowered paper threshold + simulated loss → trip + flatten (verify positions closed) + warnings + recovery (restart rebaselines, no re-trip).

**Open question for Langston:** the `markStopInProgress()`/ENGINE_STOPPING flag (`paper-sim-service.ts:839`) already blocks new trades during stop — should the evaluator's `killInProgress` latch coordinate with / reuse that, or stay an independent kill-switch-specific latch? I lean independent (different lifecycle: ENGINE_STOPPING is per-stop-operation; `killInProgress` guards the evaluator specifically) but want your read.

---

---

## §4 — STEP-3 CARRY-INS (Langston PROCEED 2026-06-16 + CC decisions on his two open points)

**Langston conditions (fold into the named chunks):**
1. **`killInProgress` lifecycle — two hard invariants (latch+trip chunk):** (a) the **check-and-set is one synchronous block with NO `await` between** `if(killInProgress[mode]) return` and `killInProgress[mode]=true` (this atomicity — not the DB guard — is what closes the same-tick double-close window; `calculate24hPL` runs AFTER the set). (b) **`killInProgress[mode]` resets on `resetKillSwitch`/restart**, tied to the same `engineSessionStart` epoch as the warning de-dup (else the latch stays true and the evaluator is permanently off next session). Reset lands where `resetKillSwitch` clears.
2. **Warning de-dup hysteresis — ✅ CC DECISION: HYSTERESIS RE-ARM** (Langston leaned it; correct for multi-day active-paper sessions where losses roll out of the 24h window and a fresh breach is a real event). A tier fires + disarms on cross; **re-arms when the loss ratio drops back below `(tier − band)`** (small anti-flap band). Band = a documented small fixed proportion or `module_constants`-resolved (operational anti-flap, NOT a risk-threshold constant — fail-loud if module-resolved). Documented in the warnings chunk + completion report.
3. **Live-mode flatten — ✅ CC DECISION: NAMED HOME = Phase-21 live-activation (RUNNING_ISSUES, added at Step-10).** The flatten=stop-sequence proof is paper-only. Today a `tripKillSwitch('live')` is a persisted no-op (live engine not built — `guardrail-policy.ts:501`) and live trading is 409-gated with ZERO live positions, so a live trip cannot silently leave live positions open *today*. The Phase-21 precondition: **before live go-live, verify/wire that `tripKillSwitch('live')` flattens open live positions** (no silent-leave). Documented in pre-audit + completion report + a RUNNING_ISSUES item.

**Minor (Langston):** the migration columns `dailyLossWarning1Pct`/`dailyLossWarning2Pct` are **% OF THE KILL THRESHOLD** (NOT absolute loss %) — documented in the migration chunk so the bounds `0<warn1<warn2<100` and the evaluator's `warningThreshold = (warnPct/100)×killThreshold` math read the same units.

**Trace-1 completion-report note (Langston):** state explicitly that the session-anchored budget is a **circuit-breaker, NOT a hard calendar-day cap** — an operator restart rebaselines the window, so repeated restarts could exceed multiple budgets in one day (intended; restart = deliberate human action).

---

*Step-2 deliverable + carry-ins. Langston PROCEED to Step-3. Step-3 chunks: A migration (per-mode warn fields + seed + coherency strict-bounds) → B restored `daily-loss-budget.ts` (calculate24hPL + evaluator, re-pointed) → C latch+trip wiring (atomic latch, trip-only kill, critical alert) → D 2 warning tiers (hysteresis re-arm, ratchet, system-alert) → E setImmediate post-close hook (gated, observable counter) → F delete F3 orphan → G force-trip tests + bench.*
