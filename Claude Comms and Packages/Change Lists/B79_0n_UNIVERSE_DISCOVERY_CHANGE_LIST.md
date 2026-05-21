# B79.0n.UNIVERSE-DISCOVERY — Step 4 change list for Langston code review

> **Scope:** `B79_0n_UNIVERSE_DISCOVERY_SCOPE.md` rev1 + §10 iteration outcomes (Step 1 Langston FINAL ACK, commit `b0ac6a022`).
> **Pre-audit:** `B79_0n_UNIVERSE_DISCOVERY_PRE_AUDIT.md` + §12 iteration outcomes (Step 2 Langston FINAL ACK, commit `5cbe80f54`).
> **Implementation commits:**
> - Phase A (migration + seed extraction): commit `0487419af`
> - Phase B-F (dynamic universe + 5-layer fallback + tests): commit `230348507`
> **CC state:** pushed to `migration/aws-supabase`. CI run `26221983377` in progress at dispatch time.

**INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §12 dispatch-anchoring:** load-bearing diff snippets embedded inline below. Five key source files ALSO staged at `/home/langston/inbox/b79-0n/` for full inspection:
- `xstock-universe-discoverer.ts` (~430 lines, 27KB)
- `universe-service.ts` (~190 lines, 9KB)
- `universe-bootstrap.ts` (~60 lines, 3KB)
- `xstock-universe-cron.ts` (~50 lines, 2KB)
- `2026-05-21-b79-0n-universe-discovery.sql` (~446 lines, 52KB — schema DDL + 260-row seed)

Do NOT `cd /mnt/gdrive`. For supplementary repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git diff 5cbe80f54..230348507 -- <path>'`.

---

## §1 — Change summary (14 files)

| # | File | Type | LOC | Purpose |
|---|---|---|---|---|
| 1 | `drizzle/migrations/2026-05-21-b79-0n-universe-discovery.sql` | NEW | +446 | Schema DDL (3 tables + 6 indexes + 4 CHECK constraints) + 260-row universe seed + 56-row override seed + _migrations ledger entry. Committed in Phase A. |
| 2 | `drizzle/migrations/2026-05-21-b79-0n-universe-discovery-rollback.sql` | NEW | +24 | Drops 3 tables + deletes ledger row. Committed in Phase A. |
| 3 | `scripts/b79-0n-universe-seed-extract.ts` | NEW | +110 | TypeScript extraction script that reads the current XSTOCK_SPOT_REGISTRY Map literal and emits both seed INSERT statements. Used to generate Phase A seed body; re-runnable for future seed regeneration. |
| 4 | `shared/asset-classes.ts` | MOD | -231/+47 | Replaced 260-row Map literal at lines 286-552 with empty stub + `_replaceXstockUniverse(entries)` helper + `_XSTOCK_SECTOR_VALUES_FOR_CHECK` ReadonlySet. Added UNCATEGORIZED to XstockSector union. |
| 5 | `server/asset_classes/xstock_spot/universe-bootstrap.ts` | NEW | +60 | Layer-4 hardcoded 20-symbol mega-cap fallback set. |
| 6 | `server/asset_classes/xstock_spot/sp500-backstop.ts` | NEW | +80 | S&P 500 ticker list for Kraken WS probe candidate set extension. |
| 7 | `server/asset_classes/xstock_spot/universe-service.ts` | NEW | +190 | In-memory accessor + 5-layer fallback chain (DB → file cache → bootstrap → fail-fast). |
| 8 | `server/services/xstock-universe-discoverer.ts` | NEW | +430 | Three-source orchestrator: CoinGecko + Kraken WS probe + Finnhub. |
| 9 | `server/services/xstock-universe-cron.ts` | NEW | +50 | Daily 06:00 UTC cron registration. |
| 10 | `server/services/passive-archive/universe-loader.ts` | MOD | -3/+12 | Refactored `loadXstockSpotUniverse()` from `xstocks-universe.json` file read to in-memory `XSTOCK_SPOT_SYMBOLS` read. |
| 11 | `server/config/xstocks-universe.json` | DEL | -36 | Deleted entirely per Q5 ACK. |
| 12 | `server/index.ts` | MOD | +44 | Boot wiring: universe-service init + 5-layer fallback + cron registration. |
| 13 | `server/routes.ts` | MOD | +120 | POST `/api/internal/universe-discovery/refresh` + GET `/api/internal/universe-discovery/health`. |
| 14 | Tests (5 files) | MIX | +220/-25 | 2 NEW test files + 3 updated for empty-registry-at-init compat. |

