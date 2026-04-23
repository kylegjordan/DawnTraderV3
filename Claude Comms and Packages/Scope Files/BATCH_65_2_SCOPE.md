# Batch 65.2 — Trailing Exits: Functional, End-to-End

**Author:** Claude Code, 2026-04-23
**Status:** Step 1 scope. Pending Langston Step-4 review with paired pre-audit.
**System phase:** 15c
**Prereq:** B65.1 infrastructure deployed (module_constants table + service + resolution hierarchy live on staging)
**Supersedes:** The earlier B65.2 commit (`dd1f5372`) that shipped plumbing-only centralization with `useTrailing:false` on both callers. This scope completes what that commit did not: it actually turns trailing exits on, makes them write back to the trade rows, retires the Phase-11 duplicate, and verifies the behavior is observable in the running VTS within 24 hours of deploy.

---

## 1. Why this scope exists

Trailing exits were built in Phase 11 but never wired into production. Two parallel implementations coexist (one ATR-based with a two-stage latch + cost-aware floors, one percentage-based). Neither is called by the simulated-trade path (VTS) or the paper active-trading path. The ratcheted stop has no path back into the open-trade row, so even if the logic were engaged, the exit gate would not consume it. The closed simulated-trades table has no column to preserve trade mode on close. The UI already renders a "Moonbag" badge when the trade mode field is set, but nothing has ever written to that field because nothing calls the trailing engine. Adaptive sizing (position expand/contract on trendline reinforcement) is a separate dormant Phase-11 feature; it is deferred to B65.3 and is explicitly out of scope here.

The prior B65.2 commit centralized the exit-decision primitive. That was necessary but not sufficient. This scope is the "sufficient" half: the trailing engine actually runs, actually moves stops, actually closes trades on trailing hits, and is visible in the database and UI for both simulated trades and paper-mode open/closed trades.

**Success is observable in the VTS within 24 hours of deploy.** We do not need to wait for live trading to know whether this works. If the VTS produces zero closed trades with a `trailing_stop_hit` exit reason in the first 24 hours, the batch is not done.

---

## 2. Operating-mode context

Active trading OFF. Paper trading OFF. Only VTS (passive learning) is running. This batch wires trailing exits into both the simulated path and the paper active-trading path. The paper path will receive the change but will not be exercised until active trading is turned back on. The VTS path provides the live observability signal for verification.

---

## 3. Design decisions (already made, recorded for implementation)

### 3.1 Canonical trailing engine

The ATR-based engine at `server/services/trailing-exit-controller.ts` (Directive 9.2) is the canonical trailing engine and gets the "TEC" label going forward. The Phase-11 percentage-based implementation at `server/services/execution-controller.ts` (Directive 11.0C) is **deleted**, not deprecated or commented out, to prevent regression. All backing constants (`EXECUTION_CONFIG`), unit tests, and type definitions tied exclusively to the deleted implementation are deleted with it. Any symbol that another part of the codebase still references gets migrated to `module_constants` before the deletion lands so the build never breaks.

### 3.2 Moonbag qualifier

Not every trade enters trailing (moonbag) mode on target hit. Only trades whose strategy is on the qualifier list:

- `strong_bull_trend`
- `sma_trend_ride`
- `vwap_pullback` (but only when `sourcePool === 'quant-strong_trend'` — the B63 strong-trend-lane promotion)
- `breakout`

Trades on any other strategy close at target with exit reason `target_hit`, no trailing. The qualifier list lives in `module_constants` (`module_name = 'trailing_exit'`, `constant_name = 'moonbag_qualifying_strategies'`) as a JSON array so operators can tune without deploy.

### 3.3 Moonbag duration cap

Trailing mode closes automatically after 4 hours regardless of where the trailing stop sits. Prevents a single trade from indefinitely tying up a slot. Stored at `module_constants.moonbag_max_duration_ms = 14400000` (4 × 60 × 60 × 1000). Per-asset-class tunable — equity markets will need different caps at a future date.

### 3.4 Moonbag concurrency cap

Two different policies by mode:

