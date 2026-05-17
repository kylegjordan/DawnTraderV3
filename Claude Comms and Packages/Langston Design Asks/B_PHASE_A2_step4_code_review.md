# B-PHASE-A2 — Step 4 Code Review Dispatch (embed-diff-inline)

> **From:** Claude Code
> **To:** Langston
> **Date:** 2026-05-17
> **Workflow step:** Step 4 — Code Review (pre-push verification)
> **Commit range:** `e84657110..d567399bc` (5 commits on `migration/aws-supabase`)
> **Status:** pushed to GitHub; CI running; awaiting your Step 4 ACK before deploy
>
> **INFRASTRUCTURE NOTE (CLAUDE.md §6.5.0.a):** DO NOT `cd /mnt/gdrive/...` to inspect the repo. The diff content is embedded inline below. For any deeper code reading beyond the snippets here, use `ssh staging 'cd /home/deploy/dawntrader && git diff e84657110^..HEAD path/to/file'`.

---

## Summary

All 6 deliverables (sub-tasks A through E) committed across 5 atomic commits. Roll-up:

| Sub-task | Commit | Files | Insertions |
|---|---|---|---|
| A | `e84657110` | 3 (store + asset-classes type + test) + 5 governance docs | 2330 |
| B | `9cdafa7df` | 2 (registry data + reference doc) | 656 |
| C | `2a9341b87` | 3 (scanner + eval-cycle + test) | 269 |
| D | `ba2689141` | 2 (migration + rollback) | 86 |
| E | `d567399bc` | 3 (backfill table + script + package.json) | 249 |
| **Total** | | 17 files | **3580** |

---

## §1 — Sub-task A: directional-bias-store.ts extension (commit e84657110)

### 1.1 New types in `shared/asset-classes.ts`

```ts
export type XstockSector =
  | 'XLK' | 'XLE' | 'XLV' | 'XLF' | 'XLI' | 'XLP' | 'XLY' | 'XLU' | 'XLB' | 'XLRE' | 'XLC'
  | 'INDEX_PROXY' | 'BROAD_ETF' | 'INTL_ETF';

export interface XstockSpotEntry {
  name: string;
  is24_7?: boolean;
  sector: XstockSector;        // Required (sub-task B flips this; A keeps optional)
  adr?: boolean;
  cryptoAdjacent?: boolean;
}
```

(In sub-task A the `sector` field is staged `optional`; sub-task B flips to required AFTER the 265 entries are filled in.)

### 1.2 Store constructor option (`server/core/metrics/directional-bias-store.ts`)

```ts
export interface DirectionalBiasStoreOptions {
  mode: 'crypto' | 'xstock';
  assetClassForKnobs: 'crypto_spot' | 'xstock_spot';
}

const GICS_SECTORS: ReadonlySet<XstockSector> = new Set<XstockSector>([
  'XLK', 'XLE', 'XLV', 'XLF', 'XLI', 'XLP', 'XLY', 'XLU', 'XLB', 'XLRE', 'XLC',
]);

function getGlobalDbsMinSampleCount(assetClass: 'crypto_spot' | 'xstock_spot'): number {
  return getCachedNumberRequired('dbs_calculation', 'min_sample_count',
    { exchange: '*', assetClass, strategy: '*', regime: '*' });
}

function getSectorCoverageFloor(): number {
  try {
    const v = getCachedConstant<number>('dbs_calculation', 'sector_coverage_floor',
      { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' });
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 7;
  } catch {
    return 7;
  }
}
```

### 1.3 PairStoreEntry sector field

```ts
interface PairStoreEntry {
  score: number;
  timestamp: number;
  sentinelZero: boolean;
  volume: number;
  sector?: XstockSector;     // crypto leaves undefined; xstock populates
}
```

### 1.4 publishSnapshot mode-branch (the load-bearing logic)

```ts
publishSnapshot(): GlobalDbsSnapshot | null {
  this.pruneExpired();

  let freshCount: number;
  let eligibleEntries: [string, PairStoreEntry][];
  let sectorsCovered = 0;

  if (this.opts.mode === 'xstock') {
    const sectorsSeen = new Set<XstockSector>();
    eligibleEntries = [];
    for (const [sym, entry] of this.store.entries()) {
      // GICS-only + non-sentinel partition gate
      if (entry.sector && GICS_SECTORS.has(entry.sector) && !entry.sentinelZero) {
        eligibleEntries.push([sym, entry]);
        sectorsSeen.add(entry.sector);
      }
    }
    freshCount = eligibleEntries.length;
    sectorsCovered = sectorsSeen.size;
  } else {
    // crypto mode — original behavior (back-compat)
    freshCount = this.store.size;
    eligibleEntries = Array.from(this.store.entries());
  }

  const minSampleCount = getGlobalDbsMinSampleCount(this.opts.assetClassForKnobs);
  const sectorCoverageFloor = this.opts.mode === 'xstock' ? getSectorCoverageFloor() : 0;
  const belowGlobalFloor = freshCount < minSampleCount;
  const belowSectorFloor = this.opts.mode === 'xstock' && sectorsCovered < sectorCoverageFloor;
  const belowFloor = belowGlobalFloor || belowSectorFloor;

  // ... existing 5-row behavior spec applies; xstock log tag is 'GlobalDBS-xstock'
  // Aggregation source for the weighted-median:
  const aggregationSource = this.opts.mode === 'xstock' ? eligibleEntries : Array.from(this.store.entries());
  // (Continues with same compute + Row 4 + Row 5 logic)
}
```

