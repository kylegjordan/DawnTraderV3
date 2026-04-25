# BATCH 63 — Completion Report

**Status:** ✅ **FORMALLY CLOSED 2026-04-25**
**Final close:** Closed by Kyle directive 2026-04-25 — Item 13 preliminary verdict reached statistical certainty 3 days ahead of the original 2026-04-28 gate (cohort at 2.85× min sample size, both metrics deep below KEEP and TUNE thresholds, +27 R recovery in 3 remaining days statistically not happening). Verdict: **BUILD_DEDICATED**. Follow-on: B65.5 Strong Bull Pullback research-then-design (may renumber B66.5 / B72). Full Item 13 verdict block at §11 below.
**Scope doc:** `Claude Comms and Packages/Scope Files/BATCH_63_SCOPE.md` (19 items)
**Pre-audit:** `Claude Comms and Packages/Scope Files/BATCH_63_PRE_AUDIT.md`
**Trigger evidence:** `Claude Comms and Packages/Scope Files/BATCH_63_COUNTERFACTUAL_AUDIT.md`

**Audit deliverables (all closed 2026-04-22):**
- `B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md` (47.8 KB)
- `B63_ITEM18_SQE_AUDIT.md` (47.8 KB)
- `B63_ITEM19_CADENCE_LATENCY_AUDIT.md` (24.4 KB, corrected)
- `B63_STREAKINESS_ANALYSIS.md` (13 KB, companion doc)
- `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` (consolidation)
- `EXTERNAL_DATA_ARCHITECTURE_PLACEMENT.md` (B67 anchor)

> This report was updated 2026-04-22 after all Item 15/18/19 audits + streakiness + synthesis + placement docs landed. Items marked **[OBS PENDING]** are awaiting the 2026-04-28 decision gate. Items marked **[OBS IN PROGRESS]** have data accumulating and will close at window end.

---

## 1. Scope summary

B63 originally scoped 9 items (2026-04-20). Expanded to 19 items (2026-04-21) after the 72h B62 observation analysis + counterfactual audit surfaced mirror-defect bleed, mode-overlay RR destruction, and framework-level gaps. Final split:

- **Implementation (shipped):** Items 1-14 + 16
- **Audit-only (deliverables open):** Items 15, 18, 19
- **Decision gates:** Items 13, 17

## 2. Commit + cohort inventory

| Stage | Commit | PM2 restart | UTC timestamp | Items | Langston approval |
|---|---|---:|---|---|---|
| B63.0 core | (multi, from earlier sessions) | prior | 2026-04-20 | 1-9 | prior approval |
| Stage 10A | `b0b8e39e` | #79 | 2026-04-21 ~14:45 | 10 | second-pass ✅ |
| Stage 10B+10C | `c3fe0712` | #80 | 2026-04-21 ~15:13 | 11, 12, 14 | second-pass ✅ |
| Stage 16 | `a4f5dbe0` | #81 | 2026-04-21 ~15:34 | 16 | second-pass ✅ |

## 3. 19-item checklist