- **VTS (passive learning):** No concurrency cap. The whole point of running trailing in VTS is to observe its behavior at scale across many concurrent trades. A cap would defeat the observation goal. Stored as `moonbag_cap_mode = 'unlimited'`.
- **Paper + live active trading:** Reserved-slots model. Current slot total is N. At most `N − moonbag_reserved_slots` open trades may be in moonbag mode simultaneously. Default `moonbag_reserved_slots = 1`. Tunable per mode via `module_constants`. Scales automatically as portfolio grows — small portfolios get meaningful protection, large portfolios find the cap non-binding, which is appropriate since slot-pressure fades with scale.

Stored as `moonbag_cap_mode = 'reserved_slots'` with companion `moonbag_reserved_slots = 1` for paper and live separately, so they can be tuned independently if live is ever set to be more conservative than paper.

### 3.5 Two-stage latch behavior (unchanged from existing 9.2 logic)

- **Stage 1 — break-even lock:** When price gains 1× ATR from entry, stop moves up to approximately entry price plus round-trip cost coverage. The trade can no longer become a net loser. Driven by `module_constants.break_even_trigger_r` (default 1.0). Applies to ALL trades, not just qualifiers. A trade that is not moonbag-qualifying still gets the break-even protection; it just does not enter trailing mode on target hit.
- **Stage 2 — target lock and trailing (moonbag):** When price hits target, if the trade qualifies (§3.2), mode flips from `TARGET` to `TRAILING_TAKE`. Stop locks at the cost-aware target floor. Thereafter stop ratchets up with new highs at a distance of `trail_distance_atr_multiplier × ATR` (default 1.0 × ATR). When price reverses through the ratcheted stop, trade closes with exit reason `trailing_stop_hit`. When hold time exceeds `moonbag_max_duration_ms`, trade closes with exit reason `moonbag_timeout`.

### 3.6 Stop writeback to open-trade rows

Every stop update (break-even lock, target lock, trailing ratchet) writes the new stop price back to the open-trade row. The exit gate reads the current stop from the row. This is the most important wiring fix — without it, the trailing engine's output is invisible to the exit gate and to the UI, which is why the Phase-11 implementation never visibly ran.

Concretely: the trailing engine's `updatePosition()` returns `newStopPrice` and `modeChanged`. Both are written to the appropriate open-trade row (simulated or paper) on every cycle the engine produces a change, with debouncing so we do not hammer the DB on every price tick. Persistence debounce = `module_constants.persistence_debounce_ms` (default 5000ms).

### 3.7 Trade-mode field across all trade-row tables

| Table | Column today | Action |
|---|---|---|
| `paper_sim_open_positions` | `trade_mode` exists | Populate on every mode change. |
| `paper_sim_trades` (closed sim) | does **not** exist | **Add column** in migration. Populate on close. |
| `trades` with mode=`paper` (paper active open/closed) | `trade_mode` exists | Populate. |
| `trades` with mode=`live` (live open/closed) | `trade_mode` exists | Populate. |

Migration: `2026-04-2x-b65-2-add-trade-mode-to-paper-sim-trades.sql` adds the column, backfills existing rows to `'TARGET'` (the default), and adds a constraint `trade_mode IN ('TARGET','TRAILING_TAKE')`.

### 3.8 Volatility input to trailing engine

