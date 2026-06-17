# P19-B6 SCOPE — Daily Loss-Budget Kill Switch (RESTORE deleted auto-trip + flatten + 2 warning tiers, per-mode)

> **Batch:** P19-B6 · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-16 · **Rev:** 3 (Kyle decisions folded: flatten, two warnings 50%/75%, per-mode guardrail fields, circuit-breaker)
> **Roadmap home:** 19-4 / §19.0.B · **Pre-flight gate:** PHASE_19_PLAN §6 gate 7
> **Status:** Step-1 rev-3 → re-engaging Langston on the expanded surface (warning tiers + migration)

---

## §0 — DECISIONS LOG (Rev-1 build → Rev-2 restore → Rev-3 Kyle calls)

- **PREVIOUSLY (Rev-1 + plan §3.6 + SIM 1551): "no daily-loss service exists; build new."** **NOW: the mode-aware auto-trip EXISTED, was wired to the modern `tripKillSwitch`, and was DELETED 2026-01-01 in `594aad717` ("Remove legacy risk management"). B6 = RESTORE.** (Kyle "it was working as of Phase 8, re-check.")
- **Kyle decisions 2026-06-16 (override my Rev-2 recommendations where noted):**
  1. **FLATTEN on kill** — restore the Phase-8 force-close: at the limit, close ALL open positions, then halt. (CC + Langston + Kyle all agree; the more correct policy.)
  2. **TWO warning tiers — 50% AND 75% of the kill threshold** — restore the warning functionality and add a second tier. (Overrides my Rev-2 "hard-trip-only" — Kyle wants it restored.)
  3. **Per-mode user guardrails** — the kill limit + both warning levels are user-settable, with a SEPARATE set for **paper** and **live**. Kill limit is already per-mode in `guardrails_v2`; the two warning levels are NOT there yet → add them (migration, both modes).
  4. **Circuit-breaker** (restore-as-was) — a deliberate restart rebaselines the day's loss counter. Hard "locked-out-till-tomorrow" cap = named follow-up (more relevant for live; Kyle can request).
  5. **Recommended opening defaults (Kyle-adjustable):** paper kill **15%** (no real risk → set higher so the learning run is not halted by ordinary variance), live kill **7%** (conservative, established default). Warnings stored as **% of the kill threshold**: warn-1 = **50**, warn-2 = **75** (so paper warns at 7.5%/11.25% loss; live at 3.5%/5.25%; auto-scale with the limit).

---

## §1 — WHAT ACTUALLY HAPPENED (code-verified)

Deleted `risk-manager.ts` (`594aad717^`, 2026-01-01) held a fully-built, mode-aware evaluator already on the modern trip path:
- **`calculate24hPL(mode, settings)`** — rolling-24h realized P&L (`getTrades(mode,{closed})` last 24h) + (stubbed-zero) unrealized; denominator `getPortfolioBalanceV2(mode)`; returns `lossPercent`.
- **`checkKillSwitch(mode, settings)`** — skip-if-tripped → skip-if-no-loss → `killThreshold = dailyLossKillSwitch||7` → `warning = (warnPct/100)×killThreshold` → if `lossPercent ≥ killThreshold`: **`closeAllTrades(mode)` (force-close ALL open positions)** → log `killSwitchEvent` → `guardrailPolicy.tripKillSwitch(mode, "DAILY_LOSS_THRESHOLD_EXCEEDED…", lossPercent, threshold)`; else if `≥ warning`: log warning event.

**Facts:** F1 — whole 1,496-line `RiskManager` deleted (auto-trip = collateral of a remove-legacy sweep). F2 — `checkKillSwitch` had ZERO live callers even at deletion (trigger wiring already cut); logic proven, trigger is what B6 re-establishes. F3 — orphan remnant `paper-metrics.ts::calculate24hPL()` (zero callers) still in the live tree → **DELETE in B6** (§15, no two-sources-of-truth).

---

