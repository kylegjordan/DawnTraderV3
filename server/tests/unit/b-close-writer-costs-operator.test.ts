// B-CLOSE-WRITER-COSTS P-10 + P-12 — the operator closes and their remedy, exercised (Langston Part B C-3: the source-text
// checks could not see that a refusal's reason never reached the screen).
//   R-1..R-4  what the two routes send back: every refusal is 200 + success:false + error (the client throws on non-2xx and
//             its onError discards the body); a partial stranded clear carries `error` too.
//   C-1       the client's success handlers really do show `result.error` (the zero-client-change premise, pinned).
//   S-1..S-9  the restore service against a stand-in storage: its four refusals, the success path (fields copied, both fee
//             columns, the restore stamps, the position pointed at its record), the explicit pending-maker branch, and the
//             atomic insert losing a race.
//   S-10..S-12 Langston Part B conditions: a null entry fee or slippage is REFUSED, never a fabricated zero (S-10, S-11);
//             the six regime stamps are promoted from the position's metadata, malformed values staying NULL (S-12).
//   K-1..K-5  Langston Part C NEW-1: a record resolved BY KEY has its id stamped back onto the position (K-1..K-3), at both
//             resolve sites and before the record is finished (K-4), so a later restore refuses instead of double-booking (K-5).
//   O-1..O-2  closeOnePositionByOperator: not found, and the one chain with the operator's tag and 'manual_stop'.
// POSITIVE CONTROLS (mutation-proved while writing): returning 409 for a refusal fails R-2; dropping `error` from the
// partial-clear body fails R-4; omitting chosenEntryMode from the restore fails S-6; the pending branch refusing fails S-8.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const st = vi.hoisted(() => ({
  getActiveOpenPosition: vi.fn(),
  findOpenTradeRecord: vi.fn(),
  getClosedTrade: vi.fn(),
  insertOpenTradeRecordIfNoneOpen: vi.fn(),
  updateActiveOpenPosition: vi.fn(async () => ({})),
}));
vi.mock('../../storage', () => ({ storage: st }));

import { engineNotRunningResponse, manualCloseResponse, closeAllResponse } from '../../services/operator-close-response';
import { restoreOpenTradeRecord, stampPositionTradeId } from '../../services/trade-record-restore';
import { ActivePortfolioManager } from '../../services/active-portfolio-manager';

