# B-XSTOCK-CALIB · F-NOW COMPLETION REPORT — calibration_state tag plumbing (VTS-only)

**Sub-batch:** F-NOW (#10 of the B-XSTOCK-CALIB umbrella). **CLOSED:** 2026-06-01. **Active trading:** OFF throughout (VTS passive learning only; zero capital risk).
**Commit:** `cdac422b9` (code + migration + governance head). **Migration:** `2026-06-01-f-now-calibration-state.sql` (+ rollback). **CI:** run `26757161780` — all-4-green (TypeScript Check, Test Suite, Build, Docker Build). **Deploy:** PM2 dawntrader online, HTTP 200.

---

> 🚨 **THIS BATCH DOES NOT MAKE THE PRE-CALIBRATION FILTER FUNCTIONAL IN ANY UI OR DECISION PATH. The exclusion (`buildCalibrationClause`) is OPT-IN and WILL REMAIN INERT — no caller passes `excludePreCalibration=true` — UNTIL THE PHASE-25 CLOSED-OUTCOME SCORING STEP IS BUILT.** What F-NOW *does* make functional now: the stamping (every xStock VTS trade is tagged), the retroactive backfill (17,184 alternates rows), and the forward propagation (new closes inherit the parent's tag). The filter mechanism is fully built and gated at its future consumer — the NO-PATCHES-correct split (build the whole mechanism, apply it where it's actually needed), not a half-ship.

---

## PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2)

| Item | PREVIOUSLY | NOW | Reason |
|---|---|---|---|
| Aggregator exclusion | "exclude pre-cal rows when scoped to xStock" (scope §1 row 10; built unconditional in commits `f131e0272`/`edf395f35`) | **OPT-IN** `buildCalibrationClause(assetClass, excludePreCalibration)` — default-off; live panels unchanged; applied only by the future Phase-25 caller | A proper Step-2 upstream/downstream audit (prompted by Kyle pushback) surfaced that the aggregator feeds the LIVE xStocks-tab Exit-Strategy-Ablation panel — unconditional exclusion would have emptied it (all 1,432 xStock trades are pre-cal). Kyle decision 2026-06-01: keep the live panel. |
| Forward-propagation key | (implicit: the trade id) | `originalSignalId` (= `vts_open_trades.id`), NOT the replay `tradeId` | Buried linkage: replay `tradeId` is rebuilt from symbol+exitTime (vts-service.ts:816) and never equals the open id; a `WHERE id=tradeId` sub-select would silently never match (surfaced pre-audit §3). |
| Sub-select per row | (initial: one correlated sub-select per variant row) | resolve ONCE per close, stamp all 12 | Langston Q2 micro-opt; also makes the resolved value unit-testable. |

## Scope objectives — status

| # | Objective | Result |
|---|---|---|
| 1 | `calibration_state` on `vts_open_trades` (VTS-only), default pre-cal, back-stamp existing | ✅ YES — NOT NULL DEFAULT; 1,793 xStock + 2,005 crypto rows tagged via PG fast-default |
| 2 | Retroactively backfill all existing xStock VTS trades → `exit_strategy_alternates` | ✅ YES — 17,184 xStock VTS alternates rows tagged in-migration (post-deploy NULL count = 0) |
| 3 | Forward propagation via the replay-service writer | ✅ YES — `resolveCalibrationState(ctx.vtsOpenTradeId)`; live-writer confirmed on first post-deploy close |
| 4 | Aggregator excludes pre-cal when scoped to xStock | ✅ YES (capability) / **INERT** (application) — opt-in default-off per Kyle; Phase-25 caller activates. §9.1 declared above. |
| 5 | Do NOT touch the active-paper path | ✅ YES — `paper_sim_open_positions` untouched; paper-sourced alternates resolve to NULL (none exist today) |
| 6 | CI green + governance + completion report | ✅ YES — this turn |

## Verification (outcomes-based)

- **Local bench (`480d1e3` + changes):** `npx tsc --noEmit` = **493** — clean baseline on this exact commit re-measured = 493 → **0 net new** (the 4 `vts-service.ts` errors at 548/811/984/990 are pre-existing baseline). `npx vitest run b-xstock-calib-f-now` = **10/10 pass**.
- **CI:** run `26757161780` all-4-green.
- **Migration:** applied cleanly (`[db-migrate] ✓ 2026-06-01-f-now-calibration-state.sql`). Rollback validated on staging via `BEGIN; DROP COLUMN IF EXISTS …; ROLLBACK;` (ran clean, both columns survive).
- **psql (post-deploy):** `vts_open_trades` — every xStock + crypto row tagged `pre_calibration_xstock_2026_05`. `exit_strategy_alternates` — xStock VTS 17,184 tagged, crypto VTS NULL (intended). **CRITICAL (Langston §6): xStock-VTS NULL count = 0.**
- **Forward-path (Langston §6 — the assertion that proves the live writer, not just the backfill):** confirmed on the first post-deploy VTS close — the new alternates row carried the parent's tag (not NULL).
- **UI (§9.3):** the design outcome is "no UI change." Confirmed the live xStocks-tab Exit-Strategy-Ablation panel is **unchanged** at its data source — `/api/xstocks/exit-strategy-ablation?window=rolling_30d` returns `totalTrades: 1433, variants: 12, ready: true` (if the exclusion had leaked into the live path this would be ~0). Claude-in-Chrome confirmed the ML page renders (logged-in session) and the **xStocks** tab is present. The unit test proves `buildCalibrationClause('xstock_spot', false)` emits no clause, so the live endpoint query is provably identical to pre-F-NOW.

## Governance files changed

`SYSTEM_IMPACT_MAP.md` (F-NOW B73 addendum: full upstream/downstream + the audit-miss finding + fail-open/scoped-reads/flip-stress notes), `SYSTEM_MANUAL.md` (B73 section: calibration_state propagation + opt-in exclusion), `BATCH_CATALOG.md` (F-NOW row in the B-XSTOCK-CALIB table), `PHASE_HISTORY.md` (Sub-batch 10 entry + process learning), `CHANGES_AND_FIXES.md` (CLOSURE-2026-06-01 F-NOW), `RUNNING_ISSUES.md` (deferred recurring-zero-NULL-guard consideration), `ASSET_CLASS_ONBOARDING_WORKFLOW.md` (§3.3 learnings), `MULTI_ASSET_VTS_EXPANSION_PLAN.md` (Phase-24 progress), `MEMORY.md` (3-way), scope/pre-audit/change-list in `Claude Comms and Packages/`. This report.

## Asset-class onboarding workflow learnings (§3.3 — MANDATORY for Phase-24 batches)

**(a) What worked well.** The buried-linkage discipline paid off: tracing the replay writer's id scheme (rather than assuming `trade_id` was the open id) caught a silent-no-match that would have tagged zero rows. The resolve-once + exported-helper refactor made the risky resolution directly unit-testable. The DB fast-default backfilled `vts_open_trades` with zero write-path code.

**(b) What surprised us.** The replay writer's `tradeId` is reconstructed from symbol+exit-time and is NOT the open id — the open id only survives as `originalSignalId`. Asset-class onboarding repeatedly hits this "the obvious key isn't the join key" trap; worth a standing check.

**(c) Recurring structural pattern — the one that bit this batch.** A single aggregator surface feeds BOTH a live exploratory UI panel AND a future evaluation path. Scoping a filter "for the calibration/evaluation" silently changes the live UI because they share the surface. **The fix pattern: make the filter OPT-IN (default-off, applied only by the evaluation caller), never unconditional on the shared aggregator.** This is the second time an xStock-scoped change rode a shared crypto component (B79.0i.b reused `ExitStrategyAblationSection`); onboarding must enumerate every consumer of a shared surface before adding a scoped filter.

**(d) Process learning (the audit miss) + proposed workflow edit.** The v1 pre-audit consulted the impact map by grep-and-cite, did not deep-read the System Manual, and did not trace the aggregator's UI consumers — so the live-panel-empties consequence wasn't surfaced until Kyle pushed back. Step 1.a + Step 2 require a *code-level* upstream/downstream read of SIM **and** System Manual. **Proposed `ASSET_CLASS_ONBOARDING_WORKFLOW.md` edit (applied this governance turn):** add a checklist item — "when a batch adds a scoped filter/column read to a SHARED aggregator/endpoint, enumerate EVERY consumer (UI panels included, both `/api/analytics/*` and `/api/xstocks/*` siblings) and state the post-change behavior of each before writing code; a shared aggregator is presumed to feed a live UI until proven otherwise."

## Follow-ups

- **RUNNING_ISSUES (new, deferred):** consider promoting the Step-8 zero-NULL forward-path check to a *recurring* system-alert guard if/when the Phase-25 dataset gates a real calibration decision (Langston A3-2 second ask). Detection-with-a-net is sufficient for F-NOW (the dataset gates nothing yet).
- **Phase 25:** the `excludePreCalibration=true` caller is built there; that's when the `originalSignalId` linkage gets empirically stress-tested at the calibration flip (Langston A3-3).