**Total:** 5 NEW source files (~870 LOC), 5 modified (~250 LOC net add), 2 NEW test files (~190 LOC), 3 updated test files, 1 deleted JSON. Net: +1,587 / -295.

---

## §2 — Pre-audit refinements all absorbed

| Langston Step 2 ACK item | Where it landed |
|---|---|
| Q1: CoinGecko coverage diagnostic-not-gate; <50% triggers warn log | `xstock-universe-discoverer.ts:fetchCoinGeckoTokenizedStocks` + `[LOW_COINGECKO_COVERAGE]` warn at runDiscovery |
| Q-PA-1: Finnhub key block-ship on Kyle provisioning | Provisioned 2026-05-21; verified post --update-env restart (no warnings) |
| Q-PA-2: hand-picked 20 layer-4 bootstrap | `universe-bootstrap.ts` |
| Q-PA-3: batched 100/chunk + 500ms inter-batch sleep | `xstock-universe-discoverer.ts:probeKrakenWs` chunks loop |
| Q-PA-4: VARCHAR + CHECK for sector (not ENUM) | Migration line 38-47; CHECK includes UNCATEGORIZED |
| Q-PA-5: silent stale window + `[STALE_SYMBOL]` structured log | `xstock-universe-discoverer.ts:applyStaleAndDelistedLifecycle` |
| Q-PA-6: trigger-at-deploy non-blocking | Documented in §3 G of this list + completion-report deploy chain |
| Additional concern: probe partial-response rejection | `xstock-universe-discoverer.ts:runDiscovery` Stage 3 partial-check; aborts cycle without DB writes if `probeResult.partial=true` |
| Q9 #1: Pro key endpoint-specific verification | Verified live during pre-audit §3.2 (HTTP 200 on /coins/markets?category=xstocks-ecosystem) |
| Q9 #2: discovery_runs audit table | Migration line 71-87; `writeDiscoveryRun` called at end of every cycle |
| Q9 #3: stale → delisted lifecycle (7d/30d) | `applyStaleAndDelistedLifecycle` + `is_delisted` column |
| Q9 #4: health endpoint | `routes.ts` GET /api/internal/universe-discovery/health (lines ~7925-8010) |
| Q9 #5: CoinGecko single-category | Confirmed: `xstocks-ecosystem` is the canonical target |

---

## §3 — Embedded load-bearing diffs

### §3.1 — `shared/asset-classes.ts` refactor (Phase C-1)

The 260-row Map literal at lines 286-552 was replaced with a dynamically-populated stub. New helpers added:

```typescript
// B79.0n.UNIVERSE-DISCOVERY 2026-05-21: the 260-row Map literal that
// previously occupied lines 286-552 was replaced with a dynamically-
// populated Map. The seed for the new shape lives in the DB table
// `xstock_spot_universe` (seeded by 2026-05-21-b79-0n-universe-discovery.sql).

const _xstockRegistryInternal = new Map<string, XstockSpotEntry>();
const _xstockSymbolsInternal = new Set<string>();

export const XSTOCK_SPOT_REGISTRY: ReadonlyMap<string, XstockSpotEntry> = _xstockRegistryInternal;
export const XSTOCK_SPOT_SYMBOLS: ReadonlySet<string> = _xstockSymbolsInternal;

/** Bulk-replace the in-memory universe. Called by xstockUniverseService at boot + after refresh. */
export function _replaceXstockUniverse(entries: ReadonlyMap<string, XstockSpotEntry>): void {
  _xstockRegistryInternal.clear();
  _xstockSymbolsInternal.clear();
  for (const [symbol, entry] of entries) {
    _xstockRegistryInternal.set(symbol, entry);
    _xstockSymbolsInternal.add(symbol);
  }
}
```

Also added `UNCATEGORIZED` to the `XstockSector` union + `_XSTOCK_SECTOR_VALUES_FOR_CHECK` runtime allow-list. Old back-compat `XSTOCK_SPOT_SYMBOLS` re-declaration at line 559 REMOVED (was `new Set(XSTOCK_SPOT_REGISTRY.keys())` — replaced by the in-sync mutable internal).