The trailing engine requires ATR as an input. The current B65.2 commit passes `atr: 0` from the VTS caller, which disables the trailing math entirely. This scope replaces that with a real ATR value sourced from the same ATR calculation path that the strategy engines use for initial stop placement (`analysis-utils.ts::calculateATR` or the VTS path's equivalent — pre-audit confirms the exact source). Same for the paper path.

### 3.9 Adaptive sizing — explicitly out of scope

Deferred to B65.3. This batch does not touch `updateAdaptiveSize` or the `Trendline` type. Adaptive sizing stays dormant with a TODO note pointing to B65.3's scope document.

---

## 4. Implementation plan

Ordered steps. Each step is atomic and the build must pass after each.

### Step A — Inventory & safety

A.1. Grep the whole codebase for every reference to `executionController`, `ExecutionControllerImpl`, `EXECUTION_CONFIG`, `TradeExecutionController`, `ActiveTrade.trailingStop`, `ActiveTrade.trendline`, `Trendline`, `AdaptiveSizeResult`, `TECConfig`, `updateAdaptiveSize`, and every constant in `execution-config.ts`. Record each hit in the pre-audit.

A.2. For each hit, classify: (a) inside the files to be deleted (safe to delete), (b) in unit tests that only exist to test the deleted files (safe to delete), (c) in live code that must be migrated or re-pointed, (d) in governance docs (updated as part of §6 governance).

A.3. For category (c), plan the migration: every genuinely-used constant from `EXECUTION_CONFIG` either lands in `module_constants` as part of B65.1's `trailing_exit` module or gets moved to a more appropriate location. No orphans.

### Step B — Module-constants seeds

B.1. Extend the B65.1 seed for module `trailing_exit`:
- `moonbag_qualifying_strategies` = JSON array `["strong_bull_trend","sma_trend_ride","vwap_pullback","breakout"]` (global wildcard row).
- `moonbag_qualifying_source_pools` = JSON mapping `{"vwap_pullback":["quant-strong_trend"]}` for strategies that only qualify in specific source pools (optional refinement; if absent, the strategy qualifies regardless of source pool).
- `moonbag_max_duration_ms` = `14400000`
- `moonbag_cap_mode` per mode: `'unlimited'` for VTS, `'reserved_slots'` for paper and live.
- `moonbag_reserved_slots` = `1` for paper and live.

B.2. New migration file seeds the rows. Rollback file removes them.

### Step C — Schema: add `trade_mode` to `paper_sim_trades`

C.1. Migration adds the column with a default of `'TARGET'`.
C.2. Backfill all existing rows to `'TARGET'`.
C.3. Add check constraint `trade_mode IN ('TARGET','TRAILING_TAKE')`.
C.4. Rollback file drops the constraint and column.

### Step D — Delete the Phase-11 trailing engine

D.1. Delete `server/services/execution-controller.ts`.
D.2. Delete `server/config/execution-config.ts`.
D.3. Delete `server/tests/unit/tco-tec-tcl.test.ts`.
D.4. Delete `Trendline`, `TradeExecutionController`, `ActiveTrade.trailingStop` and `ActiveTrade.trendline` from `server/types/trade-flow.ts`. If `ActiveTrade` is still used after the deletion of these two fields, leave it; the pre-audit confirms.
D.5. Grep for the deleted symbols. Zero hits expected. Any hit blocks the batch.

### Step E — Upgrade the trailing engine (`trailing-exit-controller.ts`)

E.1. Load `module_constants` for the `trailing_exit` module at engine initialization with 60s refresh, same pattern as `module-constants-service` uses internally.
E.2. Break-even trigger, target-lock trigger, trail-distance multiplier all read from module_constants with the B65.1 seed defaults as fallbacks.
E.3. Moonbag qualifier check (§3.2): when `isTargetLockTriggered()` fires, also check `isMoonbagQualifier(strategy, sourcePool)` — if false, do NOT flip mode to `TRAILING_TAKE`. Instead, return a decision that closes the trade at target (existing `target_hit` reason).
E.4. Moonbag duration cap (§3.3): on each `updatePosition()` call, if `tradeMode === 'TRAILING_TAKE'` and hold time exceeds `moonbag_max_duration_ms`, return a close decision with new exit reason `moonbag_timeout`.
E.5. Moonbag concurrency cap (§3.4): new service method `canEnterMoonbag(mode, currentConcurrentMoonbags, currentSlotTotal)`. VTS returns true always. Paper/live returns `currentConcurrentMoonbags < currentSlotTotal − reservedSlots`. If false, trade closes at target instead of entering trailing.
E.6. Stop writeback (§3.6): `updatePosition()` gets a new optional callback `onStopChange(newStop, newMode)` the caller passes. Default implementation writes to the appropriate trade-row table.

### Step F — Wire the VTS path

F.1. VTS exit loop (`vts-runner.ts`, the loop I refactored in the prior B65.2 commit) now calls `evaluateTECExit({ useTrailing: true })` instead of `useTrailing: false`.
F.2. VTS passes a real ATR value from the cached indicator set (not 0). Pre-audit confirms exact source path.
F.3. VTS passes the current concurrent-moonbag count and current slot total for the cap check.
F.4. On `trailing_stop_hit` or `moonbag_timeout` exit, the VTS's existing persist-closed-trade logic captures the exit reason correctly into the sim-closed-trades table, including the trade_mode column (from the engine's final state).
F.5. Open-trade-row writeback: the VTS does not currently maintain an open-sim-trade table — it uses an in-memory Map. Pre-audit decides whether to add DB persistence for open sim trades now, or keep the in-memory map and have the UI read from a new lightweight endpoint that exposes engine state. Leaning toward the lightweight endpoint to avoid scope creep into DB-backing 500 concurrent trades.

