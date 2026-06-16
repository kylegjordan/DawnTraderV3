# P19-B6 SCOPE — Daily Loss-Budget Kill Switch (auto-trip)

> **Batch:** P19-B6 · **Phase:** 19 (Paper Mode Audit & Debug) · **Author:** Claude New (CC-B) · **Date:** 2026-06-16
> **Roadmap home:** 19-4 / `POST_AUDIT_ROADMAP.md` §19.0.B · **Pre-flight gate:** PHASE_19_PLAN §6 gate 7 (B7b hard precondition)
> **Status:** Step-1 draft → awaiting Langston ACK

---

## §0 — ONE-LINE INTENT

Build the **automatic** daily loss-budget evaluator that the system has never had: a small per-mode service that watches running paper/live P&L and **auto-trips the existing kill switch** when the loss crosses the existing `dailyLossKillSwitchPct` threshold — reusing the existing `tripKillSwitch` signature, **no new threshold constants** — plus a **mandatory force-trip verification** proving the trip fires AND the recovery path works before we trust it.

---

## §1 — THE GAP (code-verified)

The kill-switch *mechanism* is fully built and DB-backed, but **nothing automatic ever pulls the trigger on a loss budget**:

- **The knob exists:** `dailyLossKillSwitchPct` lives in `guardrails_v2`, per mode, DB-resolved (`guardrail-policy.ts:248`, `getEffective`). Coherency RULE_007 bounds it 1.00–25.00% (`guardrail-policy.ts:386`). Default 7.00%.
- **The trip action exists:** `guardrailPolicy.tripKillSwitch(mode, reason, lossPercent?, threshold?)` (`guardrail-policy.ts:442`) — persists `killSwitchTripped=true`, sets `isEngineActive=false`, clears the active filter pool, stops the paper sim (live = persisted no-op until Phase 21), broadcasts events. **The `lossPercent`/`threshold` params already exist for exactly this caller — and are never populated** because no auto-caller exists.
- **The enforcement of the tripped state exists:** `trade-safety.ts::checkKillSwitch` (`:133`) is check #1 of the pre-trade gate — once tripped, every new trade is blocked.
- **The recovery path exists:** `resetKillSwitch(mode)` (`guardrail-policy.ts:535`) clears the flag; it is called automatically on `POST /api/trading/start` (the manual `/kill-switch/reset` endpoints are deprecated 410s).
- **What is MISSING (the whole batch):** a service that **computes running loss and calls `tripKillSwitch` automatically.** `GuardrailAdapter.checkDailyLoss()` is a literal `stub placeholder` (`server/agent/bridge/GuardrailAdapter.ts:27`). The legacy `risk-manager.ts::checkDailyLossKillSwitch/calculate24hPL/triggerKillSwitch` from the pre-migration user-coupled era **no longer exists** (mode-based migration removed it). PHASE_19_PLAN §3.6 records the pre-investigation verbatim: *"B6: confirmed no daily-loss service exists; `tripKillSwitch` manual-only."* SIM line 1551 flags the same gap as **"BLOCKING for live-trading activation."**

**Doc-vs-reality mismatch to fix in governance:** `SYSTEM_MANUAL.md` Ch 4 §9 already lists Trigger #2 *"Automatic: Daily P&L loss exceeds `dailyLossKillSwitchPct` threshold"* and the legacy `KILL_SWITCH_INTEGRATION.md` describes a full auto-trip flow — **both describe behavior that does not exist in code.** B6 makes the docs true.

---

## §2 — DESIGN (spine pre-decided by governance; refinements flagged for Langston)

The roadmap §19.0.B pre-specifies the spine (verbatim, lines 88/120/121):
> "Aggregator + auto-trip on **rolling 24h** paper P&L vs portfolio."
> "Build `server/services/daily-loss-budget.ts` — rolling 24h P&L aggregator across paper + live trades."
> "Wire auto-trip when `dailyPnL / portfolioValue ≤ -dailyLossKillSwitchPct`."

Combined with the Langston refinement on the plan board (row 25): *"reuse existing `dailyLossKillSwitchPct` knob + existing `tripKillSwitch` signature, no new constants; force-trip verification mandatory."*

### Decided (governance-fixed — not reopening):
- **D-A — Rolling-24h window** (roadmap-specified). Per-mode realized P&L summed over closed trades in the trailing 24 hours.
- **D-B — New service file** `server/services/daily-loss-budget.ts` (roadmap-named).
- **D-C — Trip condition** `rolling24hPnL / portfolioValue ≤ -(dailyLossKillSwitchPct/100)` → call `tripKillSwitch(mode, reason, lossPercent, threshold)`.
- **D-D — Reuse the existing knob + trip signature; introduce NO new risk-threshold constant.**
- **D-E — Per-mode, mode-generic.** Arm + force-trip-verify on **paper** (the B7b mode). Live inherits the identical code for Phase 21 (its trip is already a persisted no-op until the live engine exists; its 24h P&L is empty until then).
- **D-F — Realized P&L** (matches roadmap "P&L" + the existing equity infrastructure `getPortfolioBalanceV2`, which is realized-only by design).