## §2 — DESIGN (restore + flatten + 2 warnings, per-mode; CC+Langston+Kyle aligned)

**Restore `checkKillSwitch` + `calculate24hPL` into `server/services/daily-loss-budget.ts`**, re-pointed at `guardrails_v2` + mode-aware sources. Restore **only** those two methods (no userId-coupled surface). Establish the cut trigger as a **tick-deferred post-close hook**.

### Resolved decisions:
- **N1 restore** ✅ — two methods only; F3 orphan deleted (§15, DELETED_COMPONENTS_LOG + restore-provenance from `594aad717`); Step-4 diffs the restore line-for-line vs the deleted code.
- **N2 warnings** ✅ (Kyle) — restore + TWO tiers (50%, 75% of kill threshold). Each warning logs a `killSwitchEvent` **and fires a system-alert** (so it is actionable now, not decoration — visible via the existing alert channel before the B7a paper UI). Warning is advisory only (no halt, no flatten).
- **N3 flatten + re-entrancy** ✅ (Kyle + Langston + CC) — kill flattens all open positions then halts. **Langston's critical correctness constraint — the trip/flatten ORDERING is NOT restored verbatim:**
  - **Latch/trip FIRST, then flatten.** Set the tripped state before `closeAllTrades` runs, so every fan-out close-hook in the same tick hits `already-tripped → no-op`.
  - **Synchronous in-memory latch** (`killInProgress[mode]`) set at evaluator entry and checked **before any `await`** — closes the TOCTOU window where two same-tick deferred evaluators both pass an async DB guard → two concurrent flattens. DB `killSwitchTripped` is for durability, not the guard.
  - **Flatten path bypasses / provably suppresses the hook** (close-without-re-arm for the kill-driven flatten).
  - Hook remains `setImmediate` fire-and-forget + observable failure counter; never blocks/throws into the close path.
- **N4 circuit-breaker** ✅ (Kyle) — session-anchored window `max(now−24h, engineSessionStart)` (Step-2 verifies `engineSessionStart` advances on `/api/trading/start`); hard-lockout = named follow-up.
- **Q1–Q3 (Rev-1, still hold):** event-on-close trigger; `getPortfolioBalanceV2` denominator with `≤0→breach` guard; realized-only 24h P&L (faithful — Phase-8 unrealized was a stub; but note flatten force-realizes open drawdown at kill, partially covering the gap).

### Migration (NEW in Rev-3):
Add to `guardrails_v2` (per-mode, both rows): `dailyLossWarning1Pct` (default 50.00) + `dailyLossWarning2Pct` (default 75.00), stored as % of the kill threshold. Seed paper kill 7→**15**, keep live kill 7 (Kyle defaults; user-adjustable). Coherency RULE_007 (kill 1–25%) still applies; add bounds rules for the warnings (0 < warn1 ≤ warn2 ≤ 100). Migration is gitignored `*.sql` → `git add -f` + MANIFEST.

---

## §3 — NUMBERED OBJECTIVES

