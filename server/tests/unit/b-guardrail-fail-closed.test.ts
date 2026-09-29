/**
 * B-GUARDRAIL-FAIL-CLOSED (#1081, row 4.a) — A PRE-TRADE RISK CHECK THAT THROWS REFUSES THE TRADE.
 *
 * Plan: `Scope Files/B_GUARDRAIL_FAIL_CLOSED_PRE_AUDIT.md` (Step 2 cleared by Langston, conditions carried).
 * The cooldown and total-exposure checks used to return `{ ok: true }` from their catch. These tests drive the REAL
 * gate, `checkGuardrailRisk`, with only its data boundaries stubbed, and make the fault happen WHERE A REAL ONE WOULD:
 * the cooldown's guardrail read and the exposure check's balance read (Langston C3: never by stubbing the check).
 * They assert the CODE, not just `ok: false`, because `recordBlock` feeds `result.code` into the RTB metrics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const _faults = { guardrailsRead: null as Error | null, balanceRead: null as Error | null };

vi.mock('../../storage', () => ({
  storage: {
    getGuardrailsV2: async () => {
      if (_faults.guardrailsRead) throw _faults.guardrailsRead;
      return { symbolCooldownMinutes: 0 };
    },
    getActiveOpenPositions: async () => [],
    getActiveTrades: async () => [],
    getClosedTradesPaginated: async () => ({ trades: [], total: 0 }),
    getTrades: async () => [],
  },
}));
vi.mock('../../services/guardrail-settings', () => ({
  buildSettingsFromGuardrails: async () => ({
    killSwitchTripped: false, portfolioValue: 1000, maxPositionPercent: 20, maxOpenTrades: 20, maxTotalExposurePct: 100, riskPerTradePct: 4,
  }),
  getRiskPercentageV2: async () => 4,
  calculateRiskAmount: (v: number, p: number) => (v * p) / 100,
  getPortfolioBalanceV2: async () => {
    if (_faults.balanceRead) throw _faults.balanceRead;
    return 1000;
  },
}));
vi.mock('../../services/aj16-rtb-diagnostic', () => ({
  aj16Diagnostic: { getCycleId: () => 'c1', logCooldownCheck: () => {}, logGuardrailBlock: () => {} },
}));
vi.mock('../../services/aj19-max-position-diagnostic', () => ({
  aj19Diagnostic: { isActive: () => false, isDryRunMode: () => false, logCheck: () => {} },
}));
vi.mock('../../services/b4-diagnostics.js', () => ({ b4Diagnostics: { logMaxPositionCheck: () => {}, logFunnelEvent: () => {} } }));
vi.mock('../../services/b5-sizing-audit.js', () => ({ b5SizingAudit: { logGuardrailCheck: () => {} } }));
vi.mock('../../services/i1-rtb-diagnostics-service.js', () => ({ i1RtbDiagnostics: { recordAttempt: () => {}, recordBlock: () => {} } }));
vi.mock('../../services/active-engine-service.js', () => ({ getGlobalActiveEngineManager: () => null }));
vi.mock('../../services/risk-concentration.js', () => ({
  isCorrelatedExposure: () => false,
  riskConcentrationAnalyzer: { updatePositionWeights: () => {} },
}));
vi.mock('../../services/module-constants-service.js', () => ({ getCachedNumberRequired: () => 5 }));
vi.mock('../../services/fx-conversion-service.js', () => ({ fxConversionService: { requiresConversion: () => false, parseSymbol: () => ({}) } }));
vi.mock('../../services/market-data', () => ({ marketDataService: { getMarketData: async () => ({}) } }));

import { checkGuardrailRisk } from '../../services/trade-safety';
import { rtbMetricsService } from '../../services/rtb-metrics-service';

const trade = { symbol: 'ETH/USD', entryPrice: 2000, stopPrice: 1950, targetPrice: 2100, strategy: 'breakout', preComputedNotional: 150 };

beforeEach(() => {
  _faults.guardrailsRead = null;
  _faults.balanceRead = null;
  rtbMetricsService.reset();
});

describe('#1081 — a check that throws refuses, with the fail-closed code', () => {
  // CONTROL: with no fault the gate passes, so the refusals below are the fault's doing, not a mis-set fixture.
  it('CONTROL — no fault: every check passes', async () => {
    const r = await checkGuardrailRisk('paper', trade);
    expect(r.ok).toBe(true);
  });

  // MUTATION: put `return { ok: true }` back in the cooldown catch and this fails.
  it('the cooldown check refuses when its guardrail read throws', async () => {
    _faults.guardrailsRead = new Error('connection terminated');
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await checkGuardrailRisk('paper', trade);
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe('GUARDRAIL_READ_FAIL');
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain('[B-GUARDRAIL-FAIL-CLOSED][CHECK_THREW check=COOLDOWN mode=paper]');
    warn.mockRestore();
  });

  // MUTATION: put `return { ok: true }` back in the exposure catch and this fails.
  it('the total-exposure check refuses when its balance read throws', async () => {
    _faults.balanceRead = new Error('statement timeout');
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await checkGuardrailRisk('paper', trade);
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe('GUARDRAIL_READ_FAIL');
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('[8.8.3-B3][MAX_TOTAL_EXPOSURE_ERROR]');
    expect(logged).toContain('[B-GUARDRAIL-FAIL-CLOSED][CHECK_THREW check=MAX_TOTAL_EXPOSURE mode=paper]');
    warn.mockRestore();
  });

  // MUTATION: drop the metrics list entry and this fails — the refusal would be counted as OTHER.
  it('the refusal is counted under its own name in the RTB metrics', async () => {
    _faults.balanceRead = new Error('statement timeout');
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    await checkGuardrailRisk('paper', trade);
    warn.mockRestore();
    const s = rtbMetricsService.getStats();
    expect(s.blockedByReason.GUARDRAIL_READ_FAIL).toBe(1);
    expect(s.blockedByReason.OTHER).toBe(0);
  });
});

describe('#1081 — the class, not the instance: every TradeSafetyResultCode is counted under its own name', () => {
  // Langston's Step-2 condition: two codes (GUARDRAIL_READ_FAIL, CORRELATION_EXPOSURE) were missing, and the lists are
  // hand-maintained array literals that tsc does not check for exhaustiveness. The members are read from the type's
  // own declaration (comments stripped), so a new code added to the union without the lists fails here.
  const src = readFileSync(join(process.cwd(), 'server/services/trade-safety.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const block = src.slice(src.indexOf('export type TradeSafetyResultCode ='), src.indexOf('export type TradeSafetyResult ='))
    .replace(/\/\/[^\n]*/g, '');
  const codes = [...block.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);

  // B-SIZING-DEC-RESTORE obj-4: 17 -> 16, MAX_TRADES left the union with the retired open-slots check.
  it('the type declares the expected number of members (the parser is not reading nothing)', () => {
    expect(codes.length).toBe(16);
    expect(codes).not.toContain('MAX_TRADES');
  });

  // Langston Step-4 NIT-2: the round-trip below proves `normalizeBlockReason`'s list only, because `recordBlock` does
  // `(… || 0) + 1`. `initializeBlockReasons` is fenced here: a code missing from it would VANISH from the breakdown
  // instead of showing 0. MUTATION: drop a code from `initializeBlockReasons` alone and this fails.
  it('every code is present, at 0, in a freshly reset breakdown', () => {
    rtbMetricsService.reset();
    const byReason = rtbMetricsService.getStats().blockedByReason as Record<string, number>;
    for (const c of codes) expect(byReason[c], c).toBe(0);
  });

  it.each(codes)('%s is counted under its own name, not OTHER', (code) => {
    rtbMetricsService.reset();
    rtbMetricsService.recordBlock('X/USD', 'breakout', code);
    const s = rtbMetricsService.getStats();
    expect(s.blockedByReason[code as keyof typeof s.blockedByReason]).toBe(1);
    expect(s.blockedByReason.OTHER).toBe(0);
  });
});
