/**
 * B-CLOSE-WRITER-COSTS P-12 (scope §5; pre-audit P-12 + condition (c); Kyle KD-17): THE OPERATOR REMEDY FOR A REFUSED
 * CLOSE.
 *
 * A close refuses (and keeps the position) when its open trade record does not resolve (P-2). When the record is MISSING,
 * this restores it from the position's OWN open-time fields — symbol, class, mode, side, quantity, entry price, entry fee
 * and slippage, strategy, opened_at — and NOTHING about the exit: the next close books the real exit onto it. The record is
 * stamped `record_restored_from_position`, `restored_at`, `restored_by_claimed` (the caller — a CLAIM, `#447`).
 *
 * IDEMPOTENT by refusal: it refuses when an open record exists (one or several), when the position's own `tradeId` names a
 * record that exists, and when the position carries no entry fee or slippage (a record is never restored with an invented
 * value). Called by `POST /active-engine/positions/:id/restore-record`, which chooses the mode at the API boundary (KD-37).
 */
import { storage } from '../storage';
import { asValidAssetClass } from '../../shared/asset-classes.js';
import type { TradingMode } from '../lib/event-bus';

export type RestoreResult =
  | { ok: true; recordId: string; positionId: string; symbol: string }
  | { ok: false; code: 404 | 409; error: string; recordId?: string; recordIds?: string[]; more?: boolean };

export async function restoreOpenTradeRecord(mode: TradingMode, positionId: string, claimedBy: string): Promise<RestoreResult> {
  const position: any = await storage.getActiveOpenPosition(mode, positionId);
  if (!position) return { ok: false, code: 404, error: 'position not found' };
  const cls = asValidAssetClass(position.assetClass);
  if (!cls) return { ok: false, code: 409, error: `the position has no valid asset class (${String(position.assetClass)})` };

  const existing = await storage.findOpenTradeRecord(mode, position.symbol, cls);
  if (existing.status === 'one') {
    return { ok: false, code: 409, error: 'an open trade record already exists for this position', recordId: existing.record.id };
  }
  if (existing.status === 'many') {
    return { ok: false, code: 409, error: 'several open trade records match — investigate the duplicate, do not restore', recordIds: existing.ids, more: existing.more };
  }
  const tid: string | undefined = position.metadata?.tradeId;
  if (tid && (await storage.getClosedTrade(mode, tid))) {
    return { ok: false, code: 409, error: `the position's own record ${tid} exists and is not open — investigate, do not restore`, recordId: tid };
  }
  if (position.entryFee == null || position.entrySlippage == null) {
    return { ok: false, code: 409, error: 'the position carries no entry fee or entry slippage — a record cannot be restored without inventing one' };
  }

  const str = (v: unknown) => (v == null ? null : String(v));
  const record = await storage.createClosedTrade(mode, {
    symbol: position.symbol,
    baseCurrency: position.symbol.split('/')[0] || position.symbol,
    exchange: position.exchange,
    assetClass: cls,
    strategyName: position.strategyName,
    side: position.side,
    quantity: String(position.quantity),
    entryPrice: String(position.avgPrice),
    actualEntryPrice: String(position.avgPrice),
    intendedEntryPrice: str(position.intendedEntryPrice),
    stopLoss: str(position.stopLoss),
    takeProfit: str(position.takeProfit),
    // An OPEN record holds its entry fee in `fees` (the open path's write) — and, from this batch, in `entry_fee` too.
    fees: String(position.entryFee),
    entryFee: String(position.entryFee),
    slippage: String(position.entrySlippage),
    entrySlippage: String(position.entrySlippage),
    confidence: str(position.confidence),
    openedAt: position.openedAt ?? new Date(),
    signalType: position.signalType ?? undefined,
    patternType: position.patternType ?? null,
    patternStrength: position.patternStrength ?? null,
    sourcePool: position.sourcePool ?? null,
    balanceRatioAtOpen: position.balanceRatioAtOpen ?? null,
    anchorBalanceAtOpen: position.anchorBalanceAtOpen ?? null,
    anchorVersionAtOpen: position.anchorVersionAtOpen ?? null,
    metadata: position.metadata,
    recordRestoredFromPosition: true,
    restoredAt: new Date(),
    restoredByClaimed: claimedBy,
  } as any);
  // The position now points at its record, so the next close (and P-16 / P-17) resolve it by `tradeId` as well as by key.
  await storage.updateActiveOpenPosition(mode, position.id, { metadata: { ...(position.metadata ?? {}), tradeId: record.id } } as any);
  console.log(`[B-CLOSE-WRITER-COSTS][RECORD_RESTORED:${mode}] ${position.symbol} pos=${position.id} -> record ${record.id} (claimed by ${claimedBy})`);
  return { ok: true, recordId: record.id, positionId: position.id, symbol: position.symbol };
}
