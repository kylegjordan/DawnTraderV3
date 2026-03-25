# Batch 19F — Phase 14.5 Completion: Dual-Path Filters, VTS Fix, Hybrid Confluence, UI Transparency

## Summary
Complete the Phase 14.5 dual-path pattern scanning architecture by fixing the VTS pattern path, implementing dual global filters, adding hybrid confluence detection, and building the UI transparency components. This batch addresses all architectural gaps identified in the Session 7 audit.

## Design Decisions (LOCKED — Kyle approved)
1. All 300 FX5 pairs go through BOTH quant AND pattern filter paths simultaneously
2. Global filters are DIFFERENT for quant vs pattern (volume, spread, history differ)
3. VTS passive learning uses the same dual-path approach — survivors tagged with sourcePool
4. Hybrid confluence: when a quant signal fires, check 5-min pattern signal buffer for compatible match
5. Solo quant and pattern signals proceed independently through SQE — not held or delayed
6. RTB deduplication changes to pair+strategy combination (not pair alone)
7. Same pair can exist in RTB up to 3 times (quant, pattern, hybrid)
8. All filter paths visible in Guardrails & Filters page (4 columns)
9. Pattern filter stats tab mirrors existing Filter Insights tab

## Changes Required

### 1. Dual Global Filters (fx5-scanner.ts, market-scanner.ts)
**Current**: Single global filter pass → all 300 pairs → one set of survivors → split at IMF stage
**New**: Two parallel global filter passes on same 300 pairs:
- **Quant global**: volume $500K, spread 0.5%, history 60-90d, stablecoins excluded
- **Pattern global**: volume $250K, spread 1.0%, history 14-30d, stablecoins excluded
- Price filter and stablecoin exclusion: SAME for both paths

After global filters, each path applies its own IMF filters:
- **Quant IMF (active)**: LQ ≥ 40, VN ≤ 0.6, ρ ≤ 0.75
- **Pattern IMF (active)**: LQ ≥ 20-25, VN ≤ 0.95-0.98 (regime-aware from pattern-filter-profile.ts)
- **Quant IMF (VTS)**: LQ ≥ 25, VN ≤ 0.98, ρ ≤ 0.95
- **Pattern IMF (VTS)**: Even more relaxed — TBD based on pattern-filter-profile VTS variant

Files: `market-scanner.ts` (collectAdaptiveBatch), `fx5-scanner.ts` (scanMode), `system-guards.ts` (new PATTERN_GLOBAL_FILTERS config), `pattern-filter-profile.ts` (VTS variant thresholds)

### 2. VTS Pattern Path Fix (vts-runner.ts, fx5-scanner.ts)
**Current**: VTS calls `activeFilterPool.getPatternPool()` which is EMPTY during passive learning
**New**: FX5 scanner tags pairs in `getCurrentScanBatch()` with sourcePool based on which filters they passed:
- Pairs that pass quant filters: `sourcePool: 'quant'`
- Pairs that pass pattern filters (but may have failed quant): `sourcePool: 'pattern'`
- Pairs that pass BOTH: `sourcePool: 'quant'` (higher quality path takes precedence for VTS)

VTS reads sourcePool from the scan batch — no dependency on active filter pool.

Files: `fx5-scanner.ts` (getCurrentScanBatch output), `vts-runner.ts` (read sourcePool from batch)

### 3. Active Filter Pool Dual Population (fx5-scanner.ts, active-filter-pool.ts)
**Current**: Pattern pool only gets pairs that FAILED quant filters
**New**: All 300 pairs go through BOTH filter paths. A pair can be in BOTH the quant pool AND the pattern pool simultaneously.
- Quant pool: pairs passing quant global + quant IMF → `sourcePool: 'quant'`
- Pattern pool: pairs passing pattern global + pattern IMF → `sourcePool: 'pattern'`
- Deduplication: a pair in both pools is fine — they go through different evaluation paths

Files: `fx5-scanner.ts` (scanMode dual-path population), `active-filter-pool.ts` (allow same pair in both pools)

### 4. Hybrid Confluence Detection (NEW: hybrid-confluence-buffer.ts, signal-orchestrator.ts)
**New component**: `HybridConfluenceBuffer` — in-memory Map keyed by `symbol_patternType`
- Every pattern signal that fires gets stored in the buffer with timestamp
- 30-second eviction sweep removes entries older than 5 minutes
- Composite key prevents overwriting multiple patterns for same pair

