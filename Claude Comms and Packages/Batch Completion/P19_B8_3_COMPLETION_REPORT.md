# P19-B8.3 — Completion Report

**Batch:** P19-B8.3 — per-mode dashboards + mode-honest FD tabs + metrics-strip move
**Change-class:** non_architecture (declared at Step-1, held — display + read-only endpoints, zero engine-behavior change, no migration)
**Date closed:** 2026-07-06 (same-day scope → close)
**Head:** `6ba933708` (3 commits: `9750772b9` server / `a39c72cd3` client+tail / `6ba933708` Step-4 conditions), CI run `28816474999` all-4-green, deployed staging restart #446, HTTP 200.
**Reviews:** Langston Step-1 consensus ×2 (scope v3) · Step-2 PASS (staged-v1 sizing ruling; B8.3b pre-named, architecture class) · Step-4 PROCEED ×2 (queue double-review — UNION of conditions implemented per the #401 stricter-verdict rule) · delta PROCEED · **Step-8 PASS** (independent: he minted a staging token and reproduced all five endpoint checks himself; ruled the #417 home).

## PREVIOUSLY-STATED-VS-NOW

- PREVIOUSLY STATED (Step-4 brief): "all new metrics computed over `validTrades`." NOW: feeDrag/makerTakerMix/avgNetR/maxDrawdown/byAssetClass are WINDOW-scoped over `trades`; ONLY calendar earnings compute over the all-time `validTrades`. REASON: the brief's wording was loose (Langston flag); the code was always window-scoped by design.
- PREVIOUSLY STATED (Step-4 brief): fees summed from `num(t.fees)`. NOW: `num(t.totalFee ?? t.fees)`. REASON: wording fix (Langston flag); code unchanged.
- PREVIOUSLY STATED (scope v3): 9 objectives + OBJ-10 close. NOW: OBJ-9 (optional crypto scanner-cycle twin card) DROPPED WITHOUT RESIDUE. REASON: Kyle-optional, unanswered at build-complete — per the scope's own drop rule.

## Scope objectives

| OBJ | Outcome | Evidence |
|---|---|---|
| 1 — mode-param stats endpoints + 6 new metrics | **YES** | `/trades/analytics` + `/portfolio-summary` take `?mode=` (default paper), `mode` echoed. feeDrag / makerTakerMix / avgNetR (rExcluded surfaced) / maxDrawdownInWindow / byAssetClass / calendar earnings / winCount+lossCount / avgAmountInvested. Pure math in `server/services/dashboard-metrics.ts`, 10 unit tests. `netPnlPercent` always-0 ROOT-FIXED (B8.2 anchor-balance denominator, null-honest). `profitFactor` null-on-no-losses (Langston finding A — the isFinite→0 coercion killed). Calendar earnings hoisted above BOTH empty-window zero-shapes (Langston finding §1.7 — the session early-return now flows through; `engineRunning:false` verified derived, not lost). Langston reproduced the endpoint shapes independently. |
| 2 — NEW `/api/vts/analytics` | **YES** | Typed exclusions IN the row filter (`countsInAggregates !== false`, `mtTwin`, `shadow`, `never_filled`) + `excludedCount` surfaced (live: 43); `profitFactor` null-on-no-losses; `virtual: true`. Live: 39.1% win rate (336 of 859), PF 0.49. |
| 3 — Dashboard tab (Kyle's widget template) first + defaultTab, all 3 pages | **YES** | `mode-dashboard-tab.tsx`: Portfolio Value / Earnings (calendar) / Activity & Results / Averages & Edge cards + breakdowns; window selector Day/Week/Month/Lifetime (pure aliases of 24h/7d/30d/all); raw counts beside every % ("0.0% (0 of 0)"). VTS variant: learning-throughput framing + virtual disclaimer + excludedCount. §9.3 Chrome walk: all three pages render; the Paper card shows the LIVE Kraken mirror ($824.11, real read-only) beside the simulated balance. |
| 3b — realized balance curve | **YES** | `/api/active-engine/balance-curve`: `portfolio_anchor_events` rows RESET the level, closed trades accrue cumulative netPnl, `never_filled` excluded, `basis:'realized'`, honest empty. Chart titled "(closed-trade basis — excludes open-position value)"; anchor events render as reference dots. NO snapshots (per scope). Residual #416 (unused carrier field) → B8.3b. |
| 3c — mode-honest FD tabs (staged v1) | **YES (staged, residual homed)** | Shared-scanner banner on enforce (Kyle's per-mode-thresholds model, code-verified: per-filterPath `screener_filters` rows). VTS-only sections gated to 'tag'. `ActivePipelineTail` (NEW `/pipeline-tail`: pool size / RTB queue depth / gate tallies / opens — honest zeros pre-switch-on) on enforce. NO scanner instrumentation (Step-2 staged-v1 ruling). **#417 self-declared residual:** the VTS funnel sub-blocks inside shared scanner tables 1–2 still render on Paper/Live (VTS-labeled, banner-explained) — INTENDED-BUT-INCOMPLETE, homed to B8.3b (Langston conceded: earlier than his B8.4 preference; display replacement rides with the per-path counters that replace it). |
| 4 — metrics-strip move | **YES** | `portfolio-metrics-strip.tsx` (NEW) on the Paper/Live pages; top-bar portfolio query + BOTH I10-FIX WS listeners MOVED (trade_closed invalidate, throttled price_updated) — **Langston HARD-check 2 PASS: zero orphaned listeners** (all deletions verified in-diff; tsc-clean). |
| 5 — three-balance labels | **YES** | "Starting — Paper (simulated)" / "Starting — Live (record)" / "Realized Balance" / "Open Positions (marked live)"; the card shows live `portfolioValue` AND realized `cashBalance`, both basis-labeled (Langston Step-1 condition). |
| 6 — badge fix | **YES** | `active-trades-v2` badge derives from `useTradingMode` (`isPaper ? "Paper Trading" : "Live Trading"`). |
| 7 — gate relabels, disposition-aware | **YES** | Pure `gate-columns.ts` contract, panel maps it: **'tag' (VTS) = Dropped (Bad Stop + No ATR) / Tagged (RR Too Low + Target Unreachable — still simulated)**; **'enforce' (Paper/Live) = one true Rejected = Evals − Passed**. **Langston HARD-check 1 PASS: "Rejected" structurally unreachable in any VTS context** — verified in the RENDERED DOM on staging, and the identity verified holding EXACTLY on live data (`vwap_pullback: 18,209 − 0 = 1,131 + 17,055 + 0 + 23`; `morning_star: 36,289 − 14,405 = 21,884` ✓). Plain-name headers + tooltips. Identity test-pinned against the real `applyGlobalGuards` over a branch-covering grid. |
| 8 — visible fetch-failure states | **YES** | VTS open/closed/FD tabs + strip + every dashboard card render an error banner + Retry on fetch failure (the 2026-07-06 zero-trades scare can't recur silently); Live strip failure states "No live session exists yet — live mode arrives in Phase 21". |
| 9 — optional crypto scanner-cycle card | **DROPPED** | Kyle-optional, unanswered at build-complete → dropped without residue per scope. |
| 10 — close | **YES** | This report + full governance below. |

## Tests & bench
10 new tests (`p19-b8-3-dashboard-metrics.test.ts`): empty-window calendar earnings; zero-denominator null paths (makerShare / pctOfGross / avgNetR); PF null-on-all-wins + genuine-0; maxDD peak-to-trough; win-basis parity (headline vs byAssetClass, both `pnl>0`); the enforce identity grid vs the real `applyGlobalGuards` (every reason class exercised); 'tag' yields no Rejected column. Bench: tsc baseline OK; full vitest 2,189 pass / 9 pre-existing local-env failures (unchanged baseline); all 28 B8.2 regression tests pass.

## Langston-condition dispositions
- REQUIRED earnings hoist → DONE (both shapes). REQUIRED PF honesty → DONE (server null + client "∞ (no losses)").
- Confirmations: (B) win basis matches (test-pinned); (C) validTrades = all-time mode-scoped ghost-filtered (range-independent); (D) `getAnchorState` returns `{balance, anchorVersion}`, null-guarded.
- Non-blocking homes: **#415** (anchor-balance denominator vs curve `newBalance` reconciliation + the headline-`pnl`-vs-byAssetClass-`netPnl` summing basis) → B8.3b rider; **#416** (unused curve carrier / hasData-empty mismatch) → B8.3b rider; **#417** (VTS funnel sub-blocks on enforce tabs) → B8.3b.

## Decisions for Kyle at ack
- **Legacy mode-less `/dashboard` page: retire vs redirect** — the per-mode Dashboard tabs now carry its entire widget set with honest per-mode data.

## Governance files changed (this batch)
`BATCH_CATALOG.md` (B8.3 row) · `PHASE_HISTORY.md` (B8.3 paragraph) · `PHASE_19_PLAN.md` (§1 board B8 row + §5 decision-log row; B8.3b next → B8.4) · `SYSTEM_MANUAL.md` (Chapter 9 NEW §18 — per-mode dashboards + FD disposition model + endpoint contracts; TOC updated) · `SYSTEM_IMPACT_MAP.md` (P19-B8.3 banner block — 9 new/changed components + blast radius) · `CHANGES_AND_FIXES.md` (FIX-2026-07-06-A — the three dishonest numbers + the silent-empty-table class) · `RUNNING_ISSUES.md` (#415, #416, #417 opened + homed to B8.3b) · `MEMORY_CC_B.md` (+ repo mirror) · Langston `/home/langston/MEMORY.md` (batch-closure sync) · this report. MULTI_ASSET_VTS_EXPANSION_PLAN working list reviewed — no xStock-calibration items changed by this batch. ADJUSTMENT_FRAMEWORK / AUTHORITY_BASELINE / ASSET_CLASS_ONBOARDING: N/A (no parameters, no constitutional change, no onboarding learning).

**Status: batch complete pending Kyle acknowledgment.**