### 1.5 Two singleton exports

```ts
export const directionalBiasStore = new DirectionalBiasStore({
  mode: 'crypto',
  assetClassForKnobs: 'crypto_spot',
});

export const xstockDirectionalBiasStore = new DirectionalBiasStore({
  mode: 'xstock',
  assetClassForKnobs: 'xstock_spot',
});

export function getLatestGlobalDbsSnapshot(): GlobalDbsSnapshot | null {
  return directionalBiasStore.getLatestSnapshot();
}

export function getLatestXstockGlobalDbsSnapshot(): GlobalDbsSnapshot | null {
  return xstockDirectionalBiasStore.getLatestSnapshot();
}
```

### 1.6 Unit test file (`b-phase-a2-xstock-dbs-store.test.ts`)

11 test cases:
- Two-instance independence (3): distinct instances, independent clear(), convenience accessors
- Crypto back-compat (3): 4-arg updatePair, 25-pair publish at 20-floor, 15-pair below-floor null
- xStock dual-floor + sector partition (4): 35 multi-sector publish, all-XLK fails sector-coverage, 25 fails global-30, INDEX_PROXY excluded from floor, sentinel excluded
- Independent operation (1): crypto publish unaffected by xStock store state

Test mocks `module-constants-service` to return xstock_spot→30/7 and crypto wildcard→20.

---

## §2 — Sub-task B: 265-entry sector mapping (commit 9cdafa7df)

All 265 entries got concrete `sector` tag (e.g.):

```ts
['AAPL/USD', { name: 'Apple', is24_7: true, sector: 'XLK' }],
['MSTR/USD', { name: 'MicroStrategy', is24_7: true, sector: 'XLK', cryptoAdjacent: true }],
['COIN/USD', { name: 'Coinbase', sector: 'XLF', cryptoAdjacent: true }],
['SPY/USD', { name: 'S&P 500 ETF', is24_7: true, sector: 'INDEX_PROXY' }],
['GLD/USD', { name: 'Gold ETF', is24_7: true, sector: 'BROAD_ETF' }],
['EWZ/USD', { name: 'Brazil ETF', sector: 'INTL_ETF' }],
['BABA/USD', { name: 'Alibaba', sector: 'XLY', adr: true }],
```

And `sector` flipped to REQUIRED in the interface:

```ts
export interface XstockSpotEntry {
  name: string;
  is24_7?: boolean;
  sector: XstockSector;      // ← REQUIRED, no `?`
  adr?: boolean;
  cryptoAdjacent?: boolean;
}
```

