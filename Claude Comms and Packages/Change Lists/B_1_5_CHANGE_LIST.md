# B.1.5 — Step 4 Change List for Langston Code Review

**Batch:** B-XSTOCK-CALIB B.1.5 (xStock liquidity/volume data-integrity + cross-asset isolation)
**Step:** 4 (code review BEFORE GitHub push)
**Author:** CC, 2026-05-30
**Status:** READY FOR REVIEW — local tsc + vitest GREEN, all chunks complete

**Critical infrastructure note (per CLAUDE.md §6.5.0.a):** review using the embedded diffs below + the inbox copies at `/home/langston/inbox/b1_5/`. **DO NOT** `cd /mnt/gdrive`, `git status`, or `git log` on the GDrive FUSE mount — that pattern hangs (B-NEW-42b empirical, 30+ min hangs). If you need anything not embedded here, use `ssh staging` for repo-side inspection.

---

## §1 — Build summary

| Chunk | Scope | Status |
|---|---|---|
| A | Scanner rolling-median depth query + threading | ✅ DONE |
| B | New `xstock_spot/imf-liquidity.ts` + wired into both filter lanes | ✅ DONE |
| C | Two-way `min_depth_usd` admission gate (global + pattern Stage-1) | ✅ DONE |
| D | ORB unit-fix + Global-DBS depth-weight + RTB annotate-null | ✅ DONE |
| E | **DROPPED → Phase 25 25-11** (Kyle directive 2026-05-29; portfolio-size rationale: $150-250 trade vs $11K-$250K depth → cap cannot bind) | ✅ APPROVED (your concur folded) |
| F | Isolation + behavior tests (17 tests, all passing) | ✅ DONE |
| G | Migration SQL + Drizzle schema + O6 universe-audit script | ✅ DONE |
| H | Final tsc(494/494) + vitest(17/17) gate | ✅ DONE |

**Gates:**
- `npx tsc --noEmit`: **494 errors = baseline; ZERO new regressions; ZERO in any B.1.5-touched file.**
- `node scripts/check-tsc-baseline.mjs`: `OK — no regressions above baseline`.
- `npx vitest run server/tests/unit/b1-5-xstock-liquidity-isolation.test.ts`: **17 passed / 17 total**.

---

## §2 — Files changed

**NEW (4):**
- `server/asset_classes/xstock_spot/imf-liquidity.ts` — depth-LQ module.
- `server/tests/unit/b1-5-xstock-liquidity-isolation.test.ts` — 17 isolation tests.
- `drizzle/migrations/2026-05-30-b-1-5-xstock-depth-liquidity.sql` — column + seed.
- `scripts/b-1-5-universe-audit.ts` — O6 reusable audit.

**MODIFIED (8):**
- `server/asset_classes/xstock_spot/imf-evaluator.ts` — LQ swap + askDepthUsd param + graceful skip.
- `server/asset_classes/xstock_spot/pattern-filter.ts` — LQ swap + min_depth gate + 2 depth params + graceful skip.
- `server/asset_classes/xstock_spot/global-filter.ts` — min_depth gate + 2 depth params + graceful skip.
- `server/asset_classes/xstock_spot/eval-cycle.ts` — params + threading to 3 filters.
- `server/asset_classes/xstock_spot/scanner.ts` — rolling-median depth query + depthBySymbol map + DBS-weight switched to depth.
- `server/strategies/orb.ts` — currentVolume re-sourced (xstock-only by orb.ts:157 gate, fix automatically isolated).
- `server/core/rtb/ready_to_buy_service.ts` — volume24h write annotated-null for xstock.
- `shared/schema.ts` — `minDepthUsd` field on `screenerFilters`.

---

## §3 — Load-bearing diff snippets

### 3.1 NEW: `server/asset_classes/xstock_spot/imf-liquidity.ts` (Chunk B core)

