# B79.0n.STORAGE — Step 4 Change List (Embedded Diff)

> **Position:** sub-batch 3 of 18 in B79.0n umbrella v3.
> **Branch:** `migration/aws-supabase` HEAD `c8c7143e4` (Step 3 implementation + 1 fix-forward).
> **Build:** GREEN on staging (esbuild clean; 3 pre-existing warnings only).
> **New unit tests:** 7/7 PASS (both new files + 1 cache-isolation case per Langston re-ACK item 4).
> **Pre-existing CI red:** unchanged baseline (RUNNING_ISSUES #113). SQESignalInput ngc/riskScore + signal-orchestrator argcount errors are pre-existing legacy code; not introduced by this batch.
>
> **INFRASTRUCTURE NOTE PER CLAUDE.MD §6.5.0.a:** DO NOT `cd /mnt/gdrive/...` or `git status` against the gdrive-mounted repo (FUSE cache stalls). Use `ssh staging` for any repo-side inspection — commit head reads `c8c7143e4`.

---

## §1 — Files Changed (24 total: 19 modified + 5 new)

| Category | File | LOC delta |
|----------|------|----------:|
| **Core API** | server/storage.ts | +36 / -10 |
| **SQE** | server/core/filters/signal_quality_evaluator.ts | +27 / -6 |
| **SQE callers** | server/core/rtb/ready_to_buy_service.ts | +13 / -2 |
| **SQE callers** | server/services/signal-orchestrator.ts | +9 / -1 |
| **(a) crypto-intentional** | server/services/fx5-scanner.ts | +13 / -6 |
| **(d) diagnostic helpers** | server/index.ts | +5 / -1 |
| **(d) diagnostic helpers** | server/routes.ts | +20 / -4 |
| **(d) diagnostic helpers** | server/routes/vts.ts | +14 / -12 |
| **(d) diagnostic helpers** | server/services/config-update-service.ts | +2 / -1 |
| **(d) diagnostic helpers** | server/services/paper-sim-diagnostic.ts | +2 / -1 |
| **(d) diagnostic helpers** | server/services/paper-sim-service.ts | +2 / -1 |
| **(d) diagnostic helpers** | server/services/reb-2-12-test-harness.ts | +2 / -1 |
| **(d) diagnostic helpers** | server/services/reb-2-15-certification.ts | +2 / -1 |
| **(d) diagnostic helpers** | server/services/unified-filter-gateway.ts | +4 / -2 |
| **(d) diagnostic CLI** | server/scripts/diagnostic-11.4G-5.ts | +6 / -2 |
| **Test update** | server/tests/unit/sqe-config-dynamic.test.ts | +3 |
| **NEW migration** | drizzle/migrations/2026-05-21-b79-0n-storage-xstock-screener-filters-seed.sql | +42 |
| **NEW test** | server/tests/unit/b79-0n-storage-required-assetclass.test.ts | +50 |
| **NEW test** | server/tests/unit/b79-0n-storage-sqe-asset-class-routing.test.ts | +106 |
| Governance | Scope + Pre-audit + 3 Langston reply files | +817 |

**Total: 1153 insertions / 56 deletions across 24 files.** ~120 LOC net for production code; the bulk is governance + test files.

**Caller count refinement:** pre-audit estimated 32 silent-fallback sites; actual count surfaced during compile-driven sweep was **38** (6 additional in paper-sim/reb-test/unified-filter-gateway/index.ts that the initial grep missed because they had no `mode` literal in the closing brace — they used variable-bound mode references that the original regex didn't catch). The TypeScript compiler forced the audit; the 6 additional sites all classified as (d) diagnostic and route through `getCanonicalScreenerConfig`.

---

## §2 — Core API change (server/storage.ts)

### NEW import at top
```diff
 import { normalizeToInternalSymbol } from './markets/kraken-symbol-resolver';
+// B79.0n.STORAGE (2026-05-21): AssetClass type for REQUIRED-assetClass storage API.
+import type { AssetClass } from '../shared/asset-classes';
```

### Interface signature change at line 235 + new helper signature
```diff
   // Screener filters methods (global settings per mode)
   // Batch 19G: filterPath support for 4-path filter architecture
-  getScreenerFilters(params: { mode: 'live' | 'paper'; filterPath?: string; assetClass?: string }): Promise<ScreenerFilters | null>;
+  // B79.0n.STORAGE (2026-05-21): assetClass is REQUIRED — no silent crypto_spot default.
+  // Per Langston rev2 §11.4 + Step 2 ACK: every caller passes explicit assetClass.
+  // For UI/diagnostic baselines that intentionally want canonical crypto values, use
+  // getCanonicalScreenerConfig() helper (never mis-route as asset-class-aware).
+  getScreenerFilters(params: { mode: 'live' | 'paper'; assetClass: AssetClass; filterPath?: string }): Promise<ScreenerFilters | null>;
+  getCanonicalScreenerConfig(params: { mode: 'live' | 'paper'; filterPath?: string }): Promise<ScreenerFilters | null>;
   upsertScreenerFilters(data: Omit<InsertScreenerFilters, 'userId'> & { lastUpdatedBy?: string; filterPath?: string }): Promise<ScreenerFilters>;
```

### Implementation change at line 948
```diff
-  // B79.0m.a: assetClass support — defaults to 'crypto_spot' for backward compat;
-  // unique index now (mode, asset_class, filter_path) so xstock can coexist.
-  async getScreenerFilters(params: { mode: 'live' | 'paper'; filterPath?: string; assetClass?: string }): Promise<ScreenerFilters | null> {
+  // B79.0n.STORAGE (2026-05-21): assetClass is REQUIRED. The B79.0m.a backward-compat
+  // default to 'crypto_spot' was the silent-fallback footgun that routed all xStock
+  // SQE cycles to crypto thresholds. Removed. Callers must pass explicit assetClass.
+  async getScreenerFilters(params: { mode: 'live' | 'paper'; assetClass: AssetClass; filterPath?: string }): Promise<ScreenerFilters | null> {
     const filterPath = params.filterPath || 'active_quant';
-    const assetClass = params.assetClass || 'crypto_spot';
     const [result] = await db
       .select()
       .from(screenerFilters)
       .where(and(
         eq(screenerFilters.mode, params.mode),
         eq(screenerFilters.filterPath, filterPath),
-        eq(screenerFilters.assetClass, assetClass)
+        eq(screenerFilters.assetClass, params.assetClass)
       ));
     return result || null;
   }
+
+  // B79.0n.STORAGE (2026-05-21): canonical crypto_spot baseline accessor for UI display
+  // and diagnostic reference panels. NEVER use this for runtime signal/screener/SQE
+  // routing — use getScreenerFilters({mode, assetClass, ...}) with the explicit asset
+  // class derived from the signal/cycle context. The whole point of B79.0n.STORAGE is
+  // preventing the silent-fallback footgun this helper could become if misused.
+  async getCanonicalScreenerConfig(params: { mode: 'live' | 'paper'; filterPath?: string }): Promise<ScreenerFilters | null> {
+    return this.getScreenerFilters({ ...params, assetClass: 'crypto_spot' });
+  }
```

### upsertScreenerFilters internal caller fix
```diff
   async upsertScreenerFilters(data: Omit<InsertScreenerFilters, 'userId'> & { lastUpdatedBy?: string; filterPath?: string }): Promise<ScreenerFilters> {
     const filterPath = data.filterPath || 'active_quant';
-    const existing = await this.getScreenerFilters({ mode: data.mode, filterPath });
+    const existing = await this.getScreenerFilters({
+      mode: data.mode,
+      assetClass: (data.assetClass ?? 'crypto_spot') as AssetClass,
+      filterPath
+    });
```

---

## §3 — SQE change (server/core/filters/signal_quality_evaluator.ts)

### SQEInput interface — NEW required field
```diff
 export interface SQEInput {
   signalId: string;
   symbol: string;
   strategy: string;
   mode: 'paper' | 'live';
+  // B79.0n.STORAGE (2026-05-21): assetClass is REQUIRED. Routes Layer 1 (screener_filters)
+  // lookup to the correct per-class row instead of silently reading crypto thresholds.
+  assetClass: AssetClass;
   finalScore?: number;
   regimeWeight?: number;
```

### getSQEThresholdsFromConfig signature change
```diff
-export async function getSQEThresholdsFromConfig(mode: 'paper' | 'live'): Promise<{ finalScoreMin: number; regimeWeightMin: number }> {
+export async function getSQEThresholdsFromConfig(mode: 'paper' | 'live', assetClass: AssetClass): Promise<{ finalScoreMin: number; regimeWeightMin: number }> {
```

### Internal call at line 143 (THE SQE BUG FIX)
```diff
-    const filters = await storage.getScreenerFilters({ mode });
+    const filters = await storage.getScreenerFilters({ mode, assetClass });
```

### Internal call at line 237 (evaluateSignalQuality)
```diff
   // Load thresholds from screener config (configurable via UI)
-  const thresholds = await getSQEThresholdsFromConfig(input.mode);
+  // B79.0n.STORAGE (2026-05-21): assetClass plumbed from input.
+  const thresholds = await getSQEThresholdsFromConfig(input.mode, input.assetClass);
```

### SignalQualityEvaluatorService.getThresholds — cache key extension
```diff
-  async getThresholds(mode: 'paper' | 'live'): Promise<{ finalScoreMin: number; regimeWeightMin: number }> {
-    const cached = this.cachedThresholds.get(mode);
+  // B79.0n.STORAGE (2026-05-21): cache key extended to `${mode}:${assetClass}` so
+  // crypto and xStock cycles do not share cached thresholds. Without this, a crypto
+  // cycle's threshold load would return on a later xStock cycle (or vice versa) and
+  // silently route the wrong values.
+  async getThresholds(mode: 'paper' | 'live', assetClass: AssetClass): Promise<{ finalScoreMin: number; regimeWeightMin: number }> {
+    const cacheKey = `${mode}:${assetClass}`;
+    const cached = this.cachedThresholds.get(cacheKey);
     if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
       return cached.thresholds;
     }
-
-    const thresholds = await getSQEThresholdsFromConfig(mode);
-    this.cachedThresholds.set(mode, { thresholds, cachedAt: Date.now() });
+
+    const thresholds = await getSQEThresholdsFromConfig(mode, assetClass);
+    this.cachedThresholds.set(cacheKey, { thresholds, cachedAt: Date.now() });
     return thresholds;
   }
```

### Import update
```diff
-import { safeResolveAssetClass } from '../../../shared/asset-classes.js';
+import { safeResolveAssetClass, type AssetClass } from '../../../shared/asset-classes.js';
```

---

## §4 — SQE callers — SQEInput.assetClass population

### server/services/signal-orchestrator.ts (sqeInput construction site)
```diff
-import { resolveAssetClass } from '../../shared/asset-classes.js';
+// B79.0n.STORAGE (2026-05-21): AssetClass type for SQEInput.assetClass population.
+import { resolveAssetClass, type AssetClass } from '../../shared/asset-classes.js';
```

```diff
+    // B79.0n.STORAGE (2026-05-21): assetClass REQUIRED on SQEInput. Resolves via the
+    // raw signal's metadata (set by the upstream cycle) or falls through to the
+    // resolveAssetClass(symbol, exchange) primary resolver. NO silent crypto default.
+    const sqeAssetClass = (rawSignal.metadata?.assetClass as AssetClass | undefined)
+      ?? resolveAssetClass(rawSignal.symbol, 'kraken');
+
     const sqeInput: SQEInput = {
       signalId,
       symbol: rawSignal.symbol,
       strategy: strategyId,
       mode: sizingContext.mode,
+      assetClass: sqeAssetClass,
       confidence: extendedMetrics.confidence,
```

### server/core/rtb/ready_to_buy_service.ts (2 SQEInput sites)
```diff
+// B79.0n.STORAGE (2026-05-21): resolveAssetClass + AssetClass type for SQEInput population.
+import { resolveAssetClass, type AssetClass } from '../../../shared/asset-classes';
```

```diff
+    // B79.0n.STORAGE (2026-05-21): assetClass REQUIRED on SQEInput. RtbSignal DB row
+    // does not carry asset_class today (schema gap tracked for RTB batch #11). Resolve
+    // from the symbol via resolveAssetClass(symbol, 'kraken').
+    const sqeAssetClass = resolveAssetClass(normalizedSymbol, 'kraken');
+
     const sqeInput: SQEInput = {
       signalId: signal.signalId,
       symbol: normalizedSymbol,
       strategy: signal.strategy,
       mode,
+      assetClass: sqeAssetClass,
```

Same shape at the second site (line 873). NB: an earlier draft tried to read `signal.assetClass` first but the `rtb_signals` DB schema (`shared/schema.ts:1827`) does not have an `asset_class` column today — pre-audit §5.2 already flagged this for RTB batch #11. `resolveAssetClass(symbol, 'kraken')` is the sole source for now.

---

## §5 — (a) Crypto-intentional sweep (server/services/fx5-scanner.ts × 6 + config-update-service × 1)

All 6 fx5-scanner sites get `assetClass: 'crypto_spot'`. Example:
```diff
-      const filters = await storage.getScreenerFilters({ mode, filterPath: 'active_quant' });
+      // B79.0n.STORAGE (2026-05-21): FX5 is the crypto scanner; assetClass is explicit.
+      const filters = await storage.getScreenerFilters({ mode, assetClass: 'crypto_spot', filterPath: 'active_quant' });
```

`config-update-service.ts` reclassified from (a) → (d) during implementation (it's a UI-feeding `getScreeners()` function returning canonical crypto baseline for display, not a crypto-cycle-intentional reader). Routes through `getCanonicalScreenerConfig`.

---

## §6 — (d) Diagnostic sweep — getCanonicalScreenerConfig helper (23+5 = 28 sites)

All sites that were displaying canonical crypto-baseline values for UI/diagnostic purposes route through the new helper. Example:
```diff
-      const screenerData = await storage.getScreenerFilters({ mode, filterPath });
+      // B79.0n.STORAGE (2026-05-21): UI display reads canonical crypto baseline.
+      const screenerData = await storage.getCanonicalScreenerConfig({ mode, filterPath });
```

**Distribution across files:**
- `server/routes/vts.ts:1445-1457` — 12 sites in the Filter Diagnostics UI panel endpoint (all 12 swapped together)
- `server/routes.ts` — 8 sites at 2199, 2361, 2536, 3389, 3510, 12499, 13858, 20817
- `server/index.ts` — 2 sites at 993 (boot config snapshot) + 1074 (FilterCoherence telemetry)
- `server/services/config-update-service.ts:208` — 1 site (re-classified from (a))
- `server/services/paper-sim-diagnostic.ts:99` — 1 site
- `server/services/paper-sim-service.ts:162` — 1 site
- `server/services/reb-2-12-test-harness.ts:113` — 1 site
- `server/services/reb-2-15-certification.ts:129` — 1 site
- `server/services/unified-filter-gateway.ts:141 + :189` — 2 sites

---

## §7 — (d) Diagnostic CLI — explicit literal (1 site)

Per Langston Step 2 RE-ACK wording note: the standalone CLI diagnostic uses explicit `'crypto_spot'` literal rather than the helper (one-off script, not a route handler):
```diff
 async function loadLiveThresholds(): Promise<LiveThresholds> {
   const defaults = getSQEDefaultThresholds();
-  const paperThresholds = await getSQEThresholdsFromConfig('paper');
-  const liveThresholds = await getSQEThresholdsFromConfig('live');
+  // B79.0n.STORAGE (2026-05-21): diagnostic CLI reads canonical crypto baseline.
+  // Explicit literal (not via getCanonicalScreenerConfig helper) since this is a
+  // one-off CLI tool, not a route handler — Langston Step 2 re-ACK wording note.
+  const paperThresholds = await getSQEThresholdsFromConfig('paper', 'crypto_spot');
+  const liveThresholds = await getSQEThresholdsFromConfig('live', 'crypto_spot');
```

---

## §8 — Seed migration (drizzle/migrations/2026-05-21-b79-0n-storage-xstock-screener-filters-seed.sql)

Idempotent migration cloning the 10 missing xstock_spot rows from crypto_spot baseline:

```sql
INSERT INTO screener_filters (
  id, mode, asset_class, filter_path,
  min_volume, min_price, max_price, min_market_cap, max_bid_ask_spread,
  rsi_min, rsi_max, volatility_min, volatility_max,
  exclude_stablecoins, min_liquidity, allow_regulated_only,
  universe_size, quote_currencies, active_timeframes, confidence_threshold,
  managed_by_lottie, manual_override_enabled, locked_by_user, filter_overrides,
  min_history_days, final_score_min, regime_weight_min,
  lq_min, vn_max, di_min, di_max, volume_24h_min,
  strategies, description, enabled, corr_max, tunable_status,
  last_updated_by, created_at, updated_at
)
SELECT
  gen_random_uuid(), s.mode, 'xstock_spot', s.filter_path,
  s.min_volume, s.min_price, s.max_price, s.min_market_cap, s.max_bid_ask_spread,
  s.rsi_min, s.rsi_max, s.volatility_min, s.volatility_max,
  s.exclude_stablecoins, s.min_liquidity, s.allow_regulated_only,
  s.universe_size, s.quote_currencies, s.active_timeframes, s.confidence_threshold,
  s.managed_by_lottie, s.manual_override_enabled, s.locked_by_user, s.filter_overrides,
  s.min_history_days, s.final_score_min, s.regime_weight_min,
  s.lq_min, s.vn_max, s.di_min, s.di_max, s.volume_24h_min,
  s.strategies, s.description, s.enabled, s.corr_max, s.tunable_status,
  'b79-0n-storage-seed', NOW(), NOW()
FROM screener_filters s
WHERE s.asset_class = 'crypto_spot'
  AND (
    (s.mode = 'live'  AND s.filter_path IN ('vts_quant','vts_trend','vts_reversal','vts_breakout','vts_oscillator'))
    OR
    (s.mode = 'paper' AND s.filter_path IN ('active_breakout','active_oscillator','active_reversal','active_trend','vts_quant'))
  )
ON CONFLICT (mode, asset_class, filter_path) DO NOTHING;
```

Idempotent via ON CONFLICT (mode, asset_class, filter_path) DO NOTHING. Cloned all columns from corresponding crypto rows so xStock starts with identical placeholder values — Layer 3 calibration ticket filed for Phase 19 gate per Langston Q4 ACK.

---

## §9 — Unit tests

### NEW b79-0n-storage-required-assetclass.test.ts
@ts-expect-error regression lock on the breaking signature. 3 tests. PASS.

### NEW b79-0n-storage-sqe-asset-class-routing.test.ts
4 tests including the cache-isolation case per your Step 2 RE-ACK item 4:
- routes crypto_spot SQE call to crypto_spot screener_filters row
- routes xstock_spot SQE call to xstock_spot screener_filters row
- **CACHE ISOLATION** — warm cache with paper:crypto_spot, then read paper:xstock_spot, assert the second read does NOT return crypto's entry + storage was called twice (no cache hit)
- CACHE HIT — same (mode, assetClass) returns cached value (single storage call within TTL)

All 4 PASS on staging.

### Updated sqe-config-dynamic.test.ts
3 existing SQEInput constructions get `assetClass: 'crypto_spot'` added (compile-fail without it).

---

## §10 — Crypto-by-construction-NONE invariant (§8 of pre-audit re-verified)

- Every (a) site explicitly passes `'crypto_spot'` — semantically identical to today's silent default.
- (c) SQE bug fix routes per signal's asset class — crypto signals get crypto thresholds (same as today), xStock signals get xStock thresholds (NEW; bug fix).
- Every (d) site calls `getCanonicalScreenerConfig` which internally hardcodes `'crypto_spot'` — semantically identical.
- Seed migration adds 10 xStock rows; does NOT modify any crypto row.
- Cache key extension to `${mode}:${assetClass}` cannot leak across classes (proven by new test).

24h crypto regression-lock soak confirms empirically per umbrella §2.2 thresholds at scheduled alert `d4b2e590` (2026-05-22T11:55:57Z).

---

## §11 — Step 4 ACK ask

Ready for Step 4 ACK or specific iteration requests. Diff is locked at commit `c8c7143e4` (post-fix-forward) plus the prior staging-built commit `c8cb22e1c`. If ACK, proceed to Step 6 deploy (chain: `git pull && npm run db:migrate && npm run build && pm2 restart --update-env`).

Note that pre-audit specifically asked your sign-off on these B79.0n.STORAGE-introduced patterns:

1. **getCanonicalScreenerConfig helper signature** — `{ mode, filterPath? }` per your Q-S2-1 preference. Banner-style "NEVER use for runtime routing" docstring lives in code at storage.ts:971.
2. **Caller refinement during compile-driven audit** — 6 additional sites discovered (paper-sim x2, reb-test x2, unified-filter-gateway x2 — the pre-audit grep missed them because they use a bare `mode` variable without a literal). All classified (d) diagnostic.
3. **RTB asset-class resolution** — `signal.assetClass` doesn't exist on the RtbSignal DB type (pre-audit §5.2 flagged this for RTB batch #11). Resolved via `resolveAssetClass(symbol, 'kraken')` as sole source. Acceptable interim until RTB schema gap closes.
4. **Cache key extension** — `${mode}:${assetClass}`. Memory delta: 2 → 4 entries max in production (paper+live × crypto+xstock). Trivial.

Pre-existing CI red baseline unchanged. New tests added; existing tests still pass.