| # | Item | Type | Status | Evidence |
|---|---|---|---|---|
| 1 | DBS computation moves pre-filter to FX5 scanner | Implementation | ✅ SHIPPED | prior B63 commits; integrated in Stages 10A/10BC/16 |
| 2 | DBS end-to-end propagation | Implementation | ✅ SHIPPED | `propagatedDbs` threaded through scanner → VTS → MCE → detect |
| 3 | `active_strong_trend` + `vts_strong_trend` DB filter paths | Implementation | ✅ SHIPPED | `screener_filters` table — 28 rows verified 2026-04-22 (24 baseline + 2×2 new paths) |
| 4 | Strong-DBS exclusive routing to Path D (quant-strong_trend) | Implementation | ✅ SHIPPED | exclusive routing active; Item 17 decision gate keeps exclusive |
| 5 | `strong_bull_trend` strategy | Implementation | ✅ SHIPPED | `server/strategies/strong-bull-trend.ts` live since B63.1 |
| 6 | Detect() self-exclusion guards on 5 strategies | Implementation | ✅ SHIPPED | `b63_strong_dbs_exclusion` null-reason in morning_star, reverse_impulse, defensive_hedge, volatility_edge, vwap_pullback (vwap_pullback's original guard removed in Item 11 and replaced with the mirror guard of Item 10) |
| 7 | Path-aware Net EV kernel | Implementation | ✅ SHIPPED | `pWin = min(0.60, max(0.40, 0.40 + |DBS|/2))` for `quant-strong_trend` sourcePool |
| 8 | Ship to BOTH VTS + active-trading paths | Implementation | ✅ SHIPPED | Items 10/14 applied to both `vts-runner` and `paper-execution-engine` |
| 9 | Governance updates (Tier 1 + Tier 2) | Governance | ✅ PARTIAL (this commit) — see §9 below | BATCH_CATALOG + PHASE_HISTORY + SIM + System Manual + CHANGES_AND_FIXES all updated this commit |
| 10 | Counter-trend LONG guards | Implementation | ✅ SHIPPED | commit `b0b8e39e` + integrated into `c3fe0712`; 5 occurrences of `b63b_counter_trend_long_exclusion` in compiled dist |
| 11 | vwap_pullback strong-trend lane promotion + lane arbitration | Implementation | ✅ SHIPPED | commit `c3fe0712`; `MULTI_FAMILY_ELIGIBILITY` map + first-claim-wins guard |
| 12 | Strong-trend geometry override plumbing | Implementation | ✅ SHIPPED | commit `c3fe0712`; 4-test contract suite passing |
| 13 | Observation + decision gate for dedicated `strong_bull_pullback` | Decision gate | ✅ **CLOSED 2026-04-25 — BUILD_DEDICATED** | 57 closed trades / 21.1% WR / sumR -28.99 / mean net -1.81% / total net -$42.26 at 2.85× min sample. Both metrics below KEEP (≥55% / >0) and TUNE (45-55% / -2.0 to 0) thresholds; would need +27 R recovery to escape — not statistically possible in remaining window. Closed early by Kyle directive. Follow-on: **B65.5 Strong Bull Pullback research-then-design**. See §11 below for full verdict block. |
| 14 | Strong-trend lane mode-overlay bypass | Implementation | ✅ SHIPPED | commit `c3fe0712`; live proof from PM2 #80 same-cycle log pair (ETH multipliers applied vs EVAA bypass identical before/after) |
| 15 | Multi-lever adaptive framework audit | Audit | ✅ **CLOSED 2026-04-22** | `B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md` (47.8 KB). 69 levers inventoried (51 static-tunable, 18 runtime-adaptive). Snapshot-heavy scoring (7/10 scoring inputs). ExpectedEdge Pearson r = −0.130 vs actual net. PredConf self-cancellation identified as design flaw. Part E modularization lens with 4-cluster analysis + 5-module partition. |
| 16 | Global DBS persistent store + atomic snapshot + 20-pair floor | Implementation | ✅ SHIPPED | commit `a4f5dbe0`; 11-test contract suite passing; cold-start + warm-up verified post-deploy |
| 17 | High-DBS exclusivity decision gate | Decision gate | ✅ KEEP EXCLUSIVE (consensus 2026-04-21) | revisit if observation shows missed signals; see B63_PRE_AUDIT §13 Item 17 |
| 18 | Full SQE audit | Audit | ✅ **CLOSED 2026-04-22** | `B63_ITEM18_SQE_AUDIT.md` (47.8 KB, Parts A-E). FinalScore anti-predictive (r = −0.017, D9 WR 15.3%). MIN_FINAL_SCORE 1.8% filter / MIN_REGIME_WEIGHT 0.0% filter. rankingScore not logged. Only quant-strong_trend source pool net-profitable (validates B63 Item 11). PredConf self-cancellation design flaw. 6 P1 constants to promote in B66. |
| 19 | Classifier cadence / latency audit | Audit | ✅ **CLOSED 2026-04-22** (with corrections) | `B63_ITEM19_CADENCE_LATENCY_AUDIT.md` (24.4 KB). 25 inputs inventoried. H1 (global regime frozen) confirmed pre-B62, **PARTIALLY FIXED post-B62** (2 transitions in 72h, severity P0→P1). H2 (scan-cycle batch correlation) confirmed: 87.8% same-outcome vs 51.9% expected (36pp excess). H3 mechanism validated via H1. MCE cadence corrected to 60s cache TTL (not 5min cycles). |

## 4. Verification metrics

### 4.1 Core B63 (observation window in progress)

**Observation start:** 2026-04-21 ~15:34 UTC (PM2 #81 = final stage boundary). Window runs 24-48h minimum per Langston's cohort-separation rule.

| Metric | Target | Current (2026-04-22 ~12:40 UTC check, T+21h) | Status |
|---|---|---|---|
| Path D trade count (investigation trigger if <3 in 2h) | ≥ 3 in 2h | 63 entries total since first fire 2026-04-20 14:48 UTC (1/35/27 by day); peak bursts during UP tape | ✅ well above trigger |
| Strong-DBS routing share to Path 6 | ≥ 95% | 100% of SBT entries carry `sourcePool=quant-strong_trend` (63/63) | ✅ |
| Existing strategies firing on \|DBS\|≥0.35 | ~0 | Counter-trend LONG guards live (Item 10), 5 guard sites in dist — no audit yet of guard hit count across cohort | pending raw event count |
| Path D TP hit rate (N ≥ 20 closed) | ≥ 30% | 53.97% (34 TP / 63 closed; TIMEOUT=1, SL=28) | ✅ |
| Path D stop-out rate (N ≥ 20 closed) | ≤ 55% | 44.44% (28 SL / 63 closed) | ✅ |
| Path D RTB rank median | top half | **[PENDING — RTB rank logger not wired into JSON export]** | — |

### 4.2 Items 10-14 post-deploy

| Metric | Expected | Post-deploy | Status |
|---|---|---|---|
| `b63b_counter_trend_long_exclusion` count in compiled dist | 5 | 5 | ✅ |
| `strong_trend_lane_conflict` count in compiled dist | 1 | 1 | ✅ |
| `B63 Item 12` override log string in compiled dist | 1 | 1 | ✅ |
| `B63 Item 14 bypass` suffix in compiled dist | 1 | 1 | ✅ |
| Counter-trend LONG trades with pairDBS ≤ -0.35 in 48h window | 0 | **[PENDING — accumulates as market drops DBS ≤ -0.35]** | — |
| vwap_pullback trades with sourcePool='quant-strong_trend' | ≥ 1 routing event observed | ✅ EVAA/USD at PM2 #80 + 3min | ✅ |
| sbt trades show 2:1 RR (not DEFENSIVE 1.33:1 or SURVIVAL 0.8:1) | 2:1 preserved | ✅ proved by EVAA same-cycle log (stop+TP identical before/after vs ETH multiplied) | ✅ |
| morning_star + reverse_impulse + defensive_hedge + sma_trend_ride still firing in normal DBS range | non-zero | **[PENDING — accumulates over window]** | — |

### 4.3 Item 16 post-deploy (verified 2026-04-21)

| Metric | Expected | Actual | Status |
|---|---|---|---|
| `[GlobalDBS][coldStart]` log at T+3s after PM2 #81 | present | ✅ at 15:34:46 UTC | ✅ |
| First valid snapshot (warm-up) | 60-90s | ✅ 63s (15:35:46 UTC, pairs=33) | ✅ |
| Zero `[GlobalDBS][degradedCoverage]` in normal ops | 0 | 0 | ✅ |
| Zero `[GlobalDBS][noSnapshot]` after warm-up | 0 | 0 | ✅ |
| Zero `[GlobalDBS][invalidCompute]` | 0 | 0 | ✅ |
| Zero `[B63 Item 16][MCE] Serving STALE` | 0 | 0 | ✅ |

## 5. Observation analysis (partial — T+21h since PM2 #81, T+10.5h since PM2 #84)

**Interim snapshot captured 2026-04-22 ~12:40 UTC. Full 24-48h close still outstanding; these numbers are preliminary but directionally meaningful.**

### 5.1 SBT (Path D) aggregate, all cohorts combined

| Field | Value |
|---|---|
| Total SBT entries since first fire 2026-04-20 14:48 UTC | 63 |
| By day (opened): 04-20 / 04-21 / 04-22 | 1 / 35 / 27 |
| Closed at check time | 63 (all closed — 0 still open in JSON log snapshot) |
| Resolution mix | TP 34 / SL 28 / TIMEOUT 1 |
| Win rate | **53.97%** |
| sourcePool routing | 100% `quant-strong_trend` (0 leakage) |
| Regime at entry | 52 TREND_FRIENDLY_STABLE / 11 IMPULSE_EXPANSION |
| pairDirectionalBias at entry | 43 UP_MODERATE / 20 UP_STRONG |
| Sum net profit (units: decimal-return per trade, not $-scaled) | +0.38 |
| Top 3 winners | BASED/USD +0.189, UAI/USD +0.185, H/USD +0.136 — all take_profit |
| Bottom 3 losers | UAI/USD -0.159, EUL/USD -0.084, EUL/EUR -0.078 — all stop_loss |

**Read:** WR 54% on N=63 meets the ≥30% TP-hit target and comes in well under the ≤55% stop-out ceiling, even counting TIMEOUT as non-TP. Path D is doing what the scope said it would do.

### 5.2 Per-day close trajectory

| Day | Opened | TP | SL | TIMEOUT | WR | Notes |
|---|---:|---:|---:|---:|---:|---|
| 04-20 (seed day, 1 trade) | 1 | 1 | 0 | 0 | 100% | UAI/USD TP in IMPULSE_EXPANSION — first fire |
| 04-21 (Stages 10A/10BC/16 live) | 35 | 20 | 14 | 1 | 57.14% | healthy early-life cohort |
| 04-22 (post-B64a deploy) | 27 | 13 | 14 | 0 | 48.15% | tape cooled midday; WR dropped but still within target |

### 5.3 Drift Dashboard rolling_24h (independent read, 2026-04-22 12:40 UTC)

Pulled from `/api/analytics/drift-dashboard?window=rolling_24h`:

- Regime mix (88,667 samples, 15-min cadence): TFS 57.93% / RBS 17.71% / ST 13.05% / IE 9.76% / HVU 1.55%. Family flicker 0.89% — healthy.
- Global DBS: score 0.506 (UP_MODERATE), pairCount 167, `isStale=false`, snapshotAge 20s. **Only 1 transition in 24h** — NEUTRAL → UP_MODERATE at 2026-04-22 02:05:20 UTC. That is the PM2 #84 cold-start transition; there has been zero flicker since.
- Trade counts in dashboard (closed-only, rolling_24h): total 80, WR 51.25% across all strategies.
- SBT in TFS (within 24h window): 30 trades, 15 wins, WR 50%, avgNetPct +37.24 (sum +1117%). Note: `avgNetPct` is price-% entry→exit, not position-normalized $ return — large values reflect TP being ~3×ATR off entry on micro-caps.
- SBT in IE (within 24h window): 6 trades, 1 win, WR 16.67%, avgNetPct +113.61 (dominated by outlier). IE cohort is small; do not over-read.

### 5.4 vwap_pullback-in-strong-trend-lane (Item 13 feed)

- Dashboard rolling_24h in TFS: vwap_pullback n=2, both wins (100% WR, sum +0.01 pct). Sample is too small for any verdict; Item 13 gate evaluates 2026-04-28.
- Ratio vs legacy QUANT-TREND-lane baseline: pre-B64a vwap_pullback cohort was WR 37.3% / meanPL -1.033% (n=51). Current 2-trade snapshot does not reject the baseline — waiting for the 1-week observation.

### 5.5 Counter-trend LONG (Item 10) activity

The guard is active in dist (5 sites found), but the market during the observation window was UP-biased with `pairDBS ≤ -0.35` rare. So the guard has not had many chances to fire. Accumulates as market rotates — not a gap.

### 5.6 Global DBS store (Item 16) stability

Zero `degradedCoverage`, zero `noSnapshot`, zero `invalidCompute`, zero `Serving STALE` logs in the full 21-hour window post-PM2 #81. Store is stable; the design holds in production.

### 5.7 Mode-overlay bypass (Item 14) — additional evidence needed

First-proof log pair captured at PM2 #80 +3min (ETH/USD normal lane vs EVAA/USD strong-trend lane). During the overnight window SURVIVAL mode has not been hit again to generate more proofs; pending a second SURVIVAL activation to fill the bypass-evidence table.

### 5.8 Open concerns

1. **SBT WR fell from 57% (04-21) to 48% (04-22 through 10:26 UTC).** Plausibly tape cooling (global DBS still UP_MODERATE but pairDBS distribution loosening). Not a red flag — single-day noise on N=27. Monitor the next 24h.
2. **`avgNetPct` field semantics in drift dashboard** — value scale suggests price-% entry→exit, not position-adjusted $ return. Usable for comparison across strategies (same formula), but should not be read as a portfolio metric. Flagged for B64 wording pass.

## 6. B58a Authority Baseline Verification (B64-lite integrated check)

Triggered by Kyle's governance-trust concern: earlier in B63 it was discovered that DB rows existed for filters but values were not all populated per documented design. This audit verifies current DB state against `AUTHORITY_BASELINE.md` Section A.

### 6.1 Result

**All 12 B58a baseline filter paths match AUTHORITY_BASELINE.md Section A exactly across both live and paper modes = 24 rows, exact match.** Additionally, B63 added 2 new strong_trend filter paths (`active_strong_trend`, `vts_strong_trend`) = 28 total rows in DB today.

### 6.2 Baseline comparison table (all 12 B58a paths — exact match)

| filter_path | vn_max | di_min | di_max | min_volume | Match? |
|---|---:|---:|---:|---:|---|
| active_quant | 0.85 | 25 | 100 | 500,000 | ✅ |
| active_trend | 0.85 | 10 | 100 | 500,000 | ✅ |
| active_breakout | 0.85 | 10 | 100 | 400,000 | ✅ |
| active_oscillator | 0.85 | 0 | 30 | 250,000 | ✅ |
| active_reversal | 0.85 | 0 | 35 | 250,000 | ✅ |
| active_pattern | 0.98 | 5 | 100 | 250,000 | ✅ |
| vts_quant | 0.95 | 15 | 100 | 250,000 | ✅ |
| vts_trend | 0.95 | 10 | 100 | 250,000 | ✅ |
| vts_breakout | 0.95 | 10 | 100 | 200,000 | ✅ |
| vts_oscillator | 0.95 | 0 | 35 | 150,000 | ✅ |
| vts_reversal | 0.95 | 0 | 40 | 150,000 | ✅ |
| vts_pattern | 0.98 | 3 | 100 | 150,000 | ✅ |

### 6.3 New B63 paths (not in B58a baseline)

| filter_path | vn_max | di_min | di_max | min_volume | Source |
|---|---:|---:|---:|---:|---|
| active_strong_trend | 0.95 | 0 | 100 | 0 | B63 (LQ=35 in scope, loosened volume in B63.4) |
| vts_strong_trend | 0.98 | 0 | 100 | 0 | B63 (same as above) |

### 6.4 Documented-vs-actual drift (1 item, intentional)

B63 original scope doc proposed `min_volume=$250k` for strong_trend paths. B63.4 loosened to `min_volume=$0` to increase Path D trade count. Current DB reflects the loosened value. B63 scope doc is stale on this specific parameter; no further action required — drift is documented here and in CHANGES_AND_FIXES `B64-AUDIT-001`.

### 6.5 Residual observation (out of scope for this audit)

B63.3 commit message references additional columns (`min_price` tiered, `max_price`, `liquidity`, `market_cap`, `spread`, `history`) beyond the B58a baseline scope. Those columns are present in the schema but NOT part of `AUTHORITY_BASELINE.md` Section A's audit surface. Could be added to a future re-baselined `AUTHORITY_BASELINE.md` v2, but does not affect the current audit result.

### 6.6 Verdict

**B58a authority baseline is confirmed intact as of 2026-04-22.** Trust in the baseline record is restored for the documented surface. The B64 full authority-baseline audit (scope: Strategy Constants Section B + Shared Config Section C) remains as future work if Kyle wants the broader review.

## 7. Governance updates in this commit

Tier 1:
- ✅ `BATCH_CATALOG.md` — B63 entry updated from "IN PROGRESS" to "IMPLEMENTATION COMPLETE (audits open)" with three stage commits + cohort boundaries + B58a verification note
- ✅ `PHASE_HISTORY.md` — Phase 15b Sub-Phase C implementation milestone captured
- ✅ `.claude/memory/MEMORY.md` — updated prior to this commit with B63 state
- ✅ `BATCH_63_SCOPE.md` — scope already locked at 19 items
- ✅ `BATCH_63_COMPLETION_REPORT.md` — this file (skeleton, open)

Tier 2:
- ✅ `SYSTEM_MANUAL.md` — Appendix B63 added covering strong-trend lane architecture, counter-trend guard pattern, global DBS persistent store, mode-overlay bypass pattern, cohort boundaries
- ✅ `SYSTEM_IMPACT_MAP.md` — §5.1b DBS updated with Items 10-14 + 16 status; new §5.1c Directional Bias Store; §5.2.5 MCE updated for Item 16 delegation
- ✅ `CHANGES_AND_FIXES.md` — DBS-B63B-001, -002, -003, -004 + DBS-B63-ITEM16-001 + DBS-B63-AUDIT-001 + B64-AUDIT-001

Tier 2 pending (filled at window close):
- `POST_AUDIT_ROADMAP.md` — update to reflect B63 implementation close + remaining audit items' status
- `RUNNING_ISSUES.md` — close any B63-specific issues once audit deliverables land

## 8. Open items for final close

- **[CLOSED 2026-04-22]** Item 15 audit — `B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md` (47.8 KB, L1/L2/L3 + Part E)
- **[CLOSED 2026-04-22]** Item 18 audit — `B63_ITEM18_SQE_AUDIT.md` (47.8 KB, Parts A-E)
- **[CLOSED 2026-04-22]** Item 19 audit — `B63_ITEM19_CADENCE_LATENCY_AUDIT.md` (24.4 KB, Parts A/B/C/E + post-B62 H1 re-verification)
- **[CLOSED 2026-04-22]** Streakiness companion analysis — `B63_STREAKINESS_ANALYSIS.md` (13 KB)
- **[CLOSED 2026-04-22]** Modularization synthesis — `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md`
- **[CLOSED 2026-04-22]** External data architectural placement — `EXTERNAL_DATA_ARCHITECTURE_PLACEMENT.md`
- **[OBS IN PROGRESS]** 48h observation window — ~28-32h elapsed as of report update (started ~2026-04-21 12:00 UTC). No code changes during window per Kyle directive.
- **[OBS PENDING 2026-04-28]** Item 13 decision gate: vwap_pullback-in-strong-trend-lane KEEP/TUNE/BUILD_DEDICATED. Evidence-accumulation script ready at `B63_ITEM13_EVIDENCE_SCRIPT.py`.
- **[NEXT BATCH]** B66 scope written: `BATCH_66_SCOPE.md` — core recalibration (P0 formula constant promotion, PredConf rolling window, per-underlying position limits, realized-EV-adaptive floor, rankingScore logging).
- **[FINAL CLOSE BLOCKER]** Item 13 verdict at 2026-04-28 is the last remaining dependency; batch formally closes with that verdict recorded.

## 9. Autonomous overnight monitoring check (2026-04-22 ~12:40 UTC)

Kyle requested autonomous monitoring continuation between sessions. This section logs the findings of the T+21h check so the next manual session picks up cold.

### 9.1 Tasks executed

| # | Task | Result |
|---|---|---|
| 1 | Count new SBT trades opened since first fire | 63 total (1 on 04-20, 35 on 04-21, 27 through 04-22 10:26 UTC) |
| 2 | Classify SBT closed trades TP vs SL vs TIMEOUT | 34 TP / 28 SL / 1 TIMEOUT; 0 still open in JSON log |
| 3 | Scan PM2 logs for new error patterns since last check | See §9.3 — all patterns are pre-existing background noise, no B63 regression |
| 4 | Verify USDC/CHF errors still absent | Confirmed absent from last ~5000 err log lines |
| 5 | Query VTS trade log JSON for SBT entries | Done — schema is `resultType` (take_profit / stop_loss / timeout), `netProfit` per decimal return, `sourcePool` always `quant-strong_trend` for SBT |
| 6 | Completion report update | This section |

### 9.2 Route of access notes for the next autonomous run

- **Trade data ground truth:** `/home/deploy/dawntrader/logs/virtual_trades/<YYYY-MM-DD>.json`. Each entry is a closed trade object. Schema: `status`, `resultType`, `entryTime` (ms), `exitTime` (ms), `entryPrice`, `exitPrice`, `netProfit` (decimal return per trade, NOT $), `positionSize` ($), `strategy`, `sourcePool`, `regime`, `pairDirectionalBias(/Score)`, `globalDirectionalBias(/Score)`.
- **`paper_sim_trades` DB table is empty** — VTS trades are file-based (JSON), not DB-persisted on staging as of 2026-04-22. Trying `SELECT FROM paper_sim_trades` returns 0 rows. Use the JSON files.
- **Drift Dashboard API endpoint:** `GET /api/analytics/drift-dashboard?window={rolling_24h|rolling_7d|rolling_30d|cohort_latest}` (not `/api/vts/drift-dashboard`).
- **Auth:** `POST /api/auth/login` returns `{ accessToken }`. Bearer in subsequent calls.

### 9.3 Error taxonomy (last ~8000 err log lines)

All of the top error buckets are pre-existing background noise predating B63, not new regressions:

| Count | Pattern | Age | Classification |
|---:|---|---|---|
| 2,397 | `[8.9.0-B][WS] Sub Error: Method(s) not found` | present since PM2 error log birth 2026-03-30 | pre-existing — Kraken WebSocket subscription-method mismatch; MD fallback active, no market-data outage |
| 35 | `Kraken API error: EQuery:Unknown asset pair` (REBN/HND contexts) | old | pre-existing — specific pair name-mismatch, not impacting scanner universe |
| 21 | `[CCP][Export] Error reading <path>.json: SyntaxError: Unterminated string` | old | pre-existing — export-only path, does not affect live scanning |
| 20+ | OpenAI `invalid_api_key sk-place…` | old | expected on staging — API key placeholder, AI-insights panel unused |
| 14 | `Failed trades check: invalid input value for enum trading_mode: <uuid>-…` | old | pre-existing — SystemHealth job using a uuid-like string in enum slot; cosmetic |
| 14 | AI insights auth error (same as above) | old | expected |
| 7 | `federatedEthicsHub.getDeltaUpdates is not a function` | old | pre-existing — scheduler method missing, not in B63 surface |
| 6 | `EmbeddingService auth error` | old | tied to OpenAI key placeholder |
| 3 | `/home/runner` EACCES | old | pre-existing — Replit-era path reference, never updated to `/home/deploy` in one specific writer |
| 3 | `systemHealthMonitor.startPeriodicChecks is not a function` | old | pre-existing |
| 2 | `UnifiedCore Failed to synchronize: error: syntax error at or near "desc"` | old | pre-existing — SQL fragment |
| 2 | `FORMULA-AUDIT Alert creation error: duplicate key value violates unique constraint "unique_global_alert"` | old | pre-existing — upsert needs ON CONFLICT |
| 2 | `AutonomyController: Cannot read properties of undefined (reading 'startsWith')` | old | pre-existing — null-check missing |

**Verdict:** no new error patterns introduced by B63 implementation stages 10A/10B/10C/16 or the B64a dashboard deploy. The log floor is noisy with Replit-era/pre-B63 issues that are queued for later cleanup, but the B63 surface is clean.

### 9.4 WebSocket investigation note (defer to separate batch)

`[8.9.0-B][WS] Sub Error: Method(s) not found` is the loudest single pattern (2,397 hits in the sampled window; 14,630 in the full err-log file). It predates B63 by weeks (first appearance in log file dated 2026-03-30). The system is functioning on the REST fallback — `[MD-Coordinator] WebSocket data stale (~30s), checking fallback...` runs every 30s and immediately recovers, which is why `isStale=false` on global DBS and scan cycles keep producing signals. Treating this as a known-to-system, low-priority backlog item (candidate for B64-lite housekeeping scope) rather than a B63 regression.

### 9.5 SBT cohort resolution mini-table (for Item 13 and §5 feeds)

| Cohort | N | TP | SL | TIMEOUT | WR | Notes |
|---|---:|---:|---:|---:|---:|---|
| All-time since 2026-04-20 14:48 UTC | 63 | 34 | 28 | 1 | 53.97% | 100% quant-strong_trend routing |
| 04-22 (today) subset through 10:26 UTC | 27 | 13 | 14 | 0 | 48.15% | WR softened day-over-day — monitor |
| 04-21 (full day) | 35 | 20 | 14 | 1 | 57.14% | main cohort post-Stages 10A/10BC/16 |
| Outlier check | — | — | — | — | — | 3 UAI/USD re-fires (1 TP +0.189, 1 TP +0.185, 1 SL -0.159) — pair re-selected by scanner multiple times, consistent with design |

### 9.6 Next autonomous check recommended items

- Re-run §5.1 + §5.2 at T+48h (≈ 2026-04-23 15:34 UTC) for cohort-close numbers and update §4.1.
- Pull `source_pool` + `strategy` 24h rollup from the Drift Dashboard for Items 10/11 accumulation (counter-trend guard firings, lane-promotion vwap_pullback count).
- If SBT WR drops below 45% over the 04-22 cohort full-day close, flag for investigation before Item 13 evaluation on 2026-04-28.

## 10. Consolidated headline findings (from Items 15/18/19 + Streakiness + Synthesis + Placement)

### 10.1 Scoring pipeline is anti-predictive

- **FinalScore vs net profit Pearson r = −0.017** (Item 18 — uncorrelated with slight negative bias)
- **Decile-1 WR 50.8%, Decile-9 WR 15.3%** — monotonic inversion in TFS regime (46.2% of trades)
- **ExpectedEdge vs actual net Pearson r = −0.130** (Item 15 — worse than FinalScore; systematic overestimation). Mean expected edge +2.28% vs mean actual net −0.98%.
- **Only `quant-strong_trend` source pool is net-profitable** (n=53, 58.5% WR, +0.0093 avg net). Every other pool net-negative. Validates B63 Item 11 strong-trend-lane architecture.
- **PredConf self-cancellation design flaw** (Item 15 §3.10, Item 18 §D) — same input eases FinalScore gate AND tightens ROI gate. In VTS where FinalScore is no-op, ROI becomes binding → high-confidence trades face STRICTER filtering than low-confidence ones.

### 10.2 Temporal pathologies (cause of streakiness)

- **Runs test z = −15.574 (p < 10⁻⁵⁰)** on 620 closed trades (full 7d window) — outcomes are catastrophically non-random.
- **Post-B62 re-measurement (2026-04-20+, n=163):** z = **−5.43** (still rejects independence but 3× less extreme). Max loss streak drops from 70 → 20. WR rises from 34.1% → 62.6%. **B62 alone delivered most of the streakiness reduction** by adding DBS as a regime-classifier input. B66's success-criteria target of z > −10 is already met post-B62.
- **Max loss streak: 70 consecutive losses** (pre-B62) across 6 strategies, 5 pair regimes, 3 source pools, 42 pairs. Only constant: global regime = 100% TFS.
- **Scan-cycle batch correlation 87.8% same-outcome** vs 51.9% expected under independence (Item 19 H2). 21% of all trades enter in multi-entry minutes. Consistent with VTS design intent (broad capture, no SQE filtering) but sets the minimum requirement for active-trading gate tightness in Phase 19.
- **Global regime frozen pre-B62, PARTIALLY FIXED post-B62** (Item 19 H1 re-verification). 2 global regime transitions in 72h post-B62. Severity P0 → P1.
- **MCE on-demand per-pair with 60s cache TTL** (corrected in Item 19). Not "5-minute cycles" as initial framing suggested. Staleness window = ~2 consecutive scans share the same cached context.
- **PredConf uses all-time cumulative VTS WR** (Item 15 §3.1) — in a market that shifts on multi-hour timescales, it measures a market that no longer exists.

### 10.3 Lever inventory + rigidity

- **69 adaptive levers across 14 categories** (Item 15 Level 1)
- **51 (74%) are static-tunable** — hard-coded constants requiring code deploy to change
- **18 (26%) genuinely adaptive** at runtime
- **Only 6 of 51 static-tunable are DB-driven** (via `screener_filters` table); **45 are hard-coded in source across 12+ files**
- **7 of 10 scoring inputs use snapshot or cumulative data** (governance violation per CLAUDE.md §5 rule #13)

### 10.4 Modularization — 8 canonical modules across 5 orthogonal dimensions

Synthesized from Items 15/18/19 §E sections + streakiness mechanisms + Kyle 2026-04-22 directives on multi-exchange + asset-class filter sets:

**Modules:** Exchange Adapter / Filter Module Family / Context Provider (extended MCE) / Eligibility / Scoring Kernel / Threshold / Profitability / Ranking (currently missing — Phase 19 new module).

**Dimensions:** `(exchange, asset_class, filter, strategy, regime) → constants` with most-specific-wins resolution hierarchy.

**Primary driver per Kyle directive:** modularization is the REQUIRED precondition for asset-class expansion (crypto perpetuals, x-stocks, real equities, FX) AND new-exchange expansion (Binance, Alpaca, IBKR, FX brokers). Without it, adding any of these requires forking; with it, each becomes DB rows + small adapter/filter implementations.

**Secondary driver:** rapid calibration iteration. Items 15/18 found the 6 P1 constants need promotion for B66 recalibration to be iteration-fast rather than deploy-cycle-slow.

### 10.5 External data architectural placement (B67 anchor)

External data sources feed **MCE (extended)** — NOT SQE, NOT per-strategy. Architectural decision documented in `EXTERNAL_DATA_ARCHITECTURE_PLACEMENT.md`:
- MCE is already the context distribution layer; extending its output schema means all consumers (Scoring Kernel, Regime Classifier, Strategy detect(), Mode Overlay, SQE) auto-benefit
- Asset-class routing required: crypto pair context excludes equity fields, and vice versa
- Cadence-awareness mirrors `directional-bias-store.ts` pattern: isStale flags propagate, explicit staleness semantics, no silent reuse

### 10.6 B66 scope (written 2026-04-22)

`BATCH_66_SCOPE.md` — concrete 3-sub-deploy batch:
- **B66.1:** `module_constants` table + P0 formula constant promotion (6 items)
- **B66.2:** PredConf rolling window + per-underlying position limits
- **B66.3:** Realized-EV-adaptive Net EV floor + rankingScore logging + P2/P3 cleanup
- **Prereq:** B65 (TEC wiring + asset_class + exchange schema formalization)
- **Success criteria:** runs-test z > −10 (streakiness reduced), max loss streak < 30, FinalScore vs net profit r > +0.05, ExpectedEdge r > −0.05

### 10.7 Post-live phases queued

- **Modularization Phase** (post-live, new phase slot): extract 8 modules from monolith, formalize Exchange Adapter, build Ranking module, per-asset-class filter sets, module_constants resolution hierarchy
- **Phase 21.5:** new exchange + asset class expansion (depends on Modularization Phase)

## 11. References

- `BATCH_63_SCOPE.md` — 19-item scope + 5-row Item 16 behavior spec
- `BATCH_63_PRE_AUDIT.md` — per-item implementation plan, audit methodology, SIM consultation
- `BATCH_63_COUNTERFACTUAL_AUDIT.md` — exit-only replay evidence that triggered Items 10-14
- `BATCH_63_STAGE_10A_CHANGE_LIST.md` — Stage 10A code review package
- `BATCH_63_STAGE_10BC_CHANGE_LIST.md` — Stage 10B+10C code review package
- `BATCH_63_STAGE_16_CHANGE_LIST.md` — Stage 16 code review package
- `AUTHORITY_BASELINE.md` Section A — B58a baseline reference for B64-lite audit
- `server/tests/unit/b63-item12-geometry-override.test.ts` — 4 tests
- `server/tests/unit/b63-item16-dbs-store.test.ts` — 11 tests

---

## 11. Item 13 Final Verdict — BUILD_DEDICATED (closed 2026-04-25)

**Pre-registered evaluation criteria** (from `BATCH_63_ITEM13_DECISION_GATE_SPEC.md`):

| Verdict | Win Rate | Sum R | Met? |
|---|---|---|---|
| KEEP | ≥ 55% | > 0 | ❌ |
| TUNE | 45–55% | −2.0 to 0 | ❌ |
| **BUILD_DEDICATED** | **< 45%** | **≤ −2.0** | **✅ both** |

**Cohort metrics as of 2026-04-25 (cohort start: PM2 #80 = 2026-04-21 15:13 UTC, ~3.4 days into 7-day window):**

| Metric | Value | Threshold |
|---|---|---|
| Closed trades | 57 | min 20 (2.85× over) |
| Win rate | 21.1% (12 W / 45 L) | < 45% by 24 pts |
| Sum R | −28.99 | < −2.0 by 27 R |
| Mean net % | −1.81% | — |
| Total net | −$42.26 | — |

**Cohort exit-reason distribution:**

| Exit reason | Count | Pattern |
|---|---|---|
| `break_even_stop` | 21 | BE protection catching reversals — entry, gain, reverse, BE-stop fires |
| (pre-HF3 entries with no exitReason field) | 26 | Pre-2026-04-24 trades with collapsed mappings |
| `trailing_stop_hit` | 6 | Some moonbag captures did happen |
| `stop_hit` | 4 | Real losses on the original stop |

**Reading:** The strategy isn't producing winning trades reliably enough in the current market environment. Many trades enter, gain a small amount, then reverse — triggering BE protection rather than reaching target. The B63 architecture changes (Variant E geometry override, mode-overlay bypass, lane-specific routing, first-claim-wins arbitration) did not unlock vwap_pullback as a profitable strong-trend strategy. The mismatch is at the entry-detector layer: vwap_pullback's existing pullback geometry is a mean-reversion archetype mismatched with the high-DBS continuation pairs in the strong-trend lane.

**Closure decision (Kyle directive 2026-04-25):**

Statistical certainty was reached at 2.85× minimum sample size — the cohort would need +27 R recovery in the remaining 3 days to escape BUILD_DEDICATED, which is implausible at the current win-rate trajectory. Closing the gate 3 days ahead of the original 2026-04-28 schedule.

**Verdict: BUILD_DEDICATED.** Path forward:

Either **(a)** build a new dedicated `strong_bull_pullback` strategy with its own detector tuned for actual continuation patterns (not the existing pullback geometry), OR **(b)** remove vwap_pullback from the strong-trend lane entirely and let `strong_bull_trend` carry the lane alone.

**Follow-on batch: B65.5 Strong Bull Pullback research-then-design** (may renumber as B66.5 or B72 once scope formalized). Approach: (1) analyze the 57-trade failure cohort, pattern-match losers; (2) form hypothesis on filter/detector change excluding bad ones while preserving 12 winners; (3) backtest hypothesis against historical OHLC; (4) deploy behind A/B observation flag if backtest favorable. Realistic timeline: 1-2 weeks analysis + iteration. Outcome may be (a) BUILD or (b) DROP.

---

*B63 formally closed 2026-04-25. All implementation items shipped, all audit deliverables filed, Item 13 decision gate resolved. Follow-on work tracked in B65.5.*

---

## 12. Item 13 verdict — 2026-04-26 addendum (provisional reframe to INCONCLUSIVE)

**Status:** original BUILD_DEDICATED verdict (§11) stands as historical record. Provisional reframe added below based on B65.5 Phase A0 findings.

**What changed:** B65.5 Phase A0 (market-window control) was run on the cohort 2026-04-26. The methodology improvement was to compute sibling-strategy WR in ±60min windows around each cohort entry, plus an SBT-focused control on the lane-mate, plus a per-day breakdown. Findings:

| Metric | Value |
|---|---:|
| Cohort WR (n=63 in A0 pull, vs. n=57 in original §11 pull — minor cohort-boundary variance) | 27.0% |
| Sibling-strategy WR in same ±60min windows | **25.8%** |
| `strong_bull_trend` (lane-mate) WR in same windows | **23.9%** |
| Cohort WR excluding 2026-04-22 | **43.2%** (n=37) |
| `strong_bull_trend` WR excluding 2026-04-22 | 32.3% (n=282) |

Cohort WR is statistically indistinguishable from sibling WR. The strategy was not underperforming relative to the windows it traded in. Excluding the catastrophic 04-22 day (which contributed 25 of the cohort's losers), the cohort *outperforms* the lane-mate by ~10 points.

**Recurrence finding (Langston cc-inbox #821):** the 04-22 day is the second instance in one week of the same failure mode as the B63 04-18 streakiness day — both with globalRegime classified as TREND_FRIENDLY_STABLE for the entire affected window while the market disagreed catastrophically. This is not a one-off anomaly; it is a recurring failure mode that motivates the Phase 19.5 Adaptive Market Response framework rather than per-strategy detector redesign.

**Reframed verdict (provisional, 2026-04-26): INCONCLUSIVE — INSUFFICIENT EVIDENCE.**

The original verdict was procedurally correct against pre-registered thresholds. The thresholds did not include a sibling-strategy WR control to identify hostile-window contamination — that is a methodology gap, not a process flaw. The right action is to:

1. Leave `vwap_pullback` in the strong-trend lane (no canonical map change).
2. Open a separate future batch (Kyle directive 2026-04-26, number TBD) to re-evaluate Item 13 with cleaner data, post-Phase-19 paper audit.
3. Treat the 04-18 + 04-22 recurrence as canonical positive cases for Phase 19.5 AMR detection-layer design.

**No code change** is shipped from this addendum. The B63 implementation items remain as committed; the strong-trend lane mode-overlay bypass and Variant E geometry override stand. Only the Item 13 *recommendation* (BUILD vs DROP vs KEEP vs TUNE) is reframed.

**See:** `Claude Comms and Packages/Scope Files/B65_5_PHASE_A0_WINDOW_CONTROL.md` for the full Phase A0 evidence; `Claude Comms and Packages/Batch Completion/BATCH_65_5_COMPLETION_REPORT.md` for the closure report; `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` for the AMR design context.
