/**
 * B-SIZING-DEC-RESTORE increment 2b (#1093) — THE SYMBOL COOLDOWN MATCHES THE EXACT SYMBOL, IN ITS OWN ASSET CLASS.
 *
 * The paper cooldown used to find "the last close" through the Closed Trades search box's SUBSTRING filter, so a check
 * for C/USD also matched LTC/USD, and DASH/USD exists in both classes (the Dash coin and DoorDash). These tests drive
 * the REAL gate, `checkGuardrailRisk`, with the storage boundary stubbed, and pin the resolved close time the check
 * acted on (Langston condition 4) — captured from the diagnostic it logs — not just the verdict.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const _cooldown = { lastClosedAt: null as Date | null, calls: [] as Array<[string, string, string | null]> };
const _aj16 = { checks: [] as any[] };

vi.mock('../../storage', () => ({
  storage: {
    getGuardrailsV2: async () => ({ symbolCooldownMinutes: 5 }),
    getLastClosedAtForSymbol: async (mode: string, symbol: string, assetClass: string | null) => {
      _cooldown.calls.push([mode, symbol, assetClass]);
      return _cooldown.lastClosedAt;
    },
    getActiveOpenPositions: async () => [],
    getActiveTrades: async () => [],
    getClosedTradesPaginated: async () => { throw new Error('the cooldown must not use the substring search reader'); },
    getTrades: async () => [],
  },
}));
vi.mock('../../services/guardrail-settings', () => ({
  buildSettingsFromGuardrails: async () => ({
    killSwitchTripped: false, portfolioValue: 1000, maxPositionPercent: 20, maxOpenTrades: 20, maxTotalExposurePct: 100, riskPerTradePct: 4,
  }),
  getRiskPercentageV2: async () => 4,
  calculateRiskAmount: (v: number, p: number) => (v * p) / 100,
  getPortfolioBalanceV2: async () => 1000,
}));
vi.mock('../../services/aj16-rtb-diagnostic', () => ({
  aj16Diagnostic: {
    getCycleId: () => 'c1',
    logCooldownCheck: (x: any) => { _aj16.checks.push(x); },
    logGuardrailBlock: () => {},
  },
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

const trade = (symbol: string, assetClass?: string) => ({
  symbol, entryPrice: 100, stopPrice: 97, targetPrice: 105, strategy: 'breakout', preComputedNotional: 150,
  ...(assetClass ? { assetClass } : {}),
}) as any;

beforeEach(() => {
  _cooldown.lastClosedAt = null;
  _cooldown.calls = [];
  _aj16.checks = [];
});

describe('#1093 — the cooldown asks for the EXACT symbol, in the trade\'s own class', () => {
  it('the read is called with the exact symbol and the asset class, never the substring reader', async () => {
    await checkGuardrailRisk('paper', trade('C/USD', 'xstock_spot'));
    expect(_cooldown.calls).toEqual([['paper', 'C/USD', 'xstock_spot']]);
  });

  // CONTROL: the symbol's OWN close two minutes ago blocks, and the block acted on THAT time (condition 4).
  it('CONTROL — its own close two minutes ago blocks, and the check used exactly that close time', async () => {
    const closedAt = new Date(Date.now() - 2 * 60_000);
    _cooldown.lastClosedAt = closedAt;
    const r = await checkGuardrailRisk('paper', trade('C/USD', 'xstock_spot'));
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe('COOLDOWN');
    const blocked = _aj16.checks.find((c) => c.guardrailCooldown === true);
    expect(blocked?.lastTradeTime?.getTime()).toBe(closedAt.getTime());
  });

  // What the exact read returns for C/USD when only LTC/USD closed: nothing. The storage leg of the same claim — that
  // the SQL really is exact — is proved on real Postgres in b-sizing-inc2b-cooldown-db.test.ts.
  it('no close of its own ⇒ not in cooldown, and no close time was acted on', async () => {
    _cooldown.lastClosedAt = null;
    const r = await checkGuardrailRisk('paper', trade('C/USD', 'xstock_spot'));
    expect(r.ok).toBe(true);
    expect(_aj16.checks.some((c) => c.guardrailCooldown === true)).toBe(false);
  });

  // A trade with no class is matched in ANY class — stricter, never looser — and says so in the log.
  it('no asset class on the trade ⇒ the read asks for any class (null) and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await checkGuardrailRisk('paper', trade('DASH/USD'));
    expect(_cooldown.calls).toEqual([['paper', 'DASH/USD', null]]);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain('[COOLDOWN_CLASS_UNKNOWN] DASH/USD');
    warn.mockRestore();
  });
});

describe('#1093 — the engine hands the cooldown the asset class of the signal', () => {
  // MUTATION: drop assetClass from the engine's trade candidate and this fails — every paper check would then match
  // the symbol in any class (stricter, but the DASH/USD collision would be back).
  it('the trade candidate built before checkGuardrailRisk carries the class', () => {
    const src = readFileSync(join(process.cwd(), 'server/services/active-execution-engine.ts'), 'utf-8').replace(/\r\n/g, '\n');
    const i = src.indexOf('const tradeCandidate: TradeCandidate = {');
    expect(i).toBeGreaterThan(0);
    const block = src.slice(i, src.indexOf('};', i));
    expect(block).toContain('assetClass: asValidAssetClass((signal as any).metadata?.assetClass) ?? undefined');
  });
});
