# BATCH 79.0i.b — Completion Report (xStocks Tab Final Form)

> **Status:** SHIPPED rev2 + G3 walkthrough verified rich ablation tables render
> **Author:** Claude Code
> **Created:** 2026-05-10 18:45 UTC; rev2 commit 2026-05-10 ~21:00 UTC
> **Commits:** `5dde28f52` (initial expansion) → `cdbd2a04b` (jsonb hotfix) → `b9a1cdd4e` (rev2 — rich-component reuse + drop "shadow-mode") → `32b4bd4f5` (governance close)
> **PM2 deploy:** #210 (final)
> **Trigger:** Two Kyle pushbacks 2026-05-10 evening — first to expand the tab beyond the initial Phase 1 scanner+freshness scope to mirror Filter Diagnostics in full, then to use the actual rich crypto ablation tables instead of custom lighter panels and drop "shadow-mode" terminology entirely.

---

## 1. Three-revision arc

The B79.0i.b development followed three iterations under Kyle pushbacks, each clarifying the right design:

| Rev | Trigger | Outcome |
|---|---|---|
| Initial (`5dde28f52`) | B79.0i.a was scoped to Panel A scanner + Panel E freshness only with B/C/D deferred to "Tue/Wed when shadow-mode evidence accumulates." Kyle: "This new tab is nothing like the filter diagnostics tab. Not even close. It sounds like the two of you deferred most of the tables for some unspecified 'later'. That doesn't work." | Expanded xStocks tab to mirror Filter Diagnostics in full + added custom lighter B73 + B67.0 ablation panels |
| Hotfix (`cdbd2a04b`) | Initial deploy errored on factor-calibration trying to read flat `real_confidence`/`alt_confidence` columns (those don't exist) | Corrected to extract from jsonb `(real_decision->>'confidence')::numeric` per actual schema |
| **Rev2 (`b9a1cdd4e`) — FINAL FORM** | Kyle: "exit and factor ablation tables. Also, stop referring to VTS and passive learning as shadow mode. That is not terminology we are using." | Replaced custom lighter panels with the EXISTING rich `ExitStrategyAblationSection` + `FactorCalibrationSection` from `analytics.tsx` via export+endpointBase prop. Aggregators parameterized with optional asset_class. "Shadow-mode" terminology removed. |

---

## 2. Final form — 5 sections on the xStocks tab (all rev2)

| # | Section | Source | Status |
|---|---------|--------|--------|
| 1 | Scanner Cycle Header (xstock-specific) | `/api/xstocks/filter-diagnostics` (xstockScanner field) | ✅ |
| 2 | Per-Pair Fresh-Tick Latency | `/api/xstocks/freshness` | ✅ — 10 fresh / 0 stale / 5 dead at G3 walkthrough |
| 3 | **FilterDiagnosticsPanel** reused from `machine-learning.tsx` (Pipeline Summary + Last Scan Filter Breakdown + 24h Rolling Aggregates + VTS Evaluation Detail by-strategy + Setup Nulls categorical + Pre-Eval Skips + Post-Signal Rejections + Filter Metric Ranges) | `/api/xstocks/filter-diagnostics` returning full FilterDiagnosticsData v2.0 | ✅ — all sub-sections render |
| 4 | **ExitStrategyAblationSection** reused from `analytics.tsx` via `endpointBase="/api/xstocks/exit-strategy-ablation"` | Calls shared `computeExitStrategyAblation(window, regimeFilter, 'xstock_spot')` aggregator | ✅ — title "(B73)" + window selectors All regimes/24h/7d/30d/Since latest + empty-state "framework is wired and listening. Each VTS trade close populates 12 variant rows automatically..." |
| 5 | **FactorCalibrationSection** reused from `analytics.tsx` via `endpointBase="/api/xstocks/factor-calibration"` | Calls shared `computeFactorCalibration(window, 'xstock_spot')` aggregator | ✅ — title "(B67 — does each lever add predictive value?)" + window selectors + empty-state "Calibration analysis requires closed VTS trades joined to ablation alternates by replay-ablation..." |

---

## 3. Architectural patterns established

Two new patterns now appear in the **Phase 24 standing rules** (SYSTEM_MANUAL appendix #6 + #7):

### #6 Cross-asset-class UI component reuse via export+endpointBase prop

When an asset-class-specific tab needs the same rich tables a primary asset-class tab already renders, the primary's component is exported with an optional `endpointBase` prop whose default is the primary's existing endpoint. The asset-class-specific tab passes its own `endpointBase` pointing at a sibling endpoint that returns the same response shape. **No code-duplication, no behavioral drift, no risk to legacy consumers** — when `endpointBase` is omitted, behavior is byte-identical to pre-change.

```typescript
// analytics.tsx (B79.0i.b — exported)
export function FactorCalibrationSection({ endpointBase = '/api/analytics/factor-calibration' }) {
  const { data } = useQuery({ queryFn: () => apiFetch(`${endpointBase}?window=...`) });
  // ... unchanged rendering ...
}

// xstocks-tab.tsx (B79.0i.b — consumes)
<FactorCalibrationSection endpointBase="/api/xstocks/factor-calibration" />
```

### #7 Shared aggregator parameterization via optional asset_class

When a backend aggregator function needs to serve multiple asset classes, the function signature gains an optional `assetClass` parameter with a default value preserving the legacy crypto-only behavior. The SQL WHERE clause appends `AND asset_class = $X` ONLY when the parameter is provided.

```typescript
// drift-dashboard-aggregator.ts (B79.0i.b)
export async function computeFactorCalibration(
  window: DashboardWindow,
  assetClass: string = 'crypto_spot', // default preserves byte-identical pre-change behavior
): Promise<FactorCalibrationResponse> {
  // ... SQL with WHERE asset_class = ${assetClass} ...
}

// exit-strategy-ablation-aggregator.ts (B79.0i.b)
export async function computeExitStrategyAblation(
  window: AblationWindow,
  regimeFilter: string | null = null,
  assetClass: string | null = null, // null = no WHERE filter (preserves legacy mixed-asset behavior)
): Promise<ExitStrategyAblationResponse> {
  const assetClassClause = assetClass ? sql`AND asset_class = ${assetClass}` : sql``;
  // ... existing SQL + ${assetClassClause} ...
}
```

---

## 4. Crypto regression posture

**NONE by-construction.** Verified post-deploy:
- `curl /api/analytics/factor-calibration?window=rolling_7d` → returns `{ ok: true, data: { factors: [10 entries] } }` — unchanged from pre-deploy
- Aggregator default values preserve byte-identical pre-B79.0i.b behavior for all crypto consumers
- No modifications to `/api/vts/*` endpoints
- The export of `FilterDiagnosticsPanel` from `machine-learning.tsx` and `FactorCalibrationSection`+`ExitStrategyAblationSection` from `analytics.tsx` are purely additive — no behavior change for existing callers

No-touch fence on crypto_spot through 2026-05-15 preserved.

---

## 5. G3 Claude-in-Chrome verification (rev2)

Login → Machine Learning → click xStocks tab → screenshot all 5 sections by scrolling.

| Screenshot ID | Section verified |
|---|---|
| ss_7481cmxd9 | Top of tab — "xStocks (xstock_spot) — VTS Observation" header + Scanner Cycle Metrics |
| ss_0278b5bg0 | 24-Hour Rolling Aggregates section of FilterDiagnosticsPanel |
| ss_0921123mt | Setup Nulls + Pre-Evaluation Skips + Post-Signal Rejections + Exit Strategy Ablation header with "(B73)" + window selectors + empty-state |
| ss_1452qn79t / ss_1563ab7kn | Factor Calibration "(B67)" header + window selectors + empty-state explaining replay-ablation requirement |

All sections render without console errors or 4xx/5xx network responses. No "shadow-mode" terminology visible.

---

## 6. Hotfix paper trail (`cdbd2a04b`)

Initial deploy of rev1 errored on `/api/xstocks/factor-calibration` — query referenced flat `real_confidence` / `alt_confidence` columns. Schema check via `psql \d regime_factor_alternates` showed actual columns are `real_decision` (jsonb) + `alternate_decision` (jsonb). Hotfix commit corrected to `(real_decision->>'confidence')::numeric - (alternate_decision->>'confidence')::numeric` extraction. Filed as a CHANGES_AND_FIXES entry. Cause: I assumed the flat-column shape from naming convention rather than verifying schema — should have run the `\d` check before writing the query. Rev2 sidesteps this entirely by using the shared aggregator (which already had the correct jsonb extraction).

---

## 7. Findings preserved from B79.0i.a (still applicable)

- **Finding #1 (xstockSpotScanner is observability-only):** still stands. Funnel-rejection counters in section 3 (FilterDiagnosticsPanel) show zero where the scanner doesn't yet track them. Strategy-level + null-reason aggregates ARE real from `signal_eval_archive`. Wiring the scanner through orchestration is a future B79.x batch. **Filed as RUNNING_ISSUES #92.**
- **Cache-key isolation (Finding #9):** preserved. xstocks-tab useQuery hooks include `{ asset_class: 'xstock_spot' }` in queryKey arrays.
- **Cold-scanner empty state (Finding #10):** preserved. ScannerCycleHeader renders explicit "Scanner has not completed first cycle yet — refresh in ~30s" when cyclesCompleted=0.

---

## 8. Pending follow-ups

- **B79.x scanner-orchestration wiring** — RUNNING_ISSUES #92 — when the scanner is wired through signal-orchestrator, FilterDiagnosticsPanel funnel-rejection rows will populate from real telemetry. Until then they stay zero.
- **B79.TEC.b operator gate ~11:24 UTC Sunday** (manual: `break_even_enabled` wildcard DELETE)
- **B79.0a SQE wildcards DELETE ~21:38 UTC Sunday**
- **RUNNING_ISSUES #89 #90 #91** unchanged

---

## 9. Governance updates

This batch closure includes the following Tier 1 + Tier 2 updates committed in `32b4bd4f5` (close) + the post-completion governance batch:

- BATCH_CATALOG.md — B79.0i.b row revised to reflect rev2 final state
- PHASE_HISTORY.md — Phase 24 sub-batch table extended with rev2 commits + final state
- SYSTEM_IMPACT_MAP.md — xstocks-tab.tsx + 3 new endpoints + aggregator parameterization + component-reuse-with-endpointBase pattern
- SYSTEM_MANUAL.md — 2 new architectural standing rules (#6 component reuse, #7 aggregator parameterization) added to Phase 24 appendix
- ASSET_CLASS_ONBOARDING_WORKFLOW.md — new Section M "Stand up the dedicated observation tab" with the B80 blueprint
- POST_AUDIT_ROADMAP.md — standing rule #10 obligation marked CLOSED for xstock_spot; rules #6 + #7 added
- RUNNING_ISSUES.md — #92 filed (xstockSpotScanner orchestration wiring)
- MULTI_ASSET_VTS_EXPANSION_PLAN.md — §12 update log row for B79.0i closure
- CHANGES_AND_FIXES.md — jsonb schema-extraction hotfix entry (`cdbd2a04b`)
- MEMORY.md (CC + Langston via Hetzner scp) — 3-way synced
