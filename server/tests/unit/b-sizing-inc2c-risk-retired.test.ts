/**
 * B-SIZING-DEC-RESTORE increment 2c — Portfolio Risk per Trade RETIRED, in paper AND live (PRE_AUDIT §17, Langston §17.4).
 *
 *   1. ONE trade-size formula (balance × exposure % × max position % × buffer): the sizer, the band monitor, the
 *      max-position check's missing-notional branch and the validator's estimate all use it (P-4, P-5).
 *   2. The execution engine takes the fixed-notional quantity in EVERY mode and never re-sizes by risk ÷ stop — the live
 *      arm that sized `balance × risk% ÷ stop distance` (200% of the balance at a 2% stop, nothing re-checking) is gone,
 *      and an unsized signal is REFUSED (P-1). Proved at the source: `executeSimulatedTrade` needs the full engine to run.
 *      ⚠️ SCOPE: this engine only. It is started in paper only today; live mode opens through the legacy TradingEngine
 *      (`trading-engine.ts`, $100 ÷ stop, Phase-21-gated, sprint row 79), which this file does not read.
 *   3. The call-graph fact P-1 rests on (§17.4 C2): the only call into `executeSimulatedTrade` is in `processSignal`, AFTER
 *      the B6 sizing block — so an upstream-unsized signal is sized by the same sizer before it can reach the refusal.
 *   4. The execution audit records the real balance and the dollars the FILLED position risks (P-2, §17.4 C3).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

vi.mock('../../services/system-alerts.js', () => ({ addAlert: vi.fn(async () => ({ id: 'test-alert' })) }));
vi.mock('../../services/module-constants-service.js', () => ({ getCachedNumberRequired: vi.fn(() => 0.97) }));

import { tradeNotional, bufferedTradeNotional, sizeActivePositionForSignal } from '../../services/active-position-sizing.js';
import { evaluatePaperSizeBand } from '../../services/paper-size-band.js';

const REPO = resolve(__dirname, '../../..');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = (rel: string) => stripComments(readFileSync(join(REPO, rel), 'utf-8'));

describe('1 — one trade-size formula', () => {
  it('tradeNotional = balance × e × p × buffer ($3,000 × 100% × 5% × 0.97 = $145.50)', () => {
    expect(tradeNotional(3000, 100, 5, 0.97)).toBeCloseTo(145.5, 10);
  });

  it('bufferedTradeNotional is the same formula with the DB buffer (0.97 here)', () => {
    expect(bufferedTradeNotional(3000, 100, 5)).toBeCloseTo(tradeNotional(3000, 100, 5, 0.97), 10);
  });

  // MUTATION: give the sizer its own arithmetic that drifts from the shared formula and this fails.
  it('the sizer sizes exactly the shared formula (no covariance, quant pool)', () => {
    const r = sizeActivePositionForSignal({
      mode: 'paper', portfolioValue: 3000, entryPrice: 100, stopPrice: 97, symbol: 'ZZZ/USD',
      strategy: 'breakout' as any, assetClass: 'crypto_spot' as any,
      guardrails: { maxPositionPercentPct: '5.00', maxTotalExposurePct: '100.00' } as any,
    });
    expect(r.estimatedValue).toBeCloseTo(bufferedTradeNotional(3000, 100, 5), 6);
  });

  it('the band monitor uses the same formula', () => {
    const v = evaluatePaperSizeBand({ balance: 3000, e: 100, p: 5, buffer: 0.97 }, { low: 140, high: 150, target: 145 });
    expect(v.size).toBeCloseTo(tradeNotional(3000, 100, 5, 0.97), 10);
  });

  it('the max-position check and the validator size an unsized candidate through the shared helper', () => {
    expect(code('server/services/trade-safety.ts')).toContain('bufferedTradeNotional(portfolioValue, maxTotalExposurePct, maxPositionPercent)');
    expect(code('server/services/pre-execution-validator.ts')).toContain('bufferedTradeNotional(portfolioValue, maxTotalExposurePct, maxPositionPct)');
  });
});

describe('2 — the engine never re-sizes by risk ÷ stop, in any mode', () => {
  const engine = code('server/services/active-execution-engine.ts');

  // MUTATION: restore the paper-only condition and live would again discard the fixed-notional quantity.
  it('no mode-conditioned choice of quantity', () => {
    expect(engine).not.toMatch(/this\.mode\s*===\s*'paper'\s*&&\s*signal\.quantity/);
  });

  // Wording-independent (the object-round reader: the regex above catches only the ORIGINAL condition's text). Inside
  // executeSimulatedTrade the quantity is declared ONCE from the signal and reassigned in exactly two places — the venue
  // lot rounding and the depth-walk fill. Any re-size, however it is written, adds an assignment and fails here.
  it('executeSimulatedTrade sets quantity once from the signal and reassigns it only for lot rounding and the fill', () => {
    const start = engine.indexOf('private async executeSimulatedTrade(');
    expect(start).toBeGreaterThan(-1);
    const rest = engine.slice(start + 1);
    const next = rest.search(/\n  (private |public |protected )?(async )?[A-Za-z_]+\s*\(/);
    const body = next === -1 ? rest : rest.slice(0, next);
    expect(body.match(/\blet quantity\b[^;]*;/g)).toEqual(['let quantity: number = signal.quantity ?? 0;']);
    const assigns = (body.match(/^[^\S\n]*(?:if \([^\n]*\)[^\S\n]*)?quantity\s*(?:[-+*/]?=)(?!=)[^;\n]*;/gm) ?? []).map((s) => s.trim());
    expect(assigns).toEqual([
      'if (_venueQty !== null) quantity = _venueQty.quantity;',
      'quantity = _openFill.fillQty;',
    ]);
  });

  it('no risk ÷ stop sizing, no risk %, no silent 4.0', () => {
    expect(engine).not.toContain('riskAmount / stopDistance');
    expect(engine).not.toContain('riskPerTradePct');
    expect(engine).not.toContain("|| '4.0'");
  });

  it('an unsized signal is REFUSED as SIZING_INVALID at execution', () => {
    expect(engine).toContain('[B-SIZING-DEC-RESTORE][UNSIZED_AT_EXECUTION:');
    expect(engine).toMatch(/if \(!\(quantity > 0\)\) \{[\s\S]{0,800}stage: 'SIZING_INVALID'/);
  });
});

