# B-FILTER-DIAG-PAPER — Pre-Audit (DRAFT — Step-2 in progress 2026-08-06; Langston r2 scope verdict pending)

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