### Data sources (all existing — zero new tables, zero migration):
- **Numerator (24h realized P&L):** per-mode closed trades — paper via `storage.getPaperSimTrades(mode,{closedOnly:true})`, live via `storage.getTrades(mode,{status:'closed'})` — filtered to `closedAt ≥ now − 24h`, summing the same `pnl`/`realizedPL` field `getPortfolioBalanceV2` already uses (`guardrail-settings.ts:106`).
- **Denominator (portfolio value):** `getPortfolioBalanceV2(mode)` (`guardrail-settings.ts:63`) — the existing per-mode current balance (`startingBalance + session realized P&L`).
- **Threshold:** `getGuardrailsV2({mode}).dailyLossKillSwitchPct`, the existing per-mode knob.

### OPEN QUESTIONS for Langston (Step-1 ACK):

**Q1 — Evaluation trigger: event-on-close (recommended) vs add a periodic watcher.**
Realized 24h P&L only *increases in loss* when a trade **closes** (the rolling window sliding forward only ever *removes* old losses — it never adds loss without a new close). So a **post-close hook** catches every increase to the loss budget with **no cron and no new cadence constant** — the cleanest fit for "no new constants." Hook point: the existing fire-and-forget tail of `paper-execution-engine.ts::closePosition` (`:1295` already documents a "must never block closePosition" fire-and-forget pattern) or the `eventBus.onTradeClosed` subscription (`:250`). **Recommendation: event-on-close only.** Alternative if you want belt-and-suspenders: a low-frequency periodic re-check (cadence `module_constants`-resolved, fail-loud, like B5c — *not* a threshold constant). I lean event-only to honor "no new constants" most strictly. **Your call.**

**Q2 — Re-trip-after-reset (the one genuinely thorny point).** A pure rolling-24h window is session-independent: after a manual reset + `/api/trading/start`, the same pre-trip losses are *still inside the trailing 24h* → the evaluator would **immediately re-trip**, trapping the operator until the losses age out. Proposed fix: **anchor the window to `max(now − 24h, engineSessionStart)`** — i.e. "rolling 24h, but never count trades from before the current engine session." This reuses `getEngineSessionStart(mode)` (already imported in `guardrail-settings.ts:84`), so a restart naturally rebaselines the budget to zero and there is **no immediate re-trip**, while normal operation is still a true trailing-24h window. **Recommendation: adopt the session-anchored 24h window.** Confirm.

**Q3 — Denominator confirm.** Use `getPortfolioBalanceV2(mode)` (current balance) as `portfolioValue`, matching the roadmap's `dailyPnL/portfolioValue` form. (Alternatives — `startingBalance`, or value-24h-ago — are marginal; current balance is simplest and reuses the existing function.) Confirm.

