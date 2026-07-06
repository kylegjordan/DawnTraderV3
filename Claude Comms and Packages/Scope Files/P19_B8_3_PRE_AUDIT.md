# P19-B8.3 PRE-AUDIT — Per-mode dashboards (Step-2)

**Batch:** P19-B8.3 · CC-B · 2026-07-06 · Scope: `P19_B8_3_SCOPE.md` v3 (full Step-1 consensus, Langston ×2)
**Evidence:** two architectural reads (dashboard data sources; active-path funnel tracking — all claims file:line-cited), live staging checks, SIM Cross-Cutting registry read. This doc = the DETERMINATIONS; the reads carry the detail.

## §1 — THE SIZING DETERMINATION (OBJ-3c, Langston's headline question): STAGED v1 + fast-follow NAMED **P19-B8.3b**

**Finding (read + Langston independent verification; CORRECTED per his Step-2 evidence check — the original "destinationCount never populated / hardcoded 0" claim was WRONG):** the fx5 scanner APPLIES the per-path thresholds (`active_quant` :656 vs `vts_quant` :705 — the `Object.assign(filters, vtsQuantRow)` filter-object swap is the proof there is no second per-path funnel object) but does NOT TRACK the active-path funnel per-stage — the cycle/lifetime diagnostic counters are ONE path-agnostic set per stage. **`destinationCount` IS populated — at :1671, unconditionally, with `taggedVtsSurvivors.length` (the VTS survivor count); :1475 is only the initializer. So when the engine is active and `destination` reads `'active_pool'` (:1474), the count is STILL the VTS figure — the field is a MISLABEL in active mode, not an inert zero (worse than the original claim; B8.3b must fix or retire this field, and must NOT be scoped on the "always 0" premise).** The only true per-path products are: the per-mode `activeFilterPool` POPULATION (paperPool/livePool, survivors only, no reason tracking; `getPoolSize(mode)` prunes expired entries before returning — cheap, not literally O(1)) and the downstream rtb-metrics counters (fully instrumented: openedTotal, blockedByReason, openFailedByStage). The v1 tail is SAFE by construction: it sources the active figure from `getPoolSize(mode)` and never surfaces `destinationCount`.

**Determination:**
- **B8.3 ships the honest v1** — NO scanner instrumentation: the Paper/Live FD tabs get (a) a one-line banner on the shared scan-feed sections ("one scanner feeds all modes; the per-path thresholds and funnels differ — active-path stage counters land in B8.3b"); (b) the VTS-flavored tail rows REMOVED from Paper/Live (VTS Destination / VTS Evaluation Detail / VTS tradesOpened — they stay on the VTS page); (c) the mode's REAL tail from existing sources: **Active Pool population** (`activeFilterPool.getPoolSize(mode)` — O(1), the true active-path destination figure), **RTB queue depth** (COUNT of `rtb_signals` rows by mode + live status — the table has the rows; no in-memory counter exists and none is added), **SQE/guardrail tail** (rtb-metrics openedTotal + blockedByReason + openFailedByStage), **the mode's real opens** (existing endpoint). All honest zeros until B8.4.
- **P19-B8.3b (NAMED NOW, §13):** per-stage ACTIVE-path funnel counters inside the fx5 scan cycle (global → IMF → family per the active thresholds) + `destinationCount` population + the FD panel's funnel section rendered per-path. Sequenced BEFORE B8.4 (the switch-on troubleshooting wants this visibility). **Change-class pre-declared: architecture** (scan-cycle cross-cutting counter state → SIM §17 entry), exactly per Langston's Step-1 condition — declared here so the flip is not a surprise at B8.3b Step-1.
- RUNNING_ISSUES entry at B8.3 close records the v1/3b split (no vague deferral).

## §2 — Window taxonomy (Langston condition): ONE canonical set
Canonical = the analytics ranges (verified accepted: 1h/6h/12h/24h/7d/30d/all/session, default 24h). The dashboard cards use **24h / 7d / 30d / all**, DISPLAYED as "Day / Week / Month / Lifetime" — a pure display alias documented in the component (one vocabulary, one mapping, stated). The chart's 7D/1M/3M/YTD/ALL ranges resolve client-side over the curve endpoint's day-window (7/30/90/ytd-days/all). The Earnings card's Today/This Week/This Month = calendar buckets computed from the same closed-trade rows (labeled calendar, not rolling — the legacy card's semantics, kept).

