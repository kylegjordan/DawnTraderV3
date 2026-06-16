# P19-B6 SCOPE — Daily Loss-Budget Kill Switch (RESTORE the deleted auto-trip)

> **Batch:** P19-B6 · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-16 · **Rev:** 2 (reframed build→restore after Kyle "it was working as of Phase 8, re-check the code")
> **Roadmap home:** 19-4 / §19.0.B · **Pre-flight gate:** PHASE_19_PLAN §6 gate 7
> **Status:** Step-1 rev-2 → re-engaging Langston with the corrected finding

---

## §0 — PREVIOUSLY-STATED-VS-NOW (§9.2 — mandatory delta)

> **PREVIOUSLY STATED (Rev-1 scope + PHASE_19_PLAN §3.6 + SIM 1551 + roadmap §19.0.B): "no daily-loss service exists; build a NEW `daily-loss-budget.ts` from scratch."**
> **NOW: the automatic evaluator EXISTED, was MODE-AWARE, was already wired to the modern `guardrailPolicy.tripKillSwitch`, and worked — it was DELETED on 2026-01-01 in commit `594aad717` "Remove legacy risk management and userId parameters." B6 is a RESTORE + RECONNECT of proven code, not a from-scratch build.**
> **REASON: Kyle directed a detailed re-check ("it was working as of Phase 8"). Git archaeology of the deleted `server/services/risk-manager.ts` recovered the actual `checkKillSwitch()` + `calculate24hPL()` implementation.**

---

## §1 — WHAT ACTUALLY HAPPENED (code-verified, not assumed)

The deleted `risk-manager.ts` (last seen at `594aad717^`, 2026-01-01) contained a **fully-built, mode-aware kill-switch evaluator** — already migrated to the modern kill-switch system (`killSwitchTripped` / `isEngineActive`, NOT the old `tradingSuspended`):

- **`calculate24hPL(mode, settings)`** — rolling-24h P&L: realized from `storage.getTrades(mode,{status:'closed'})` in the last 24h + (a stubbed, never-finished) unrealized; denominator `getPortfolioBalanceV2(mode)`; returns `lossPercent`.
- **`checkKillSwitch(mode, settings)`** — the evaluator:
  1. skip if `killSwitchTripped` already (idempotent);
  2. skip if `totalPL ≥ 0` (only act on a loss);
  3. `killSwitchThreshold = dailyLossKillSwitch || 7.00`; `warningThreshold = (dailyLossWarningTrigger/100) × killSwitchThreshold`;
  4. if `lossPercent ≥ killSwitchThreshold` → **force-close all open positions** (`closeAllTrades(mode)`) → log a `killSwitchEvent` → call **`guardrailPolicy.tripKillSwitch(mode, "DAILY_LOSS_THRESHOLD_EXCEEDED: X% >= Y%", lossPercent, threshold)`**;
  5. else if `lossPercent ≥ warningThreshold` → log a warning `killSwitchEvent` + return warning message.

**Three facts that shape the restore:**
- **F1 — The whole `RiskManager` class was deleted** (1,496 lines) because it was bundled with the userId-coupled legacy risk manager. The working auto-trip was collateral damage of a "remove legacy" sweep. (This is the exact failure mode CLAUDE.md §9 warns about — useful logic thrown out with legacy.)
- **F2 — The trigger wiring was ALREADY cut before deletion.** `checkKillSwitch` had **zero live call sites** at `594aad717^` (its old caller `heuristic-trader.ts` — also deleted — was the wiring). So the EVALUATION LOGIC is proven; the TRIGGER (what calls it, and when) is what B6 must (re)establish. This reconciles with the governance docs' "tripKillSwitch only called manually" — `checkKillSwitch` (which calls it) had itself gone dark.
- **F3 — A partial remnant still sits orphaned in the live tree:** `paper-metrics.ts::calculate24hPL()` (a copy of the 24h calc, zero callers). Confirms the migration scattered/abandoned this machinery.

**Doc reconciliation (governance make-real, B6-6):** SIM 1551, CHANGES_AND_FIXES 3282, PHASE_HISTORY 526, PHASE_19_PLAN §3.6 all say "no auto-trip code exists / only manual." That is true of the CURRENT tree but **mis-frames the history** — the code existed and was deleted. The completion report + these docs get corrected to "restored from `594aad717^` deleted `risk-manager.ts`."

