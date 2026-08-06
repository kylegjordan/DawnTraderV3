# B-FILTER-DIAG-PAPER — Pre-Audit (Step-2 COMPLETE 2026-08-06; scope r2 APPROVED at `9f4472db9`)

**Owner:** CC-B · Scope: `B_FILTER_DIAG_PAPER_SCOPE.md` r2 at `9f4472db9`.

## 1. How the VTS FD tabs work (Kyle OBJ-1 leg — code-level; runtime-log leg PENDING)

**One shared component, two class-scoped feeds, disposition-scoped rendering:**
- `FilterDiagnosticsPanel` (`vts-filter-diagnostics-panel.tsx:412`) — props `{data, isLoading, gateDisposition='tag'|'enforce', modeTail, assetClass}`.
- **Crypto VTS tab:** `vts-tabs.tsx:163-177` owns the query `/api/vts/filter-diagnostics` (schema `filter-diagnostics/v1.5`, crypto_spot) → panel with defaults (`tag`, no modeTail).
- **xStock VTS tab:** `xstocks-tab.tsx:249-250` owns `/api/xstocks/filter-diagnostics` (schema `xstocks-filter-diagnostics/v2.1`) → SAME component, `assetClass='xstock_spot'`; the scanner stage renders as xstocks-tab's OWN `ScannerCycleHeader` ABOVE the panel (crypto's scanner card is inside the panel at `:527` — `assetClass==='crypto_spot'` gate).
- **Paper/Live pages:** manifests pass `gateDisposition='enforce'` + `modeTail='paper'|'live'` → `ActivePipelineTables` (`:273`) reads `/api/active-engine/diagnostics/funnel?mode=` per class (`:280`), falls back to `DormantPipelineTables` when `status!=='active'` (`:254-283` wiring).

## 2. Measured facts carried from Step-1 (2026-08-06, all live)

- Funnel ACTIVE both classes since 07-14. Crypto paper cumulative: signalsGenerated 318,418 · strategyAttrition per-strategy (liquidity_trap 939,465 · strong_bull_trend 476,145 · vwap_pullback 460,146 · range_trade/adaptive_flow 222,691 · mean_reversion/defensive_hedge 135,059 · sma_trend_ride/breakout/vwap_bounce/volatility_edge/dhma 15,999) · sqeEvaluated 553,331 · sqePassed 10,500 · sqeGateRejects uncategorized 541,469 / Confidence 4,071 / RegimeWeight 793 · postSqeRejects rr_below_min 35,928 / unreachable 14,323 / invalid_geometry 56 · rtbRefresh cyclesRun 51,529 / attempted 235,555 / reconfirmed 235,532 / rejectedInRefresh 23 / promoted 318 / droppedError 0.
- Archive stage×source (24h): pre_filter market-scanner 1,413,257 + fx5-scanner 157,384 · strategy_internal vts-runner ONLY 690,110 · sqe vts 16,891 + signal-orchestrator 7,630 · admitted 481 orchestrator / 18 active-execution-engine / 74 vts · tcl vts-runner 1,476, **active-path 0 → LIVENESS CHECK OWED (§4)**.
- NetEV = 7,648/7,649 active sqe reject tokens (24h); reason text: `"NetEV -0.006420 <= 0 (chosen maker mode — non-positive net expectancy after friction)"`. Confirms `ACTIVE_PATH_FLOW.md:212` + #570 consistency.

