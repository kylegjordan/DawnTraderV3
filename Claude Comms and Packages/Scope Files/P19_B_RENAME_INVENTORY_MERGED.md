# P19-B-RENAME (#413) — MERGED inventory (CC-A ∪ CC-B, reconciled) — THE SIGN-OFF LIST

**2026-07-02. Sources:** `P19_B_RENAME_INVENTORY_CCA.md` (Claude Old) + `P19_B_RENAME_INVENTORY_CCB.md` (Claude New), built double-blind per Kyle, diffed + discrepancies code-verified by CC-B. **The double-blind paid for itself — each list caught real items the other missed** (§3). This merged doc is the single list for Kyle+Langston sign-off; NOTHING renames before that sign-off.

## 1. What both lists agree on (high confidence)

**CAT-A files → `active-*`** (8): paper-execution-engine → `active-execution-engine.ts` · paper-portfolio-manager → `active-portfolio-manager.ts` · paper-sim-service → `active-engine-service.ts` (CC-A's name over CC-B's active-trading-service — "engine" is what it manages) · paper-position-sizing → `active-position-sizing.ts` · paper-session-reset → `active-session-reset.ts` · paper_sim_heartbeat → `active-engine-heartbeat.ts` (+underscore→hyphen fix) · paper-sim-diagnostic.ts → `active-scan-diagnostic.ts` (CC-A's name — it's a scan/filter-trace diagnostic) · start-paper-sim.sh → `start-active-engine.sh` (+ `PAPER_SIM_TOKEN`→`ACTIVE_ENGINE_TOKEN` lockstep).
**CAT-A tables → `active_*`** (3): paper_sim_open_positions → `active_open_positions` · paper_sim_sessions → `active_engine_sessions` · paper_sim_trade_logs → `active_trade_logs` **unless** the CC-B near-orphan walk (storage-only, 1 raw ref) proves zero live callers → then rule-18 DELETE instead (Step-2 item).
**CAT-C deletes** (agreed): server/paper-trading-start.ts + paper-trading-stop.ts + paper-48hr-simulation.ts (the guard-blocked CLI chain) · test-guardrails-paper.ts (root) · after-click-paper.png (root, CC-B).
**CAT-D keeps** (agreed): goals_paper + goal_analysis_history_paper (the per-mode model) · the `'paper'|'live'` mode axis everywhere (types, UI mode buttons, active-filter-pool per-mode pool keys `paper_trend|…` + `live_*` — mode keys BY DESIGN, not CAT-A) · shipped migration filenames (immutable).
**CAT-E governance** (agreed): CLAUDE.md rule-20 trap paragraph rewritten; SIM + System Manual component rows; MEMORY files + Langston's docs.

## 2. Discrepancies — resolved by code verification (CC-B, bench @ head)

1. ~~CC-A: "paper-execution-engine imported by vts-runner"~~ → **COMMENTS ONLY** (vts-runner:1599/2917 reference it in prose; no import). The rename still sweeps those comment strings, but the VTS is NOT an import-blast-radius member.
2. ~~CC-B: client `paper-sim-diagnostic.tsx` = CAT-A rename~~ → **CC-A right: CAT-C DEAD** (zero importers incl. lazy/App.tsx — verified). Server sibling still renames per CAT-A.
3. **CC-B's pricing.ts catch stands and gates the CAT-B deletion:** `server/routes/pricing.ts:13` imports `paperValidationEngine` and calls `getRollingLatencyAverages()` at 3 LIVE latency endpoints. The M5 validation harness is NOT cleanly deletable — disposition options: (i) extract the rolling-latency tracker into its own small module, delete the rest; (ii) keep-and-rename `validation-run-engine.ts`; (iii) delete pricing's latency read too (if those endpoints are themselves dead — verify). **Decision at sign-off (OPEN-3).**

## 3. Union-only items (what the double-blind bought)