**Q4 — Realized-only limitation acknowledgment.** Because the budget is realized-only, a large *open-position* unrealized drawdown will not trip until the position closes. This matches the roadmap + the existing P&L infra and is a defensible first safety net (Kyle's "cheap insurance"). **Proposed home for the unrealized-drawdown extension: a named RUNNING_ISSUES follow-up → Phase-25 / B9-watch** (it wants real paper-run drawdown data to calibrate). Confirm this is the right disposition rather than in-scope for B6.

**Q5 — Warning tier OUT of scope.** The legacy design had a warning trigger (75% of the kill threshold) — that would require a new `dailyLossWarningTrigger` constant, violating "no new constants." **Proposed: hard-trip only for B6; no warning tier.** Confirm (or flag for Kyle if he wants the warning toast back — it would be a separately-named follow-up).

---

## §3 — NUMBERED OBJECTIVES (with verification criteria)

| # | Objective | Verification criterion |
|---|---|---|
| **B6-1** | New `server/services/daily-loss-budget.ts` computing per-mode **session-anchored rolling-24h realized loss %** from existing closed-trade + portfolio-balance sources. Pure/testable core function `evaluateDailyLossBudget(mode)` returning `{ lossPct, threshold, portfolioValue, windowStart, breached }`. | Unit tests: returns correct lossPct for a synthetic closed-trade set; respects the `max(now−24h, sessionStart)` anchor; handles zero/empty portfolio safely (no NaN, no false trip). |
| **B6-2** | **Auto-trip wiring**: when `breached` AND not already tripped AND active trading is on for the mode, call the existing `tripKillSwitch(mode, reason, lossPct, threshold)` with a descriptive reason. **Idempotent** (skip if `isKillSwitchTripped(mode)` already true). **Gated** on `isEngineActive` (dormant during VTS/passive). | Unit test: crossing loss → exactly one `tripKillSwitch` call with populated `lossPercent`/`threshold`; below-threshold → no call; already-tripped → no second call; engine-inactive → no call. |
| **B6-3** | **Evaluation hook**: invoke the evaluator from the post-close path (`closePosition` fire-and-forget tail / `onTradeClosed`), wrapped so it can **never block or throw into** the close path (rule-11 observable failure counter, not a silent swallow). | Code review: hook is fire-and-forget + try/caught + counter; close path unaffected on evaluator error. Pre-audit (Step-2) confirms no re-entrancy/deadlock when `tripKillSwitch → stopPaperSimulation` runs from within a close handler. |
| **B6-4** | **No new threshold constants**: reuse `dailyLossKillSwitchPct` + the existing `tripKillSwitch` signature. Any operational cadence (only if Q1 → periodic) is `module_constants`-resolved + fail-loud, never a hard-coded risk number. | `git diff` shows zero new threshold literals; the only constant touched is the existing DB-resolved knob. |
| **B6-5** | **FORCE-TRIP VERIFICATION (gate 7 — the core deliverable)**: a deterministic proof that (a) a crossing loss auto-trips the kill switch, (b) the tripped state blocks new trades via `trade-safety` check #1, and (c) the **recovery path** (`/api/trading/start` → `resetKillSwitch` → `killSwitchTripped=false` → trading resumes, no immediate re-trip thanks to the session anchor) works end-to-end. | Integration test driving a synthetic crossing loss → asserts trip + block + clean recovery. **PLUS** a staging force-trip exercise: temporarily lower `dailyLossKillSwitchPct`, drive a simulated paper loss, observe the auto-trip in logs + DB, then prove recovery. Evidence cited in the completion report. |
| **B6-6** | **Governance make-real**: SIM line 1551 gap closed + line 105 "confirmed safe" note updated; `SYSTEM_MANUAL.md` Ch 4 §9 Trigger #2 changed from intended→implemented (with the file/function); PHASE_19_PLAN §6 gate 7 flipped ✅; roadmap 19-4/§19.0.B marked done; legacy `KILL_SWITCH_INTEGRATION.md` reconciled or marked superseded. | Completion report's governance-files-changed list includes SIM + System Manual + PHASE_19_PLAN + roadmap + RUNNING_ISSUES + BATCH_CATALOG + PHASE_HISTORY. |

---

## §4 — DORMANCY / FUNCTIONAL DECLARATION (§9.1)

🚨 **THIS BATCH MAKES THE AUTO-TRIP FUNCTIONAL, BUT IT IS DORMANT-IN-EFFECT UNTIL ACTIVE PAPER TRADING IS SWITCHED ON (P19-B7b).** The evaluator only runs on the *active paper-close path* and is gated on `isEngineActive`; while the system is in VTS/passive learning there are no active paper trades closing, so it has nothing to act on — exactly like the B5 capture hooks. Its mechanism is force-trip-proven in B6 (deterministic test + staging exercise); its real live-close-driven exercise lands at B7b when paper trading turns on. This is the correct ordering — B6 is a **switch-on safety precondition**, built and proven before the flip, not after.

---

## §5 — EXPLICITLY OUT OF SCOPE

- **Warning tier** (75%-of-threshold soft alert) — needs a new constant; named follow-up if Kyle wants it (Q5).
- **Unrealized open-position drawdown** in the budget — realized-only for B6; named follow-up (Q4).
- **Live-mode live-engine stop** — `tripKillSwitch` live branch is a persisted no-op until the Phase-21 live engine exists; B6 arms the evaluator mode-generically but only paper is exercisable now.
- **UI surfacing** of the auto-trip event / kill screen — the existing `/kill-switch/status` + `killSwitchTripped` broadcast already drive the UI; any new paper-mode kill display rides the B7a UI-shell batch, not B6.
- **`kraken.ts`** — untouched (locked module).

---

## §6 — GOVERNANCE DOCS TO UPDATE (Step-10)

Tier-1: BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN (§1 row + §5 decision + §6 gate 7), MEMORY (4-way), completion report. Tier-2: SYSTEM_IMPACT_MAP (line 1551 gap close + line 105 note + new `daily-loss-budget.ts` component entry + any liveness-registry touch), SYSTEM_MANUAL Ch 4 §9 (make-real), POST_AUDIT_ROADMAP 19-4/§19.0.B (done), RUNNING_ISSUES (auto-trip closed; unrealized-drawdown + warning-tier follow-ups homed), CHANGES_AND_FIXES (the gap → fix), KILL_SWITCH_INTEGRATION.md (reconcile/supersede legacy doc).

---

## §7 — VERIFICATION PLAN (Steps 5-8)

1. Bench: `node scripts/check-tsc-baseline.mjs` (no regression) + `npx vitest run` (new B6 tests green, suite green).
2. CI all-4-green on the head commit.
3. Staging deploy + HTTP 200 clean boot.
4. **Force-trip exercise on staging** (gate 7): lower `dailyLossKillSwitchPct` for paper, drive a simulated crossing loss (existing `/api/test/simulate-loss` or a direct evaluator drive), observe auto-trip in `out.log` + the `guardrails_v2.killSwitchTripped` DB flag flip + `isEngineActive=false`, then restore via `/api/trading/start` and confirm clean resume (no immediate re-trip). Restore the threshold after.
5. Langston Step-4 (diff) + Step-8 (independent verification).

---

*Step-1 deliverable. On Langston ACK → Step-2 pre-audit (close-hook + re-entrancy + SIM deep read), then implementation.*