```ts
export function calculateXstockDepthLQ(askDepthUsd: number): number {
  if (!Number.isFinite(askDepthUsd) || askDepthUsd <= 0) return 0;
  // Parity with crypto's shape: log10(USD + 1) × 10, clamped [0, 100].
  const rawLQ = Math.log10(askDepthUsd + 1) * 10;
  return Math.min(100, Math.max(0, rawLQ));
}
```

Pure ask-side depth → 0-100 score, log10-shaped for parity with crypto LQ semantics. Sentinel `<= 0` or non-finite → 0 (graceful, never throws).

### 3.2 `imf-evaluator.ts` LQ swap + graceful skip (Chunks B-wire + C)

```ts
import { calculateIMFMetrics, calculateVolNoise, calculateCorrelation } from '../../core/metrics/imf-metrics.js';
import { calculateXstockDepthLQ } from './imf-liquidity.js';
// ... calculateLogLiquidity REMOVED from import (no longer used here; SHARED fn unchanged)
```

```ts
export async function evaluateXstockFamilyIMF(
  symbol: string, ohlc: OHLCData[], mode: 'paper' | 'live',
  preloadedFamilies?: Map<string, any>,
  askDepthUsd: number = -1,   // NEW — sentinel-default
): Promise<FamilyIMFResult> {
```

```ts
// B.1.5 — depth-based LQ (ask-side). lqComputable=false when depth data
// is unavailable this cycle → LQ gate is skipped (non-binding) below.
const lqComputable = askDepthUsd >= 0;
const LQ = lqComputable ? calculateXstockDepthLQ(askDepthUsd) : 0;
// ... per-family gate now:
if (lqComputable && LQ < lqMin) { /* failLQ */ } else if (VolNoise > vnMax) { ... }
```

### 3.3 `pattern-filter.ts` — same LQ swap + Stage-1 `min_depth_usd` gate (Chunks B-wire + C)

```ts
import { calculateVolNoise } from '../../core/metrics/imf-metrics.js';
import { calculateXstockDepthLQ } from './imf-liquidity.js';
```

```ts
export async function evaluateXstockPatternFilter(
  /* ... existing params ... */
  bidAskSpreadPct: number = -1,
  // NEW:
  askDepthUsd: number = -1,
  bidDepthUsd: number = -1,
): Promise<PatternFilterResult> {
```

Stage-1 NEW gate (after existing min_volume block, which becomes inert via Chunk G seeding `min_volume=0`):

```ts
const minDepthUsd = parseFloat(config.minDepthUsd ?? '0');
const twoWayDepthUsd = (askDepthUsd >= 0 && bidDepthUsd >= 0) ? Math.min(askDepthUsd, bidDepthUsd) : -1;
if (minDepthUsd > 0 && twoWayDepthUsd >= 0 && twoWayDepthUsd < minDepthUsd) {
  counters.failed_min_depth = 1;
  return { passed: false, failureReason: `pattern_min_depth_${twoWayDepthUsd.toFixed(0)}_lt_${minDepthUsd.toFixed(0)}`, counters, perMetric, metrics: { LQ: 0, VolNoise: 0, DI: null } };
}
```

Stage-2 LQ swap (identical to imf-evaluator):

```ts
const lqComputable = askDepthUsd >= 0;
const LQ = lqComputable ? calculateXstockDepthLQ(askDepthUsd) : 0;
// ...
if (lqComputable && LQ < lqMin) { /* failLQ */ } else if (VolNoise > vnMax) { ... }
```

### 3.4 `global-filter.ts` — Stage-1 `min_depth_usd` gate (Chunk C)

Same pattern as pattern-filter Stage-1: 2 new optional depth params (`askDepthUsd=-1, bidDepthUsd=-1`), gate fires on `MIN(askDepthUsd, bidDepthUsd)` only when `minDepthUsd > 0` AND both depth values are present and finite; otherwise skips. `failed_min_depth` counter added.

### 3.5 `eval-cycle.ts` — param threading (Chunk A)