### Step G — Wire the paper path

G.1. Paper exit-condition check (`paper-execution-engine.ts::checkExitConditions`, which I delegated to the evaluator in the prior commit) now calls with `useTrailing: true` and passes real ATR.
G.2. Remove paper's metadata-driven percentage-trailing block (`metadata.trailingStopPercent + highWaterMark`) from `checkExitConditions` — it's a different algorithm and will fight the ATR engine.
G.3. Paper passes the current concurrent-moonbag count and slot total for the cap check.
G.4. On every mode change or stop change, paper writes `trade_mode` and `stop_loss` back to the `paper_sim_open_positions` row.
G.5. On close, paper writes `trade_mode` to the closed trade row (both `paper_sim_trades` and `trades` depending on which mode wrote).

### Step H — UI verification surface

H.1. Confirm existing `active-trades-v2.tsx` MOONBAG badge renders correctly when `trade_mode === 'TRAILING_TAKE'`.
H.2. Add the same badge to the closed-trades view (`closed-trades-*.tsx`) so historical trades show which ones ended in moonbag mode.
H.3. Add badge to the simulated-trade views (open + closed) — pre-audit identifies the exact component paths.

### Step I — Parity tests

I.1. Update the parity test (`server/tests/unit/b65-tec-parity.test.ts`) to cover the new scenarios:
- Qualifier accepts: qualifying strategy enters trailing on target hit.
- Qualifier rejects: non-qualifying strategy closes at target, no trailing.
- Duration cap: moonbag trade held past 4h closes with `moonbag_timeout`.
- Concurrency cap (paper): `canEnterMoonbag` returns false when `N − reserved = current`.
- Concurrency cap (VTS): `canEnterMoonbag` returns true at arbitrary concurrency.
- Stop writeback: callback fires with expected new stop price on each ratchet.
I.2. Add an integration-style test at `server/tests/integration/b65-tec-end-to-end.test.ts` that drives a price path through the VTS exit loop (with a mocked price cache) and verifies the sim-closed-trades table receives a `trailing_stop_hit` row with `trade_mode = 'TRAILING_TAKE'`.

### Step J — Deploy and verify

J.1. Commit in logical chunks (schema migration; deletion commit; engine upgrade; VTS wire; paper wire; tests; governance). Push.
J.2. CI green on all blocking checks. TypeScript errors: no new errors (count identical to pre-B65.2 baseline of 645 legacy).
J.3. Deploy to staging (`git pull && npm run build && npm run db:migrate && pm2 restart`).
J.4. Staging verification — the 24-hour success signal:
- Query `paper_sim_trades` for rows with `exit_reason = 'trailing_stop_hit'` and `trade_mode = 'TRAILING_TAKE'` from after deploy time. Target: ≥ 1 such row within 24 hours.
- Query for `exit_reason = 'moonbag_timeout'` rows. Target: appears if any VTS trade actually held past 4h in trailing.
- Query for `trade_mode = 'TRAILING_TAKE'` on the currently-open sim positions snapshot (via the new lightweight endpoint from F.5). Target: at least one open sim trade in trailing at any given moment during the 24h window.
- Spot-check VTS closed-trade PnL distribution: `trailing_stop_hit` closes should have average profit higher than the original `target_hit` average (they got past target and then some). Not a hard pass/fail, but a sanity check.
J.5. PM2 log scan for TEC errors, mode-sync failures, stop-writeback errors. Zero tolerance.

