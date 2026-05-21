/**
 * Directive 11.3B Integration Tests
 * Cost Engine Consolidation & Diagnostics Finalization
 * 
 * Tests:
 * 1. cost_cache_latency - Ensures lookup < 0.1 ms
 * 2. cost_clamping - Values never exceed 1%
 * 3. diagnostics_output - Confirms endpoint correctness
 * 4. integration_cost_consistency - All modules share same cached values
 * 5. governance_invariants - C1-C5 validation
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('Directive 11.3B: Cost Engine Consolidation', () => {
  
  describe('Exchange Defaults (Task 1)', () => {
    it('should export correct default taker fee of 0.26%', async () => {
      const { DEFAULT_TAKER_FEE } = await import('../../config/exchange-defaults.js');
      expect(DEFAULT_TAKER_FEE).toBe(0.0026);
    });
    
    it('should export correct default maker fee of 0.16%', async () => {
      const { DEFAULT_MAKER_FEE } = await import('../../config/exchange-defaults.js');
      expect(DEFAULT_MAKER_FEE).toBe(0.0016);
    });
    
    it('should export correct default slippage of 0.05%', async () => {
      const { DEFAULT_SLIPPAGE } = await import('../../config/exchange-defaults.js');
      expect(DEFAULT_SLIPPAGE).toBe(0.0005);
    });
    
    it('should export correct default spread of 0.10%', async () => {
      const { DEFAULT_SPREAD } = await import('../../config/exchange-defaults.js');
      expect(DEFAULT_SPREAD).toBe(0.0010);
    });
    
    it('should export MAX_COST_BOUND of 1%', async () => {
      const { MAX_COST_BOUND } = await import('../../config/exchange-defaults.js');
      expect(MAX_COST_BOUND).toBe(0.01);
    });
  });
  
  describe('In-Memory Cost Cache (Task 2)', () => {
    beforeEach(async () => {
      const { clearCostCache } = await import('../../core/cache/cost-cache.js');
      clearCostCache();
    });
    
    it('should return null for uncached symbols', async () => {
      const { getCostMetrics } = await import('../../core/cache/cost-cache.js');
      expect(getCostMetrics('UNKNOWN/USD')).toBeNull();
    });
    
    it('should cache and retrieve cost metrics', async () => {
      const { setCostMetrics, getCostMetrics } = await import('../../core/cache/cost-cache.js');
      
      setCostMetrics('BTC/USD', { fee: 0.003, slippage: 0.001, spread: 0.002 });
      const cached = getCostMetrics('BTC/USD');
      
      expect(cached).not.toBeNull();
      expect(cached!.fee).toBe(0.003);
      expect(cached!.slippage).toBe(0.001);
      expect(cached!.spread).toBe(0.002);
    });
    
    it('C3: should clamp values to MAX_COST_BOUND (1%)', async () => {
      const { setCostMetrics, getCostMetrics } = await import('../../core/cache/cost-cache.js');
      const { MAX_COST_BOUND } = await import('../../config/exchange-defaults.js');
      
      setCostMetrics('ETH/USD', { fee: 0.05, slippage: 0.02, spread: 0.03 });
      const cached = getCostMetrics('ETH/USD');
      
      expect(cached!.fee).toBe(MAX_COST_BOUND);
      expect(cached!.slippage).toBe(MAX_COST_BOUND);
      expect(cached!.spread).toBe(MAX_COST_BOUND);
    });
    
    it('should use defaults when getOrSetCostMetrics called for new symbol', async () => {
      const { getOrSetCostMetrics } = await import('../../core/cache/cost-cache.js');
      const { DEFAULT_TAKER_FEE, DEFAULT_SLIPPAGE, DEFAULT_SPREAD } = await import('../../config/exchange-defaults.js');
      
      const metrics = getOrSetCostMetrics('SOL/USD');
      
      expect(metrics.fee).toBe(DEFAULT_TAKER_FEE);
      expect(metrics.slippage).toBe(DEFAULT_SLIPPAGE);
      expect(metrics.spread).toBe(DEFAULT_SPREAD);
    });
    
    it('C5: should lookup in < 0.1 ms (performance test)', async () => {
      const { setCostMetrics, getCostMetrics } = await import('../../core/cache/cost-cache.js');
      
      setCostMetrics('PERF/USD', { fee: 0.002, slippage: 0.001, spread: 0.001 });
      
      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        getCostMetrics('PERF/USD');
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / iterations;
      
      expect(avgMs).toBeLessThan(0.1);
    });
    
    it('C4: should expire entries after TTL (60s)', async () => {
      const { setCostMetrics, getCostMetrics, setEntryTimestamp, CACHE_TTL_MS } = await import('../../core/cache/cost-cache.js');
      
      setCostMetrics('TTL/USD', { fee: 0.003, slippage: 0.001, spread: 0.002 });
      
      const cachedBefore = getCostMetrics('TTL/USD');
      expect(cachedBefore).not.toBeNull();
      expect(cachedBefore!.fee).toBe(0.003);
      
      setEntryTimestamp('TTL/USD', Date.now() - CACHE_TTL_MS - 1);
      
      const cachedAfter = getCostMetrics('TTL/USD');
      expect(cachedAfter).toBeNull();
    });
    
    it('C4: should prune expired entries from getAllCachedSymbols', async () => {
      const { setCostMetrics, getAllCachedSymbols, setEntryTimestamp, CACHE_TTL_MS } = await import('../../core/cache/cost-cache.js');
      
      setCostMetrics('VALID/USD', { fee: 0.002, slippage: 0.001, spread: 0.001 });
      setCostMetrics('EXPIRED/USD', { fee: 0.003, slippage: 0.001, spread: 0.002 });
      
      setEntryTimestamp('EXPIRED/USD', Date.now() - CACHE_TTL_MS - 1);
      
      const symbols = getAllCachedSymbols();
      expect(symbols).toContain('VALID/USD');
      expect(symbols).not.toContain('EXPIRED/USD');
    });
  });
  
  describe('Cost Model Integration (Task 3)', () => {
    beforeEach(async () => {
      const { clearCostCache } = await import('../../core/cache/cost-cache.js');
      clearCostCache();
    });
    
    it('C1: cost-model should use centralized cache', async () => {
      const { getCachedCostMetrics } = await import('../../core/math/cost-model.js');
      const { DEFAULT_TAKER_FEE } = await import('../../config/exchange-defaults.js');
      
      const metrics = getCachedCostMetrics('ADA/USD', 'crypto_spot'); // B79.0n.MCE: assetClass REQUIRED

      expect(metrics.fee).toBe(DEFAULT_TAKER_FEE);
    });
    
    it('C2: default fee should be 0.26% (taker)', async () => {
      const { getCachedCostMetrics } = await import('../../core/math/cost-model.js');
      
      const metrics = getCachedCostMetrics('XRP/USD', 'crypto_spot'); // B79.0n.MCE: assetClass REQUIRED

      expect(metrics.fee).toBe(0.0026);
    });
    
    it('should compute correct total round-trip cost', async () => {
      const { computeTotalRoundTripCost } = await import('../../core/math/cost-model.js');
      
      const fee = 0.0026;
      const slippage = 0.0005;
      const spread = 0.001;
      
      const total = computeTotalRoundTripCost(fee, slippage, spread);
      
      expect(total).toBe(0.0072);
    });
  });
  
  describe('Cache Statistics', () => {
    beforeEach(async () => {
      const { clearCostCache } = await import('../../core/cache/cost-cache.js');
      clearCostCache();
    });
    
    it('should track cache size', async () => {
      const { setCostMetrics, getCacheSize } = await import('../../core/cache/cost-cache.js');
      
      expect(getCacheSize()).toBe(0);
      
      setCostMetrics('BTC/USD', { fee: 0.002, slippage: 0.001, spread: 0.001 });
      setCostMetrics('ETH/USD', { fee: 0.002, slippage: 0.001, spread: 0.001 });
      
      expect(getCacheSize()).toBe(2);
    });
    
    it('should compute average statistics', async () => {
      const { setCostMetrics, getCacheStats } = await import('../../core/cache/cost-cache.js');
      
      setCostMetrics('BTC/USD', { fee: 0.002, slippage: 0.001, spread: 0.001 });
      setCostMetrics('ETH/USD', { fee: 0.004, slippage: 0.001, spread: 0.001 });
      
      const stats = getCacheStats();
      
      expect(stats.symbolCount).toBe(2);
      expect(stats.avgFee).toBe(0.003);
    });
  });
  
  describe('Schema Version (Task 6)', () => {
    it('should be v1.5.8 for Directive 11.3B', async () => {
      const { SCHEMA_VERSION } = await import('../../config/schema-version.js');
      expect(SCHEMA_VERSION).toBe('v1.6.3');
    });
    
    it('should have 11.3B in schema history', async () => {
      const { SCHEMA_HISTORY } = await import('../../config/schema-version.js');
      const entry = SCHEMA_HISTORY.find(h => h.directive === '11.3B');
      expect(entry).toBeDefined();
      expect(entry?.version).toBe('v1.5.8');
    });
  });
});