```ts
export async function evaluateXstockPairForVTS(
  /* ... existing params ... */
  propagatedDbs?: { score: number; category: string; slope: number },
  // NEW:
  askDepthUsd: number = -1,
  bidDepthUsd: number = -1,
): Promise<void> {
```

Forwarded into all three filters:

```ts
const globalResult = await evaluateXstockGlobalFilter(..., bidAskSpreadPct, askDepthUsd, bidDepthUsd);
const patternResult = await evaluateXstockPatternFilter(..., bidAskSpreadPct, askDepthUsd, bidDepthUsd);
// later, inside the imf branch:
const imfResult = await evaluateXstockFamilyIMF(symbol, ohlc, mode, configs?.families, askDepthUsd);
```

### 3.6 `scanner.ts` — rolling-median depth query (Chunk A core) + DBS depth-weight (Chunk D)

After the existing `tickerEnrichmentBySymbol` loop, NEW depth aggregate:

```ts
const depthBySymbol = new Map<string, { askDepthUsd: number; bidDepthUsd: number }>();
try {
  const depthResult = await db.execute<...>(sql`
    SELECT symbol::text AS symbol,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ask * ask_qty) AS ask_depth_usd,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY bid * bid_qty) AS bid_depth_usd
    FROM xstock_spot_ticker_snap
    WHERE captured_at > NOW() - INTERVAL '20 minutes'
      AND symbol IN (${sql.raw(symbolListSql)})
      AND bid > 0 AND ask > 0 AND bid_qty > 0 AND ask_qty > 0
    GROUP BY symbol
  `);
  // ... parse rows, sentinel -1 when value <= 0 or non-finite ...
} catch (depthErr) {
  // Graceful: a depth-query failure leaves the map empty → every pair uses
  // sentinel -1 → depth gates skip this cycle. NEVER throws.
  console.warn(`[B.1.5][DEPTH_QUERY_FAIL] ${...}`);
}
```

DBS pre-cycle compute — the volume-weight is now real depth:

```ts
// B.1.5: weight by real two-sided depth-USD rather than inflated 24h "volume".
const depthInfo = depthBySymbol.get(symbol);
const dbsWeight = (depthInfo && depthInfo.askDepthUsd > 0 && depthInfo.bidDepthUsd > 0)
  ? Math.min(depthInfo.askDepthUsd, depthInfo.bidDepthUsd)
  : 0;
xstockDirectionalBiasStore.updatePair(
  symbol, dbsResult.score, dbsResult.sentinelZero, dbsWeight, sector,
);
```

Eval loop now reads depth and passes it:

```ts
const depth = depthBySymbol.get(symbol);
const askDepthUsd = depth?.askDepthUsd ?? -1;
const bidDepthUsd = depth?.bidDepthUsd ?? -1;
await evaluateXstockPairForVTS(
  symbol, ohlc, price, volume24hUSD, 'paper',
  cycleCounters, cycleConfigs, bidAskSpreadPct, propagatedDbs,
  askDepthUsd, bidDepthUsd,
);
```

### 3.7 `orb.ts` ORB unit-fix (Chunk D — your Q3 option (b) folded)

ORB is xstock_spot-only by the hard gate at orb.ts:157 (`if (assetClass !== 'xstock_spot') return null;`), so this change is **structurally isolated** — crypto never enters the function.

```ts
// B.1.5 (2026-05-30): re-source `currentVolume` from the LAST OHLC BAR's
// volume (per-bar unit, same stream as `orVolume`) rather than
// `indicators.volume` (24h field). Restores unit coherence so the
// `volumeMultiple` ratio is meaningful.
// NOTE: ORB is currently DISABLED (`strategy_gates.enabled=false` per
// B-NEW-34); this fix is forward-looking for when it's re-enabled.
const currentVolume = priceData.length > 0
  ? Number(priceData[priceData.length - 1].volume ?? 0)
  : 0;
```

