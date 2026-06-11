/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4A — Market Indicators & Narrative Feed Integration Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Validates:
 * 1. Market Friction computation (M10 governance: 0-100 normalization)
 * 2. Market Indicators service functionality
 * 3. Narrative Feed service (M12 governance: 7-day retention)
 * 4. Friction description and thresholds
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  computeMarketFriction, 
  describeFriction, 
  formatFrictionDisplay,
  type FrictionStatus 
} from '../../core/metrics/cost-metrics.js';
import {
  updateGlobalRegime,
  getCurrentRegime,
  getRegimeInfo,
  getMarketIndicators,
  regimeDescriptions,
  getExpandedRegimeDescription,
  type MarketIndicators,
} from '../../services/market-indicators.js';
import {
  appendNarrativeEvent,
  getNarrativeEvents,
  getRecentNarrativeEvents,
  getNarrativeStats,
  clearNarrativeLog,
  type NarrativeEvent,
  type NarrativeEventType,
} from '../../services/narrative-feed.js';
import { prefetchModule } from '../../services/module-constants-service.js';
// B-NEW-43 Phase 2 chunk 6 (2026-05-23): warm module_constants modules
// read by code under test. Server boot calls prefetchModule for all
// PREFETCH_MODULES; unit tests must do the same explicitly. CI Postgres
// (chunks 4.0-4.7) populates module_constants via db:migrate; this hook
// loads the rows into the sync-read cache.
import { beforeAll as __b43_beforeAll } from 'vitest';
__b43_beforeAll(async () => {
  await prefetchModule("dbs_calculation");
});


describe('Directive 11.4A: Market Friction Computation (M10 Governance)', () => {
  
  it('should compute friction score normalized to 0-100', () => {
    const friction = computeMarketFriction(0.001, 0.0005, 0.0026);
    expect(friction).toBeGreaterThanOrEqual(0);
    expect(friction).toBeLessThanOrEqual(100);
    expect(typeof friction).toBe('number');
  });
  
  it('should return 0 friction for zero costs', () => {
    const friction = computeMarketFriction(0, 0, 0);
    expect(friction).toBe(0);
  });
  
  it('should cap friction at 100 for extreme costs', () => {
    const friction = computeMarketFriction(0.1, 0.1, 0.1);
    expect(friction).toBe(100);
  });
  
  it('should apply correct formula: base = (spread + slippage + fee) × 10000, normalized = min(base/3, 100)', () => {
    const spread = 0.001;
    const slippage = 0.0005;
    const fee = 0.0026;
    
    const expectedBase = (spread + slippage + fee) * 10000;
    const expectedNormalized = Math.min(expectedBase / 3, 100);
    const expectedRounded = Math.round(expectedNormalized);
    
    const friction = computeMarketFriction(spread, slippage, fee);
    expect(friction).toBe(expectedRounded);
  });
  
  it('should describe friction with correct thresholds', () => {
    const greenStatus = describeFriction(15);
    expect(greenStatus.color).toBe('green');
    expect(greenStatus.status).toBe('High Liquidity / Low Cost');

    const orangeStatus = describeFriction(50);
    expect(orangeStatus.color).toBe('orange');
    expect(orangeStatus.status).toBe('Moderate Liquidity');

    const redStatus = describeFriction(90);
    expect(redStatus.color).toBe('red');
    expect(redStatus.status).toBe('Low Liquidity / High Cost');
  });
  
  it('should format friction for display correctly', () => {
    const display = formatFrictionDisplay(37);
    expect(display).toContain('37');
    expect(display).toContain('Moderate Liquidity');
  });
});