**Signal orchestrator change**: After a quant signal is generated:
1. Check buffer for pattern signals on the same pair within last 5 minutes
2. Look specifically for pattern signals from a COMPATIBLE strategy (defined by hybrid strategy registry)
3. If found → check hybrid conditions from the detect function → if met → create HYBRID signal
4. HYBRID signal goes through SQE independently
5. Original quant signal continues through SQE independently

**Hybrid Strategy Compatibility Registry** (new config):
```
pivot_shift: requires morning_star pattern + vwap_pullback or sma_trend_ride quant
reverse_impulse: requires pinbar pattern + mean_reversion or breakout quant
defensive_hedge: requires engulfing pattern + range_trading quant
adaptive_flow: requires tri_star pattern + sma_trend_ride quant
volatility_edge: requires inside_bar pattern + breakout or vwap_bounce quant
```
(Exact mappings to be confirmed during audit of canonical-regime-strategy-map.ts)

Files: NEW `hybrid-confluence-buffer.ts`, `signal-orchestrator.ts` (post-quant-signal check), `canonical-regime-strategy-map.ts` (verify mappings)

### 5. RTB Deduplication Change (ready_to_buy_service.ts)
**Current**: Deduplicates on pair alone — same pair can only appear once
**New**: Deduplicates on pair + strategy combination — same pair can appear up to 3 times (quant signal, pattern signal, hybrid signal)

Files: `ready_to_buy_service.ts` (dedup logic)

### 6. Pattern Filter Stats Tab (NEW: client component)
**New UI tab** in Trading page that mirrors the existing Filter Insights tab:
- Shows pattern filter scan counts (how many of 300 passed pattern global filters)
- Shows pattern IMF filter breakdown (rejected by LQ, VN, DI, etc.)
- Lists pattern pool survivors with their metadata
- Separate from the existing quant-focused Filter Insights tab

Files: NEW `client/src/components/trading/pattern-filter-insights.tsx`, `active-trades.tsx` (add tab)

### 7. 4-Column Filter Display (Guardrails & Filters page)
**Current**: Shows 2 filter sets (Active Trading IMF, VTS Learning IMF)
**New**: Shows 4 columns with both Global and IMF sections:
| | Active Quant | Active Pattern | VTS Quant | VTS Pattern |
|---|---|---|---|---|
| **Global: Min Volume** | $500K | $250K | $500K* | $250K* |
| **Global: Max Spread** | 0.5% | 1.0% | 0.5%* | 1.0%* |
| **Global: Min History** | 60-90d | 14-30d | 60-90d* | 14-30d* |
| **IMF: LQ Min** | 40 | 20-25 | 25 | TBD |
| **IMF: VN Max** | 0.6 | 0.95-0.98 | 0.98 | TBD |
| **IMF: Corr Max** | 0.75 | N/A | 0.95 | N/A |
(*VTS global filters may match active — to be confirmed)

Files: Guardrails & Filters page component (likely `client/src/pages/` or `client/src/components/guardrails/`)

### 8. ML Page sourcePool Column + API Fix
**Current**: Machine Learning page tables missing sourcePool column; `getOpenVirtualTradesStatus()` returns only 8 fields
**New**: Add sourcePool column to both open and closed simulated trades tables on ML page; fix API to return full trade data

Files: `machine-learning.tsx`, `vts-runner.ts` (getOpenVirtualTradesStatus), relevant API routes

## Testing Plan
- [ ] Verify FX5 scanner runs dual filter paths (check logs for both quant and pattern survivor counts)
- [ ] Verify active filter pool has entries in BOTH quant and pattern pools when trading is active
- [ ] Verify VTS pairs have sourcePool tags during passive learning
- [ ] Verify pattern signals appear in hybrid confluence buffer
- [ ] Verify hybrid signal creation when compatible quant+pattern exist
- [ ] Verify RTB allows same pair with different strategies
- [ ] Verify ML page shows sourcePool column
- [ ] Verify Guardrails & Filters shows 4-column display
- [ ] Verify Pattern Filter Stats tab in Trading page

## Commit Message
`Batch 19F: Phase 14.5 completion — dual-path filters, VTS fix, hybrid confluence, UI transparency`
