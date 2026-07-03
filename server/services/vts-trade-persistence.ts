/**
 * B79.0g — Open VTS trade persistence.
 *
 * PURPOSE
 * -------
 * Persist `OpenVirtualTrade` records to `vts_open_trades` so:
 *   - Trades survive PM2 restarts (rehydrated into the in-memory Map at boot).
 *   - Display + downstream consumers read `asset_class` from the persisted
 *     row, not by re-resolving from canonical symbol form (which is
 *     ambiguous post-canonicalization for the 9 collision tickers in
 *     XSTOCK_SPOT_KRAKEN_COLLISIONS).
 *   - Closed-trade migration is atomic with closed_trades INSERT
 *     (single transaction, Q5 lock).
 *
 * DESIGN (Langston Q1-Q5 lock 2026-05-10)
 * ---------------------------------------
 * Q1: NEW table `vts_open_trades` — separate from closed_trades to keep
 *     ML-pipeline closed-table reads off the open-trade churn write path.
 * Q2: ON-CLOSE SNAPSHOT — the open-trade row reflects entry-time state +
 *     last-snapshot context; mid-trade mutations stay in-memory + the
 *     dedicated TEC trailing_states table; a final snapshot on close
 *     captures the full state into closed_trades.
 * Q3: REHYDRATE via TEC rejoin — vts_open_trades carries trade-shell;
 *     TEC's existing rehydrate path restores ratcheted-stop history.
 * Q4: BOOTSTRAP-SNAPSHOT on first deploy — if `vts_open_trades` is empty
 *     AND in-memory Map is non-empty (paste-from-pre-deploy state),
 *     snapshot WITH RE-RESOLVE of asset_class via safeResolveAssetClass()
 *     so legacy bad asset_class values don't freeze into DB (Langston
 *     B79.0g revisions add'l #1).
 * Q5: ATOMIC close-time migration — DELETE-from-vts_open_trades +
 *     INSERT-into-closed_trades wrapped in a single transaction.
 *
 * NOTE: This module is the writer for vts_open_trades. The reader for
 * UI display (`getOpenVirtualTradesForML` in vts-runner.ts) continues to
 * read from the in-memory Map — which is now seeded from this table at
 * boot. Single source of truth at-rest = DB; in-memory is the live cache.
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { safeResolveAssetClass, type AssetClass } from '../../shared/asset-classes.js';

/**
 * reorg-B4 (2026-06-25) — the CANONICAL shadow-exclusion predicate for every
 * NON-shadow-path read of the shared `vts_open_trades` table. reorg-B4 persists
 * shadow trades as real rows in THIS shared table (tagged `context.shadow=true`),
 * so any learning / telemetry / replay reader that does NOT filter them would
 * ingest the full RTB-pool shadow population as if it were the per-strategy-eval
 * VTS learning set — the exact OBJ-3b contamination the batch exists to prevent.
 *
 * Compose this fragment into the WHERE clause of EVERY non-shadow read of
 * `vts_open_trades` (`... AND ${VTS_OPEN_TRADES_EXCLUDE_SHADOW}`). Legacy + live
 * rows carry no `shadow` key → `context->>'shadow'` is NULL → `IS DISTINCT FROM
 * 'true'` → included. Shadow rows → 'true' → excluded. The SHADOW resolver
 * (`resolveOpenShadowTrades`) reads the in-memory `openShadowTrades` Map, never
 * this table, so it is unaffected. ★ Single source so a future table reader can't
 * silently forget the filter (Langston Step-4 load-bearing finding).
 */
export const VTS_OPEN_TRADES_EXCLUDE_SHADOW = sql`(context->>'shadow') IS DISTINCT FROM 'true'`;

/**
 * B-NEW-36 (2026-05-20) — lifecycle marker on vts_open_trades.state.
 * 'open' = normal active trade
 * 'weekend_suspended' = paused during Fri 8PM ET → Sun 8PM ET (xstock_spot only;
 *   DB CHECK constraint enforces the asset_class scoping)
 * 'closed' = trade is closed (mirrors closed=true)
 */
/**
 * P19-B7.2c adds 'pending': a resting maker order awaiting an honest trade-through
 * fill — holds a slot, has NO fill yet; the resolve-loop pre-pass flips it to 'open'
 * on fill or drops it at the hard-deadline (never a closed trade).
 */
