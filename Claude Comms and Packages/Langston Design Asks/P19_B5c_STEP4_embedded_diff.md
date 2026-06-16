# P19-B5c — Step-4 code review (embedded diff) — continuous Q-D probe (#86)

**Commit:** `dc8350110` (local, not yet pushed). **Bench:** tsc-baseline NO-regression; vitest **2006/2006** (+14 new).
**Your two Step-2 catches:** ✅ index swap (UNIQUE-only on (symbol,bucket_start) + INDEX on `bucket_start` alone); ✅ `zero_depth` added (price-valid/zero-qty). Plus one new precision call to bless: price-degenerate split into `zero_bid` vs `zero_ask` (honest telemetry).

**INFRASTRUCTURE NOTE: read ONLY this file. Do NOT cd to /mnt/gdrive or run git on the mounted repo. For anything beyond these snippets, `ssh staging 'cd /home/deploy/dawntrader && git show dc8350110 -- <path>'`.**

Files: NEW `qd-probe-metrics.ts`, `qd-probe-service.ts`, `xstock-qd-probe-cron.ts`, `p19-b5c-qd-probe-metrics.test.ts`, migration + rollback; MODIFIED `shared/schema.ts`, `server/index.ts`, `b75-retention-sweep.ts`, `MANIFEST.txt`.

---

## 1. Migration — table DDL (D5 bucket + index swap)

```sql
CREATE TABLE IF NOT EXISTS xstock_qd_probe_history (
  id                 bigserial   PRIMARY KEY,
  symbol             text        NOT NULL,
  asset_class        text        NOT NULL DEFAULT 'xstock_spot',
  bucket_start       timestamptz NOT NULL,   -- ★D5: fire-time floored to cadence grid (dedup key)
  captured_at        timestamptz,            -- real snap timestamp (staleness source); NULL if no snap
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  bid numeric(20,8), ask numeric(20,8), bid_qty numeric(28,8), ask_qty numeric(28,8),
  mid numeric(20,8), spread_abs numeric(20,8), spread_bps numeric(12,4),
  bid_depth_notional numeric(28,8), ask_depth_notional numeric(28,8),
  snap_age_ms        bigint,
  stale              boolean     NOT NULL DEFAULT false,
  quote_quality      text        NOT NULL DEFAULT 'ok',  -- ok|crossed|zero_bid|zero_ask|nonpositive_mid|zero_depth|no_snap
  metadata           jsonb       NOT NULL DEFAULT '{"schema_version":1}'::jsonb,
  CONSTRAINT xstock_qd_probe_history_symbol_bucket_uniq UNIQUE (symbol, bucket_start)
);
-- ★catch-1: index on bucket_start ALONE (the UNIQUE already indexes (symbol,bucket_start))
CREATE INDEX IF NOT EXISTS xstock_qd_probe_history_bucket_idx ON xstock_qd_probe_history (bucket_start);
```

Seed (A2 — freshness ≥ 2× cadence; retention under data_lifecycle for the B75 pass):
```sql
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_at, updated_by) VALUES
  ('data_lifecycle', '*', '*',           '*', '*', 'xstock_qd_probe_history.hot_retention_days', '90'::jsonb,     NOW(), 'p19-b5c'),
  ('qd_probe',       '*', 'xstock_spot', '*', '*', 'cadence_minutes',                            '5'::jsonb,      NOW(), 'p19-b5c'),
  ('qd_probe',       '*', 'xstock_spot', '*', '*', 'freshness_ceiling_ms',                       '600000'::jsonb, NOW(), 'p19-b5c')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;
```

## 2. Pure metrics — A1 degenerate policy (qd-probe-metrics.ts)

```ts
export function floorToCadenceGrid(fireTimeMs: number, cadenceMinutes: number): Date {
  if (!Number.isFinite(cadenceMinutes) || cadenceMinutes <= 0) throw new Error(...);
  const gridMs = cadenceMinutes * 60_000;
  return new Date(Math.floor(fireTimeMs / gridMs) * gridMs);   // ★D5 fire-grid, NOT captured_at
}

export function computeQdMetrics(snap, fireTimeMs, freshnessCeilingMs): QdMetrics {
  if (snap === null) return { ...allNull, snapAgeMs: null, stale: false, quoteQuality: 'no_snap' };
  const snapAgeMs = snap.capturedAtMs !== null ? Math.max(0, fireTimeMs - snap.capturedAtMs) : null;
  const stale = snapAgeMs !== null ? snapAgeMs > freshnessCeilingMs : false;   // age==ceiling is NOT stale
  if (snap.bid === null || !(snap.bid > 0)) return { ...null, snapAgeMs, stale, quoteQuality: 'zero_bid' };
  if (snap.ask === null || !(snap.ask > 0)) return { ...null, snapAgeMs, stale, quoteQuality: 'zero_ask' };
  if (snap.ask < snap.bid)                  return { ...null, snapAgeMs, stale, quoteQuality: 'crossed' };
  const mid = (snap.bid + snap.ask) / 2;
  if (!(mid > 0))                           return { ...null, snapAgeMs, stale, quoteQuality: 'nonpositive_mid' };
  const spreadAbs = snap.ask - snap.bid;
  const spreadBps = (spreadAbs / mid) * 10_000;
  const depthValid = snap.bidQty!=null && snap.askQty!=null && snap.bidQty>0 && snap.askQty>0;  // mirrors depth-source.ts
  return { mid, spreadAbs, spreadBps,
    bidDepthNotional: depthValid ? snap.bid*snap.bidQty : null,
    askDepthNotional: depthValid ? snap.ask*snap.askQty : null,
    snapAgeMs, stale, quoteQuality: depthValid ? 'ok' : 'zero_depth' };  // ★catch-2: spread KEPT, depth NULL
}
```

