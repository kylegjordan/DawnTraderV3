# BATCH 79.0g-tx — Step 2 Pre-Implementation Audit

> **Status:** READY FOR LANGSTON STEP 2 REVIEW
> **Author:** Claude Code
> **Created:** 2026-05-10
> **Scope:** `BATCH_79_0g_tx_SCOPE.md` (Option B, Langston rev 2 approved, 5 adjustments applied)
> **Resolves:** RUNNING_ISSUES #91

---

## 1. SIM consultation — affected components

Consulted `1-system-manual/SYSTEM_IMPACT_MAP.md` for every component this batch touches.

### 1.1 `vts_open_trades` table (SIM §11 NEW B79.0g)

**Current shape (per migration `2026-05-10-b79-0g-vts-open-trades.sql`):**
PK `id`, `symbol`, `asset_class`, `entry_price`, `stop_loss`, `take_profit`, `position_size`, `dollar_value`, `quantity`, `regime`, `signal_type`, `strategy`, `pool`, `opened_at`, `context` jsonb, `inserted_at`, `updated_at`. Three indexes: `symbol`, `asset_class`, `opened_at`.

**Upstream writers:** `vts-trade-persistence.ts` (`insertOpenTrade` at trade open; `deleteOpenTrade` at trade close).
**Downstream readers:** `rehydrateOpenTrades` at server boot (single full-table read).
**Bootstrap reader (one-shot):** `bootstrapOpenTradesFromMemory` `SELECT COUNT(*)`.

**Blast radius for this batch (B79.0g-tx):**
- ADD columns: `closed_at TIMESTAMPTZ NULL`, `closed BOOLEAN NOT NULL DEFAULT false`. Additive only; existing rows backfill `closed=false` via DEFAULT. Zero downtime.
- ADD partial index: `vts_open_trades_open_filter_idx ON vts_open_trades(id) WHERE closed=false`. Created with `CONCURRENTLY` to avoid table lock (no ACCESS EXCLUSIVE).
- All existing indexes (`symbol`, `asset_class`, `opened_at`) UNCHANGED — bootstrap rehydrate-by-`SELECT * WHERE closed=false` is full-scan-cheap on small live-open-trade volume (10–50 rows typical), partial index keeps it that way as the table grows pre-GC.
- No FK relationships exist on this table. No views, no triggers. Blast radius CONTAINED to the persistence service + one vts-runner call site + boot rehydrate path.

### 1.2 `server/services/vts-trade-persistence.ts` (SIM §11 NEW B79.0g)

Four exported functions. Three changed in B79.0g-tx:

| Function | Current (B79.0g) | After B79.0g-tx |
|---|---|---|
| `insertOpenTrade(trade)` | UNCHANGED. INSERT `ON CONFLICT (id) DO NOTHING`. | UNCHANGED. New rows continue to default `closed=false` via column DEFAULT. |
| `deleteOpenTrade(tradeId)` | `DELETE FROM vts_open_trades WHERE id = $1` | **REMOVED.** Replaced by `markOpenTradeClosed(tradeId)`. |
| `markOpenTradeClosed(tradeId)` | NEW. | `UPDATE vts_open_trades SET closed=true, closed_at=NOW(), updated_at=NOW() WHERE id=$1 AND closed=false`. Single-row UPDATE; uses PK index. |
| `rehydrateOpenTrades()` | `SELECT * FROM vts_open_trades` | `SELECT * FROM vts_open_trades WHERE closed=false`. Uses partial index. |
| `bootstrapOpenTradesFromMemory(iter)` | `SELECT COUNT(*) FROM vts_open_trades` | `SELECT COUNT(*) FROM vts_open_trades WHERE closed=false`. Bootstrap should NOT be blocked by historical soft-deleted rows. |
| `sweepClosedOpenTrades()` | NEW. | DELETE soft-deleted rows older than retention. Boot-time sync read (per scope §2.4 + B72 pattern). |