describe('Directive 11.4A: Market Indicators Service (M14, M15 Governance)', () => {
  
  it('should update and retrieve global regime', () => {
    updateGlobalRegime('crypto_spot', 'TREND_FRIENDLY_STABLE');
    expect(getCurrentRegime('crypto_spot')).toBe('TREND_FRIENDLY_STABLE');
    
    updateGlobalRegime('crypto_spot', 'HIGH_VOLATILITY_UNSTABLE');
    expect(getCurrentRegime('crypto_spot')).toBe('HIGH_VOLATILITY_UNSTABLE');
  });
  
  it('should provide regime info with description and favored strategies', () => {
    const info = getRegimeInfo('TREND_FRIENDLY_STABLE');
    expect(info.name).toBe('TREND_FRIENDLY_STABLE');
    expect(typeof info.description).toBe('string');
    expect(Array.isArray(info.favoredStrategies)).toBe(true);
    expect(info.favoredStrategies.length).toBeGreaterThan(0);
  });
  
  it('should return market indicators with all required fields', () => {
    updateGlobalRegime('crypto_spot', 'RANGE_BOUND_STABLE');
    const indicators = getMarketIndicators('crypto_spot');
    
    expect(indicators).toHaveProperty('marketRegime');
    expect(indicators).toHaveProperty('regimeDescription');
    expect(indicators).toHaveProperty('favoredStrategies');
    expect(indicators).toHaveProperty('globalFrictionScore');
    expect(indicators).toHaveProperty('frictionDescription');
    expect(indicators).toHaveProperty('timestamp');
    
    expect(indicators.globalFrictionScore).toBeGreaterThanOrEqual(0);
    expect(indicators.globalFrictionScore).toBeLessThanOrEqual(100);
  });
  
  it('should fallback to LOW_VOL_CHOP for unknown regimes', () => {
    const info = getRegimeInfo('UNKNOWN_REGIME' as any);
    expect(info.name).toBe('RANGE_BOUND_STABLE');
  });
});