## 3. SIM/SysManual reads done
SIM S22 (funnel tracker: writers, anchor-b invariant, envelope contract, #419 open) · SIM B8.1/B8.3/B8.3b blocks (three-mode-pages contract, FD disposition model, #417 resolution) · SYSTEM_MANUAL:11499-11517 (stage→writer map) · BATCH_CATALOG:364 (B5a hook list) · guard-eval-tracker block (per-class guardDrops feed both FD endpoints).

## 4. OPEN pre-audit legs (before dispatch)
1. **Runtime-log leg (Kyle):** PM2 logs — funnel writer activity, SQE_REJECT lines, RTB refresh cycle logs, any FD-endpoint errors.
2. **Active-path `tcl` hook liveness** + its `source` string (0 rows in 24h — writer dead, unreached, or mis-stamped? presence-evidence required).
3. **§9.3 staging walk (Kyle fix-pass):** every tracked metric on all four tabs (VTS crypto/xStock, Paper crypto/xStock) — enumerate every broken/blank/wrong metric with evidence; each becomes a numbered fix item.
4. **RTB refresh counter granularity:** does `rejectedInRefresh` carry reasons? (#419 error-bucket status.) If too coarse for Kyle's "what falls out and why," spec the telemetry-only extension.
5. **Endpoint schema deltas:** what the new per-strategy×stage aggregate endpoint needs that `/api/vts/filter-diagnostics` shapes don't already carry.
6. **Blast radius per SIM** for every touched file (panel, tracker, orchestrator telemetry sites, routes).

## 5. Runtime-log leg — first findings (2026-08-06 ~20:32Z)

- **Instrument reach stated:** `pm2 logs --lines 400` covers ~20 SECONDS at current volume — per-line absence claims are worthless at that reach; log-based counts must use the rotated files with a stated time window.
- **FINDING RT-1 (rule-24 disposition pending — symptom only, no cause claimed):** the `[34.A][BROADCAST] health_engine` payload reports `paper.engine.isRunning: false` (+ null lastTick/lastSignal/lastTrade ages) and `[41F-C][HEARTBEAT]` reports `overallOk=false`, WHILE the archive proves the active pipeline is evaluating (signal-orchestrator: 424 rows in the last hour, newest seconds old). A health surface reading "not running" against a demonstrably-running pipeline is either (a) a flag with session-scoped semantics being read as pipeline-scoped, or (b) a stale writer — history+intent read owed before disposition (rule 24.0). Candidate fix-item for Kyle's OBJ-6 metrics fix-pass.
- **FINDING RT-2:** `active-execution-engine` archive rows: exactly 1 in the last hour (19:48Z, the newest) — consistent with 18 opens/24h; not itself anomalous, listed for completeness.

## 6. Open-leg 2 SETTLED — active-path `tcl` hook: ALIVE, SHADOWED-BY-DESIGN (zero rows is correct)

Positive control: all-time `tcl` rows = vts-runner 342,453 (2026-05-12→today) · active-execution-engine **0 ever**. The writer exists (`active-execution-engine.ts:3221`, source `active-execution-engine`, reason `duplicate_position`, fires at open time) — but the **#508 B-PROMOTION-RACE-FIX guard upstream (`:2424-2429`) skips any symbol already open or already promoted in the same pass BEFORE promotion reaches the open path**, so the open-time duplicate check is DEFENSE-IN-DEPTH behind it and `duplicate_position` is unreachable in normal operation. §9.5(a) census answer: two mechanisms over one condition, the upstream one wins by design; the open-time site remains the race-window backstop. **Disposition (1) — correct; the per-stage table's active `tcl` column will read 0 legitimately and the tab should say why** (a bare 0 here would read as a broken counter — the exact class Kyle's OBJ-6 targets). xStock lane note: `xstock_spot/eval-cycle.ts:877/:928` are the VTS-lane xstock tcl writers (stamp vts-runner-family source — confirm exact string at implementation).

## 7. Open-leg 4 SETTLED — RTB refresh-fallout granularity (Kyle's "what falls out and why")

The counters are COUNT-ONLY: `rejectedInRefresh` = "failed re-SQE (dropped from queue)" with **no reason breakdown** (`active-funnel-tracker.ts:71`); `droppedError` = exception-mid-pass bulk-delete (`:84`). The tracker's own invariant `refreshedAttempted === reconfirmed + rejectedInRefresh + droppedError` (`:92`, helper `:106`) is the on-tab consistency line to render. Refresh-time SQE reject REASONS currently exist only MERGED into `sqeGateRejects` (attempts are split — `sqeAttempts.atGeneration` 317,776 vs `atRefresh` 235,555 — but per-gate rejects are not). **Implementation spec: a telemetry-only per-gate at-refresh tally (or a reason param on the `rejectedInRefresh` delta), so the tabs can answer "what fell out of the refresh cycle and at which gate" — same canonical gate taxonomy as OBJ-2 (NetEV promoted).** Writers: `rtb-refresh-service.ts:452` (cyclesRun) + refresh legs; `active-execution-engine.ts:2528` (promoted). Live sanity: 23 rejectedInRefresh / 235,555 attempted / 0 droppedError — fallout is RARE today, which the tab should say rather than render a wall of zeros.

## 8. Open-legs 5-6 (schema deltas + blast radius) — drafted, finalize at implementation
- New aggregate endpoint (OBJ-4): needs (strategy, reject_stage, source) counts over a window — plain GROUP BY on `signal_eval_archive` (indexed by captured_at; 24h scan ≈ 2.1M rows — verify query cost with EXPLAIN before shipping; consider the same guarded pattern as the coverage query).
- Funnel envelope `active-funnel/v3` (shared/active-funnel-envelope.ts): OBJ-2 gate promotion adds a member to `SQE_CANONICAL_GATES` — additive; envelope version bump per its contract rules if the shape gains the at-refresh tally (v4) — decide with Langston at Step-4.
- Blast radius: client panel + tracker (telemetry) + 1-2 read-only routes + orchestrator/rtb telemetry call-site params. Zero trade-state surface. SIM rows to update at governance: S22, the FD panel block, the B8.1 three-pages block if endpoints are added.

## 9. Endpoint cost MEASURED — the aggregate CANNOT run per page-load

`EXPLAIN ANALYZE` on the exact OBJ-4 aggregate (24h, GROUP BY strategy/reject_stage/source): **Execution Time 38,507 ms** — parallel seq scans across the partition set. A UI endpoint refreshing on tab-load at ~38s/query would hammer the shared Supabase instance and time out the client. **Design consequence (binding for Step-3): server-side CACHED aggregate** — computed on an interval (start at 5 min; tunable), served from memory with `computedAt` stamped in the response and rendered on the tab ("as of HH:MM") so staleness is honest, guarded so a failed refresh serves the previous tally (the module-constants swap-on-success pattern) rather than an error or a silent zero. Never a per-request scan.

## 10. §9.3 WALK — Paper page, both FD tabs (2026-08-06 ~21:00-21:05Z, desktop width; Kyle's session in his Chrome; screenshots ss_3049cxasq + ss_4741z40ex)

**The reported "tabs broken" symptom REPRODUCED and characterized.** Enumerated fix items (OBJ-6):

| # | Finding | Evidence |
|---|---|---|
| W-1 | **Tab-switch to Crypto FD froze the renderer 45-90s** before rendering (a human reads this as "the tab does nothing" and leaves). xStock switch afterwards was prompt — first-mount or data-size dependence, mechanism NOT claimed (code read owed; crypto 24h scan volume 498,024 vs xStock 112,271). Prior CDP-synthesized clicks (element-ref AND coordinate, dead-center per elementFromPoint) never flipped `aria-selected` — only a direct JS pointer/click dispatch did, then froze. | timeline in transcript; `aria-selected` observed false→(freeze)→true |
| W-2 | **Every tab label renders TWICE** (two spans per tab, `hidden xs:inline` responsive pair BOTH visible) → overlapping strip text at ~960px. | JS census: `textContent` "DashboardDashboard" etc.; screenshot |
| W-3 | **Stale DORMANT banner on BOTH class tabs:** "…active trading is off. Everything downstream — … — is wired but DORMANT; it fills with real data when paper trading turns on (B8.5)." Rendered directly ABOVE live funnel tables. Active-paper has been ON since 07-14. | page text, both tabs |
| W-4 | **xStock tab header is VTS-era:** "xStocks (xstock_spot) — VTS Observation · Phase 24 closed 2026-05-10 · VTS + passive learning telemetry…" framing the ACTIVE-mode tab. | page text |
| W-5 | **xStock market-window copy violates rule 17:** "always running (ARCA open)" + "Live data populates during US RTH (14:30 UTC onwards) and extended-hours windows" — xStocks trade 24/5; US-RTH framing is the prohibited mental model. (Weekend/holiday zero-counters sentence is fine.) | page text |
| W-6 | **"Pre-SQE Rejects 0" as a bare zero** on both tabs — the structurally-empty bucket the scope's OBJ-5 labels (correct-by-design emptiness must say so). | page text |
| W-7 | **xStock SQE pass-rate ambiguity:** Evaluated 36,141 (935 gen + 35,206 refresh) vs Passed 35,967 (99.5%) — crypto reads 1.9% (10,500/553,800). Possibly honest (refresh re-admits dominate + high xStock pass), possibly a counting artifact; the PRESENTATION conflates generation-passes with refresh-re-passes either way. SYMPTOM ONLY — code read before disposition. | page text, both tabs |

**What already works (don't re-invent at Step-3):** both class tabs DO render Pipeline Summary + SQE Gate Rejects from the live funnel, with an honest withheld-not-fabricated footnote and "NetEV / uncategorized dominated by the net-expectancy admission gate" phrasing; the crypto/xStock scanner cards are live and correct-looking (312/1,430 · 75/483). The missing pieces match the scope: per-strategy × per-stage table, strategyAttrition rendering, refresh-fallout reasons, windowed (24h) views ("B8.4c skeleton columns withheld").

**Walk legs still open:** mobile width; the dormant-branch render (needs a non-active class/mode); the VTS-page tabs (parity reference, OBJ-1); Ready-to-Buy/Open/Closed tabs are outside this batch.

## 11. VTS-page parity walk (OBJ-1 reference — captured in full, 2026-08-06 21:30Z)

**The structural model the Paper tabs mirror** (VTS crypto tab, full text in transcript): Scanner card → **Pipeline Summary (24h)** with a Quant/Pattern/Total column split AND a per-row "Counting Basis" column (the legibility device that prevents the W-7 ambiguity class) → **Last Scan — Filter Breakdown** (per-filter rows) with FAMILY IMF metrics + per-family detail → **VTS Signal Funnel (Last Cycle)** → **24h Rolling Aggregates** (labeled "in-memory — resets on restart") → **Reward-vs-Risk/Reachability Gate per strategy** (Evals/Passed/Dropped/Tagged + reason columns + Mean RR + suppression%) → **VTS Evaluation Detail BY STRATEGY** (evaluated/nulls/null%/rejected/trades — the exact per-strategy table shape OBJ-4 needs on the active side) → **Setup Nulls taxonomy** (categorized A-F) → Pre-Eval Skips → Post-Signal Rejections → **Filter Metric Ranges** (percentile spread vs thresholds). Key adoption notes: (a) every counter states its BASIS and its RESET semantics inline; (b) per-strategy tables are the norm, not the exception; (c) DB-backed vs in-memory scopes are explicitly distinguished per row.

**Discriminators found on this walk:**
- **W-1 refinement:** the SAME JS-dispatch tab switch that froze the Paper page for 45-90s switched the VTS page INSTANTLY. The freeze is Paper-page-conditioned (first-mount, enforce-branch, or page-level effect), NOT the shared panel per se — narrows the Step-3 mechanism hunt materially. Payload sizes eliminated as cause: `/api/vts/filter-diagnostics` 25,817 B / 66 ms · xstocks 23,825 B / 80 ms · funnel 1,395 B / 34 ms (measured server-side).
- **W-2 is SITE-WIDE:** doubled tab labels reproduce on the VTS page too — the fix belongs in the shared tab component, once.
- **W-8 (NEW, shared panel data-quality):** the VTS tab's Setup-Nulls section renders its own "Section Total … **44,950 106%⚠**" (self-flagged over-sum); several Pre-Eval-Skip rows show **Total 0 against nonzero lane values** (e.g. "Price Past Target 438 / 68 / **0**"); "Family Filter Mismatch 24,227 → **0%**" percent column. These live in the SHARED panel and render on every page mounting it — in-bounds where the component is shared (scope non-goal only bars VTS-side BEHAVIOR change).

## 12. Remaining-leg dispositions (declared, not skipped silently)
- **Mobile-width walk:** deferred to the Step-7 §9.3 fix-pass (OBJ-6 requires the full walk after fixes land anyway; running it twice on the broken build buys nothing). Declared here per no-silent-caps.
- **Dormant-branch render:** covered by code-read (`DormantPipelineTables` unchanged as fallback; wiring at `vts-filter-diagnostics-panel.tsx:254-283` verified) + B8.4c's prior §9.3 walk of that exact branch. A live render check rides the Step-7 walk via the live-mode page if its funnel still reads non-active then.

**Pre-audit conclusion:** the batch is repair-and-extend on healthy bones. Fix set = W-1 freeze (mechanism hunt Step-3, Paper-page-conditioned), W-2 shared tab labels, W-3/W-4/W-5 stale copy (dormant banner, VTS-era xStock header, US-RTH wording per rule 17), W-6 labeled empty buckets (OBJ-5), W-7 basis-labeling via the VTS "Counting Basis" device, W-8 shared-panel totals math; build set = per-strategy × per-stage cached aggregate endpoint (§9: 38.5s raw → periodic cache, swap-on-success), NetEV gate promotion (OBJ-2 + soak alert), RTB refresh-fallout reasons (§7 telemetry split), VTS-structure mirroring (§11 model).