### 1.3 `server/services/vts-runner.ts` — close-time call site (lines 2376–2395)

Today's pattern is fire-and-log:
```ts
openVirtualTrades.delete(id);
void (async () => {
  try {
    const { deleteOpenTrade } = await import('./vts-trade-persistence.js');
    await deleteOpenTrade(id);
  } catch (err) {
    console.warn(`[B79.0g][DELETE_FAIL] orphan row=${id}...`);
  }
})();
```

After B79.0g-tx (per scope rev #3 + Langston pre-audit R1, locked):
```ts
// B79.0g-tx: Map.delete FIRST (synchronous, can't fail) so the non-
// idempotent close cascade upstream of this point is gated against
// re-execution. THEN awaited markOpenTradeClosed in try/catch that
// does NOT re-throw — re-throwing would let the next exit cycle re-
// run the cascade (persistRealPriceTrade pushes closedTrades, increments
// session P&L, writes JSON ledger, fires B73 ablation + B70 archive,
// triggerMLCalibration) which is destructive. Soft-delete UPDATE is
// observability for the DB row; the Map gate is the correctness invariant.
openVirtualTrades.delete(id);
try {
  const { markOpenTradeClosed } = await import('./vts-trade-persistence.js');
  await markOpenTradeClosed(id);
} catch (err) {
  console.error(
    `[B79.0g-tx][MARK_CLOSED_FAIL] trade=${id} soft-delete UPDATE failed; ` +
    `JSON ledger + session metrics OK; DB row stays closed=false until rehydrate-on-next-boot ` +
    `re-adds to Map and a subsequent close cycle retries (idempotent). Investigate if recurring:`,
    err instanceof Error ? err.message : err,
  );
  // Do NOT re-throw — re-throwing causes next-cycle re-execution of
  // the non-idempotent close cascade (double JSON write, double P&L).
}
```

**Ordering rationale (Langston R1, 2026-05-10).** Map.delete first, awaited UPDATE after, NO re-throw. The whole close cascade upstream of line 2376 (`persistRealPriceTrade` → `closedTrades.push` → `simulatedTradesThisSession++` → `totalRealizedPnL += pnl` → `logTrade` JSON write → outcome-feedback EMA → B73 ablation replay → B70 archive enqueue → `triggerMLCalibration`) is non-idempotent. If the soft-delete UPDATE throws and the Map still holds the trade, the next exit cycle re-evaluates the same exit conditions and re-runs the entire cascade — duplicate JSON ledger entry, double-counted session P&L, duplicate B70 archive row, duplicate B73 ablation, duplicate ML calibration tick. That is strictly worse than today's failure mode (recoverable ghost DB row, no double-write). The Map gate is what prevents re-execution; preserve it. The rare failure window leaves a `closed=false` row that rehydrate-on-next-boot re-adds to the Map, after which a subsequent close cycle retries cleanly (the UPDATE itself is idempotent via `WHERE closed=false`). Soft-delete doesn't make the close cascade atomic — only Option C would; Option B's win is the partial-index-filtered rehydrate, not close-time atomicity.

**The pre-B79.0g-tx `void import()` async block at lines 2385–2395 is REMOVED entirely.**

### 1.4 `server/index.ts` boot path

Per scope §2.4 + B72 sync-read pattern. `rehydrateOpenVtsTrades()` is already called from `server/index.ts` after DB connection but before scanner.start. Add a second call immediately after:

```ts
await rehydrateOpenVtsTrades();
// B79.0g-tx: sync-read sweep of soft-deleted closed=true rows past
// retention. Bounded; sub-second on typical row volume.
await sweepClosedOpenTrades();
```

Sweep is single-statement: `DELETE FROM vts_open_trades WHERE closed=true AND closed_at < NOW() - INTERVAL '<retention> days'`. No batching needed — table volume is tiny vs. context_bridge_log (which uses batched DELETE loop). Pre-audit notes if retention ever needs batching, swap to the `context-bridge-log-ttl.ts` batched pattern.

### 1.5 `module_constants` — `data_lifecycle` module

New key: `vts_open_trades.closed_gc_retention_days` = `90` (integer; wildcard scope `(*, *, *, *)`).

Pattern matches existing `data_lifecycle.<table>.hot_retention_days` rows (B75 era; see SIM §lifecycle). Reader is the new sweep function; HARD-FAIL on missing per CLAUDE.md §5 #15 "No fallbacks for DB-governed settings" — except per scope §3 the missing row does NOT block the close-time hot path. It only blocks the sweep. So the boot sweep throws-and-logs on missing key (operator visibility) but does NOT halt server boot; subsequent operations continue.

### 1.6 Components NOT touched (no-touch invariants)

| Component | Why untouched |
|---|---|
| JSON log file format (`logTrade` in `vts-service.ts`) | Per scope §3 invariant. B73 ablation replay continues reading JSON. |
| `paper_sim_trades` (active-trading table) | Untouched. Active trading OFF until Phase 19. |
| B73 ablation replay (`exit-strategy-replay-service`) | Async fire-and-forget by design. Out of scope per scope §3. |
| B70 archive enqueue | Async by design. Out of scope per scope §3. |
| TEC trailing engine state (`tec_trailing_states`) | Separate persistence layer; unaffected. |
| Crypto path (`asset_class='crypto_spot'`) | Soft-delete is asset-class-agnostic. No-touch fence preserved by-construction. |
| `b70-retention-sweep`, `context-bridge-log-ttl`, `b75-cold-rotator`, `b75-retention-sweep` | Separate registries, separate tables, no overlap. |

---

## 2. Upstream / Downstream / Shared / Background trace

Per CLAUDE.md §2 Step 2 mandatory tracing:

**Upstream dependencies for `markOpenTradeClosed`:**
- `vts-runner.ts:2376` (close-time call site) — only caller.
- `b79-0g-vts-trade-persistence.test.ts` — unit tests; needs update for `deleteOpenTrade` → `markOpenTradeClosed` rename.

**Downstream consumers of `vts_open_trades.closed` column:**
- `rehydrateOpenTrades` filter `WHERE closed=false`
- `bootstrapOpenTradesFromMemory` COUNT filter
- `sweepClosedOpenTrades` GC sweep filter
- Nothing else reads `vts_open_trades`. Verified via `Grep "vts_open_trades"` across `server/`.

**Shared state mutations:**
- in-memory `openVirtualTrades` Map — ordering with Map.delete now post-UPDATE.
- Postgres `vts_open_trades` rows — soft-delete instead of hard-delete; row volume grows up to retention window before GC trims.

**Background execution effects:**
- Boot sweep at every server start — bounded sub-second op.
- No periodic cron (boot-time-only per scope §2.4 simpler option chosen).

**Blast radius rating: LOW.** Single column-additive migration, two services touched, one boot-path addition, one module_constants row. No FK changes, no view changes, no trigger changes, no cross-table joins.

---

## 3. File-level change inventory

| # | Path | Change kind | LOC est. |
|---|---|---|---|
| 1 | `drizzle/migrations/2026-05-10-b79-0g-tx-vts-open-trades-soft-delete.sql` | NEW | ~15 (forward) |
| 2 | `drizzle/migrations/2026-05-10-b79-0g-tx-vts-open-trades-soft-delete-rollback.sql` | NEW | ~10 |
| 3 | `drizzle/migrations/2026-05-10-b79-0g-tx-data-lifecycle-seed.sql` | NEW | ~6 (INSERT) |
| 4 | `drizzle/migrations/2026-05-10-b79-0g-tx-data-lifecycle-seed-rollback.sql` | NEW | ~4 |
| 5 | `server/services/vts-trade-persistence.ts` | MODIFY | -10 / +25 (rename fn, add filter + sweep) |
| 6 | `server/services/vts-runner.ts` | MODIFY | -15 / +15 (close-site rewrite, lines 2375–2395) |
| 7 | `server/index.ts` | MODIFY | +2 (call `sweepClosedOpenTrades` after rehydrate) |
| 8 | `server/tests/unit/b79-0g-vts-trade-persistence.test.ts` | MODIFY | -20 / +40 (cover `markOpenTradeClosed` + sweep + bootstrap-with-closed-rows regression-lock) |

**Total est:** ~50-80 LOC matches scope §6 sizing.

---

## 4. Schema migration SQL (forward + rollback drafts)

### `2026-05-10-b79-0g-tx-vts-open-trades-soft-delete.sql`

```sql
-- B79.0g-tx — closed-flag soft-delete for vts_open_trades.
-- Replaces the fire-and-log DELETE-on-close pattern with an awaited
-- UPDATE so the close-time state flip becomes atomic at the Postgres
-- row level (single UPDATE round-trip). Soft-deleted rows GC'd by a
-- boot-time sweep keyed off module_constants.data_lifecycle.

ALTER TABLE vts_open_trades
  ADD COLUMN IF NOT EXISTS closed    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL;

-- CONCURRENTLY required so existing scanner+exit-cycle traffic against
-- the table is uninterrupted during index creation. Cannot run inside
-- a transaction block; this migration intentionally has no BEGIN/COMMIT.
CREATE INDEX CONCURRENTLY IF NOT EXISTS vts_open_trades_open_filter_idx
  ON vts_open_trades (id)
  WHERE closed = false;

COMMENT ON COLUMN vts_open_trades.closed IS
  'B79.0g-tx — soft-delete flag. Open trades have closed=false. Trade-close UPDATE flips to true with closed_at=NOW(). Boot-time sweep DELETEs rows past data_lifecycle.vts_open_trades.closed_gc_retention_days.';
```

### Rollback

```sql
DROP INDEX IF EXISTS vts_open_trades_open_filter_idx;
ALTER TABLE vts_open_trades DROP COLUMN IF EXISTS closed_at;
ALTER TABLE vts_open_trades DROP COLUMN IF EXISTS closed;
```

### `2026-05-10-b79-0g-tx-data-lifecycle-seed.sql`

```sql
BEGIN;
INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, tunable_status, updated_at)
VALUES
  ('data_lifecycle', 'vts_open_trades.closed_gc_retention_days', '90'::jsonb, '*', '*', '*', '*', 'active', NOW())
ON CONFLICT (module_name, constant_name, asset_class, exchange, regime, strategy) DO NOTHING;
COMMIT;
```

### Rollback

```sql
BEGIN;
DELETE FROM module_constants
 WHERE module_name='data_lifecycle'
   AND constant_name='vts_open_trades.closed_gc_retention_days';
COMMIT;
```

---

## 5. Code change drafts

### 5.1 `vts-trade-persistence.ts` deltas

**Replace `deleteOpenTrade` (lines 111-121) with:**

```ts
/**
 * B79.0g-tx — soft-delete: flip the row to closed=true with closed_at=NOW()
 * instead of hard-DELETE. Called from vts-runner trade-close site AWAITED
 * before Map.delete, so a thrown UPDATE keeps in-memory + DB in lockstep.
 * Idempotent via `WHERE closed=false`: a retry after partial-failure matches
 * zero rows and returns cleanly.
 */
export async function markOpenTradeClosed(tradeId: string): Promise<void> {
  await db.execute(sql`
    UPDATE vts_open_trades
       SET closed = true,
           closed_at = NOW(),
           updated_at = NOW()
     WHERE id = ${tradeId}
       AND closed = false
  `);
}
```

**Patch `rehydrateOpenTrades` (line 146) SELECT:** add `WHERE closed = false`.

**Patch `bootstrapOpenTradesFromMemory` (line 189) COUNT:** add `WHERE closed = false`.

**Append new sweep function:**

```ts
/**
 * B79.0g-tx — boot-time GC sweep. DELETEs soft-deleted rows whose
 * closed_at is older than module_constants.data_lifecycle.vts_open_trades.closed_gc_retention_days.
 * Bounded volume; single-statement; runs once at boot from server/index.ts
 * after rehydrateOpenVtsTrades(). HARD-FAIL on missing module_constants
 * row per CLAUDE.md §5 #15 (no silent fallbacks for DB-governed settings)
 * — surface in logs, do NOT halt boot. Sweep failure is observability,
 * not a correctness invariant.
 */
export async function sweepClosedOpenTrades(): Promise<{ swept: number } | null> {
  let retentionDays: number;
  try {
    const r = await db.execute<{ value: any }>(sql`
      SELECT value FROM module_constants
       WHERE module_name='data_lifecycle'
         AND constant_name='vts_open_trades.closed_gc_retention_days'
         AND asset_class='*' AND exchange='*' AND regime='*' AND strategy='*'
       LIMIT 1
    `);
    const rows = (r as any).rows ?? (r as unknown as any[]);
    const v = rows[0]?.value;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`invalid retention value: ${JSON.stringify(v)}`);
    }
    retentionDays = n;
  } catch (err) {
    console.error(
      `[B79.0g-tx][GC_SWEEP] missing/invalid data_lifecycle.vts_open_trades.closed_gc_retention_days — sweep skipped:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  const r = await db.execute<{ count: string }>(sql`
    WITH d AS (
      DELETE FROM vts_open_trades
       WHERE closed = true
         AND closed_at < NOW() - (${retentionDays}::int * INTERVAL '1 day')
       RETURNING id
    )
    SELECT COUNT(*)::text AS count FROM d
  `);
  const rows = (r as any).rows ?? (r as unknown as any[]);
  const swept = parseInt(String(rows[0]?.count ?? '0'), 10);
  console.log(`[B79.0g-tx][GC_SWEEP] retention=${retentionDays}d swept=${swept} closed-rows from vts_open_trades`);
  return { swept };
}
```

### 5.2 `vts-runner.ts` close-site rewrite (lines 2375–2395)

As drafted in §1.3 above. Diff: -16 / +18.

### 5.3 `server/index.ts` boot path

Add AFTER the existing rehydrate try/catch block (own try/catch per Langston pre-audit R2):
```ts
// B79.0g-tx — boot-time GC sweep of soft-deleted vts_open_trades rows
// past retention. Own try/catch so a sweep failure doesn't get logged
// as a rehydrate failure (rehydrate already has its own soft-fail block).
try {
  const { sweepClosedOpenTrades } = await import('./services/vts-trade-persistence.js');
  await sweepClosedOpenTrades();
} catch (err) {
  console.error(
    '[B79.0g-tx][SWEEP_FAIL] boot-time vts_open_trades GC sweep failed; continuing boot:',
    err instanceof Error ? err.message : err,
  );
}
```

---

## 6. Test plan (Step 7 verification)

### 6.1 Unit tests (`b79-0g-vts-trade-persistence.test.ts`)

1. **`markOpenTradeClosed`: row flips to `closed=true` with `closed_at` set.** Insert via `insertOpenTrade`, mark closed, SELECT row, assert.
2. **`markOpenTradeClosed`: idempotent retry on already-closed row.** Call twice; second call matches zero rows; no error.
3. **`rehydrateOpenTrades`: excludes `closed=true` rows.** Insert one open + one closed (manual UPDATE), rehydrate, assert only open returned.
4. **`bootstrapOpenTradesFromMemory`: COUNT excludes closed rows.** Insert one `closed=true` row; bootstrap with non-empty iter; assert bootstrap PROCEEDS (treats table as empty since all rows are closed).
5. **`sweepClosedOpenTrades`: DELETEs rows past retention.** Insert closed row with `closed_at = NOW() - INTERVAL '100 days'` + retention=90; assert row deleted.
6. **`sweepClosedOpenTrades`: skips rows inside retention.** Insert closed row with `closed_at = NOW() - INTERVAL '30 days'`; assert row preserved.
7. **`sweepClosedOpenTrades`: returns null + logs error on missing module_constants row.** Mock/delete row; assert null return + no throw.

### 6.2 G3 PM2 staging verification

- Deploy + PM2 restart.
- Verify boot log lines: `[B79.0g][REHYDRATE] ...`, `[B79.0g-tx][GC_SWEEP] retention=90d swept=N closed-rows...`.
- Trigger a VTS close (Monday post-market-open) — observe `[11.6][Exit]` log line + verify subsequent `SELECT closed, closed_at FROM vts_open_trades WHERE id=$1` returns `(t, <recent>)`.
- 1h post-deploy: `SELECT closed, COUNT(*) FROM vts_open_trades GROUP BY closed` — confirm closed rows accumulating as expected.

### 6.3 Crypto no-touch fence (G5)

Standard query post-deploy:
```sql
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```
Acceptance: counts within ±10% of pre-deploy baseline. No-touch invariant: B79.0g-tx is asset-class-agnostic by construction.

### 6.4 Bootstrap-from-memory regression-lock (G2 follow)

Cold-start regression test in unit suite: insert `closed=true` row into table, then call `bootstrapOpenTradesFromMemory` with a fresh Map entry → assert bootstrap PROCEEDS (treats table as effectively empty since open-only count is 0) and re-resolves asset_class. This pins the Langston B79.0g Q4 lock through the new soft-delete semantic.

---

## 7. Deploy sequence

Single deploy (per scope §5 Q6 lean: Option B has additive columns with safe defaults; no downtime, no schema-first split).

1. `git push migration/aws-supabase`
2. CI: TS + Test + Build + Docker green
3. SSH Hetzner staging:
   - `psql -f drizzle/migrations/2026-05-10-b79-0g-tx-vts-open-trades-soft-delete.sql`
     (NOTE: this migration runs OUTSIDE a transaction due to `CREATE INDEX CONCURRENTLY`. Apply via `psql` directly, not via Drizzle migrator's auto-tx wrapping. Document in commit message.)
   - `psql -f drizzle/migrations/2026-05-10-b79-0g-tx-data-lifecycle-seed.sql`
   - `git pull && npm run build && pm2 restart dawntrader`
4. Verify boot logs as in §6.2.
5. Post-deploy 5-gate verification (CLAUDE.md §2 Step 7).

---

## 8. Risk inventory + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `CREATE INDEX CONCURRENTLY` fails (e.g. session lost) | LOW | Re-run; `IF NOT EXISTS` guard is idempotent. |
| Awaited UPDATE adds measurable latency to close-cycle | NEGLIGIBLE | Single PK UPDATE on Supabase same-region; sub-ms. Logged in cycle telemetry post-deploy for confirmation. |
| `markOpenTradeClosed` throws → trade orphans in memory + DB | LOW | Retry on next exit cycle (idempotent). Logged with `[MARK_CLOSED_FAIL]` for ops visibility. Map keeps row → retry path exists. |
| Sweep DELETE locks table during boot | NEGLIGIBLE | Volume is bounded (max ~retention_days * close_rate). Sub-second on staging. Sweep skipped on missing module_constants row (logs error). |
| Existing rehydrate test (B79.0g unit) breaks due to `WHERE closed=false` filter | LOW | Update unit test alongside the persistence-layer changes. Listed in §3 row #8. |
| Bootstrap path regression: counting only open rows could re-bootstrap into a table with closed-history | LOW | Per §6.1 test #4: bootstrap PROCEEDS in this case (correct: in-memory Map is the source of truth for live trades, closed-history is just GC bookkeeping). Verified by regression-lock test. |

---

## 9. Open questions for Langston review

Q1. **Sweep execution model:** boot-time sync-read (B72 pattern, simpler) vs. periodic node-internal `setInterval` cron vs. external cron line (`context-bridge-log-ttl.ts` pattern). Pre-audit picks **boot-time** — table volume is tiny + boot frequency is sufficient for unbounded-growth prevention. Reasonable?

Q2. **HARD-FAIL semantics on missing module_constants row:** scope §3 says "missing row doesn't block trade-close hot path; only delays GC." Pre-audit implements "log error + return null + continue boot." Is that the right enforcement level, or should boot halt to force the operator to seed the row before the table can grow unbounded?

Q3. **Migration tx semantics:** `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. Pre-audit splits the index creation OUT of the BEGIN/COMMIT wrapper. Drizzle migrator default-wraps in a tx — need to apply via raw `psql` or annotate with a Drizzle-aware comment. Confirm approach.

