# P19 reorg-B2.2 — PRE-AUDIT (Step-2)

> **Batch:** reorg-B2.2 · **Phase:** 19 · **change-class: architecture** · **Author:** NEW Claude (CC-B) · **Date:** 2026-06-22
> Covers OBJ-B (VTS-tab per-class RR/reachability visibility) primarily; OBJ-A (persistence) already Step-4-cleared by Langston (commit `cf9e26d07`); OBJ-C (normalizer retire) is #373-gated post-window. SIM + Active-Trading-Pipeline-Audit + strategy code read per CLAUDE.md §2.1a/§9.

## ★ PREVIOUSLY-STATED-VS-NOW (§9.2)
- **recordGuardEval call-site count — PREVIOUSLY (Explore agent surface map): 13. NOW (verified by direct grep): 18. REASON:** the agent undercounted `strategy-engine.ts` — it missed 5 in-class sites (`breakout`:679, `mean_reversion`:779, `range_trade`:887, `vwap_bounce`:989, `dhma`:1610). Had OBJ-B trusted "13", the per-class re-key would have SILENTLY skipped those 5 strategies (their per-class drop stats would be absent/wrong). This is exactly the "pre-audit must catch it, don't trust a count" discipline (Kyle 2026-06-21) — caught by a compile-driven probe, not memory.

## Verified surface — the (strategy, assetClass) re-key (OBJ-B core)
**18 `recordGuardEval` sites, 1:1 with 18 `applyGlobalGuards` sites. EVERY site has `assetClass` (typed `AssetClass`) in scope — PROVEN: each guard site is immediately preceded by `getPerClassTargetGate(assetClass)` (8 sites in strategy-engine.ts @ 298/432/565/676/776/884/986/1607; 10 in the strategy files), and a grep for `getPerClassTargetGate(<non-assetClass-literal>)` returns EMPTY → all use the `assetClass` identifier, and all compile under green CI.** So adding `assetClass` as the 5th `recordGuardEval` argument is **zero-refactor at all 18 sites.**

| Group | Sites |
|---|---|
| 8 file-based | adaptive_flow:180, defensive_hedge:241, inside_bar_reversal:193, morning_star:178, pivot_shift:185, reverse_impulse:179, support_bounce:267, volatility_edge:192 |
| 2 file-based | strong_bull_trend:177, orb:299 |
| 8 in `strategy-engine.ts` | vwap_pullback:301, abcd_long:435, sma_trend_ride:568, breakout:679, mean_reversion:779, range_trade:887, vwap_bounce:989, dhma:1610 |

## Component map (read targets)
- **Tracker** `server/strategies/guard-eval-tracker.ts` — `_stats: Map<string,GuardEvalRecord>` keyed by strategy only. `recordGuardEval(strategy,rr,pass,dropReason)`; `getGuardEvalStats()` returns per-strategy + meanRR + rrSuppressionRate. (OBJ-A persistence already in; OBJ-B re-keys.)
- **Endpoint (diagnostics)** `GET /api/diagnostics/guard-eval-stats` — `routes.ts:8738`, per-strategy.
- **Endpoint (crypto VTS)** `GET /api/vts/filter-diagnostics` — returns `FilterDiagnosticsData` (`quant.global`/`pattern.global` filter-drop maps + vtsEvaluation funnel).
- **Endpoint (xStock)** `GET /api/xstocks/filter-diagnostics` — `routes.ts:7395`, `xstockSpotScanner.getDiagnostics()`, SAME shape, scoped `xstock_spot`.
- **UI (shared)** `client/src/pages/machine-learning.tsx` — `FilterDiagnosticsPanel` (~1912–2500): renders the filter breakdown (iterates `quant.global`); `formatFilterName` map (~1931). **xStock tab `client/src/components/machine-learning/xstocks-tab.tsx:310` REUSES this same panel** → one UI edit surfaces in BOTH tabs (the panel is fed class-scoped `data` per tab).

## Design (for Langston Step-1/2 review)
1. **Re-key ADDITIVE, preserve the #372 strategy-level aggregate.** Re-key `_stats` to a composite `${strategy}::${assetClass}`; `getGuardEvalStats()` keeps returning the per-strategy aggregate (SUM across asset classes on read — #372 unbroken) AND gains a per-(strategy,assetClass) breakdown (new field). No data lost; the existing strategy-level consumer/#372 read is byte-identical.
2. **"Could this live in / does it duplicate an existing component?" (Kyle §2.1a check):** NO duplication — the existing filter-diagnostics track IMF/scan-phase filter drops (LQ/VN/DI, volume, spread); the guard drops are a DISTINCT post-signal-build stage (RR/reachability on the target, which only exists after the strategy runs). So the guard-drop stats are a NEW, complementary section in the diagnostics, NOT a re-implementation of the filter breakdown. Correct placement = surface the guard-eval-tracker data (filtered per-class) as its own "Reward-vs-Risk / Reachability gate" block in `FilterDiagnosticsPanel`.
3. **Surfacing:** each filter-diagnostics endpoint includes its class's guard-drop block (crypto endpoint → crypto_spot rows; xStock endpoint → xstock_spot rows), sourced from the re-keyed `getGuardEvalStats`. `FilterDiagnosticsPanel` renders the by-reason rows: **rr_below_min (reward-vs-risk), unreachable (reachability), stop_distance, invalid_atr** + meanRR + rrSuppressionRate per strategy. Kyle's no-hidden-gates: every guard drop reason visible, per class.
4. **The #372 minRR suppression becomes VISIBLE per-class** — Kyle (and we) can SEE which strategies the 2.5 seed suppresses, per class, in the UI — the empirical input to the Phase-25 per-strategy minRR calibration.

## Sequencing / window safety (#373)
**OBJ-B deploys POST-window, bundled with OBJ-A (persistence) + OBJ-C (retire).** Deploying the re-key MID-window would reset the in-memory tracker AND mix bucket cardinality (strategy-only → composite) — corrupting the live #372 strategy-keyed window. So: **window closes → read the #372 strategy-keyed suppression numbers (verify no mid-window restart via pm2 uptime) → THEN deploy OBJ-A+B+C** (one post-window deploy; the persistence makes the new per-class window durable from then on).

## Governance (planned)
SIM (the re-key + the per-class guard-drop block in the two endpoints + the shared panel) — **SIM-scope, NOT System-Manual** (display/data-quality surfacing, no architecture/strategy/regime/filter-math change — §9 applicability judgment). BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5, RUNNING_ISSUES (#374 progress), completion report.

## Verify (Step-7/8)
Post-deploy: `/api/vts/filter-diagnostics` shows crypto_spot guard-drop rows; `/api/xstocks/filter-diagnostics` shows xstock_spot rows; the strategy-level #372 aggregate from `getGuardEvalStats` unchanged in shape; §9.3 UI-navigated — both tabs render the by-reason rows. CI 4-green; Langston Step-4 (the re-key diff) + Step-8.