Distribution per `xstock_sector_mappings_reference.md` (your spot-check ACK'd this):

```
XLV  42  XLK  39  XLF  37  XLI  27  XLY  24
XLC  22  XLRE 15  XLP  15  XLU  14
INTL_ETF 11  XLE  10
BROAD_ETF 6  INDEX_PROXY 2  XLB 1
```

---

## §3 — Sub-task C: scanner + eval-cycle wiring (commit 2a9341b87)

### 3.1 Pre-cycle DBS compute block in `scanner.ts` (inserted at line ~440)

```ts
// B-PHASE-A2: pre-cycle DBS compute
const dbsCycleStart = Date.now();
const dbsBySymbol = new Map<string, { score: number; category: string; slope: number }>();
for (const symbol of symbolList) {
  const ohlc = ohlcBatch.get(symbol) ?? [];
  if (ohlc.length < minOhlcHistoryBars) continue;
  const atr = computeATRFromOHLC(ohlc, 14);
  if (atr <= 0) continue;

  const registryEntry = XSTOCK_SPOT_REGISTRY.get(symbol);
  const sector = registryEntry?.sector;
  if (!sector) {
    console.warn(`[B-PHASE-A2][SECTOR_MISSING] ${symbol} not in registry; skipping DBS write`);
    continue;
  }

  const dbsResult = computeDirectionalBias(ohlc, atr);
  let slope = 0;
  const priorOHLC = ohlc.slice(0, -3);
  if (priorOHLC.length >= 20) {
    const priorAtr = computeATRFromOHLC(priorOHLC, 14);
    if (priorAtr > 0) {
      const priorDbs = computeDirectionalBias(priorOHLC, priorAtr);
      slope = dbsResult.score - priorDbs.score;
    }
  }

  const enrich = tickerEnrichmentBySymbol.get(symbol);
  const volume24hShares = enrich?.volume24hShares ?? 0;
  const latestPrice = ohlc[ohlc.length - 1].close;
  const volume24hUSD = Number.isFinite(volume24hShares) && volume24hShares > 0 && Number.isFinite(latestPrice) && latestPrice > 0
    ? volume24hShares * latestPrice
    : 0;

  xstockDirectionalBiasStore.updatePair(
    symbol, dbsResult.score, dbsResult.sentinelZero, volume24hUSD, sector,
  );
  dbsBySymbol.set(symbol, { score: dbsResult.score, category: dbsResult.category, slope });
}
const dbsComputeDurationMs = Date.now() - dbsCycleStart;
console.log(
  `[B-PHASE-A2][CYCLE_DBS_TIMING] tick=${tick.tickNumber} dbs_compute_ms=${dbsComputeDurationMs} ` +
  `pairs_with_dbs=${dbsBySymbol.size} universe=${symbolList.length}`,
);
```

### 3.2 Eval loop threads propagatedDbs

```ts
for (const symbol of symbolList) {
  // ... existing per-pair setup
  const propagatedDbs = dbsBySymbol.get(symbol);
  await evaluateXstockPairForVTS(
    symbol, ohlc, price, volume24hUSD, 'paper',
    cycleCounters, cycleConfigs, bidAskSpreadPct, propagatedDbs,
  );
}
```

### 3.3 End-of-cycle publish + first-floor-clear telemetry

```ts
const xstockGlobalSnapshot = xstockDirectionalBiasStore.publishSnapshot();
if (xstockGlobalSnapshot && !xstockGlobalSnapshot.isStale) {
  if (!this.diag.firstFloorClearLogged) {
    console.log(
      `[B-PHASE-A2][FIRST_FLOOR_CLEAR] tick=${tick.tickNumber} ` +
      `pairs=${xstockGlobalSnapshot.coverage} ` +
      `global_dbs=${xstockGlobalSnapshot.value.score.toFixed(3)} ` +
      `category=${xstockGlobalSnapshot.value.category}`,
    );
    this.diag.firstFloorClearLogged = true;
  }
}
```

### 3.4 Eval-cycle signature change in `eval-cycle.ts`

```ts
export async function evaluateXstockPairForVTS(
  symbol: string,
  ohlc: OHLCData[],
  lastPrice: number,
  volume24h: number,
  mode: 'paper' | 'live',
  counters: XstockEvalCycleCounters,
  configs?: XstockFilterConfigBundle,
  bidAskSpreadPct: number = -1,
  // NEW (B-PHASE-A2):
  propagatedDbs?: { score: number; category: string; slope: number },
): Promise<void> {
  // ... at the MCE call site (line ~327):
  mceContext = mce.computeContext(symbol, ohlc, lastPrice, volume24h, undefined, propagatedDbs, ASSET_CLASS);
}
```

### 3.5 Registry completeness test (`b-phase-a2-xstock-eval-cycle-dbs.test.ts`)

24 test cases across 4 describe-blocks:
- Registry completeness (3): every entry has sector, size=265, sector ∈ allowed union
- D17 high-profile spot-check asserts (15): all locked names
- Special bucket spot-check (4): SPY/QQQ INDEX_PROXY, GLD BROAD_ETF, EWA INTL_ETF
- Flag set spot-check (2): MSTR + COIN cryptoAdjacent, BABA + ASML adr

---

## §4 — Sub-task D: module_constants migration (commit ba2689141)

Idempotent ON CONFLICT DO UPDATE pattern per scope rev2 Q7:

```sql
INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('dbs_calculation', 'min_sample_count',     '30'::jsonb,    'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-layer1-starter'),
  ('dbs_calculation', 'sector_coverage_floor', '7'::jsonb,    'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-layer1-starter'),
  ('dbs_calculation', 'slope_weight',          '0.40'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto'),
  ('dbs_calculation', 'return_weight',         '0.35'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto'),
  ('dbs_calculation', 'ema_weight',            '0.25'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto'),
  ('dbs_calculation', 'lookback_period',       '48'::jsonb,   'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto'),
  ('dbs_calculation', 'ema_fast_period',       '12'::jsonb,   'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto'),
  ('dbs_calculation', 'ema_slow_period',       '26'::jsonb,   'xstock_spot', '*', '*', '*', NOW(), 'b-phase-a2-byte-identical-crypto')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by;
```

Rollback migration also shipped (deletes the 8 rows; crypto wildcard rows untouched throughout).

---

## §5 — Sub-task E: backfill table + script (commit d567399bc)

### 5.1 Table schema

```sql
CREATE TABLE IF NOT EXISTS xstock_dbs_backfill (
  symbol TEXT NOT NULL,
  sector TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  final_score DOUBLE PRECISION NOT NULL,
  slope_component DOUBLE PRECISION NOT NULL,
  return_component DOUBLE PRECISION NOT NULL,
  ema_component DOUBLE PRECISION NOT NULL,
  sentinel_zero BOOLEAN NOT NULL,
  atr DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (symbol, ts)
);
CREATE INDEX IF NOT EXISTS idx_xstock_dbs_backfill_sector_ts ON xstock_dbs_backfill (sector, ts);
CREATE INDEX IF NOT EXISTS idx_xstock_dbs_backfill_ts ON xstock_dbs_backfill (ts);
```

Captures components per scope rev2 D11 + your C8 ask.

### 5.2 Backfill script (`scripts/b-phase-a2-backfill.ts`)

Rolls 1-min bars to 60-min via SQL `date_trunc`, then per 48-bar window:

```ts
const atr = computeATRFromOHLC(bars, 14);
if (atr <= 0) { skipped++; continue; }
const result = computeDirectionalBias(bars, atr);
await pool.query(`
  INSERT INTO xstock_dbs_backfill
    (symbol, sector, ts, final_score, slope_component, return_component, ema_component, sentinel_zero, atr)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (symbol, ts) DO NOTHING
`, [symbol, sector, ts, result.score, result.components.slopeComponent, result.components.returnComponent, result.components.emaComponent, result.sentinelZero, atr]);
```

`npm run b-phase-a2:backfill -- --days 14` runs at Step 6 deploy.

---

## §6 — Key invariants preserved (verified by code-level inspection)

1. **Crypto behavior unchanged.** All 5 `directionalBiasStore.*` consumer sites (market-indicators, drift-dashboard-aggregator x3, MCE x2 + 1 publish) call against the same singleton with the same 4-arg `updatePair` signature. `publishSnapshot()` mode='crypto' branch is identical to today's behavior.
2. **MCE non-crypto branch unchanged.** Per pre-audit §3 trace, `propagatedDbs` flows MCE 905 → 973 → 974 → 997 → 1048 with no `assetClass === 'crypto_spot'` guards. xStock just stops passing `undefined` at line 327 of eval-cycle.ts.
3. **Module_constants precedence honored.** xstock_spot rows resolve via `scoreRowForKey()` more-specific-wins; crypto wildcard reads unaffected (verified in pre-audit §5).
4. **Graceful degrade.** Pairs with insufficient OHLC / ATR=0 / sector missing fall through to MCE's synthesized neutral as before. No new failure modes.
5. **TypeScript compile-gate.** `XstockSpotEntry.sector` is REQUIRED; any future registry entry missing sector hard-fails the build.

---

## §7 — Step 7 verification surface (planned)

After your Step 4 ACK + Step 6 deploy:

1. PM2 logs show `[B-PHASE-A2][CYCLE_DBS_TIMING]` per cycle (analytical pre-audit said 0.16%; empirical reads here)
2. PM2 logs show `[B-PHASE-A2][FIRST_FLOOR_CLEAR]` on first ARCA-open publish
3. `psql -c "SELECT count(*), count(DISTINCT symbol), count(DISTINCT sector) FROM xstock_dbs_backfill"` returns non-zero across all three columns
4. Claude-in-Chrome UI navigation to `/api/xstocks/filter-diagnostics` shows real DBS values (not the synthesized-neutral category)
5. **Step 7 baseline capture per your Step 2 note #1:** log xStock regime distribution pre-deploy vs post-deploy — quantify the Path-B newly-admitting xStock pairs that today are synthesized-neutral.

---

## §8 — Ask

Review the diff content above. Specifically requested:

1. **§1.4 publishSnapshot mode-branch logic** — does the GICS-partition + dual-floor mechanic match your understanding from design rev2 §3.6?
2. **§1.5 singleton exports + back-compat preservation** — anything that breaks crypto-side consumers?
3. **§3.1 pre-cycle DBS compute block** — is the order (filter for OHLC sufficiency → ATR → sector lookup → DBS → store-write → dbsBySymbol stash) correct?
4. **§4 migration** — ON CONFLICT DO UPDATE pattern per Q7 ACK; any concerns?
5. **§5.1 backfill table schema** — components captured per C8; any field missing?

Reply with: (a) Step 4 ACK to deploy, OR (b) BLOCKERS or specific revisions, OR (c) substantive disagreement.

CI is running on the push; will hold deploy until your ACK regardless of CI status (per workflow Step 4 → Step 5/6).

— Claude Code, 2026-05-17