| # | Objective | Verification |
|---|---|---|
| **B6-1** | Migration: per-mode `dailyLossWarning1Pct`/`dailyLossWarning2Pct` on `guardrails_v2` + coherency bounds + paper-kill 15 / live-kill 7 seed; expose via the existing guardrails settings API/UI (paper + live each settable). | Migration applies; both mode rows carry kill + 2 warnings; coherency rejects out-of-range; values editable per mode. |
| **B6-2** | Restore `calculate24hPL` + `checkKillSwitch` into `daily-loss-budget.ts`, re-pointed at `guardrails_v2`/mode-aware sources, session-anchored window, `≤0→breach` guard; delete F3 orphan. | Unit tests vs synthetic closed-trade sets; diff reads as a faithful re-home; orphan gone, tsc clean. |
| **B6-3** | **Flatten-on-kill with latch-first ordering**: set the in-memory `killInProgress` latch + persist trip → `closeAllTrades(mode)` → `tripKillSwitch(mode, reason, lossPct, threshold)`. Idempotent; gated `isEngineActive`. | Unit test: crossing loss → latch set first → all open positions closed exactly once (no cascade) → one trip; below → none; already-tripped → no-op. |
| **B6-4** | **Two warning tiers** (50%/75% of kill threshold): on cross, log `killSwitchEvent` + fire a system-alert; no halt/flatten. De-duped (don't re-fire the same tier every close within a session). | Unit test: loss between warn-1 and kill → warn events/alerts fire once per tier, no trip; loss ≥ kill → trip path (not warning). |
| **B6-5** | **Trigger**: tick-deferred (`setImmediate`) fire-and-forget post-close hook (`closePosition` tail / `onTradeClosed`), observable failure counter, flatten path suppresses re-arm. | Step-2 re-entrancy trace (does close path re-enter; shared locks; latch visible to every same-tick hook; deferral releases lock before trip). |
| **B6-6** | **FORCE-TRIP VERIFICATION (gate 7)** — crossing loss auto-trips + flattens; warnings fire at 50%/75%; tripped blocks new trades; recovery (`/api/trading/start`→resume, no immediate re-trip via anchor) works. | Integration test + staging force-trip exercise (lowered paper threshold + simulated loss), evidence in completion report. |
| **B6-7** | **Governance make-real + history-correct**: SIM 1551/105 + System Manual Ch4 §9 (auto-trip + flatten + 2 warnings, per-mode) + CHANGES_AND_FIXES + PHASE_HISTORY + roadmap §19.0.B + PHASE_19_PLAN §6 gate 7 + DELETED_COMPONENTS_LOG (restore provenance + F3 deletion) + KILL_SWITCH_INTEGRATION.md reconcile; hard-lockout + unrealized-budget homed (§13). | Completion-report governance list complete; history corrected. |

---

## §4 — DORMANCY / FUNCTIONAL (§9.1)

🚨 **The auto-trip + flatten are FUNCTIONAL but DORMANT-IN-EFFECT until active paper trading is switched on (B7b)** (run on the active paper-close path, gated `isEngineActive`). **The guardrail SETTINGS (kill + 2 warnings, per-mode) and their UI ARE live immediately** — they're user config, not trade-path. Force-trip-proven in B6; real close-driven exercise at B7b.

---

## §5 — OUT OF SCOPE / NAMED FOLLOW-UPS (§13)
Hard daily-lockout (un-bypassable cap; persisted `lockout-until` + trading-day boundary) → named RUNNING_ISSUES item, Kyle-requestable, live-relevant. Unrealized-drawdown in the 24h budget → named RUNNING_ISSUES item, Phase-25 (needs paper-run drawdown data). Live-engine flatten-on-kill → Phase-21 (live engine no-op today). `kraken.ts` locked.

---

## §6 — GOVERNANCE (Step-10)
Tier-1: BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN (§1+§5+§6 gate 7), MEMORY, completion report. Tier-2: SIM, SYSTEM_MANUAL Ch4 §9, POST_AUDIT_ROADMAP 19-4, RUNNING_ISSUES, CHANGES_AND_FIXES, DELETED_COMPONENTS_LOG, KILL_SWITCH_INTEGRATION.md, MULTI_ASSET (per-mode guardrail note if applicable).

---

## §7 — VERIFICATION (Steps 5-8)
Bench tsc-no-regression + vitest → CI all-4-green → deploy HTTP200 → **staging force-trip exercise (gate 7: trip + flatten + 2 warnings + recovery)** → Langston Step-4 (diff vs recovered code + migration) + Step-8.

---

*Rev-3. Re-engaging Langston on the expanded surface (2 warning tiers + per-mode migration + warning→system-alert). On ACK → Step-2 pre-audit (re-entrancy trace + engineSessionStart-advances + stopPaperSimulation-closes-positions + warning de-dup design).*