export type VtsOpenTradeState = 'open' | 'weekend_suspended' | 'closed' | 'pending';

// We intentionally use a typed-but-flexible structural type for the trade
// record passed in. The full `OpenVirtualTrade` interface lives in
// vts-runner.ts and depends on many internal types; we just need the
// shape for serialization. The `any` escape on context is intentional —
// it covers ~20 optional fields whose strict typing buys us nothing here.
export interface OpenVirtualTradeRecord {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  dollarValue: number;
  quantity: number;
  regime: string;
  signalType: string;
  strategy: string;
  pool: 'ideal' | 'rotational';
  openedAt: number;        // epoch ms
  // B-NEW-36: lifecycle marker hydrated from the new vts_open_trades.state
  // column. Optional in the structural type because pre-B-NEW-36 in-memory
  // trade records may not carry it; readers default to 'open'.
  state?: VtsOpenTradeState;
  // Everything else flows through `context`.
  [key: string]: any;
}

/**
 * Internal helper: extract the explicit columns + bundle the rest into context jsonb.
 */
function splitTradeForPersist(t: OpenVirtualTradeRecord): { core: any; context: Record<string, any> } {
  const {
    id, symbol, assetClass, entryPrice, stopLoss, takeProfit, positionSize,
    dollarValue, quantity, regime, signalType, strategy, pool, openedAt,
    // P19-B7.2b (OBJ-B): the maker/taker entry fee-mode — promoted to typed
    // columns (chosen_entry_mode / entry_fee_rate) so the VTS open-trades UI can
    // query it directly, consistent with the paper-active tables. Destructured out
    // of `...context` so it lives in ONE home (the typed column), not duplicated.
    chosenEntryMode, entryFeeRate,
    // P19-B7.2c: pending-maker lifecycle — typed columns (Langston Q3: not context
    // JSON; the resolve pre-pass reads them every cycle). `state` written at INSERT
    // so a pending row is born 'pending' (previously the DB default 'open' stood).
    state, makerLimitPrice, makerDeadline,
    ...context
  } = t;
  return {
    core: {
      id, symbol, assetClass, entryPrice, stopLoss, takeProfit, positionSize,
      dollarValue, quantity, regime, signalType, strategy, pool, openedAt,
      chosenEntryMode, entryFeeRate,
      state, makerLimitPrice, makerDeadline,
    },
    context,
  };
}

/**
 * INSERT a newly-opened trade. Called from vts-runner immediately after
 * the trade is added to the in-memory Map. Throw on failure — caller
 * should treat the insert failure as a fatal trade-open error and remove
 * the trade from the Map (no orphan in-memory state).
 */