The `Number()` coercion is required because `PriceData.volume` is typed `number | string`. Without it, tsc adds an error (TS2362).

### 3.8 `ready_to_buy_service.ts` — RTB volume24h annotate-null for xstock (Chunk D, Row-8)

```ts
// B.1.5 — Row-8: for xstock the input's volume24h is the underlying equity's
// share volume, not the token's — landmine for any future RTB-vs-volume wiring.
// Skip-write null for xstock; column is explicitly empty. Crypto path unchanged.
volume24h: input.assetClass === 'xstock_spot' ? null : input.volume24h?.toString(),
```

VTS does NOT use RTB (it calls `registerOpenVtsTrade` directly per eval-cycle.ts:698), so this only affects the active-trading path (currently dormant).

### 3.9 `shared/schema.ts` — Drizzle column add

```ts
minDepthUsd: decimal("min_depth_usd", { precision: 20, scale: 2 }),
```

NULL-by-default; only seeded for xstock_spot rows via the migration.

### 3.10 Migration SQL (Chunk G) — `2026-05-30-b-1-5-xstock-depth-liquidity.sql`

```sql
BEGIN;

ALTER TABLE screener_filters
  ADD COLUMN IF NOT EXISTS min_depth_usd NUMERIC(20, 2);

COMMENT ON COLUMN screener_filters.min_depth_usd IS 'B.1.5: ...';

UPDATE screener_filters SET min_depth_usd = 2000
 WHERE asset_class = 'xstock_spot' AND filter_path IN ('vts_quant', 'vts_pattern');

UPDATE screener_filters SET min_depth_usd = 5000
 WHERE asset_class = 'xstock_spot' AND filter_path IN ('active_quant', 'active_pattern');

-- Neutralize the now-inert broken-volume gate for xstock_spot.
UPDATE screener_filters SET min_volume = 0
 WHERE asset_class = 'xstock_spot';

COMMIT;
```

Threshold rationale: measured overnight depth median = $32,947; p10 = $10,692. $2K (VTS) admits thin names so VTS gathers learning data; $5K (active) refuses genuinely-empty books only — sizing-cap protection is Phase 25 25-11 (per-trade ~$150-250 vs depths $11K+ → participation cap cannot bind today).

---

## §4 — Isolation guarantees (per pre-audit §4)

| Touched file | Shared/Forked | Crypto-protection |
|---|---|---|
| `xstock_spot/imf-liquidity.ts` (NEW) | FORKED | crypto never imports it |
| `xstock_spot/imf-evaluator.ts`, `pattern-filter.ts`, `global-filter.ts`, `eval-cycle.ts`, `scanner.ts` | FORKED | crypto uses fx5-scanner.ts / shared filters |
| `core/metrics/imf-metrics.ts` (calculateLogLiquidity) | SHARED | **NOT EDITED** — regression-locked by test §3 |
| `core/metrics/directional-bias.ts` (weight math) | SHARED | **NOT EDITED** — only the xStock scanner's *value-passed-as-weight* changed |
| `strategies/orb.ts` | SHARED | hard gate `if (assetClass !== 'xstock_spot') return null;` at orb.ts:157 — crypto never enters |
| `core/rtb/ready_to_buy_service.ts` | SHARED | gate `input.assetClass === 'xstock_spot' ? null : ...` — crypto path byte-identical |
| `shared/schema.ts` | SHARED | NULL-default; only xstock_spot rows seeded |

The crypto `calculateLogLiquidity` golden-value tests in §3 (5 tests) lock the shared math against future drift.

---

## §5 — Test results