**From CC-A (CC-B missed):** clusterBus/WS event family `paper_sim*` (started/stopped/reset/heartbeat/…) → `active_engine*` — server emit + client listeners in ONE commit · lifecycle events `paper_trade_executed`/`paper_trade_opened` → `active_trade_*` (lifecycle-events.ts ↔ active-trades-v2.tsx:962 + portfolio-summary-strip.tsx:48) · **module_constants module keys `paper_execution`→`active_execution`, `paper_sizing`→`active_sizing`** (DB rows migration + reads + 2 test mocks) · `PAPER_TRADING_USER_ID` env (dies with the CLI chain) + `PAPER_EXEC_SRC`/`PAPER_RECORD_FAILED`/`PAPER_TRADE_RECORDED` metadata literals (rename with the engine) · `paperOperationQueue` symbol · scripts/test-phase-6-5-setup.ts (in the dead chain) · the ai-insights.tsx dead query `/api/paper/ai-reports` (NO server route exists — delete query + likely `paper_ai_reports` table, userId-coupled legacy) · `vts_open_trades` has NO drizzle declaration (schema-completeness rider or separate home) · m5d/m5e-validation + simulation-engine naming disambiguation notes · the `PaperExecutionServiceLegacy` tombstone (mode-registry.ts:11).
**From CC-B (CC-A missed):** the pricing.ts import (§2.3 — load-bearing) · paper-metrics.ts is DYNAMIC-ONLY live (routes :5292/:5323) — rides OPEN-2 per CC-A's framing, but its liveness is proven, not assumed · routes.ts:21867 registers paper_validation live · paper_daily_briefs/paper_ai_reports userId-coupling flagged for the rule-18 userId theme.

## 4. THE BIG DESIGN QUESTION (OPEN-1, needs Kyle) — `paper_sim_trades`

CC-B proposed `active_trades`; **CC-A's stronger finding: the table is the closed-trade sink for BOTH systems** — VTS closes migrate INTO it (B79.0g Q5) — so `active_trades` would misname the VTS rows exactly the way `paper_sim` misnames the active rows today. **Merged recommendation: `closed_trades`** (system-agnostic sink; existing source/mode columns distinguish origin). This is the highest-traffic table (~15 raw-SQL files) — Kyle's call on the name.

## 5. Consolidated OPEN decisions — **KYLE RULED 2026-07-03**

> **Kyle:** OPEN-7 = **DELETE** `paper_daily_briefs` + `paper_ai_reports` — Walter-era relics (the early OpenAI-via-API embed that never worked). The daily-reports CONCEPT returns later, rebuilt on our own machine learning / injected AI — record that as a future-roadmap note, not a preserved table. Everything else: proceed on CC-A + CC-B + Langston consensus. Consensus positions: OPEN-1 → **`closed_trades`** · OPEN-3 → **extract the rolling-latency tracker, delete the rest of the M5 harness** (both CCs lean; Langston confirms at sign-off) · OPEN-4 → **clean cut** on the API paths · OPEN-2 → `paper_trades` retirement homed as its own follow-up · OPEN-5 → Langston's outside-the-repo sweep gates Wave 2 · OPEN-6 → liveness walk at Step-2 decides rename-vs-delete.

- **OPEN-1** `paper_sim_trades` → `closed_trades` (recommended) vs `active_trades`.
- **OPEN-2** legacy `paper_trades` table (schema-commented "legacy"; ~10 readers incl. M5-era + metrics): NOT part of B-RENAME — home its retirement as a named follow-up batch (both lists agree).
- **OPEN-3** M5 validation harness (paper_validation_engine + route + m5d/m5e): extract-latency-then-delete vs rename vs full-delete-with-pricing-verify (§2.3).
- **OPEN-4** API route paths `/api/paper-sim/*` → `/api/active-engine/*`: clean cut (both CCs vote yes — no external consumers) vs one-cycle alias.
- **OPEN-5** anything OUTSIDE the repo referencing old paths/events (Langston's queue scripts, alert bodies, ops runbooks) — Langston sweeps his side at Step-2.
- **OPEN-6** (CC-B) `active_trade_logs` rename vs rule-18 delete (near-orphan walk at Step-2).
- **OPEN-7** (CC-A) `paper_daily_briefs`/`paper_ai_reports`: CAT-D keep vs userId-coupled legacy delete (the ai-reports client query is provably dead either way).

## 6. Execution risk order (both lists independently converged)

**Wave 1** deletions (CAT-C — shrinks the surface) → **Wave 2** file/symbol/route/event/module-key renames (tsc-verifiable; the compiler-INVISIBLE pieces — dynamic-import strings, raw-SQL strings, event names, module keys, test mocks — get an explicit enumerated grep-sweep in the Step-4 diff) → **Wave 3** DB table renames LAST, possibly its own sub-batch (ALTER TABLE migrations + lockstep queries + staged verify). Storage METHOD names (`getPaperSimTrades`…) ride Wave 3 with their tables.