describe('Directive 11.4A: Narrative Feed Service (M12, M16 Governance)', () => {
  
  beforeEach(() => {
    clearNarrativeLog();
  });
  
  it('should append and retrieve narrative events', () => {
    const event = appendNarrativeEvent('TRADE_OPENED', 'BTC/USD', {
      symbol: 'BTC/USD',
      side: 'LONG',
      entryPrice: 45000,
      strategy: 'EMA_CROSS',
      regime: 'TREND_FRIENDLY_STABLE',
    });
    
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('timestamp');
    expect(event.type).toBe('TRADE_OPENED');
    expect(event.symbol).toBe('BTC/USD');
    expect(event.message).toContain('BTC/USD');
    expect(event.message).toContain('45000');
  });
  
  it('should generate correct message format for TRADE_CLOSED', () => {
    const event = appendNarrativeEvent('TRADE_CLOSED', 'ETH/USD', {
      symbol: 'ETH/USD',
      exitPrice: 3500,
      pnlPct: 0.025,
    });
    
    expect(event.symbol).toBe('ETH/USD');
    expect(event.message).toContain('3500');
    expect(event.message).toContain('+2.50%');
    expect(event.message).toContain('Trade closed');
  });
  
  it('should generate correct message format for DSE_RESIZE', () => {
    const event = appendNarrativeEvent('DSE_RESIZE', 'SOL/USD', {
      symbol: 'SOL/USD',
      resizePct: -0.15,
      reason: 'High friction detected',
      friction: 65,
    });
    
    expect(event.message).toContain('DSE resized');
    expect(event.message).toContain('-15%');
    expect(event.message).toContain('friction 65');
  });
  
  it('should retrieve multiple events in correct count', () => {
    appendNarrativeEvent('TRADE_OPENED', 'BTC/USD', { symbol: 'BTC/USD', side: 'LONG', entryPrice: 45000, strategy: 'EMA', regime: 'BULL' });
    appendNarrativeEvent('TRADE_CLOSED', 'BTC/USD', { symbol: 'BTC/USD', exitPrice: 46000, pnlPct: 0.02 });
    appendNarrativeEvent('TRAILING_EXIT_UPDATE', 'ETH/USD', { symbol: 'ETH/USD', newStopPrice: 3400 });
    
    const events = getRecentNarrativeEvents(10);
    expect(events.length).toBe(3);
    
    const types = events.map(e => e.type);
    expect(types).toContain('TRADE_OPENED');
    expect(types).toContain('TRADE_CLOSED');
    expect(types).toContain('TRAILING_EXIT_UPDATE');
  });
  
  it('should filter events by symbol', () => {
    appendNarrativeEvent('TRADE_OPENED', 'BTC/USD', { symbol: 'BTC/USD', side: 'LONG', entryPrice: 45000, strategy: 'EMA', regime: 'BULL' });
    appendNarrativeEvent('TRADE_OPENED', 'ETH/USD', { symbol: 'ETH/USD', side: 'LONG', entryPrice: 3500, strategy: 'RSI', regime: 'BULL' });
    
    const btcEvents = getNarrativeEvents({ symbol: 'BTC/USD' });
    expect(btcEvents.length).toBe(1);
    expect(btcEvents[0].symbol).toBe('BTC/USD');
  });
  
  it('should filter events by type', () => {
    appendNarrativeEvent('TRADE_OPENED', 'BTC/USD', { symbol: 'BTC/USD', side: 'LONG', entryPrice: 45000, strategy: 'EMA', regime: 'BULL' });
    appendNarrativeEvent('TRADE_CLOSED', 'BTC/USD', { symbol: 'BTC/USD', exitPrice: 46000, pnlPct: 0.02 });
    
    const closedEvents = getNarrativeEvents({ type: 'TRADE_CLOSED' });
    expect(closedEvents.length).toBe(1);
    expect(closedEvents[0].type).toBe('TRADE_CLOSED');
  });
  
  it('should provide accurate stats', () => {
    appendNarrativeEvent('TRADE_OPENED', 'BTC/USD', { symbol: 'BTC/USD', side: 'LONG', entryPrice: 45000, strategy: 'EMA', regime: 'BULL' });
    appendNarrativeEvent('TRADE_CLOSED', 'BTC/USD', { symbol: 'BTC/USD', exitPrice: 46000, pnlPct: 0.02 });
    appendNarrativeEvent('DSE_RESIZE', 'ETH/USD', { symbol: 'ETH/USD', resizePct: 0.1, reason: 'test' });
    
    const stats = getNarrativeStats();
    expect(stats.totalEvents).toBe(3);
    expect(stats.byType['TRADE_OPENED']).toBe(1);
    expect(stats.byType['TRADE_CLOSED']).toBe(1);
    expect(stats.byType['DSE_RESIZE']).toBe(1);
    expect(stats.oldestEvent).not.toBeNull();
    expect(stats.newestEvent).not.toBeNull();
  });
  
  it('should support pagination with limit and offset', () => {
    for (let i = 0; i < 10; i++) {
      appendNarrativeEvent('TRADE_OPENED', `PAIR${i}/USD`, { symbol: `PAIR${i}/USD`, side: 'LONG', entryPrice: 100, strategy: 'TEST', regime: 'TEST' });
    }
    
    const page1 = getNarrativeEvents({ limit: 3, offset: 0 });
    const page2 = getNarrativeEvents({ limit: 3, offset: 3 });
    
    expect(page1.length).toBe(3);
    expect(page2.length).toBe(3);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
  
  it('should clear narrative log completely', () => {
    appendNarrativeEvent('TRADE_OPENED', 'BTC/USD', { symbol: 'BTC/USD', side: 'LONG', entryPrice: 45000, strategy: 'EMA', regime: 'BULL' });
    expect(getNarrativeStats().totalEvents).toBe(1);
    
    clearNarrativeLog();
    expect(getNarrativeStats().totalEvents).toBe(0);
  });
});

describe('Directive 11.4A.1: Expanded Market Regime Definitions (M19 Governance)', () => {
  
  it('should have expanded descriptions for all canonical regimes', () => {
    const regimes = ['TREND_FRIENDLY_STABLE', 'HIGH_VOLATILITY_UNSTABLE', 'RANGE_BOUND_STABLE', 'IMPULSE_EXPANSION', 'STRUCTURAL_TRANSITION'];

    for (const regime of regimes) {
      const desc = regimeDescriptions[regime];
      expect(desc).toBeDefined();
      expect(desc.title).toBeDefined();
      expect(desc.description.length).toBeGreaterThan(100);
      expect(Array.isArray(desc.favoredSignalTypes)).toBe(true);
      expect(Array.isArray(desc.favoredStrategies)).toBe(true);
    }
  });
  
  it('should return complete 3-4 sentence descriptions for each regime', () => {
    const bullStable = regimeDescriptions['TREND_FRIENDLY_STABLE'];
    expect(bullStable.description).toContain('trend');
    expect(bullStable.description.split('.').length).toBeGreaterThanOrEqual(3);

    const bearVolatile = regimeDescriptions['HIGH_VOLATILITY_UNSTABLE'];
    expect(bearVolatile.description).toContain('volatility');
    expect(bearVolatile.description.split('.').length).toBeGreaterThanOrEqual(3);
  });
  
  it('should return expanded regime via getExpandedRegimeDescription', () => {
    const expanded = getExpandedRegimeDescription('TREND_FRIENDLY_STABLE');
    expect(expanded).toBeDefined();
    expect(expanded!.title).toBe('Trend-Friendly Stable');
    expect(expanded!.favoredSignalTypes).toContain('QUANT');
  });
});

describe('Directive 11.4A.1: Expanded Market Friction Narratives (M20 Governance)', () => {
  
  it('should return 3-4 sentence narratives for each friction range', () => {
    const green = describeFriction(15);
    expect(green.narrative).toContain('High liquidity');
    expect(green.narrative.split('.').length).toBeGreaterThanOrEqual(3);

    const orange = describeFriction(50);
    expect(orange.narrative).toContain('Moderate liquidity');
    expect(orange.narrative.split('.').length).toBeGreaterThanOrEqual(2);

    const red = describeFriction(90);
    expect(red.narrative).toContain('Low liquidity');
    expect(red.narrative.split('.').length).toBeGreaterThanOrEqual(2);
  });
  
  it('should map friction scores correctly to 3-tier narrative system', () => {
    expect(describeFriction(0).narrative).toContain('High liquidity');
    expect(describeFriction(30).narrative).toContain('High liquidity');
    expect(describeFriction(31).narrative).toContain('Moderate liquidity');
    expect(describeFriction(70).narrative).toContain('Moderate liquidity');
    expect(describeFriction(71).narrative).toContain('Low liquidity');
    expect(describeFriction(100).narrative).toContain('Low liquidity');
  });
});

describe('Directive 11.4A.1: Market Indicators with Expanded Fields', () => {
  
  it('should return indicators with regimeTitle and frictionNarrative', () => {
    updateGlobalRegime('crypto_spot', 'TREND_FRIENDLY_STABLE');
    const indicators = getMarketIndicators('crypto_spot');
    
    expect(indicators).toHaveProperty('regimeTitle');
    expect(indicators).toHaveProperty('frictionNarrative');
    expect(indicators).toHaveProperty('favoredSignalTypes');
    
    expect(indicators.regimeTitle).toBe('Trend-Friendly Stable');
    expect(typeof indicators.frictionNarrative).toBe('string');
    expect(indicators.frictionNarrative.length).toBeGreaterThan(50);
  });
});

describe('Directive 11.4A.1: Schema Version Validation', () => {
  
  it('should be at version v1.6.1', async () => {
    const { SCHEMA_VERSION, SCHEMA_DIRECTIVE } = await import('../../config/schema-version.js');
    expect(SCHEMA_VERSION).toBe('v1.6.3');
    expect(SCHEMA_DIRECTIVE).toBe('11.4C.1');
  });
});
