# BATCH 79.0i.b — Completion Report (xStocks Tab Expansion)

> **Status:** SHIPPED + G3 walkthrough verified all 5 sections render
> **Author:** Claude Code
> **Created:** 2026-05-10 18:45 UTC
> **Commits:** `5dde28f52` (initial expansion) + `cdbd2a04b` (factor-calibration jsonb fix)
> **PM2 deploy:** #209
> **Trigger:** Kyle directive 2026-05-10 evening — "This new tab is nothing like the filter diagnostics tab. Not even close. It sounds like the two of you deferred most of the tables for some unspecified 'later'. That doesn't work."

---

## 1. What changed vs B79.0i.a

B79.0i.a shipped Panel A (scanner-cycle metrics only) + Panel E (freshness) + 2 new endpoints, with Panels B/C/D deferred to "B79.0i.b Tue/Wed once VTS-observation evidence accumulates." Kyle pushed back: even with no live data accumulated yet, the diagnostic infrastructure should exist now. He directed me to:
1. Navigate to the staging Filter Diagnostics tab
2. Note everything it analyzes
3. Mirror all of it for xstock_spot
4. Add the B73 exit ablation + B67.0 factor calibration panels
5. Verify via Claude-in-Chrome navigation

All done in this batch.

---

## 2. xStocks tab now contains 5 sections

| # | Section | Source endpoint | Status |
|---|---------|-----------------|--------|
| 1 | Scanner Cycle Header (xstock-specific) | `/api/xstocks/filter-diagnostics` (`xstockScanner` field) | ✅ Renders |
| 2 | Per-Pair Fresh-Tick Latency | `/api/xstocks/freshness` | ✅ Renders — 10 fresh / 0 stale / 5 dead distribution; 24/7 badge for Phase-1 names |
| 3 | **FULL FilterDiagnosticsPanel** (Pipeline Summary + Last Scan + 24h Rolling + VTS Evaluation Detail by-strategy + Setup Nulls + Pre-Eval Skips + Post-Signal Rejections + Filter Metric Ranges) | `/api/xstocks/filter-diagnostics` (FilterDiagnosticsData v2.0 shape) | ✅ Renders — all sub-sections including by-strategy table, post-signal rejections, filter ranges |
| 4 | B73 Exit Strategy Ablation | `/api/xstocks/exit-strategy-ablation` | ✅ Renders empty-state: "No closed xstock_spot trades yet — populates after first ORB fire closes. Waiting on Monday 2026-05-11 14:30 UTC ARCA open + first breakout" |
| 5 | B67.0 Factor Calibration Ablation (with mandatory amber caveat banner) | `/api/xstocks/factor-calibration` | ✅ Renders amber banner: "Current n=0. Decision-grade requires n≥150 per regime × factor-tertile bucket... Treat as system-health telemetry, not signal." + empty-state below |

---

## 3. Implementation summary

**Server (`server/routes.ts`):**
- `/api/xstocks/filter-diagnostics` REVISED to return full `FilterDiagnosticsData` shape (lastScan, rolling24h, signalRejections, vtsEvaluation, lastCycleVtsEval) + xstockScanner field. Schema v2.0. Populated from `signal_eval_archive` aggregations (real strategy/regime/null-reason data) + `xstock_spot_ticker_snap` (cycle counts) + `xstockSpotScanner.getDiagnostics()`. Funnel-rejection counters are zero (HONEST — Finding #1 still stands; scanner not wired through orchestration yet).
- `/api/xstocks/exit-strategy-ablation` NEW: per-variant aggregate from `exit_strategy_alternates` filtered by `asset_class='xstock_spot'`. Returns variant_id, variant_name, n, avg_pnl, avg_baseline, wins, losses, win_rate.
- `/api/xstocks/factor-calibration` NEW: per-factor aggregate from `regime_factor_alternates` filtered by `asset_class='xstock_spot'`. Confidence shift extracted via `(real_decision->>'confidence')::numeric - (alternate_decision->>'confidence')::numeric` from jsonb columns. Returns factor, n, avg_confidence_shift, replays_done.

**Client (`client/src/pages/machine-learning.tsx`):**
- Exported `FilterDiagnosticsPanel` + `FilterDiagnosticsData` type so xstocks-tab can reuse them.

**Client (`client/src/components/machine-learning/xstocks-tab.tsx`):**
- Rewritten ~470 lines. Imports `FilterDiagnosticsPanel` from `@/pages/machine-learning`. Renders 5 sections.
- 4 useQuery hooks (filter-diagnostics + freshness + exit-ablation + factor-calibration) all with cache-key isolation including `{ asset_class: 'xstock_spot' }`.
- Co-located `EmptyPanelState` + `CalibrationCaveatBanner` (renders only when n is bound — no longer null-render-only since n=0 is meaningful in this expansion).

---

## 4. Crypto regression posture

**NONE by-construction.** All NEW sibling endpoints under `/api/xstocks/`. NO modifications to `/api/vts/*` or `/api/analytics/*`. No-touch fence on crypto_spot through 2026-05-15 preserved. The export of `FilterDiagnosticsPanel` from machine-learning.tsx is purely additive (no behavior change for crypto consumers).

---

## 5. G3 Claude-in-Chrome verification

Login → Machine Learning → click xStocks tab → screenshot all 5 sections by scrolling.

| Screenshot ID | Section verified |
|---|---|
| ss_8118nh6jd | Top of tab — Scanner Cycle Metrics + freshness panel start |
| ss_9584pl0lj | Pipeline Summary + Last Scan Filter Breakdown |
| ss_02427cjhk | Family IMF + IMF Survivors + VTS Destination + VTS Signal Funnel + 24-Hour Rolling Aggregates |
| ss_08727ww6k | 24h Rolling Aggregates body + Family Path IMF Results + VTS Destination |
| ss_7087a8mos | Setup Nulls + Pre-Evaluation Skips + Post-Signal Rejections + B73 Exit Ablation panel |
| ss_79579w8zj | B73 empty-state + B67.0 panel with caveat banner |
| ss_86002cpln | B67.0 caveat banner + empty-state below |

All sections render without console errors or 4xx/5xx network responses. Empty states are honest signaling for VTS-observation pre-Monday-open state.

---

## 6. Findings preserved from B79.0i.a

- **Finding #1** (xstockSpotScanner doesn't track IMF/family/SQE/trade per-stage funnel counters): still stands. The funnel-rejection rows in Filter Diagnostics show zero. Strategy-level + null-reason aggregates ARE real from signal_eval_archive.
- **#9 (cache-key isolation):** preserved + extended to all 4 useQuery hooks.
- **#10 (cold-scanner empty state):** preserved.
- **#11 (banner-renders-nothing-when-no-data):** REVISED — banner now renders even at n=0 because n=0 is meaningful signal of "decision-grade evidence not yet accumulated." Previous null-render rule was a B79.0i.a artifact.

---

## 7. Pending follow-ups

- **Funnel-rejection counters for xstock_spot** — Finding #1's deferred work. When xstockSpotScanner is wired through signal-orchestrator (a future B79.x batch), the global/imf rejection fields populate from real telemetry. Until then they show zero.
- **B79.TEC.b operator gate ~11:24 UTC Sunday** (manual: `break_even_enabled` wildcard DELETE)
- **B79.0a SQE wildcards DELETE ~21:38 UTC Sunday**
- **RUNNING_ISSUES #89 #90 #91** unchanged