Q4. **Test #4 (bootstrap-with-closed-rows):** behavior is "bootstrap PROCEEDS when COUNT(open-only)=0 regardless of closed-row presence." That preserves the B79.0g Q4 re-resolve semantic across the new soft-delete world. Confirm this is the right semantic vs. "bootstrap skipped if ANY rows exist."

Q5. **Cleanup of the JSON-write reorder consideration:** scope §1 Option A was rejected because there's no shared tx surface with `logTrade` JSON write. Option B sidesteps the issue entirely. Pre-audit does NOT reorder JSON-write vs. UPDATE — UPDATE happens at the call site BEFORE `persistRealPriceTrade` is invoked (the existing close path already has `persistRealPriceTrade` complete before reaching line 2376). Actually re-reading: today's pattern at line 2211 is `await vtsService.persistRealPriceTrade(...)` then line 2376 `openVirtualTrades.delete(id)` then line 2385 async `deleteOpenTrade`. So the JSON write is already complete when we reach the soft-delete UPDATE. Confirming: no JSON-write-ordering work needed in this batch.

Q6. **Naming: `sweepClosedOpenTrades` vs. `gcClosedOpenTrades`.** Mild preference. No-strong-opinion. Pick one.

Q7. **B70 archive + B73 ablation replay:** both stay async fire-and-forget per scope §3. Re-confirming this is OK in the soft-delete world (vs. C-style atomicity).