## 3. Service — loop + D7 skip/count + dedup (qd-probe-service.ts)

```ts
// fail-loud DB-governed config (Kyle: no silent default); cadence must divide 60
export const VALID_CADENCE_MINUTES = new Set([1,2,3,4,5,6,10,12,15,20,30]);
// ...reqNum throws on missing/invalid qd_probe.cadence_minutes / .freshness_ceiling_ms...

const bucketStart = floorToCadenceGrid(fireMs, config.cadenceMinutes);
const marketOpen = isXstockMarketOpenUTC(symbols[0] ?? 'AAPL/USD', fireTime);   // D7 meta
// latest snap per symbol in ONE index-served query, filtered to the universe in JS:
//   SELECT DISTINCT ON (symbol) symbol, bid::text, ask::text, bid_qty::text, ask_qty::text, captured_at
//     FROM xstock_spot_ticker_snap ORDER BY symbol, captured_at DESC
for (const symbol of symbols) {
  const snap = snapBySymbol.get(symbol) ?? null;
  if (snap === null) { symbolsSkippedNoSnap++; continue; }   // ★D7: skip-no-row on no-snap (counted)
  const m = computeQdMetrics(snap, fireMs, config.freshnessCeilingMs);
  if (m.stale) symbolsStale++;
  toInsert.push({ symbol, assetClass:'xstock_spot', bucketStart, capturedAt:..., bid:num2str(snap.bid), ...,
                  spreadBps:num2str(m.spreadBps), ..., snapAgeMs:m.snapAgeMs, stale:m.stale, quoteQuality:m.quoteQuality });
}
const inserted = await db.insert(xstockQdProbeHistory).values(toInsert)
  .onConflictDoNothing().returning({ id: xstockQdProbeHistory.id });   // ★D5 idempotent; rowsWritten = inserted.length
```

## 4. Cron — fire-evidence meta (xstock-qd-probe-cron.ts)

```ts
// mirrors xstock-universe-cron: double-register guard + cronRegistry.register + logCronArm.
// async because cadence builds the expression: const expression = `*/${config.cadenceMinutes} * * * *`;
//   try { summary = await runQdProbeOnce(firedAt, config); } catch { status='error'; ... }
//   finally writeFireRow({ jobName:'xstock_qd_probe_cron', ..., meta: {
//     trigger_source:'cron', duration_ms,
//     market_open: summary?.marketOpen ?? null, universe_size, rows_written,
//     symbols_skipped_no_snap, symbols_stale } });   // ★D7: weekend(rows_written=0) ≠ breakage
```
Boot (`server/index.ts`, right after `registerXstockUniverseCron()`): `try { await registerXstockQdProbeCron(); } catch { console.error('[CRITICAL]...unseeded...') }` — fail-loud-but-non-crashing.

## 5. B75 plain-table retention pass (b75-retention-sweep.ts)

```ts
const PLAIN_RETENTION_TABLES = [{ table:'xstock_qd_probe_history', timestampColumn:'bucket_start',
  retentionConstantName:'xstock_qd_probe_history.hot_retention_days' }];   // identifiers = static allow-list
// loadConfig: also set retentionByTable for PLAIN_RETENTION_TABLES (reqNum, fail-hard).
// sweepPlainTables(cfg): per table, cutoff = NOW - retentionDays; batched
//   DELETE FROM <t> WHERE id IN (SELECT id FROM <t> WHERE <tsCol> < $1 ORDER BY <tsCol> ASC LIMIT 5000)
//   loop until n<batch; then VACUUM <t>;  on error -> raiseSweepAlert('warning') + continue.
// main(): const plainResult = await sweepPlainTables(cfg) AFTER the partition loop;
//   exit(1) if partitionsFailed>0 || plainResult.failed>0.   // single retention owner, no cold-offload
```

---

## Questions for you (Step-4)
1. **Bless the `zero_bid`/`zero_ask` split** (vs one merged price-degenerate tag) — I went precise so friction-extraction can tell which side failed.
2. **Cadence→expression** built from `cadence_minutes` at registration (validated to divide 60) — confirms "module_constants-resolved cadence" without a fragile arbitrary-second expression. OK?
3. Anything on the **DISTINCT-ON-no-WHERE + JS universe filter** read (chosen over `= ANY(array)` to avoid array-param fragility; the xStock-only table has ~40 distinct symbols).

Give Step-4 APPROVE (or required changes) and I push → CI → deploy.
