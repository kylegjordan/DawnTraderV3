// B-CLOSE-WRITER-COSTS P-14 — no cost is left to a column default, and none is invented.
//   P14-1  the open-time record writes its entry fee and entry slippage explicitly (the DEFAULT 0s go in the next deploy).
//   P14-2  a never-filled maker writes an explicit 0 into every cost and P&L column — not a default, and not the
//          placement-time fee estimate the open record carried in `fees` (186/186 never-filled rows, measured 2026-11-06).
//   P14-3  a filled close whose position carries no entry fee or slippage is REFUSED with its own alert — the old
//          fallback recomputed a fee from the taker rate and treated a missing slippage as 0.
// Source fences: the engine's open, drop and close are not unit-constructible; the behavioural legs are in the stop-cleanup
// suite (C-2, C-5) and the operator suite (L-1, L-2). Mutation-proved while writing (see the change list).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENGINE = readFileSync(resolve(__dirname, '../../services/active-execution-engine.ts'), 'utf8');
const MONEY = ['fees', 'slippage', 'entryFee', 'exitFee', 'totalFee', 'entrySlippage', 'exitSlippage', 'totalCost', 'grossPnl', 'netPnl', 'netPnlPercent'];

describe('B-CLOSE-WRITER-COSTS P-14', () => {
  it('P14-1 the open-time record writes entryFee and entrySlippage explicitly', () => {
    const at = ENGINE.indexOf('const trade = await storage.createClosedTrade(this.mode, {');
    expect(at).toBeGreaterThan(0);
    const payload = ENGINE.slice(at, ENGINE.indexOf('openedAt: new Date(),', at));
    expect(payload).toContain('entryFee: entryFee.toString(),');
    expect(payload).toContain('entrySlippage: totalSlippage.toString(),');
  });

  it('P14-2 the never-filled close writes an explicit 0 into all eleven cost and P&L columns', () => {
    const at = ENGINE.indexOf("closeReason: 'never_filled', // TYPED discriminator");
    expect(at).toBeGreaterThan(0);
    const block = ENGINE.slice(at, ENGINE.indexOf('} as any);', at));
    for (const col of MONEY) expect(block).toMatch(new RegExp(`\\b${col}: '0'`));
  });

  it('P14-3 a missing entry cost on the position falls back to the open RECORD (loudly); refused only when BOTH lack it', () => {
    expect(ENGINE).not.toContain('(entryValue * (_b45FeePct / 100))');
    expect(ENGINE).not.toContain("position.entrySlippage ? parseFloat(position.entrySlippage) : 0");
    const start = ENGINE.indexOf('let entryFee = _num(position.entryFee);');
    const feeFb = ENGINE.indexOf("entryFee = _num((trade as any).fees); _fromRecord.push('entry fee');", start);
    const slipFb = ENGINE.indexOf("entrySlippage = _num((trade as any).slippage); _fromRecord.push('entry slippage');", start);
    const refuse = ENGINE.indexOf('await this._refuseMissingEntryCost(position, trade.id,', start);
    const warn = ENGINE.indexOf('if (_fromRecord.length) await this._warnEntryCostFromRecord(position, trade.id, _fromRecord);', start);
    const pnl = ENGINE.indexOf('const { grossPnl, totalCost, netPnl, netPnlPercent } = computeRealizedPnl({', start);
    expect(start).toBeGreaterThan(0);
    // the fallback runs BEFORE the refusal, so a refusal means neither source had it; the warning before the P&L
    expect(feeFb).toBeGreaterThan(start);
    expect(slipFb).toBeGreaterThan(start);
    expect(refuse).toBeGreaterThan(Math.max(feeFb, slipFb));
    expect(warn).toBeGreaterThan(refuse);
    expect(pnl).toBeGreaterThan(warn);
    // the refusal's own alert — not the restore remedy, which is for an unresolvable RECORD
    const fn = ENGINE.slice(ENGINE.indexOf('private async _refuseMissingEntryCost('), ENGINE.indexOf('private async _refuseUnresolvedRecord('));
    expect(fn).toContain('dedupe_key: `close-entry-cost-missing-${this.mode}-${position.symbol}`');
    expect(fn).toContain('do NOT restore it');
    const w = ENGINE.slice(ENGINE.indexOf('private async _warnEntryCostFromRecord('), ENGINE.indexOf('private async _refuseMissingEntryCost('));
    expect(w).toContain('dedupe_key: `close-entry-cost-from-record-${this.mode}-${position.symbol}`');
  });
});