## §3 — Basis labels (Langston condition, OBJ-3/3b reconciliation)
Verified: `portfolio-summary.portfolioValue` INCLUDES open-position mark-to-market (live prices w/ entry fallback); `cashBalance/currentBalance` = realized-only. Labels shipped: the Portfolio Value card shows BOTH figures labeled — **"Portfolio Value (live — includes open positions)"** and **"Realized Balance (closed trades)"**; the OBJ-3b chart is titled **"Realized Balance Over Time (closed-trade basis)"** with a caption noting it excludes open-position value — the card-vs-curve-tip difference is thereby explained on-screen, not a bug report. In-window max drawdown computes on the SAME realized basis (stated in the tooltip).

## §4 — Widget → data-source table (every number's provenance)
| Widget | Source | Mode param |
|---|---|---|
| Portfolio Value card | `/active-engine/portfolio-summary` (+`?mode` NEW) + the Kraken mirror figure on Paper (60s-cached) | OBJ-1 |
| Earnings (Today/Week/Month + ADE + 7d trend) | closed_trades via the analytics endpoint (+ calendar buckets server-side) | OBJ-1 |
| Activity & Results (selector) | analytics: totalOpened/closedAt*/winRate W/ COUNTS + volume | OBJ-1 |
| Averages (selector) | analytics: avg profit/loss/hold/median + NEW feeDrag/avgNetR/maker-taker/maxDD | OBJ-1 |
| Edge strip (PF/avgNetR/maxDD) | analytics (profitFactor exists; avgNetR/maxDD NEW) | OBJ-1 |
| Balance curve | NEW curve endpoint (anchor events + cumulative closed netPnl, bucketed) | OBJ-3b |
| Asset-class breakdown | closed_trades GROUP BY asset_class (cols exist) | OBJ-1 ext |
| Strategy breakdown | analytics byStrategy (exists) + net P/L per strategy | OBJ-1 |
| VTS dashboard variant | NEW `/api/vts/analytics` (server aggregates; twins/never_filled/shadows EXCLUDED in-query) | OBJ-2 |
| Paper/Live FD tail | activeFilterPool.getPoolSize + rtb_signals COUNT + rtb-metrics summary + opens | OBJ-3c v1 |

## §5 — Langston v1/v3 checkpoint dispositions (pre-code)
feeDrag denominator: `pctOfGross` = null when grossPnl ≤ 0 → UI renders "—" (never NaN/negative-nonsense). maxDD denominator: absent/zero starting balance → null + "—" (Live dormant safe; endpoint-level guard, not just UI). avgNetR: rows with NULL stopLoss or |entry−stop|×qty ≤ 0 EXCLUDED + surfaced as `excludedCount`. VTS exclusions: IN the SQL/reader predicates (twins via mtTwin, shadows via VTS_OPEN_TRADES_EXCLUDE_SHADOW, never_filled via closeReason) — Step-4 shows the queries. Gate bucket exhaustiveness (OBJ-7): CONFIRMED — `applyGlobalGuards` returns pass OR exactly one of the 4 reasons (sequential early-returns, no fifth path) → Rejected = Evals − Passed = the row-sum, structurally. WS-listener migration (OBJ-4): top-bar keeps ZERO strip listeners post-move (hard Step-4 check). Badge (OBJ-6): derive from the mode context. defaultTab: proceeded (Kyle saw the flag).

## §6 — SIM / blast-radius (mandatory)
READ-ONLY consumers of existing cross-cutting state: S9 activeFilterPool (getPoolSize — no writes), S16 rtb-metrics (getSummary — no writes), portfolio-anchor-service reads (curve), module-constants untouched. NO new singletons, NO scan-cycle changes, NO storage writes → the non_architecture class HOLDS for B8.3 (B8.3b pre-declared architecture). SIM gets the two new endpoints + the strip re-home + the FD-tail re-point at Step-10. Duplication check: the VTS analytics endpoint does NOT duplicate `/api/vts/status` (that returns calibration/session stats, no trade aggregates — read-verified); the curve endpoint supersedes the LEGACY `/api/paper/metrics/history` for dashboards (the legacy route is OPEN-2 retirement stock, untouched here).

## §7 — Open decisions
Kyle: OBJ-9 crypto scanner-metrics card (optional, still open — dropped without residue if unanswered by build-complete). Langston: this doc = his Step-2 gate; the B8.3b naming + class pre-declaration are per his conditions.