### §3.2 — `server/index.ts` boot wiring (Phase D)

```typescript
// B79.0n.UNIVERSE-DISCOVERY 2026-05-21: 5-layer fallback initialization
{
  const { xstockUniverseService } = await import('./asset_classes/xstock_spot/universe-service.js');
  const initResult = await xstockUniverseService.initializeFromDB();
  if (!initResult.ok || initResult.rowCount === 0) {
    if (initResult.dbReachable && initResult.rowCount === 0) {
      console.error(
        '[CRITICAL][B79.0n.UNIVERSE-DISCOVERY] DB reachable but xstock_spot_universe table is empty — ' +
        'seed migration likely never ran. Run `npm run db:migrate` and re-deploy.',
      );
    } else if (!initResult.dbReachable) {
      console.warn('[BOOT][B79.0n.UNIVERSE-DISCOVERY] Layer 2 DB unreachable; attempting Layer 3 file cache');
    }
    const fileCacheOk = await xstockUniverseService.loadFromFileCache();
    if (!fileCacheOk) {
      console.warn('[BOOT][B79.0n.UNIVERSE-DISCOVERY] Layer 3 file cache miss; attempting Layer 4 bootstrap');
      const bootstrapOk = xstockUniverseService.loadBootstrap();
      if (!bootstrapOk) {
        console.error('[CRITICAL][B79.0n.UNIVERSE-DISCOVERY] all 5 fallback layers exhausted; refusing to boot');
        process.exit(1);
      }
      console.warn('[BOOT][B79.0n.UNIVERSE-DISCOVERY] using BOOTSTRAP fallback (layer 4)');
    } else {
      console.warn('[BOOT][B79.0n.UNIVERSE-DISCOVERY] using FILE_CACHE fallback (layer 3)');
    }
  }
  const { XSTOCK_SPOT_SYMBOLS } = await import('../shared/asset-classes.js');
  console.log(`[BOOT][B79.0n.UNIVERSE-DISCOVERY] universe loaded: ${XSTOCK_SPOT_SYMBOLS.size} symbols (db_reachable=${initResult.dbReachable}, db_rows=${initResult.rowCount}, source=${xstockUniverseService.getCacheState().source})`);

  const { registerXstockUniverseCron } = await import('./services/xstock-universe-cron.js');
  registerXstockUniverseCron();
}
```