describe('3 — the call graph P-1 rests on (§17.4 C2)', () => {
  const engine = code('server/services/active-execution-engine.ts');

  it('executeSimulatedTrade has exactly one caller, inside processSignal, after the B6 sizing block', () => {
    const calls = engine.match(/this\.executeSimulatedTrade\(/g) ?? [];
    expect(calls.length).toBe(1);
    const start = engine.indexOf('async processSignal(signal: StrategySignal)');
    const b6 = engine.indexOf('[B6][FALLBACK_SIZING]', start);
    const call = engine.indexOf('this.executeSimulatedTrade(', start);
    expect(start).toBeGreaterThan(-1);
    expect(b6).toBeGreaterThan(start);
    expect(call).toBeGreaterThan(b6);
  });
});

describe('4 — the execution audit records the truth (P-2, C3)', () => {
  const engine = code('server/services/active-execution-engine.ts');

  it('risk_amount = the FILLED quantity × |fill price − stop|; the balance is the working balance', () => {
    expect(engine).toContain('riskAmount: (quantity * Math.abs(actualEntryPrice - signal.stopPrice)).toFixed(2)');
    expect(engine).toContain('const portfolioValue = await getPortfolioBalanceV2(this.mode);');
    // the quantity at the audit write IS the fill's: it is re-set from the depth-walk before the write
    const refill = engine.indexOf('quantity = _openFill.fillQty;');
    const audit = engine.indexOf('riskAmount: (quantity * Math.abs(actualEntryPrice - signal.stopPrice))');
    expect(refill).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(refill);
  });

  it('the never-passed cycleContext parameter is gone (it zeroed the audit on every paper open)', () => {
    expect(engine).not.toContain('cycleContext');
  });
});
