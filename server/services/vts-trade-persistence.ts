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
 *   - Closed-trade migration is atomic with paper_sim_trades INSERT
 *     (single transaction, Q5 lock).
 *
 * DESIGN (Langston Q1-Q5 lock 2026-05-10)
 * ---------------------------------------
 * Q1: NEW table `vts_open_trades` — separate from paper_sim_trades to keep
 *     ML-pipeline closed-table reads off the open-trade churn write path.
 * Q2: ON-CLOSE SNAPSHOT — the open-trade row reflects entry-time state +
 *     last-snapshot context; mid-trade mutations stay in-memory + the
 *     dedicated TEC trailing_states table; a final snapshot on close
 *     captures the full state into paper_sim_trades.
 * Q3: REHYDRATE via TEC rejoin — vts_open_trades carries trade-shell;
 *     TEC's existing rehydrate path restores ratcheted-stop history.
 * Q4: BOOTSTRAP-SNAPSHOT on first deploy — if `vts_open_trades` is empty
 *     AND in-memory Map is non-empty (paste-from-pre-deploy state),
 *     snapshot WITH RE-RESOLVE of asset_class via safeResolveAssetClass()
 *     so legacy bad asset_class values don't freeze into DB (Langston
 *     B79.0g revisions add'l #1).
 * Q5: ATOMIC close-time migration — DELETE-from-vts_open_trades +
 *     INSERT-into-paper_sim_trades wrapped in a single transaction.
 *
 * NOTE: This module is the writer for vts_open_trades. The reader for
 * UI display (`getOpenVirtualTradesForML` in vts-runner.ts) continues to
 * read from the in-memory Map — which is now seeded from this table at
 * boot. Single source of truth at-rest = DB; in-memory is the live cache.
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { safeResolveAssetClass, type AssetClass } from '../../shared/asset-classes.js';

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
    ...context
  } = t;
  return {
    core: {
      id, symbol, assetClass, entryPrice, stopLoss, takeProfit, positionSize,
      dollarValue, quantity, regime, signalType, strategy, pool, openedAt,
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
      pool, opened_at, context, inserted_at, updated_at
    ) VALUES (
      ${core.id}, ${core.symbol}, ${core.assetClass},
      ${core.entryPrice}, ${core.stopLoss}, ${core.takeProfit},
      ${core.positionSize}, ${core.dollarValue}, ${core.quantity},
      ${core.regime}, ${core.signalType}, ${core.strategy}, ${core.pool},
      to_timestamp(${core.openedAt} / 1000.0),
      ${JSON.stringify(context)}::jsonb,
      NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);
}

/**
 * DELETE an open-trade row at close time. Called from inside the
 * close-time transaction in vts-service.persistRealPriceTrade so the
 * DELETE + the closed-trade INSERT atomically swap.
 *
 * The actual transactional wrap is done in vts-service via a tx callback;
 * this helper just exposes the DELETE statement.
 */
export async function deleteOpenTrade(tradeId: string): Promise<void> {
  await db.execute(sql`DELETE FROM vts_open_trades WHERE id = ${tradeId}`);
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
    context: Record<string, any>;
  }>(sql`
    SELECT id, symbol, asset_class, entry_price, stop_loss, take_profit,
           position_size, dollar_value, quantity, regime, signal_type, strategy,
           pool, opened_at, context
    FROM vts_open_trades
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
    ...(r.context ?? {}),
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
  const existing = await db.execute<{ count: string }>(sql`SELECT COUNT(*) AS count FROM vts_open_trades`);
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