---

## 10. Sequencing back to scope

Pre-audit confirms scope §6 sizing: 50-80 LOC; single Step 1+2 batch; single commit acceptable (no split-deploy needed).

## 11. Langston Step 2 review status

**APPROVED with R1 (critical) + R2 (small) applied 2026-05-10.**

- **R1 (critical, applied to §1.3 + §5.2):** Reversed the close-time ordering — Map.delete FIRST (synchronous, gates the non-idempotent close cascade), THEN awaited `markOpenTradeClosed` in try/catch that does NOT re-throw. Re-throwing would let the next exit cycle re-run the entire cascade (`persistRealPriceTrade` → `closedTrades.push`, session P&L, JSON ledger, B73, B70, ML calibration), producing duplicate writes. Soft-delete doesn't make the cascade atomic — only Option C would; Option B's win is the partial-index-filtered rehydrate.
- **R2 (small, applied to §5.3):** Boot sweep gets its own try/catch with `[B79.0g-tx][SWEEP_FAIL]` label, placed AFTER the rehydrate block so a sweep error doesn't get logged as a rehydrate error.

7 question answers locked: Q1 boot-time sweep endorsed; Q2 log+skip+continue endorsed with `[CONFIG_MISSING]` greppable label; Q3 raw `psql -f` direct application of CREATE INDEX CONCURRENTLY confirmed, no-tx-wrap comment in migration leading block; Q4 bootstrap-when-open-count=0 semantic confirmed; Q5 no JSON-write reorder needed; Q6 `sweepClosedOpenTrades` naming chosen; Q7 B70+B73 stay async fire-and-forget.

Proceeding to Step 3 implementation.

---

*End BATCH_79_0g_tx_PRE_AUDIT.md.*
