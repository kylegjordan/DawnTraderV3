/**
 * B-CLOSE-WRITER-COSTS P-12 (scope §5; pre-audit P-12 + condition (c); Kyle KD-17): THE OPERATOR REMEDY FOR A REFUSED
 * CLOSE.
 *
 * A close refuses (and keeps the position) when its open trade record does not resolve (P-2). When the record is MISSING,
 * this restores it from the position's OWN open-time fields and NOTHING about the exit — the next close books the real exit
 * onto it. The record is stamped `record_restored_from_position`, `restored_at`, `restored_by_claimed` (the caller — a
 * CLAIM, `#447`: an identity the server was told, not one it verified).
 *
 * WHAT A RESTORED RECORD CARRIES (copied from the position): symbol, class, exchange, mode, strategy, side, quantity, entry
 * price, intended entry price, stop, target, the entry fee (into BOTH `fees` and `entry_fee`, as an open record holds it),
 * entry slippage, confidence, opened_at, signal/pattern type and strength, source pool, the at-open balance stamps, the
 * maker/taker entry stamps (`chosen_entry_mode`, `entry_fill_policy`, `entry_fee_rate`), `trade_mode`, and the metadata.
 * ⚠️ WHAT IT CANNOT RECOVER (Langston Part B C-1 — so nobody reads a restored record as a full one): the entry-price
 * provenance set (`entry_price_producer`, `entry_price_source`, `entry_book_age_ms`, `entry_book_consumption_age_ms`,
 * `entry_decision_price`, `entry_observed_at_ms`), the regime stamps (`regime_confidence_raw`, `macro_modifier_value`,
 * `phase`) and `pair_id_hash` — none of them lives on the position. They stay NULL, and the restored flag says why.
 *
 * A PENDING maker (`state='pending'`, Langston Part B C-2) is decided EXPLICITLY, not by a column default: the open path
 * writes a pending maker's open record at PLACEMENT, exactly as for a taker, so a restore for a pending position mirrors the
 * normal pending state — no fill is asserted; the record is closed `never_filled` by the drop or finished by the fill. The
 * metadata says it was restored while pending.
 *
 * IDEMPOTENT AND ATOMIC (attack 2): the insert happens under a transaction-scoped advisory lock that re-checks no open
 * record exists for (mode, symbol, class) — two concurrent restores cannot both insert. Refuses when an open record exists
 * (one or several) and when the position's own `tradeId` names an existing record.
 * INVOKERS: `POST /active-engine/positions/:id/restore-record` (logged-in) and the operator script
 * `server/scripts/restore-trade-record.ts` (run on staging; the shell API tool refuses writes). The mode is chosen by the
 * caller (KD-37: the mode-scoped engine at the boundary); only paper exists today.
 */
import { storage } from '../storage';
import { asValidAssetClass } from '../../shared/asset-classes.js';
import type { TradingMode } from '../lib/event-bus';

export type RestoreResult =
  | { ok: true; recordId: string; positionId: string; symbol: string; pending: boolean }
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

  const pending = position.state === 'pending';
  const str = (v: unknown) => (v == null ? null : String(v));
  const restoredAt = new Date();
  const result = await storage.insertOpenTradeRecordIfNoneOpen(mode, position.symbol, cls, {
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
    // the entry fee the open path computed and wrote to the position (and to the record's `fees` at placement)
    fees: String(position.entryFee ?? '0'),
    entryFee: String(position.entryFee ?? '0'),
    slippage: String(position.entrySlippage ?? '0'),
    entrySlippage: String(position.entrySlippage ?? '0'),
    confidence: str(position.confidence),
    openedAt: position.openedAt ?? restoredAt,
    signalType: position.signalType ?? undefined,
    patternType: position.patternType ?? null,
    patternStrength: position.patternStrength ?? null,
    sourcePool: position.sourcePool ?? null,
    balanceRatioAtOpen: position.balanceRatioAtOpen ?? null,
    anchorBalanceAtOpen: position.anchorBalanceAtOpen ?? null,
    anchorVersionAtOpen: position.anchorVersionAtOpen ?? null,
    // Part B C-1: the maker/taker entry stamps and the trade mode live on the position — copied, not left to defaults
    chosenEntryMode: position.chosenEntryMode ?? null,
    entryFillPolicy: position.entryFillPolicy ?? null,
    entryFeeRate: str(position.entryFeeRate),
    tradeMode: position.tradeMode ?? undefined,
    metadata: { ...(position.metadata ?? {}), ...(pending ? { restoredWhilePending: true } : {}) },
    recordRestoredFromPosition: true,
    restoredAt,
    restoredByClaimed: claimedBy,
  } as any);
  if (result.status === 'exists') {
    return { ok: false, code: 409, error: 'an open trade record appeared for this position while restoring — not restored', recordIds: result.ids };
  }
  const record = result.record;
  // The position now points at its record, so the next close (and P-16 / P-17) resolve it by `tradeId` as well as by key.
  await storage.updateActiveOpenPosition(mode, position.id, { metadata: { ...(position.metadata ?? {}), tradeId: record.id } } as any);
  console.log(`[B-CLOSE-WRITER-COSTS][RECORD_RESTORED:${mode}] ${position.symbol} pos=${position.id}${pending ? ' (pending maker)' : ''} -> record ${record.id} (claimed by ${claimedBy})`);
  return { ok: true, recordId: record.id, positionId: position.id, symbol: position.symbol, pending };
}
