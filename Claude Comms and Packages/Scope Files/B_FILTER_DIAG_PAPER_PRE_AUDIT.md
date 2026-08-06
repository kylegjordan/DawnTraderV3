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