export async function insertOpenTrade(trade: OpenVirtualTradeRecord): Promise<void> {
  const { core, context } = splitTradeForPersist(trade);
  await db.execute(sql`
    INSERT INTO vts_open_trades (
      id, symbol, asset_class, entry_price, stop_loss, take_profit,
      position_size, dollar_value, quantity, regime, signal_type, strategy,
      pool, opened_at, chosen_entry_mode, entry_fee_rate,
      state, maker_limit_price, maker_deadline,
      context, inserted_at, updated_at
    ) VALUES (
      ${core.id}, ${core.symbol}, ${core.assetClass},
      ${core.entryPrice}, ${core.stopLoss}, ${core.takeProfit},
      ${core.positionSize}, ${core.dollarValue}, ${core.quantity},
      ${core.regime}, ${core.signalType}, ${core.strategy}, ${core.pool},
      to_timestamp(${core.openedAt} / 1000.0),
      ${core.chosenEntryMode ?? null}, ${core.entryFeeRate ?? null},
      ${core.state ?? 'open'},
      ${core.makerLimitPrice ?? null},
      ${core.makerDeadline != null ? new Date(core.makerDeadline) : null},
      ${JSON.stringify(context)}::jsonb,
      NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);
}

/**
 * B79.0g-tx — soft-delete: flip the row to closed=true with closed_at=NOW()
 * instead of hard-DELETE. Called from vts-runner trade-close site AWAITED
 * AFTER `openVirtualTrades.delete(id)` (which is the actual correctness
 * gate against re-executing the non-idempotent close cascade). Idempotent
 * via `WHERE closed=false`: a retry after partial-failure matches zero
 * rows and returns cleanly.
 *
 * Replaces the B79.0g `deleteOpenTrade` hard-DELETE — soft-deleted rows
 * carry the closed-history forward through the next boot's rehydrate
 * (which filters `WHERE closed=false`) and are GC'd by
 * `sweepClosedOpenTrades` at boot.
 *
 * B-NEW-36 (2026-05-20) extension: also flip `state` to 'closed' in the
 * same UPDATE. The vts_open_trades_state_consistency CHECK constraint
 * requires `closed=true AND state='closed'` together; without this the
 * close UPDATE fails for every trade once the B-NEW-36 migration lands.
 * Pre-audit §4.1.
 */
/**
 * P19-B7.2c — flip a PENDING maker order to OPEN on an honest trade-through fill.
 * Idempotent via `WHERE state='pending'` (a retry after partial failure matches
 * zero rows). The entry price + reserved maker fee were written at placement and
 * do not change on fill (the fill IS the resting limit).
 */
export async function markPendingMakerFilled(tradeId: string): Promise<void> {
  await db.execute(sql`
    UPDATE vts_open_trades
       SET state = 'open',
           updated_at = NOW()
     WHERE id = ${tradeId}
       AND state = 'pending'
       AND closed = false
  `);
}

export async function markOpenTradeClosed(tradeId: string): Promise<void> {
  await db.execute(sql`
    UPDATE vts_open_trades
       SET closed = true,
           closed_at = NOW(),
           state = 'closed',
           updated_at = NOW()
     WHERE id = ${tradeId}
       AND closed = false
  `);
}

/**
 * B-NEW-36 (2026-05-20) — bulk-mark all open xstock_spot trades as
 * weekend_suspended. Called by the off-hours session-lifecycle controller
 * on Friday 8 PM ET and at boot when inside the weekend-close window.
 *
 * Per pre-audit §4.2: this helper also mirrors the state change onto the
 * in-memory Map records so the sim cycle's iteration filter sees the new
 * state immediately. Caller passes a reference to the
 * `openVirtualTrades` Map (keyed by trade id); we mutate entries in place.
 *
 * ⚠️ P19-B7.2d LOAD-BEARING PREDICATE: both the SQL `AND state = 'open'` and the
 * in-memory `trade.state === 'open'` filter EXCLUDE state='pending' rows. A
 * pending (unfilled resting maker) must NEVER be suspended — the Sunday restore
 * flips weekend_suspended → 'open', which would convert an UNFILLED order into
 * an open position WITHOUT a fill. Pending rows pass the weekend boundary
 * untouched (they fill on an honest trade-through or hard-drop at deadline via
 * the resolve pre-pass). Do not widen either predicate.
 *
 * Returns the number of DB rows updated.
 */
export async function markAllXstockWeekendSuspended(
  inMemoryMap: Map<string, { assetClass: AssetClass; state?: VtsOpenTradeState }>,
): Promise<{ updated: number }> {
  const r = await db.execute<{ count: string }>(sql`
    WITH u AS (
      UPDATE vts_open_trades
         SET state = 'weekend_suspended', updated_at = NOW()
       WHERE asset_class = 'xstock_spot'
         AND closed = false
         AND state = 'open'
       RETURNING id
    )
    SELECT COUNT(*)::text AS count FROM u
  `);
  const rows = (r as any).rows ?? (r as unknown as any[]);
  const updated = parseInt(String(rows[0]?.count ?? '0'), 10);

  // Mirror to in-memory Map.
  let inMemoryMirrored = 0;
  for (const trade of inMemoryMap.values()) {
    if (trade.assetClass === 'xstock_spot' && trade.state === 'open') {
      trade.state = 'weekend_suspended';
      inMemoryMirrored++;
    }
  }

  console.log(
    `[B-NEW-36][SUSPEND_XSTOCK] db_rows=${updated} memory_mirrored=${inMemoryMirrored}`,
  );
  return { updated };
}

/**
 * B-NEW-36 (2026-05-20) — bulk-restore all weekend-suspended xstock_spot
 * trades to 'open'. Called on Sunday 8 PM ET and at boot when outside the
 * weekend-close window. Mirrors to in-memory Map per pre-audit §4.2.
 *
 * ⚠️ P19-B7.2d: restores ONLY state='weekend_suspended' rows (SQL + in-memory
 * predicates) — a state='pending' row can never be flipped to 'open' here (see
 * the suspend-side note above; pending must fill honestly or drop at deadline).
 *
 * Returns the number of DB rows updated.
 */
export async function unmarkAllXstockWeekendSuspended(
  inMemoryMap: Map<string, { assetClass: AssetClass; state?: VtsOpenTradeState }>,
): Promise<{ updated: number }> {
  const r = await db.execute<{ count: string }>(sql`
    WITH u AS (
      UPDATE vts_open_trades
         SET state = 'open', updated_at = NOW()
       WHERE asset_class = 'xstock_spot'
         AND closed = false
         AND state = 'weekend_suspended'
       RETURNING id
    )
    SELECT COUNT(*)::text AS count FROM u
  `);
  const rows = (r as any).rows ?? (r as unknown as any[]);
  const updated = parseInt(String(rows[0]?.count ?? '0'), 10);

  let inMemoryMirrored = 0;
  for (const trade of inMemoryMap.values()) {
    if (trade.assetClass === 'xstock_spot' && trade.state === 'weekend_suspended') {
      trade.state = 'open';
      inMemoryMirrored++;
    }
  }

  console.log(
    `[B-NEW-36][RESTORE_XSTOCK] db_rows=${updated} memory_mirrored=${inMemoryMirrored}`,
  );
  return { updated };
}

/**
 * REHYDRATE: read all rows back into a list of records. Called once at
 * server boot (before scanner.start) so the in-memory Map starts populated.
 * No partial-state reconstruction here — TEC's separate rehydrate path
 * handles the trailing-engine state via tec_trailing_states.
 */
export async function rehydrateOpenTrades(): Promise<OpenVirtualTradeRecord[]> {
  const result = await db.execute<{
    id: string;
    symbol: string;
    asset_class: string;
    entry_price: string;
    stop_loss: string;
    take_profit: string;
    position_size: string;
    dollar_value: string;
    quantity: string;
    regime: string;
    signal_type: string;
    strategy: string;
    pool: string;
    opened_at: Date;
    state: string;
    chosen_entry_mode: string | null;
    entry_fee_rate: string | null;
    maker_limit_price: string | null;
    maker_deadline: Date | null;
    context: Record<string, any>;
  }>(sql`
    SELECT id, symbol, asset_class, entry_price, stop_loss, take_profit,
           position_size, dollar_value, quantity, regime, signal_type, strategy,
           pool, opened_at, state, chosen_entry_mode, entry_fee_rate,
           maker_limit_price, maker_deadline, context
    FROM vts_open_trades
    WHERE closed = false
  `);

  const rows = (result as any).rows ?? (result as unknown as any[]);
  if (!Array.isArray(rows)) {
    throw new Error('[B79.0g] rehydrateOpenTrades: drizzle returned non-array shape');
  }

  return rows.map((r): OpenVirtualTradeRecord => ({
    id: r.id,
    symbol: r.symbol,
    assetClass: r.asset_class as AssetClass,
    entryPrice: parseFloat(r.entry_price as unknown as string),
    stopLoss: parseFloat(r.stop_loss as unknown as string),
    takeProfit: parseFloat(r.take_profit as unknown as string),
    positionSize: parseFloat(r.position_size as unknown as string),
    dollarValue: parseFloat(r.dollar_value as unknown as string),
    quantity: parseFloat(r.quantity as unknown as string),
    regime: r.regime,
    signalType: r.signal_type,
    strategy: r.strategy,
    pool: r.pool as 'ideal' | 'rotational',
    openedAt: new Date(r.opened_at).getTime(),
    // B-NEW-36: surface state on the rehydrated record so the sim-cycle
    // iteration filter sees it post-restart. Defaults to 'open' for
    // belt-and-suspenders; DB CHECK guarantees the value is valid.
    state: (r.state as VtsOpenTradeState) ?? 'open',
    ...(r.context ?? {}),
    // P19-B7.2b (OBJ-B): surface the typed maker/taker fee-mode columns; placed AFTER
    // the context spread so a NEW row's typed column wins, with a fallback to legacy
    // context for pre-B7.2b rows that stored these in the jsonb blob.
    chosenEntryMode: r.chosen_entry_mode ?? (r.context as any)?.chosenEntryMode,
    entryFeeRate: r.entry_fee_rate != null ? parseFloat(r.entry_fee_rate) : (r.context as any)?.entryFeeRate,
    // P19-B7.2c: pending-maker lifecycle fields (epoch ms in memory; typed cols in DB).
    // A rehydrated 'pending' flows into the resolve pre-pass like any live pending.
    makerLimitPrice: r.maker_limit_price != null ? parseFloat(r.maker_limit_price) : undefined,
    makerDeadline: r.maker_deadline != null ? new Date(r.maker_deadline).getTime() : undefined,
  }));
}

/**
 * BOOTSTRAP — one-shot seed from the in-memory Map into the empty table.
 * Called at server startup IF rehydrate returned 0 rows AND the in-memory
 * Map has entries. Per Langston B79.0g revisions add'l #1: re-resolve
 * asset_class via safeResolveAssetClass() before persisting so legacy bad
 * values from pre-B79.0f resolver don't freeze into DB.
 *
 * Returns the count of trades bootstrapped, or null if no bootstrap needed.
 */
export async function bootstrapOpenTradesFromMemory(
  inMemoryTrades: Iterable<OpenVirtualTradeRecord>,
): Promise<number | null> {
  // B79.0g-tx: bootstrap is gated on the OPEN-only count. Closed soft-
  // deleted history rows do not block the re-resolve bootstrap path —
  // they're just GC bookkeeping. Preserves the B79.0g Q4 re-resolve
  // semantic across the new soft-delete world (Langston pre-audit Q4).
  // reorg-B4: exclude shadow open rows from the boot-gate count — a shadow row
  // must not make the table read as "already populated" and suppress the
  // re-resolve bootstrap of real trades.
  const existing = await db.execute<{ count: string }>(sql`SELECT COUNT(*) AS count FROM vts_open_trades WHERE closed = false AND ${VTS_OPEN_TRADES_EXCLUDE_SHADOW}`);
  const existingRows = (existing as any).rows ?? (existing as unknown as any[]);
  const existingCount = parseInt(String(existingRows[0]?.count ?? '0'), 10);
  if (existingCount > 0) return null;

  let bootstrapped = 0;
  for (const trade of inMemoryTrades) {
    // Re-resolve asset_class — defeats stale value from pre-B79.0f resolver.
    const reResolved = safeResolveAssetClass(trade.symbol, 'kraken');
    if (!reResolved) {
      console.warn(`[B79.0g][BOOTSTRAP] symbol=${trade.symbol} failed re-resolve; skipping`);
      continue;
    }
    const corrected: OpenVirtualTradeRecord = {
      ...trade,
      assetClass: reResolved,
    };
    try {
      await insertOpenTrade(corrected);
      bootstrapped++;
      // F3 fix: also update the in-memory record so cache + DB agree post-
      // bootstrap. The OpenVirtualTrade Map is keyed by id; mutating the
      // record's assetClass field is safe because all readers consume the
      // current value (no caching of the field elsewhere).
      (trade as any).assetClass = reResolved;
    } catch (err) {
      console.error(
        `[B79.0g][BOOTSTRAP] insert failed for trade=${trade.id} symbol=${trade.symbol}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`[B79.0g][BOOTSTRAP] seeded ${bootstrapped} open trades from in-memory Map`);
  return bootstrapped;
}

/**
 * B79.0g-tx — boot-time GC sweep. DELETEs soft-deleted rows whose
 * `closed_at` is older than
 * `module_constants.data_lifecycle.vts_open_trades.closed_gc_retention_days`.
 *
 * Bounded volume (typical: a few hundred to a few thousand rows per
 * retention window); single statement; runs once at boot from
 * `server/index.ts` after `rehydrateOpenVtsTrades()`. HARD-FAIL semantics
 * on missing module_constants row: emit a greppable
 * `[B79.0g-tx][CONFIG_MISSING]` line, skip the sweep, return null. Do
 * NOT halt boot — sweep failure is observability, not a correctness
 * invariant.
 *
 * Returns `{ swept: number }` on success, `null` if retention config
 * was missing/invalid.
 */
export async function sweepClosedOpenTrades(): Promise<{ swept: number } | null> {
  let retentionDays: number;
  try {
    const r = await db.execute<{ value: unknown }>(sql`
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
      `[B79.0g-tx][CONFIG_MISSING] data_lifecycle.vts_open_trades.closed_gc_retention_days unreadable — sweep skipped:`,
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
