# B-NEW-34b — Snapshot-architecture pivot from B-NEW-34a lookback-tuning

> **From:** Claude Code
> **To:** Langston
> **Date:** 2026-05-18 night (post-compaction)
> **Type:** Design review + Step 4 code review on a single sub-batch + deploy blocker
> **Kyle directive 2026-05-18:** "Please check this fix with Langston as well."
> **Status on Hetzner staging:** code committed (d9031fe8d) + pushed to GitHub; migration runner blocked on UNRELATED pre-existing assertion (see §5); pre-warm + restart NOT yet performed.

---

## §1 — Context recap (sub-1-min read)

Sat 2026-05-15 the B-NEW-34 ship moved the xStock scanner from ticker-snap-based scanning to 60-min OHLC-bar aggregation with a 24-bar floor (`min_ohlc_history_bars=24`). Worked Fri afternoon, broke Mon 13:30 UTC at ARCA reopen because the 60h wall-clock lookback contains only ~20 bar-producing hours when the 48h Fri-Sun weekend close eats most of it.

B-NEW-34a hotfix attempted lookback-widening: 60h → 240h → 168h → 120h. All three failed:
- 240h, 168h: per-cycle SCAN_TIMEOUT at 25s budget (DISTINCT ON dedup over 15-22M source rows from B74's 18-56× duplication).
- 120h: deployed but unverified, almost certainly hits the same wall on a busier 1m table.

**Kyle directive 2026-05-18 evening:** abandon lookback-tuning entirely. Pivot to snapshot architecture. Build B-NEW-34b first, then B-NEW-36 (off-hours session-lifecycle controller), then B-NEW-35 (source-side dedup, two-table), then B79.0n (active-trading wire-in, separately).

---

## §2 — B-NEW-34b architecture (the pivot)

The bars we need ARE in `xstock_spot_ohlc_1m` — the source table has 17+ days of data. Instead of re-deriving them every 30s cycle via expensive DISTINCT ON over 120h, **pre-aggregate them ONCE per symbol** (slow query, that's fine with no deadline) into a small dedicated snapshot table, then read that table on cold start.

### §2.1 New table `xstock_spot_ohlc_60m_snapshot`

PK on `(symbol, bucket_ts)`. Index `(symbol, bucket_ts DESC)`. Idempotent UPSERT-friendly.

```sql
CREATE TABLE IF NOT EXISTS xstock_spot_ohlc_60m_snapshot (
  symbol             VARCHAR(32)     NOT NULL,
  bucket_ts          TIMESTAMPTZ     NOT NULL,
  open               NUMERIC(20, 8)  NOT NULL,
  high               NUMERIC(20, 8)  NOT NULL,
  low                NUMERIC(20, 8)  NOT NULL,
  close              NUMERIC(20, 8)  NOT NULL,
  volume             NUMERIC(28, 8)  NOT NULL DEFAULT 0,
  source_bar_count   INTEGER         NOT NULL DEFAULT 0,
  captured_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, bucket_ts)
);

CREATE INDEX IF NOT EXISTS idx_xstock_spot_ohlc_60m_snapshot_symbol_ts_desc
  ON xstock_spot_ohlc_60m_snapshot (symbol, bucket_ts DESC);
```

Bounded size: 265 symbols × 60 buckets max = 15,900 rows. Trivial vs the 1m table's millions.

### §2.2 Pre-warm script `scripts/b-new-34b-prewarm-snapshot.ts`

Per-symbol single-SQL aggregation with the SAME DISTINCT ON dedup as the live aggregator, but ONE symbol at a time (no scanner deadline → no SCAN_TIMEOUT pressure). UPSERTs `(symbol, bucket_ts)`. 14-day lookback by default.

Key shape (per-symbol query):

```ts
async function aggregateOneSymbol(pool: pg.Pool, symbol: string, lookbackDays: number): Promise<BucketRow[]> {
  const result = await pool.query<BucketRow>(`
    WITH deduped AS (
      SELECT DISTINCT ON (symbol, interval_begin)
        symbol, interval_begin, open, high, low, close, volume
      FROM xstock_spot_ohlc_1m
      WHERE symbol = $1
        AND interval_begin > NOW() - ($2::int * INTERVAL '1 day')
      ORDER BY symbol, interval_begin, captured_at DESC, id DESC
    ),
    bucketed AS (
      SELECT symbol,
        to_timestamp(floor(extract(epoch from interval_begin) / 3600) * 3600) AS bucket_ts,
        interval_begin, open, high, low, close, volume
      FROM deduped
    ),
    aggregated AS (
      SELECT symbol, bucket_ts,
        (array_agg(open ORDER BY interval_begin ASC))[1] AS bar_open,
        MAX(high) AS bar_high, MIN(low) AS bar_low,
        (array_agg(close ORDER BY interval_begin DESC))[1] AS bar_close,
        SUM(volume) AS bar_volume, COUNT(*) AS source_bar_count
      FROM bucketed GROUP BY symbol, bucket_ts
    )
    SELECT bucket_ts, bar_open, bar_high, bar_low, bar_close, bar_volume, source_bar_count
    FROM aggregated ORDER BY bucket_ts DESC LIMIT $3
  `, [symbol, lookbackDays, MAX_BARS_60M]);
  return result.rows.reverse();  // ASC for downstream
}
```

UPSERT shape (multi-row in one INSERT per symbol):

```sql
INSERT INTO xstock_spot_ohlc_60m_snapshot
  (symbol, bucket_ts, open, high, low, close, volume, source_bar_count)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8), (...), ...
ON CONFLICT (symbol, bucket_ts) DO UPDATE SET
  open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
  close=EXCLUDED.close, volume=EXCLUDED.volume,
  source_bar_count=EXCLUDED.source_bar_count, captured_at=NOW()
```

Estimated runtime: 1-3s per symbol × 265 = ~5-15 min total. `--symbols` flag for targeted re-runs. `--dry-run` for safety. Idempotent.

### §2.3 Aggregator change — narrow-window override

`aggregateXstockOHLC` gains an optional third arg `lookbackHoursOverride?: number`. Existing two-arg callers (tests, future direct callers) unchanged.

```ts
export async function aggregateXstockOHLC(
  symbols: string[],
  intervalMinutes: XstockAggregationInterval,
  lookbackHoursOverride?: number,
): Promise<Map<string, OHLCData[]>> {
  // ... existing setup ...
  const maxBars = intervalMinutes === 60 ? MAX_BARS_60M : MAX_BARS_240M;
  const defaultLookback = intervalMinutes === 60 ? LOOKBACK_HOURS_60M : LOOKBACK_HOURS_240M;
  const lookbackHours =
    Number.isFinite(lookbackHoursOverride) && (lookbackHoursOverride as number) > 0
      ? (lookbackHoursOverride as number)
      : defaultLookback;
  // ... rest unchanged ...
}
```

Default `LOOKBACK_HOURS_60M=120` preserved for forensic / direct callers (e.g. b-phase-a2-backfill).

### §2.4 Cache changes — snapshot-first cold read + narrow overlay + write-back

`server/services/xstock-ohlc-cache.ts` — `getOHLCDataBatch` cold-miss path for `intervalMinutes=60`:

```ts
if (intervalMinutes === 60) {
  // 1. Read snapshot rows for all missed symbols (single SQL, ROW_NUMBER window).
  const snapshotBySymbol = await this.readSnapshotBars(misses);

  // 2. Live aggregator with NARROW 24h overlay (single SQL across all misses).
  const liveBySymbol = await aggregateXstockOHLC(misses, 60, NARROW_OVERLAY_HOURS_60M);
  // ^^^ NARROW_OVERLAY_HOURS_60M = 24

  // 3. Merge per symbol — live wins on bucket_ts collision, sort ASC, cap to 60.
  const mergedBySymbol = new Map<string, OHLCData[]>();
  for (const symbol of misses) {
    const merged = this.mergeBars(
      snapshotBySymbol.get(symbol) ?? [],
      liveBySymbol.get(symbol) ?? [],
    );
    mergedBySymbol.set(symbol, merged);
    this.cache.set(this.getCacheKey(symbol, 60), { bars: merged, fetchedAt: now });
    result.set(symbol, merged);
  }

  // 4. Write-back: UPSERT most-recent 12 buckets per symbol. Fire-and-forget.
  void this.writeBackSnapshot(mergedBySymbol).catch((err) => { /* log */ });
  return result;
}
// Legacy 240-min path unchanged (currently dead per B-NEW-34 hotfix 3).
```

Snapshot read (single SQL, PK-indexed):

```ts
const result: any = await db.execute(sql`
  WITH ranked AS (
    SELECT symbol, bucket_ts, open, high, low, close, volume, source_bar_count,
      ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY bucket_ts DESC) AS rn
    FROM xstock_spot_ohlc_60m_snapshot
    WHERE symbol IN (${sql.raw(symbolListSql)})
  )
  SELECT symbol, bucket_ts, open, high, low, close, volume, source_bar_count
  FROM ranked WHERE rn <= 60 ORDER BY symbol, bucket_ts ASC
`);
```

Merge logic (Map-keyed by timestamp, live overrides):

```ts
private mergeBars(snap: OHLCData[], live: OHLCData[]): OHLCData[] {
  if (snap.length === 0 && live.length === 0) return [];
  const byTs = new Map<number, OHLCData>();
  for (const b of snap) byTs.set(b.timestamp, b);
  for (const b of live) byTs.set(b.timestamp, b);  // live wins
  const merged = Array.from(byTs.values()).sort((a, b) => a.timestamp - b.timestamp);
  return merged.length > 60 ? merged.slice(merged.length - 60) : merged;
}
```

Write-back (most-recent 12 buckets per symbol, ON CONFLICT DO UPDATE, `source_bar_count=0` sentinel meaning "live overlay, not freshly counted"):

```ts
const WRITE_BACK_RECENT_BUCKETS = 12;
// ... builds VALUES (...), (...) ... list ...
await db.execute(sql`
  INSERT INTO xstock_spot_ohlc_60m_snapshot (symbol, bucket_ts, open, high, low, close, volume, source_bar_count)
  VALUES ${sql.raw(valuesLiteralParts.join(','))}
  ON CONFLICT (symbol, bucket_ts) DO UPDATE SET
    open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
    close=EXCLUDED.close, volume=EXCLUDED.volume, captured_at=NOW()
`);
```

---

## §3 — Sizing math

### Pre-B-NEW-34b (120h live aggregator on every cache miss):
- 120h × 60 min/h × 75 syms × ~21× B74 dup ≈ **~11M source rows per cache miss**
- DISTINCT ON dedup time at this scale → SCAN_TIMEOUT empirically observed at 240h/168h, 120h unverified

### Post-B-NEW-34b (snapshot + 24h overlay on every cache miss):
- Snapshot read: 75 syms × up to 60 rows = **4,500 rows max, PK-indexed scan**
- Live overlay 24h: 24h × 60 × 75 × 21 = **~2.3M source rows pre-DISTINCT-ON** (~4× cheaper than 60h, ~5× cheaper than 120h)
- Write-back: 75 syms × 12 buckets = **900 row UPSERT** per miss (~1× INSERT)
- **Net IO drop ~75-85% vs the 120h live path** + dramatic reduction in DISTINCT-ON CPU cost

### Snapshot staleness window:
- Snapshot is refreshed on every cache-miss write-back (≤ TTL=5min during active scanning)
- Pre-warm script ground-truths it (run once tonight; B-NEW-36 owns scheduled refresh)
- Between Step A ship and Step B ship (~1-2 days), if scanner restarts cold mid-week, snapshot is at most "minutes" stale because write-back keeps it fresh

### Coverage / gap analysis (the bit I most want your eye on):
- **24/7 names (10 syms)** on Mon 14:00 UTC (current scenario): snapshot vintage from tonight's pre-warm = NOW(); live 24h overlay catches the last 24h → no gap.
- **non-24/7 names (255 syms)** on Mon 14:00 UTC: snapshot has the Fri RTH bars; live overlay catches the past 30+ min since ARCA reopen → no gap.
- **24/7 names on Tue 14:00 UTC (24h after deploy)** if scanner had never restarted: cache TTL has cycled multiple times, every cycle's write-back refreshed snapshot. Snapshot ≤ 5min stale. Live 24h overlay covers the last 24h. No gap.
- **24/7 names on Tue 14:00 UTC if scanner cold-started at midnight UTC**: cache empty, snapshot vintage from last write-back (could be hours old if the scanner was down). If snapshot was last written 14 hours ago, live 24h overlay still covers the gap. **Concern:** scanner down for >24h → gap. Mitigation: re-run pre-warm script before restart.
- **Worst case (post B-NEW-36 weekly cycle):** Sun 8PM ET startup runs pre-warm first → cold start reads fresh snapshot.

---

## §4 — Specific design questions for Langston

**Q1: Write-back-on-miss shape.** I write back the most-recent 12 buckets per symbol (75×12=900 upserts/cycle-miss). My reasoning: only the recent tail is what live overlay just computed; older snapshot buckets are immutable. Is 12 the right N, or should it be the FULL merged set (60 per symbol = 4500 upserts per miss, higher write IO but no edge case where mid-snapshot bars get out of date)?

**Q2: `source_bar_count=0` sentinel on write-back.** When live overlay writes back, it doesn't have the underlying COUNT(*) post-DISTINCT-ON — it has bars already aggregated. I'm writing `source_bar_count=0` as a "live overlay, not freshly counted" sentinel. The pre-warm script writes the real count. Alternative: thread `source_bar_count` from aggregator (require changing OHLCData type or wrapping). Worth doing, or sentinel is fine?

**Q3: NARROW_OVERLAY_HOURS_60M = 24.** Chosen so snapshot can be up to 24h stale before gap risk for 24/7 names. Is 24h conservative enough given the cache-write-back keeps snapshot fresh? Could go down to 12h or even 6h (3-4× more aggressive IO savings). Trade-off: harder to recover from extended scanner-down windows (e.g. multi-day infra failure).

**Q4: Aggregator default lookback.** I left `LOOKBACK_HOURS_60M = 120` as the FORENSIC fallback for direct callers (backfill, ad-hoc tools). Cache always passes 24h override. Acceptable, or should I revert default to 60h to make intent unambiguous (forensic callers can pass an override too)?

**Q5: 240-min path.** Cache 240-min path falls through to the legacy single-call shape (no snapshot involvement). The 240-min cache call is currently DEAD (commented out in scanner.ts:408 per B-NEW-34 hotfix 3, pending B-NEW-35). Leave as-is, or remove the dead branch entirely?

**Q6: Test coverage.** Existing `b-new-34-aggregator.test.ts` still passes (added arg is optional). I should add:
- Cache test: snapshot-only read, live-only overlay, merge with collision, write-back UPSERT path.
- Aggregator test: lookback override behavior.
Right priority for Step 4 lock, or skippable for tonight given scanner-recovery urgency?

**Q7: B-NEW-36 sequencing.** This batch is Step A of Kyle's 4-item locked plan. Step B is the off-hours session-lifecycle controller. Step B will own:
- Fri 8PM ET shutdown hook that runs the pre-warm script (+ marks open xStock VTS trades `state='weekend_suspended'`, + scanner unsubscribes from centralClock, + sim cycle skips weekend-suspended trades to avoid TEC stale fail-closed).
- Sun 8PM ET startup hook that runs pre-warm + scanner re-subscribes + un-suspends 24/7-name trades.
- Mon 13:30 UTC un-suspend hook for non-24/7 trades.

Are there sequencing concerns I'm missing between B-NEW-34b ship and B-NEW-36 ship?

---

## §5 — DEPLOY BLOCKER (urgent, may need your eye)

Tried to run `npm run db:migrate` on staging to apply my new migration. It listed **17 pending migrations** — far more than I expected. The runner started with the OLDEST pending, `2026-05-08-b79-tec-per-class-be-rows.sql`, and that one failed an assertion BEFORE getting to my B-NEW-34b migration:

```
error: B79.TEC migration assertion failed: expected 4 rows with value=false for ACTIVE
asset classes, found 3. Current rows: crypto_perp=false, crypto_spot=false,
xstock_perp=false, xstock_spot=true. A pre-existing intentional override may exist;
manual review required.
```

I aborted before investigating because Kyle had just said "check this fix with Langston as well" — figured I should not power-through-and-investigate this alone.

**The puzzle:** how can 17 migrations from 2026-05-08 onward be "pending" if the system has been deploying and the apps are functioning? Possibilities I can think of:
- The `_migrations` ledger was wiped/reset at some point (I have no record of this).
- Migrations from 2026-05-08 onward were applied via direct psql (not via the runner) and never recorded.
- Two different DBs in play (unlikely — `DATABASE_URL` is set).

Asks:
- (a) Should I block deploy on figuring out the ledger state vs. force-mark all 16 prior migrations as applied (skipping their inline assertions) to clear the path for B-NEW-34b?
- (b) Is there a safer path you'd take? My instinct: query `_migrations` ledger directly + cross-reference against the migration files to map what's actually been run.

**Empirical state on staging right now (per MEMORY.md):** scanner running with B-NEW-34a-tune2 (120h lookback) at commit `935094a48`. Still in `insufficient_history=75` every cycle (i.e. NOT recovered). My B-NEW-34b commit `d9031fe8d` is pulled to `/home/deploy/dawntrader` but **not yet** rebuilt or restarted, AND the migration was never applied — so the new table doesn't exist; if I `pm2 restart` now, the cache will throw on `xstock_spot_ohlc_60m_snapshot does not exist` on first cold miss.

So I'm fully stopped pending your direction on §5(a)/(b) AND your §4 ACK on the design.

---

## §6 — What I'd like from you

1. **Step 4 code review on §2-§3.** Single-batch sub-batch, code is up at commit `d9031fe8d`. Snippets all embedded above per §6.5.0.a. Files: `drizzle/migrations/2026-05-18-b-new-34b-xstock-60m-snapshot.sql` + rollback, `scripts/b-new-34b-prewarm-snapshot.ts`, `server/services/xstock-ohlc-cache.ts`, `server/asset_classes/xstock_spot/ohlc-aggregator.ts`, `package.json`.
2. **Design ACK on the 7 specific questions in §4.**
3. **Direction on §5 the deploy blocker.** Whether to investigate or force-clear.

INFRASTRUCTURE NOTE (per CLAUDE.md §6.5.0.a): DO NOT `cd /mnt/gdrive`. Snippets above are sufficient for a Step 4 review. For deeper inspection (full file contents, _migrations ledger query, prior-batch context), use `ssh staging` to reach the repo at `/home/deploy/dawntrader` at commit `d9031fe8d`.

Reply with: (a) Step-4-folded-into-Step-1 ACK to clear me to address §5 + ship + verify, OR (b) specific revisions, OR (c) substantive disagreement on the architectural shape itself.

— Claude Code, 2026-05-18 night
