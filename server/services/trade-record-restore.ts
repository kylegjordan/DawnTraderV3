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
 * price, intended entry price, stop, target, the entry fee (into `fees`, where the organic open record holds it, AND into
 * `entry_fee` — which the organic record leaves at its column default until the close update overwrites it from `fees`,
 * so writing it here is harmless), entry slippage, confidence, opened_at, signal/pattern type and strength, source pool,
 * the at-open balance stamps, the maker/taker entry stamps (`chosen_entry_mode`, `entry_fill_policy`, `entry_fee_rate`),
 * `trade_mode`, and the metadata.
 * THE SIX REGIME STAMPS ARE PROMOTED FROM THE POSITION'S METADATA (Langston Part B condition 1): the open path writes the
 * SAME six values (`regimeConfidenceRaw`, `macroModifierValue`, `phase`, `phaseAgeSeconds`, `strategyPhaseWeight`,
 * `regimeConfidenceModulated`) to the record's typed columns AND into the position's metadata, so a restore copies them
 * into their columns — same values, same vintage. A value absent from metadata (null when the MCE context was unavailable
 * at open — measured 2026-11-05: present 19/19, non-null 7/19 for five of them) stays NULL, as it would on the organic row.
 * ⚠️ WHAT IT CANNOT RECOVER (so nobody reads a restored record as a full one): the entry-price provenance set
 * (`entry_price_producer`, `entry_price_source`, `entry_book_age_ms`, `entry_book_consumption_age_ms`,
 * `entry_decision_price`, `entry_observed_at_ms`) and `pair_id_hash` — none of them is on the position, in a column or in
 * its metadata (0/19 measured by Langston, 2026-11-05). They stay NULL, and the restored flag says why.
 * A POSITION WITH NO ENTRY FEE OR SLIPPAGE IS REFUSED (Langston Part B condition 2): a restore copies costs, it never
 * invents them, so a null is a refusal to investigate, not a zero. A fence — 0/19 open positions carried either null.
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

/**
 * STAMP THE RESOLVED RECORD BACK ONTO THE POSITION (Langston Part C NEW-1, folded into Part C). Called wherever a position's
 * open record is resolved BY KEY (symbol, mode, class) — the engine's `_resolveOpenTradeRecord` (close, maker drop) and the
 * stop flow's orphan step. WHY: if that record is then FINISHED and the position's delete fails, the position is left on a
 * finished record; the next cycle finds no OPEN record and the alert points at the restore. The restore's only guard against
 * a finished record is the position's own `tradeId` — so without this stamp it would insert a SECOND record for a trade
 * already booked, and the next close would book a second exit. With it, the restore refuses (409) as designed.
 * Returns false on a failed write (logged, never thrown). The engine's close treats it as best-effort — refusing a close
 * whose record IS resolved would be worse; the stop flow's orphan step fails CLOSED on it (keeps the position, leaves the
 * record open, reports it). Updates the in-memory position too, so the rest of the cycle sees the id. The metadata is a
 * read-modify-write of a column `updateActiveOpenPosition` replaces wholesale — the house convention (the book-state and
 * ladder writers do the same off the same in-memory object), so the stamp is only as fresh as the cycle's fetch.
 */
export async function stampPositionTradeId(mode: TradingMode, position: any, recordId: string): Promise<boolean> {
  const meta = position?.metadata ?? {};
  if (meta.tradeId === recordId) return true;
  try {
    await storage.updateActiveOpenPosition(mode, position.id, { metadata: { ...meta, tradeId: recordId } } as any);
    position.metadata = { ...meta, tradeId: recordId };
    return true;
  } catch (err) {
    console.error(`[B-CLOSE-WRITER-COSTS][TRADEID_STAMP_FAILED:${mode}] ${position?.symbol} pos=${position?.id} record=${recordId}:`, err);
    return false;
  }
}

export type RestoreResult =
  | { ok: true; recordId: string; positionId: string; symbol: string; pending: boolean;
      /** P-14 (Langston Part C record 1): the most recent CLOSED record for the key, so the operator sees a trade booked moments ago. Information, not a gate. */
      latestClosed: { id: string; closedAt: string; closeReason: string | null } | null }
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

  // Part B condition 2: copy the entry costs or refuse — never a fabricated zero (the batch's origin, PHASE_19_PLAN:116).
  if (position.entryFee == null || position.entrySlippage == null) {
    return { ok: false, code: 409, error: 'the position carries no entry fee or slippage — a restore would invent a cost; investigate, do not restore' };
  }

  const pending = position.state === 'pending';
  const str = (v: unknown) => (v == null ? null : String(v));
  // Part B condition 1: the six regime stamps, promoted from the position's metadata (the open path writes the same values
  // to both). Only well-formed values travel; anything else stays NULL, as on an organic row with no MCE context.
  const meta: Record<string, unknown> = position.metadata ?? {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);
  const phase = meta.phase === 'EARLY' || meta.phase === 'PRIME' || meta.phase === 'LATE' ? meta.phase : null;
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
    fees: String(position.entryFee),
    entryFee: String(position.entryFee),
    slippage: String(position.entrySlippage),
    entrySlippage: String(position.entrySlippage),
    regimeConfidenceRaw: num(meta.regimeConfidenceRaw),
    macroModifierValue: num(meta.macroModifierValue),
    phase,
    phaseAgeSeconds: int(meta.phaseAgeSeconds),
    strategyPhaseWeight: num(meta.strategyPhaseWeight),
    regimeConfidenceModulated: num(meta.regimeConfidenceModulated),
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
  });
  if (result.status === 'exists') {
    return { ok: false, code: 409, error: 'an open trade record appeared for this position while restoring — not restored', recordIds: result.ids };
  }
  const record = result.record;
  // P-14 (Langston Part C record 1): name the most recent CLOSED record for the key — best-effort information; a failed
  // read never undoes or blocks the restore that has already happened.
  let latestClosed: { id: string; closedAt: string; closeReason: string | null } | null = null;
  try {
    const lc = await storage.getLatestClosedTradeForKey(mode, position.symbol, cls);
    latestClosed = lc ? { id: lc.id, closedAt: lc.closedAt.toISOString(), closeReason: lc.closeReason } : null;
  } catch (err) {
    console.error(`[B-CLOSE-WRITER-COSTS][RECORD_RESTORED:${mode}] latest-closed read failed (information only):`, err);
  }
  // The position now points at its record, so the next close (and P-16 / P-17) resolve it by `tradeId` as well as by key.
  await storage.updateActiveOpenPosition(mode, position.id, { metadata: { ...(position.metadata ?? {}), tradeId: record.id } } as any);
  console.log(`[B-CLOSE-WRITER-COSTS][RECORD_RESTORED:${mode}] ${position.symbol} pos=${position.id}${pending ? ' (pending maker)' : ''} -> record ${record.id} (claimed by ${claimedBy})`);
  if (latestClosed) {
    console.log(`[B-CLOSE-WRITER-COSTS][RECORD_RESTORED:${mode}] ${position.symbol}: the latest CLOSED record for this key is ${latestClosed.id} (${latestClosed.closeReason ?? 'no reason'}, closed ${latestClosed.closedAt}) — check it is not this same trade`);
  }
  return { ok: true, recordId: record.id, positionId: position.id, symbol: position.symbol, pending, latestClosed };
}