---

## §2 — DESIGN (restore the proven logic into the current architecture)

**Spine (governance-fixed + now anchored to the real deleted code):** restore `checkKillSwitch` + `calculate24hPL` into a current-architecture home (`server/services/daily-loss-budget.ts`, roadmap-named), re-pointed at the modern mode-based sources, reusing `guardrailPolicy.tripKillSwitch`. Establish the trigger wiring that was cut.

### Langston's Rev-1 ACK positions still apply to the restored evaluator (re-confirm):
- **Q1 trigger = event-on-close only** (no cron). Provably complete for realized 24h loss (only rises on close). ✅ Langston agreed.
- **Q2 session-anchored 24h window** `max(now−24h, engineSessionStart)` to avoid immediate re-trip after a manual reset. ✅ agreed, **with the Step-2 precondition that `engineSessionStart(mode)` actually advances on `/api/trading/start`** (trace in code; if it doesn't, that's a prerequisite fix IN B6). The Phase-8 code used a pure 24h window (no anchor) — the anchor is an improvement we add.
- **Q3 denominator** = `getPortfolioBalanceV2(mode)` current balance. ✅ agreed. **Guard: `portfolioValue ≤ 0` → treat as breached (force-trip), never compute the ratio** (no NaN / sign-flip that suppresses a trip).
- **Q4 realized-only** for B6 — and the Phase-8 code ITSELF was effectively realized-only (its `unrealizedPL` was a `// TODO` stub = 0). So realized-only is faithful to what worked, not a regression. Unrealized = named follow-up.
- **Q5 idempotency + the `isKillSwitchTripped(mode)` first-line guard** = the re-entrancy circuit-breaker. ✅ The Phase-8 code already did skip-if-tripped (step 1).
- **Re-entrancy (Langston's hardest-eyes item)** — sharpened by the restore: the Phase-8 evaluator force-closed positions THEN tripped (which stops the engine). Restoring that faithfully = the exact nested-close hazard. Step-2 must trace whether `stopPaperSimulation`/the close path re-enters, require the **tick-deferred (`setImmediate`) hook**, and reconcile who closes positions (see N3).

### NEW decisions surfaced by the restore (need Langston, two may be Kyle's):
- **N1 — Restore vs rebuild.** Restore the proven `checkKillSwitch`/`calculate24hPL` logic (re-homed + re-pointed), NOT a clean-sheet design. **Recommend restore** (use-what-exists, proven, lower-risk). The roadmap's `daily-loss-budget.ts` filename is fine as the new home.
- **N2 — Warning tier (Kyle decision).** The Phase-8 code had a 75%-of-threshold warning. Its field `dailyLossWarningTrigger` exists ONLY in the legacy `tradingSettings` table — the modern `guardrails_v2` has NO warning field. So restoring the warning tier requires ADDING a field to `guardrails_v2` (a migration + effectively a new modern knob). **Options: (a) hard-trip only for B6 (Langston's no-new-constants lean); (b) restore the warning tier by adding `dailyLossWarningTrigger` to guardrails_v2.** Recommend surfacing to Kyle — it's his safety-net preference.
- **N3 — Does a kill CLOSE open positions, or just halt new trades? (Kyle-relevant safety semantics).** Phase-8 `checkKillSwitch` force-closed all open positions (`closeAllTrades`) before tripping — "stop the bleeding," including open drawdown. The modern `tripKillSwitch` stops the engine + clears the pool + sets `isEngineActive=false`, but Step-2 must verify whether it (via `stopPaperSimulation`) actually CLOSES open positions or leaves them open. **A real loss-budget kill should arguably flatten open positions, not just block new entries.** Step-2 determines current behavior; then decide restore-the-force-close vs halt-only. Ties directly into the re-entrancy design.
- **N4 — Circuit-breaker vs hard-daily-lockout (Kyle decision, carried from Langston Rev-1).** Session-anchored = circuit breaker on the current run (a deliberate restart rebaselines the budget). A "locked out till tomorrow no matter what" lockout is a different feature (needs a persisted lockout-until timestamp + constant). Ship circuit-breaker for B6; name hard-lockout as a Kyle decision.

---

## §3 — NUMBERED OBJECTIVES

| # | Objective | Verification |
|---|---|---|
| **B6-1** | Restore `calculate24hPL` + `checkKillSwitch` logic into `server/services/daily-loss-budget.ts`, re-pointed to modern sources (`guardrails_v2.dailyLossKillSwitchPct`, mode-aware closed-trade query, `getPortfolioBalanceV2`), session-anchored window, `portfolioValue≤0`→breach guard. | Unit tests vs synthetic closed-trade sets; anchor honored; no NaN on zero balance. Diff readable as a faithful re-home of the recovered code. |
| **B6-2** | Auto-trip wiring via existing `tripKillSwitch(mode, reason, lossPct, threshold)` — idempotent (`isKillSwitchTripped` first line), gated on `isEngineActive` (dormant in VTS/passive). | Crossing loss → one `tripKillSwitch` call w/ populated params; below → none; already-tripped/engine-inactive → none. |
| **B6-3** | Establish the trigger: **tick-deferred** (`setImmediate`) fire-and-forget post-close hook (`closePosition` tail / `onTradeClosed`), observable failure counter, never blocks/throws into the close path. | Step-2 re-entrancy trace answered (does the close path re-enter; shared locks; deferral releases lock before trip). Code review confirms deferral + counter. |
| **B6-4** | Resolve N3 (close-open-positions-on-kill) per Step-2 finding + Langston/Kyle; resolve N2 (warning tier) per Kyle; no new RISK-threshold constant beyond a Kyle-approved warning field. | Behavior matches the agreed decision; any cadence/field is DB-resolved + documented. |
| **B6-5** | **FORCE-TRIP VERIFICATION (gate 7)** — deterministic proof: crossing loss auto-trips; tripped state blocks new trades (`trade-safety` #1); recovery (`/api/trading/start`→`resetKillSwitch`→resume, no immediate re-trip via the anchor) works. | Integration test + staging force-trip exercise (lowered threshold + simulated loss), evidence in completion report. |
| **B6-6** | Governance make-real + history-correct: SIM 1551/105, System Manual Ch4 §9, CHANGES_AND_FIXES, PHASE_HISTORY, roadmap §19.0.B, PHASE_19_PLAN §6 gate 7, legacy `KILL_SWITCH_INTEGRATION.md`; DELETED_COMPONENTS_LOG reference to `594aad717` for provenance. | Completion-report governance list complete; history corrected from "never existed" to "deleted + restored." |

---

## §4 — DORMANCY / FUNCTIONAL DECLARATION (§9.1)

🚨 **B6 MAKES THE AUTO-TRIP FUNCTIONAL BUT DORMANT-IN-EFFECT UNTIL ACTIVE PAPER TRADING IS SWITCHED ON (P19-B7b).** It runs on the active paper-close path, gated on `isEngineActive`; in VTS/passive there are no active paper closes to evaluate. Mechanism is force-trip-proven in B6; real close-driven exercise lands at B7b.

---

## §5 — OUT OF SCOPE
Live-engine close-on-kill (Phase 21 no-op); UI kill-screen rework (rides B7a); unrealized-drawdown budget (named follow-up — single concrete home at Step-10 per §13, targeted Phase-25); `kraken.ts` (locked).

---

## §6 — GOVERNANCE (Step-10)
Tier-1: BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN (§1+§5+§6 gate 7), MEMORY, completion report. Tier-2: SIM (1551 gap close + 105 note + provenance), SYSTEM_MANUAL Ch4 §9, POST_AUDIT_ROADMAP 19-4, RUNNING_ISSUES (auto-trip restored; unrealized + warning-tier follow-ups homed), CHANGES_AND_FIXES, DELETED_COMPONENTS_LOG (restore provenance from `594aad717`), KILL_SWITCH_INTEGRATION.md reconcile.

---

## §7 — VERIFICATION (Steps 5-8)
Bench tsc-no-regression + vitest green → CI all-4-green → deploy HTTP200 → **staging force-trip exercise (gate 7)** → Langston Step-4 (diff vs the recovered code) + Step-8.

---

*Rev-2. Re-engaging Langston with the recovered deleted code + N1–N4. On his ACK → Step-2 pre-audit (re-entrancy trace + engineSessionStart-advances + stopPaperSimulation-closes-positions).*