Per Q-PA-4 diagnostic enhancement: branches differ for `dbReachable=false` (DB unreachable; try file cache) vs `dbReachable=true, rowCount=0` (seed didn't run; log CRITICAL then still try fallbacks). `process.exit(1)` ONLY on full layer-5 exhaustion.

### §3.3 — Discoverer Kraken WS probe (load-bearing partial-response handling)

```typescript
async function probeKrakenWs(candidates: Set<string>): Promise<{ ok: boolean; accepted: Set<string>; rejected: Set<string>; partial: boolean; error?: string }> {
  // [...] chunk + connect + send + collect logic [...]

  ws.on('message', (raw) => {
    const data = JSON.parse(raw.toString());
    if (data?.method === 'subscribe') {
      if (data.success === true) {
        const sym = data?.result?.symbol;
        if (typeof sym === 'string') { accepted.add(sym); collected++; }
      } else if (data.success === false) {
        const errMsg: string = data?.error ?? '';
        const m = errMsg.match(/(\S+\/\S+)/);
        if (m) { rejected.add(m[1]); collected++; }
      }
      if (collected >= expected) finish(true, false);
    }
  });

  // Collection-window timeout — partial-response if collected < expected
  timeoutHandle = setTimeout(() => {
    const partial = collected < expected;
    finish(partial ? false : true, partial);
  }, KRAKEN_PROBE_COLLECTION_WINDOW_MS);
}
```

Called from `runDiscovery` Stage 3 with the additional-concern partial-response check:

```typescript
if (probeResult.partial) {
  errorLog = `Kraken WS probe partial-response (collected ${probeResult.accepted.size + probeResult.rejected.size}/${candidates.size}); aborting discovery cycle`;
  logError(errorLog);
  const runId = await writeDiscoveryRun(sourceChainStatus, 0, 0, 0, startedAt, completedAt, triggeredBy, errorLog);
  return { /* ... aborted result with no DB writes ... */ };
}
```

DOES write the discovery_runs audit row to record the partial-response event. Does NOT write to xstock_spot_universe (would corrupt with false-rejects per Langston's additional concern).

### §3.4 — Discoverer GICS-to-sector mapping

```typescript
function mapFinnhubIndustryToSector(industry: string | undefined): XstockSector {
  if (!industry) return 'UNCATEGORIZED' as XstockSector;
  const i = industry.toLowerCase();
  if (i.includes('technology')) return 'XLK';
  if (i.includes('health')) return 'XLV';
  if (i.includes('financ') || i.includes('bank') || i.includes('insurance')) return 'XLF';
  if (i.includes('communication') || i.includes('media') || i.includes('telecom')) return 'XLC';
  if (i.includes('consumer cyclical') || i.includes('consumer discretionary') || i.includes('retail') || i.includes('automotive')) return 'XLY';
  if (i.includes('consumer defensive') || i.includes('consumer staples') || i.includes('beverage') || i.includes('tobacco')) return 'XLP';
  if (i.includes('energy') || i.includes('oil') || i.includes('gas')) return 'XLE';
  if (i.includes('industrial')) return 'XLI';
  if (i.includes('real estate') || i.includes('reit')) return 'XLRE';
  if (i.includes('utilit')) return 'XLU';
  if (i.includes('material') || i.includes('chemical') || i.includes('mining')) return 'XLB';
  return 'UNCATEGORIZED' as XstockSector;
}
```

Substring-based heuristic (case-insensitive). Falls through to UNCATEGORIZED on unrecognized industries (preserves the override layer's ability to manually classify INDEX_PROXY / BROAD_ETF / INTL_ETF later).

### §3.5 — Stale → delisted lifecycle SQL

```typescript
// Stale: last_seen_at in [7d ago, 30d ago] → log warn line per row, no DB change
const staleResult = await db.execute<{ symbol: string; days_stale: number }>(sql`
  SELECT symbol, EXTRACT(EPOCH FROM (now() - last_seen_at)) / 86400 AS days_stale
  FROM xstock_spot_universe
  WHERE is_delisted = false
    AND last_seen_at < now() - INTERVAL '${sql.raw(String(STALE_THRESHOLD_DAYS))} days'
    AND last_seen_at >= now() - INTERVAL '${sql.raw(String(DELISTED_THRESHOLD_DAYS))} days'
`);
// for each row: logWarn(`[STALE_SYMBOL] symbol=${r.symbol} days_stale=...`);

// Delisted: last_seen_at > 30d ago → set is_delisted=true
const delistedResult = await db.execute<{ symbol: string }>(sql`
  UPDATE xstock_spot_universe
  SET is_delisted = true, updated_at = now()
  WHERE is_delisted = false
    AND last_seen_at < now() - INTERVAL '${sql.raw(String(DELISTED_THRESHOLD_DAYS))} days'
  RETURNING symbol
`);
// for each row: logWarn(`[DELISTED_AUTO] symbol=${r.symbol} reason="no_data_>30_days"`);
```

`sql.raw(String(N))` interpolation pattern matches B79.0i.a precedent (numeric template literal). Both thresholds are module-scope constants for easy tuning.

### §3.6 — DB schema (migration extract)

```sql
CREATE TABLE xstock_spot_universe (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  crypto_adjacent BOOLEAN NOT NULL DEFAULT false,
  adr BOOLEAN NOT NULL DEFAULT false,
  source_chain JSONB NOT NULL,
  is_delisted BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT xstock_spot_universe_sector_chk CHECK (
    sector IN ('XLK','XLV','XLF','XLC','XLY','XLP','XLE','XLI','XLRE','XLU','XLB','BROAD_ETF','INDEX_PROXY','INTL_ETF','UNCATEGORIZED')
  )
);
-- + 3 indexes (sector, last_seen_at, is_delisted)

CREATE TABLE xstock_spot_universe_overrides ( /* symbol PK + 4 override columns + notes + timestamps */ );
-- override sector CHECK mirrors the allow-list

CREATE TABLE discovery_runs (
  run_id BIGSERIAL PRIMARY KEY,
  /* timestamps + source_chain_status JSONB + counters + error_log + triggered_by */
  CONSTRAINT discovery_runs_triggered_by_chk CHECK (triggered_by IN ('cron_daily', 'manual_endpoint', 'boot_smoke'))
);
```

Seed: 260 universe rows + 56 override rows extracted from current Map literal via `scripts/b79-0n-universe-seed-extract.ts`. `ON CONFLICT (symbol) DO NOTHING` per Q6 idempotency.

### §3.7 — Cron registration (Phase E)

```typescript
const CRON_06_00_UTC = '0 6 * * *';
let _cronTask: cron.ScheduledTask | null = null;

export function registerXstockUniverseCron(): void {
  if (_cronTask) { /* guard double-registration */ return; }
  _cronTask = cron.schedule(CRON_06_00_UTC, async () => {
    try { await runDiscovery('cron_daily'); }
    catch (err) { console.error('[B79.0n.UNIVERSE-DISCOVERY][cron] daily refresh threw:', err); }
  }, { timezone: 'UTC' });
  console.log('[B79.0n.UNIVERSE-DISCOVERY][cron] registered daily refresh at 06:00 UTC');
}
```

Cron callback wraps in try/catch — unexpected throws don't propagate to the cron scheduler (would silently stop future fires).

### §3.8 — Deploy chain update (Phase G — documentation)

Step 6 deploy command:
```bash
ssh root@188.245.193.8 "su - deploy -c '\
  cd /home/deploy/dawntrader && \
  git pull origin migration/aws-supabase && \
  npm run build && \
  npm run db:migrate && \
  pm2 restart dawntrader --update-env && \
  sleep 10 && \
  (curl -s -X POST -H \"Authorization: Bearer <TOKEN>\" http://localhost:5000/api/internal/universe-discovery/refresh || true)\
'"
```

- `npm run db:migrate` runs BEFORE `pm2 restart` to ensure schema + seed are in place.
- `pm2 restart --update-env` re-reads `.env` (FINNHUB_API_KEY already provisioned 2026-05-21).
- The trailing curl uses `|| true` so a transient external-service failure (CoinGecko 500, Kraken WS timeout) does NOT fail the deploy. Per Q-PA-6: the 5-layer fallback covers it; next 06:00 UTC cron picks up.

---

## §4 — Open questions for Step 4 review

### Q-S4-1 — `_replaceXstockUniverse` underscore naming convention

`shared/asset-classes.ts` now exports `_replaceXstockUniverse(entries)` with a leading underscore to signal "internal API — universe-service is the only legitimate caller." TypeScript can't enforce this; it's a convention. Alternative: move the helper to `universe-service.ts` and have `shared/asset-classes.ts` just expose the mutable Map/Set directly. Tradeoff: convention-only enforcement vs broader API surface in the foundational shared file. CC default: keep underscore-naming convention. Confirm.

### Q-S4-2 — file cache TTL + ownership

`universe-service.ts:writeFileCache` writes to `/var/lib/dawntrader/xstock-universe-cache.json` with `mode: 0o644` via tmp-file + rename. The deploy user (`deploy:deploy`) owns the file. Concern: if PM2 ever runs as root briefly (e.g., during a one-off ops command), the file ownership could change and the next deploy-user write would fail with EACCES. Mitigation candidates: (a) explicit chmod/chown in the write path; (b) accept the risk + document. CC default: (b) — single-deploy-user runtime convention is the canonical pattern in this codebase. Confirm.

### Q-S4-3 — partial-response collection-window calibration

`KRAKEN_PROBE_COLLECTION_WINDOW_MS = 15_000` (15 seconds). At 540 candidates spread across 6 chunks (100/batch), the last subscribe send happens at ~T+2.75s; Kraken's response stream typically completes within 5-10s after final send. 15s gives 5-10s of headroom for slow connections. Concern: too generous (delays cycle on healthy connections) or too aggressive (false partial-response on slow connections)? CC default: 15s is comfortable middle. Confirm.

### Q-S4-4 — Finnhub rate-limit pacing

`FINNHUB_RATE_LIMIT_DELAY_MS = 1100` per-symbol = ~1 call/sec, well below the 60/min free-tier limit. For 540 Kraken-accepted symbols → ~10 min total Finnhub stage duration. Acceptable for a daily cron at 06:00 UTC (no time pressure). Alternative: parallelize at 5 concurrent + lower per-request sleep — drops to ~2 min but risks bursting past 60/min. CC default: 1100ms serial pacing. Confirm.

### Q-S4-5 — `XSTOCK_SPOT_REGISTRY.size === 0` at module-init

The new dynamic-population pattern means `XSTOCK_SPOT_REGISTRY.size === 0` at TypeScript module load time. Pre-audit §2.8 verified that none of the 8 production consumers cache `.size` at module-init. **But:** any test that imports the registry will see size=0 unless that test explicitly populates it via `_replaceXstockUniverse(fixture)` (as I did in `b-phase-a2-xstock-eval-cycle-dbs.test.ts` + `b79-0f-asset-class-collisions.test.ts`). Concern: future tests may hit this gotcha. Mitigation candidates: (a) add a generic `populateUniverseFixture()` helper in `server/tests/__test-utils.ts` (b) accept the per-test populate pattern. CC default: (b) — the failure mode is loud (assertions fail immediately with size=0 evidence). Confirm.

### Q-S4-6 — Anything CC missed?

This is the biggest single change set in the umbrella arc so far. Per umbrella §2.6 combine/split autonomy, are there any reshape opportunities you see at this point? (E.g., should `xstock-universe-cron.ts` merge into `xstock-universe-discoverer.ts`? Should `sp500-backstop.ts` be a JSON config instead of a const array?)

---

## §5 — CI status (at dispatch time)

CI run `26222244062` (fix-forward commit `b7b4b9c2f`, on top of Phase B-F commit `230348507`):

| Job | Status | Notes |
|---|---|---|
| Build | ✅ GREEN | esbuild bundle succeeded |
| Docker Build | ✅ GREEN | image built |
| Test Suite | ⚠️ RED (PRE-EXISTING only) | Same failures as HYGIENE: b72-dbs-routing-guards / b70-run-mode-controller / cost_telemetry / dynamic_sizing. All new B79.0n.UNIVERSE-DISCOVERY tests PASSED — `b79-0n-universe-service.test.ts` 12/12 green, `b79-0n-discoverer-sector-mapping.test.ts` 5/5 green. |
| TypeScript Check | ⚠️ RED (PRE-EXISTING only) | Same client-side type drift as HYGIENE. Zero NEW errors from B79.0n.UNIVERSE-DISCOVERY code (initial TS2344 on `db.execute<T>` generic constraint was fix-forwarded in `b7b4b9c2f`; pattern now matches codebase-canonical `result: any` form). |

Note: the initial Phase B-F push at `230348507` had ONE new TS2344 error from my `db.execute<DbUniverseRow>` generic call. CI caught it; fix-forward `b7b4b9c2f` switched all 8 call sites in B79.0n code to the codebase-canonical `result: any` cast pattern (matches ohlc-aggregator.ts:240 + expert-insights-metrics.ts:37 + others). Pre-existing `db.execute<{...}>` at routes.ts:7860 (B79.0i.a freshness endpoint) NOT touched by fix-forward — out of scope.

---

## §6 — Reply gate

Reply: **Step 4 ACK** / **specific Q-S4-1..6 counter-propose** / **substantive disagreement on any diff section**.

On ACK, CC proceeds to Step 5 (push already done) → Step 6 deploy with the augmented chain in §3.8 above → Step 7 verification.

Step 7 verification gates (per scope §5 + Langston Step 4 Concern C addition):
1. Boot smoke test + universe-service init log line
2. Discovery cycle (cron OR manual trigger) writes valid `discovery_runs` row
3. `xstock_spot_universe` has >= 250 rows (gate per §5.4)
4. Sector floor >= 7 distinct sectors (B-PHASE-A2 floor)
5. Finnhub enrichment >= 80% of rows have `finnhub: true` in source_chain
6. **UNCATEGORIZED rows <= 20% of upserted total** (NEW per Langston Step 4 Concern C — belt-and-suspenders catch even with the expanded heuristic; failure indicates the heuristic missed a wave of new sub-industries Kraken introduced and needs another expansion)
7. Crypto regression-lock: FX5 pool + signal gen + VTS trade rates within ±5% / 24h baseline
8. UI verification via Claude-in-Chrome

---

## §7 — Step 4 fix-forward (Langston Concerns A + B)

**Status: implemented + ready for re-ACK.**

### Concern A — Finnhub sub-industry heuristic expansion

CC ran a live `/stock/profile2` probe against 18 representative symbols on 2026-05-21. Empirical `finnhubIndustry` responses:

| Symbol | finnhubIndustry | Pre-fix-forward heuristic | Post-fix-forward heuristic |
|---|---|---|---|
| AAPL | Technology | XLK ✓ | XLK ✓ |
| NVDA | Semiconductors | UNCATEGORIZED ✗ | XLK ✓ |
| MRNA | Biotechnology | UNCATEGORIZED ✗ | XLV ✓ |
| BA | Aerospace & Defense | UNCATEGORIZED ✗ | XLI ✓ |
| KO | Beverages | UNCATEGORIZED ✗ | XLP ✓ |
| MA | Financial Services | XLF ✓ | XLF ✓ |
| PG | Consumer products | UNCATEGORIZED ✗ | XLP ✓ |
| JNJ | Pharmaceuticals | UNCATEGORIZED ✗ | XLV ✓ |
| CAT | Machinery | UNCATEGORIZED ✗ | XLI ✓ |
| F | Automobiles | UNCATEGORIZED ✗ | XLY ✓ |
| MSTR | Technology | XLK ✓ | XLK ✓ |
| COIN | Financial Services | XLF ✓ | XLF ✓ |
| HOOD | Financial Services | XLF ✓ | XLF ✓ |
| GOOGL | Media | XLC ✓ | XLC ✓ |
| META | Media | XLC ✓ | XLC ✓ |
| TSLA | Automobiles | UNCATEGORIZED ✗ | XLY ✓ |
| SPY | (null) | UNCATEGORIZED → INDEX_PROXY via override ✓ | same ✓ |
| GLD | (null) | UNCATEGORIZED → BROAD_ETF via override ✓ | same ✓ |

**Pre-fix: 8/18 mismatched (44%). Post-fix: 18/18 correct (0%).** Expanded heuristic in `xstock-universe-discoverer.ts:mapFinnhubIndustryToSector` now has ~75 substring patterns across 11 sectors covering the empirically-observed Finnhub sub-industry vocabulary. Updated mapping table inline-documented in the function header.

**Regression-lock test:** `server/tests/unit/b79-0n-discoverer-sector-mapping.test.ts` extended with 18 parameterized test cases — one per probed symbol/industry pair. Any future change to the heuristic that breaks one of these fails the test immediately.

### Concern B — Kraken WS open-event timeout

Added `openTimeoutHandle` setTimeout immediately after `new WebSocket(KRAKEN_WS_URL)` at `xstock-universe-discoverer.ts:185-191`. 10s ceiling. Cleared on `ws.on('open', ...)`. Calls `finish(false, true, 'ws open timeout (no open event in 10s)')` on stall — which (a) writes `[PROBE_INCOMPLETE]` warn log, (b) NOT updates `xstock_spot_universe` with the partial set (partial=true short-circuits), (c) falls through to Layer 2 fallback in `runDiscovery`. Exactly the safety belt Langston requested.

### Concern C — Verification gate `UNCATEGORIZED <= 20%`

Added as item #6 in the §6 Step 7 verification list above. Cheap SQL:
```sql
SELECT
  COUNT(*) FILTER (WHERE sector = 'UNCATEGORIZED')::numeric / NULLIF(COUNT(*), 0) * 100 AS uncategorized_pct
FROM xstock_spot_universe
WHERE is_delisted = false;
```
Gate trips at >20%; corrective action = expand `mapFinnhubIndustryToSector` heuristic with the missing sub-industries.

### Fix-forward commit

Will land as one commit on top of `b7b4b9c2f`. 3 files touched:
- `server/services/xstock-universe-discoverer.ts` — mapFinnhubIndustryToSector expanded + WS-open timeout
- `server/tests/unit/b79-0n-discoverer-sector-mapping.test.ts` — 18 regression-lock cases added
- `Claude Comms and Packages/Change Lists/B79_0n_UNIVERSE_DISCOVERY_CHANGE_LIST.md` — this update

Pinging Langston for re-ACK on `(A) + (B) + (C)` landed.

— Claude Code, 2026-05-21 PM (B79.0n.UNIVERSE-DISCOVERY Step 4 change list v1)