beforeEach(() => {
  Object.values(st).forEach((f) => f.mockReset());
  st.updateActiveOpenPosition.mockResolvedValue({});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('R — what the operator routes send back', () => {
  it('R-1 engine not running: 200, success false, the remedy in `error`', () => {
    const r = engineNotRunningResponse('close the position');
    expect(r.http).toBe(200);
    expect(r.body).toEqual({ success: false, error: 'Paper trading simulation not running — start the engine, then close the position from Active Trades.' });
  });
  it('R-2 a refused close: 200, success false, the reason in `error`', () => {
    const r = manualCloseResponse('p1', { status: 'left_open', reason: 'close refused by the fill contract or the trade-record check (position still open)', symbol: 'NEM/USD' });
    expect(r.http).toBe(200);
    expect(r.body.success).toBe(false);
    expect(r.body.error).toBe('NEM/USD not closed: close refused by the fill contract or the trade-record check (position still open)');
    expect(manualCloseResponse('p1', { status: 'not_found' }).http).toBe(200);
  });
  it('R-3 a close: 200, success true, a message', () => {
    expect(manualCloseResponse('p1', { status: 'closed', symbol: 'BTC/USD' }).body).toEqual({ success: true, closedTradeId: 'p1', message: 'Closed BTC/USD position' });
  });
  it('R-4 a partial close-all carries the message in `error` (KD-45 fold; the client failure branch reads `error`)', () => {
    const r = closeAllResponse({ closed: 4, leftOpen: 1, failed: 0 });
    expect(r.http).toBe(200);
    expect(r.body.success).toBe(false);
    expect(r.body.error).toBe('Closed 4; 1 left open (no observed price, or the close was refused — each one is alerted), 0 failed');
    expect(closeAllResponse({ closed: 3, leftOpen: 0, failed: 0 }).body).toEqual({ success: true, closed: 3, leftOpen: 0, failed: 0, message: 'All positions closed (3)' });
  });
});

describe('C — the client premise', () => {
  it('C-1 both Active Trades success handlers show result.error on success:false', () => {
    const src = readFileSync(resolve(__dirname, '../../../client/src/components/trading/paper-open-trades-tab.tsx'), 'utf8');
    const close = src.slice(src.indexOf('const closeTradeMutation'), src.indexOf('const closeAllMutation'));
    const clear = src.slice(src.indexOf('const closeAllMutation'), src.indexOf('const resetSessionMutation'));
    expect(clear).toContain("apiFetch('/api/active-engine/close-all'");   // KD-45: the banner button calls close-all
    expect(src).not.toContain('force-clear-stranded');
    for (const block of [close, clear]) {
      expect(block).toMatch(/onSuccess: \(result: any\) =>/);
      expect(block).toMatch(/description: result\?\.error \|\|/);
    }
  });
});

const POSITION = {
  id: 'pos-1', symbol: 'ETH/USD', assetClass: 'crypto_spot', exchange: 'kraken', strategyName: 'momentum', side: 'buy',
  quantity: '0.5', avgPrice: '2000', intendedEntryPrice: '1999', stopLoss: '1900', takeProfit: '2200', entryFee: '4',
  entrySlippage: '0.2', confidence: '61', openedAt: new Date('2026-11-05T10:00:00Z'), signalType: 'QUANT', patternType: null,
  patternStrength: null, sourcePool: 'quant', balanceRatioAtOpen: '0.1', anchorBalanceAtOpen: '3000', anchorVersionAtOpen: 9,
  chosenEntryMode: 'taker', entryFillPolicy: 'walk', entryFeeRate: '0.004', tradeMode: 'TRAILING_TAKE', state: 'open',
  metadata: { tradeId: 'gone-1', origin: 'x' },
};

describe('D — the Close All button sits behind its confirm (Langston KD-45 fold, condition 2)', () => {
  it('D-1 the button is the dialog trigger, and onCloseAll is wired ONLY to the dialog action', () => {
    const src = readFileSync(resolve(__dirname, '../../../client/src/components/trading/paper-open-trades-tab.tsx'), 'utf8');
    const open = src.indexOf('<AlertDialogTrigger asChild>');
    const close = src.indexOf('</AlertDialogTrigger>', open);
    const btn = src.indexOf('data-testid="button-close-all"');
    expect(open).toBeGreaterThan(0);
    expect(btn).toBeGreaterThan(open);
    expect(close).toBeGreaterThan(btn);
    expect(src.match(/onClick=\{onCloseAll\}/g)?.length).toBe(1);
    expect(src).toContain('<AlertDialogAction onClick={onCloseAll}>');
  });
});

describe('S — the restore service', () => {
  it('S-1 position not found → 404', async () => {
    st.getActiveOpenPosition.mockResolvedValue(undefined);
    expect(await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a')).toMatchObject({ ok: false, code: 404 });
  });
  it('S-2 no valid asset class → 409, no lookup', async () => {
    st.getActiveOpenPosition.mockResolvedValue({ ...POSITION, assetClass: 'nope' });
    expect(await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a')).toMatchObject({ ok: false, code: 409 });
    expect(st.findOpenTradeRecord).not.toHaveBeenCalled();
  });
  it('S-3 an open record exists → 409 naming it, nothing inserted', async () => {
    st.getActiveOpenPosition.mockResolvedValue(POSITION);
    st.findOpenTradeRecord.mockResolvedValue({ status: 'one', record: { id: 'r-1' } });
    expect(await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a')).toMatchObject({ ok: false, code: 409, recordId: 'r-1' });
    expect(st.insertOpenTradeRecordIfNoneOpen).not.toHaveBeenCalled();
  });
  it('S-4 several open records → 409 naming them', async () => {
    st.getActiveOpenPosition.mockResolvedValue(POSITION);
    st.findOpenTradeRecord.mockResolvedValue({ status: 'many', ids: ['a', 'b'], more: false });
    expect(await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a')).toMatchObject({ ok: false, code: 409, recordIds: ['a', 'b'] });
  });
  it('S-5 the position\'s own tradeId record exists (not open) → 409', async () => {
    st.getActiveOpenPosition.mockResolvedValue(POSITION);
    st.findOpenTradeRecord.mockResolvedValue({ status: 'none' });
    st.getClosedTrade.mockResolvedValue({ id: 'gone-1', closedAt: new Date() });
    expect(await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a')).toMatchObject({ ok: false, code: 409, recordId: 'gone-1' });
    expect(st.insertOpenTradeRecordIfNoneOpen).not.toHaveBeenCalled();
  });
  it('S-6 success: the open-time fields copied (incl. the maker/taker stamps and trade mode), both fee columns, the stamps', async () => {
    st.getActiveOpenPosition.mockResolvedValue(POSITION);
    st.findOpenTradeRecord.mockResolvedValue({ status: 'none' });
    st.getClosedTrade.mockResolvedValue(undefined);
    st.insertOpenTradeRecordIfNoneOpen.mockResolvedValue({ status: 'inserted', record: { id: 'new-1' } });
    const r = await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a');
    expect(r).toMatchObject({ ok: true, recordId: 'new-1', pending: false });
    const [mode, sym, cls, rec] = st.insertOpenTradeRecordIfNoneOpen.mock.calls[0] as [string, string, string, Record<string, unknown>];
    expect([mode, sym, cls]).toEqual(['paper', 'ETH/USD', 'crypto_spot']);
    expect(rec).toMatchObject({
      entryPrice: '2000', actualEntryPrice: '2000', intendedEntryPrice: '1999', fees: '4', entryFee: '4', slippage: '0.2', entrySlippage: '0.2',
      chosenEntryMode: 'taker', entryFillPolicy: 'walk', entryFeeRate: '0.004', tradeMode: 'TRAILING_TAKE',
      recordRestoredFromPosition: true, restoredByClaimed: 'cc-a',
    });
    expect(rec).not.toHaveProperty('exitPrice');
    expect(rec).not.toHaveProperty('closedAt');
  });
  it('S-7 success points the position at its new record', async () => {
    st.getActiveOpenPosition.mockResolvedValue(POSITION);
    st.findOpenTradeRecord.mockResolvedValue({ status: 'none' });
    st.insertOpenTradeRecordIfNoneOpen.mockResolvedValue({ status: 'inserted', record: { id: 'new-1' } });
    await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a');
    expect(st.updateActiveOpenPosition).toHaveBeenCalledWith('paper', 'pos-1', { metadata: { tradeId: 'new-1', origin: 'x' } });
  });
  it('S-8 a PENDING maker is restored explicitly (no fill asserted; its zero fee is legitimate), flagged in metadata', async () => {
    st.getActiveOpenPosition.mockResolvedValue({ ...POSITION, state: 'pending', entryFee: '0', entrySlippage: '0', metadata: {} });
    st.findOpenTradeRecord.mockResolvedValue({ status: 'none' });
    st.insertOpenTradeRecordIfNoneOpen.mockResolvedValue({ status: 'inserted', record: { id: 'new-2' } });
    const r = await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a');
    expect(r).toMatchObject({ ok: true, pending: true });
    const rec = st.insertOpenTradeRecordIfNoneOpen.mock.calls[0][3] as Record<string, any>;
    expect(rec.metadata).toEqual({ restoredWhilePending: true });
    expect(rec.entryFee).toBe('0');
  });
  it('S-9 the atomic insert finds a record appeared meanwhile → 409, the position not repointed', async () => {
    st.getActiveOpenPosition.mockResolvedValue(POSITION);
    st.findOpenTradeRecord.mockResolvedValue({ status: 'none' });
    st.insertOpenTradeRecordIfNoneOpen.mockResolvedValue({ status: 'exists', ids: ['raced-1'] });
    expect(await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a')).toMatchObject({ ok: false, code: 409, recordIds: ['raced-1'] });
    expect(st.updateActiveOpenPosition).not.toHaveBeenCalled();
  });
  it('S-10 a position with no entry fee → 409, nothing inserted (no invented zero)', async () => {
    st.getActiveOpenPosition.mockResolvedValue({ ...POSITION, entryFee: null });
    st.findOpenTradeRecord.mockResolvedValue({ status: 'none' });
    st.getClosedTrade.mockResolvedValue(undefined);
    expect(await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a')).toMatchObject({ ok: false, code: 409 });
    expect(st.insertOpenTradeRecordIfNoneOpen).not.toHaveBeenCalled();
  });
  it('S-11 a position with no entry slippage → 409, nothing inserted', async () => {
    st.getActiveOpenPosition.mockResolvedValue({ ...POSITION, entrySlippage: undefined });
    st.findOpenTradeRecord.mockResolvedValue({ status: 'none' });
    st.getClosedTrade.mockResolvedValue(undefined);
    expect(await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a')).toMatchObject({ ok: false, code: 409 });
    expect(st.insertOpenTradeRecordIfNoneOpen).not.toHaveBeenCalled();
  });
  it('S-12 the six regime stamps are promoted from metadata; malformed or absent values stay NULL', async () => {
    st.getActiveOpenPosition.mockResolvedValue({ ...POSITION, metadata: {
      regimeConfidenceRaw: 0.71, macroModifierValue: 1.05, phase: 'PRIME', phaseAgeSeconds: 420,
      strategyPhaseWeight: 0.9, regimeConfidenceModulated: 0.64,
    } });
    st.findOpenTradeRecord.mockResolvedValue({ status: 'none' });
    st.getClosedTrade.mockResolvedValue(undefined);
    st.insertOpenTradeRecordIfNoneOpen.mockResolvedValue({ status: 'inserted', record: { id: 'new-3' } });
    await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a');
    expect(st.insertOpenTradeRecordIfNoneOpen.mock.calls[0][3]).toMatchObject({
      regimeConfidenceRaw: 0.71, macroModifierValue: 1.05, phase: 'PRIME', phaseAgeSeconds: 420,
      strategyPhaseWeight: 0.9, regimeConfidenceModulated: 0.64,
    });
    st.insertOpenTradeRecordIfNoneOpen.mockClear();
    st.getActiveOpenPosition.mockResolvedValue({ ...POSITION, metadata: { macroModifierValue: 1.0, phase: 'BOGUS', phaseAgeSeconds: 1.5 } });
    await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a');
    expect(st.insertOpenTradeRecordIfNoneOpen.mock.calls[0][3]).toMatchObject({
      regimeConfidenceRaw: null, macroModifierValue: 1.0, phase: null, phaseAgeSeconds: null,
      strategyPhaseWeight: null, regimeConfidenceModulated: null,
    });
  });
});

describe('K — the record id is stamped back when a record resolves by key (Langston Part C NEW-1)', () => {
  it('K-1 a position without the id: written to storage and to the in-memory position', async () => {
    const pos: any = { id: 'pos-1', symbol: 'ETH/USD', metadata: { origin: 'x' } };
    expect(await stampPositionTradeId('paper', pos, 'rec-9')).toBe(true);
    expect(st.updateActiveOpenPosition).toHaveBeenCalledWith('paper', 'pos-1', { metadata: { origin: 'x', tradeId: 'rec-9' } });
    expect(pos.metadata.tradeId).toBe('rec-9');
  });
  it('K-2 already stamped with the same id: no write', async () => {
    expect(await stampPositionTradeId('paper', { id: 'pos-1', metadata: { tradeId: 'rec-9' } }, 'rec-9')).toBe(true);
    expect(st.updateActiveOpenPosition).not.toHaveBeenCalled();
  });
  it('K-3 a failed write is logged and returns false — it never throws into the close', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    st.updateActiveOpenPosition.mockRejectedValue(new Error('db down'));
    await expect(stampPositionTradeId('paper', { id: 'pos-1', metadata: {} }, 'rec-9')).resolves.toBe(false);
  });
  it('K-4 both key-resolve sites stamp, and the stop flow stamps BEFORE finishing the record', () => {
    const eng = readFileSync(resolve(__dirname, '../../services/active-execution-engine.ts'), 'utf8');
    const resolver = eng.slice(eng.indexOf('private async _resolveOpenTradeRecord'), eng.indexOf('private async _refuseUnresolvedRecord'));
    expect(resolver).toContain('await stampPositionTradeId(this.mode, position, rec.record.id);');
    const svc = readFileSync(resolve(__dirname, '../../services/active-engine-service.ts'), 'utf8');
    const stamp = svc.indexOf("await stampPositionTradeId('paper', orphan, _orec.id);");
    const finish = svc.indexOf("closeStaleRecordAtReference('paper', _orec)");
    expect(stamp).toBeGreaterThan(0);
    expect(finish).toBeGreaterThan(stamp);
  });
  it('K-5 the composed path: a stamped position whose record was finished is REFUSED by the restore, nothing inserted', async () => {
    st.getActiveOpenPosition.mockResolvedValue({ ...POSITION, metadata: { tradeId: 'rec-9' } });
    st.findOpenTradeRecord.mockResolvedValue({ status: 'none' });
    st.getClosedTrade.mockResolvedValue({ id: 'rec-9', closedAt: new Date() });
    expect(await restoreOpenTradeRecord('paper', 'pos-1', 'cc-a')).toMatchObject({ ok: false, code: 409, recordId: 'rec-9' });
    expect(st.insertOpenTradeRecordIfNoneOpen).not.toHaveBeenCalled();
  });
});

describe('O — closeOnePositionByOperator', () => {
  type Mgr = { mode: string; _flattenOne: ReturnType<typeof vi.fn>; closeOnePositionByOperator: (id: string, tag: string) => Promise<unknown> };
  const proto = ActivePortfolioManager.prototype as unknown as Mgr;
  it('O-1 a position that is gone → not_found, no close attempted', async () => {
    const fake = { mode: 'paper', _flattenOne: vi.fn() };
    st.getActiveOpenPosition.mockResolvedValue(undefined);
    expect(await proto.closeOnePositionByOperator.call(fake, 'pos-1', 'manual_close')).toEqual({ status: 'not_found' });
    expect(fake._flattenOne).not.toHaveBeenCalled();
  });
  it('O-2 the one chain: _flattenOne(position, tag, manual_stop), its outcome returned with the symbol', async () => {
    const fake = { mode: 'paper', _flattenOne: vi.fn(async () => ({ status: 'left_open', reason: 'r' })) };
    st.getActiveOpenPosition.mockResolvedValue(POSITION);
    expect(await proto.closeOnePositionByOperator.call(fake, 'pos-1', 'manual_close')).toEqual({ status: 'left_open', reason: 'r', symbol: 'ETH/USD' });
    expect(fake._flattenOne).toHaveBeenCalledWith(POSITION, 'manual_close', 'manual_stop');
  });
});