---

## 5. Non-goals

- Adaptive sizing — B65.3.
- Changing trailing policy (distance multipliers, latch triggers) — B66 territory.
- Adding per-strategy TEC parameters beyond the qualifier list — B66 if needed.
- Migrating the Phase-11 VTS percentage-trailing (it's already excluded from the new path, just confirming it does not get re-introduced).
- Paper's position-level `maxHoldingPeriod` metadata — stays inline in paper-execution-engine, not touched.

---

## 6. Governance checklist (Step 10)

Tier 1:
- `BATCH_CATALOG.md` — update the B65.2 row from "SHIPPED — plumbing only" to "SHIPPED — functional trailing exits end-to-end" with new commit chain.
- `PHASE_HISTORY.md` — update Phase 15c status with B65.2 completion.
- `MEMORY.md` — volatile state refresh.
- `BATCH_65_2_COMPLETION_REPORT.md` — new file, covers this batch.

Tier 2 (all applicable):
- `SYSTEM_IMPACT_MAP.md` — add `trailing-exit-controller.ts` as a connected service with its full dependency graph. Remove `execution-controller.ts`. Update VTS + paper exit-loop entries to reflect the new call path.
- `SYSTEM_MANUAL.md` — rewrite the exit-decision pipeline section to describe the trailing engine's two-stage latch, the moonbag qualifier, duration + concurrency caps, and the stop-writeback flow.
- `CHANGES_AND_FIXES.md` — entries for: (a) wiring trailing exits after 8 months dormant, (b) deleting the Phase-11 duplicate implementation.
- `RUNNING_ISSUES.md` — close any existing "TEC dormant" issue.

Workflow rename:
- `CLAUDE.md` §2 — rename workflow steps from "Phase 1...Phase 11" to "Step 1...Step 11" to prevent collision with system phase labels.
- Any other governance doc that references workflow-step numbers gets the same treatment.

Change list:
- `Claude Comms and Packages/Change Lists/BATCH_65_2_CHANGE_LIST.md` — per-file change list for Langston's Step 4 review.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Deleting `execution-controller.ts` breaks a live import somewhere I missed | Step A orphan check + CI build-green gate. Build fails if any hit remains. |
| VTS in-memory state for trailing gets out of sync with DB on restart | Persistence debounce writes to existing `trade-safety.ts` persist path (used by 9.2 module already); restart recovery uses `importStates` from the engine module, which already exists. Pre-audit confirms. |
| Real ATR value in VTS path comes from a stale cache | Pre-audit identifies exact source; if cache staleness is a concern, trailing engine pulls fresh ATR via the same path the signal engine uses. |
| Moonbag concurrency cap race condition when 2+ trades hit target in the same cycle | Cap check is evaluated once per cycle against the current count; if N−K qualifiers hit target in the same cycle but only N−K−1 slots are available, the first (sorted by symbol) get moonbag and the rest close at target. Deterministic, no race. |
| 4h duration cap too short for strong crypto trends | The cap is a tunable `module_constants` entry; can be adjusted without deploy if observation shows it truncating profitable continuations. The observation window verifies this. |
| VTS scale exposes a performance issue at 100+ concurrent moonbag trades | VTS has no cap by design (§3.4); if the engine's per-cycle work becomes a bottleneck, we add observability and address in a follow-up. Not blocking for B65.2. |

---

## 8. Langston review request

Please review for:
- Any hole in the implementation plan's step ordering (dependency issues?).
- Any deleted symbol or migrated constant I missed.
- The `canEnterMoonbag` cap semantics under concurrent target-hits.
- The VTS open-sim-trade writeback decision in F.5 — endpoint vs. DB table.
- Whether the 4h moonbag duration should be higher/lower for crypto specifically (you proposed 4h originally; confirming).
- The decision to NOT backfill the sim-closed trade_mode column with derived values from existing metadata (we backfill to `'TARGET'` because no historical trade has ever been in TRAILING_TAKE mode — correct?).

When you are happy, I'll begin implementation and send the per-file change list for Step 4 review before push.