```
$ npx vitest run server/tests/unit/b1-5-xstock-liquidity-isolation.test.ts

✓ B.1.5 — xStock depth-based LQ (calculateXstockDepthLQ) (10 tests)
  ✓ returns 0 when askDepthUsd is the sentinel -1
  ✓ returns 0 when askDepthUsd is 0
  ✓ returns 0 when askDepthUsd is non-finite (NaN / ±Infinity)
  ✓ returns 0 when askDepthUsd is negative
  ✓ maps $10K → LQ≈40 (log10 parity-shape)
  ✓ maps $100K → LQ≈50
  ✓ maps $1M → LQ≈60
  ✓ clamps to 100 for extremely deep books
  ✓ monotonically non-decreasing for increasing depth
  ✓ output strictly within [0, 100] across wide range

✓ B.1.5 — Crypto LQ regression-lock (calculateLogLiquidity unchanged) (5 tests)
  ✓ returns 0 for empty OHLC
  ✓ returns 0 for fewer than 5 bars
  ✓ deterministic log10-shaped value for stable 10-bar input (≈50)
  ✓ higher volumes produce higher LQ (monotonic)
  ✓ clamps to [0, 100] for extreme volumes

✓ B.1.5 — Cross-asset isolation structure (2 tests)
  ✓ xstock_spot/imf-liquidity.ts exports only calculateXstockDepthLQ (arity = 1)
  ✓ same numeric input → independent results (not aliased)

Test Files  1 passed (1)
     Tests  17 passed (17)
```

---

## §6 — Known residuals + explicit non-scope

1. **MCE `indicators.volume` still carries inflated underlying-equity volume** for xStock — only archived to `pair_scan_archive`, not consumed by any live decision after the ORB unit-fix. Scrubbing it would touch shared MCE; flagged as data-quality cleanup, **not in B.1.5 scope** (pre-audit §6 governance gap; SIM Manual §8 note in Step-10).
2. **ORB is currently DB-disabled** (`strategy_gates.enabled=false` per B-NEW-34, 2026-05-15). The orb.ts fix is forward-looking for re-enablement; it doesn't repair a live-running consumer.
3. **`min_volume` gate code path left in place** on global-filter / pattern-filter (lines :117 / :199). Inert via the migration setting `min_volume=0` for xstock_spot. Decided over removing the code: lower blast radius + preserves the existing skip-on-0 semantics. Remove in a later batch if desired.
4. **B-NEW-47 (storage sweep activation)** is the next-after-B.1.5 sub-batch — scheduled by Kyle 2026-05-29.
5. **#162 Global Regime per-class gap** — surfaced during downstream-consumer discussion; sequenced as B-NEW-48 (after B-NEW-47, conditional on a consumer-impact audit at its scoping). Out of B.1.5 scope.

---

## §7 — Review ask

Please weigh in on:

- **Q1 — Graceful-skip semantics:** the three-state design (depth adequate → bind / thin → bind protective / absent → non-binding skip via sentinel -1) is implemented at the filter level via `lqComputable` and the `MIN(...) >= 0` guard on the depth gate. Does the implementation match the design you signed off in pre-audit §R-fold-1b?
- **Q2 — Rolling-median window:** I used a 20-minute window in the scanner (`INTERVAL '20 minutes'`). Sensible default given measured depth stability, or worth a longer window (e.g. 30-60 min)?
- **Q3 — DBS weight fallback:** when depth is absent for a symbol, the scanner passes `0` as the weight to `xstockDirectionalBiasStore.updatePair` (effectively excludes the pair from the volume-weighted median). Acceptable, or would you prefer a different graceful behavior (e.g., median-of-known-depths fallback)?
- **Q4 — Threshold seeds:** $2K (VTS) and $5K (active) for `min_depth_usd`. Calibrated against measured overnight median $33K / p10 $11K — comfortable, or do you want different starter values?
- **Q5 — Min_volume code left in place (inert via DB=0):** comfortable, or do you want it removed in the same batch?
- **Q6 — Any other concerns** before we push to GitHub + deploy to staging.

No re-review needed for revisions you flag as nits — I'll fold them and re-dispatch only if material.

---

*End B.1.5 Step-4 Change List. After your ACK: push → CI all-4-green → staging deploy (migration + pm2 restart) → Step-7 verify → Step-8 you do UI verification → governance → close.*
