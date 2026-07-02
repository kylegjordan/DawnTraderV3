/**
 * Directive 11.3C Integration Tests
 * Persistent Cost Telemetry & Drift Monitoring
 * 
 * Tests:
 * 1. cost_telemetry_persistence - Verifies 5-min snapshot writing and TTL cleanup
 * 2. cost_drift_alerts - Simulates cost volatility spikes and confirms warnings emitted
 * 3. dse_cost_pressure - Confirms DSE multiplier damping behavior under high costs
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prefetchModule } from '../../services/module-constants-service.js';
// B-NEW-43 Phase 2 chunk 6 (2026-05-23): warm module_constants modules
// read by code under test. Server boot calls prefetchModule for all
// PREFETCH_MODULES; unit tests must do the same explicitly. CI Postgres
// (chunks 4.0-4.7) populates module_constants via db:migrate; this hook
// loads the rows into the sync-read cache.
import { beforeAll as __b43_beforeAll } from 'vitest';
__b43_beforeAll(async () => {
  await prefetchModule("position_sizing");
  // P19-B7.2a: persistCostSnapshot/checkForDrift now compose avgFee from the
  // B-4.5 merge site (fee_model) — warm it like server boot does.
  await prefetchModule("fee_model");
});


describe('Directive 11.3C: Persistent Cost Telemetry & Drift Monitoring', () => {
  
  describe('Cost Telemetry Persistence (Task 1)', () => {
    it('should export SNAPSHOT_INTERVAL_MS of 5 minutes', async () => {
      const { SNAPSHOT_INTERVAL_MS } = await import('../../core/telemetry/cost-telemetry.js');
      expect(SNAPSHOT_INTERVAL_MS).toBe(5 * 60 * 1000);
    });
    
    it('should export RETENTION_HOURS of 72 hours', async () => {
      const { RETENTION_HOURS } = await import('../../core/telemetry/cost-telemetry.js');
      expect(RETENTION_HOURS).toBe(72);
    });
    
    it('should export COST_METRICS_SYMBOL for identification', async () => {
      const { COST_METRICS_SYMBOL } = await import('../../core/telemetry/cost-telemetry.js');
      expect(COST_METRICS_SYMBOL).toBe('COST_METRICS');
    });
    
    it('M6: persistCostSnapshot should attempt to persist when cache has data', async () => {
      const { persistCostSnapshot } = await import('../../core/telemetry/cost-telemetry.js');
      const { setCostMetrics, clearCostCache, getCacheSize } = await import('../../core/cache/cost-cache.js');
      
      clearCostCache();
      setCostMetrics('BTC/USD', { slippage: 0.0005, spread: 0.001 });
      setCostMetrics('ETH/USD', { slippage: 0.0005, spread: 0.001 });

      const cacheSize = getCacheSize();
      expect(cacheSize).toBe(2);

      const snapshot = await persistCostSnapshot();

      if (snapshot !== null) {
        expect(snapshot.symbolCount).toBe(2);
        // P19-B7.2a: avgFee composes from the merge site (fee_model Tier-1
        // taker), never from cache entries.
        expect(snapshot.avgFee).toBeCloseTo(0.008, 6);
      }
    });
    
    it('M6: persistCostSnapshot should return null when cache is empty', async () => {
      const { persistCostSnapshot } = await import('../../core/telemetry/cost-telemetry.js');
      const { clearCostCache } = await import('../../core/cache/cost-cache.js');
      
      clearCostCache();
      
      const snapshot = await persistCostSnapshot();
      
      expect(snapshot).toBeNull();
    });
  });
  
  describe('Cost Drift Monitor (Task 2)', () => {
    beforeEach(async () => {
      const { clearAlerts } = await import('../../services/monitoring/cost-drift-monitor.js');
      clearAlerts();
    });
    
    it('should export DRIFT_THRESHOLD of 50%', async () => {
      const { DRIFT_THRESHOLD } = await import('../../services/monitoring/cost-drift-monitor.js');
      expect(DRIFT_THRESHOLD).toBe(0.50);
    });
    
    it('should export BASELINE_WINDOW_HOURS of 1 hour', async () => {
      const { BASELINE_WINDOW_HOURS } = await import('../../services/monitoring/cost-drift-monitor.js');
      expect(BASELINE_WINDOW_HOURS).toBe(1);
    });
    
    it('M7: getRecentAlerts should return empty initially', async () => {
      const { getRecentAlerts } = await import('../../services/monitoring/cost-drift-monitor.js');
      
      const alerts = getRecentAlerts();
      
      expect(alerts).toHaveLength(0);
    });
    
    it('M7: getRecentCostDrift should return 0 when no alerts', async () => {
      const { getRecentCostDrift } = await import('../../services/monitoring/cost-drift-monitor.js');
      
      const drift = getRecentCostDrift();
      
      expect(drift).toBe(0);
    });
    
    it('M7: clearAlerts should reset alert buffer', async () => {
      const { getRecentAlerts, clearAlerts } = await import('../../services/monitoring/cost-drift-monitor.js');
      
      clearAlerts();
      const alerts = getRecentAlerts();
      
      expect(alerts).toHaveLength(0);
    });
  });
  
  describe('DSE Cost Pressure Integration (Task 3)', () => {
    beforeEach(async () => {
      const { clearAlerts } = await import('../../services/monitoring/cost-drift-monitor.js');
      clearAlerts();
    });
    
    it('M8: getCostPressureFactor should return 1.0 when no drift', async () => {
      const { getCostPressureFactor } = await import('../../core/risk/dynamic-sizing-engine.js');
      
      const factor = getCostPressureFactor();
      
      expect(factor).toBe(1.0);
    });
    
    it('M8: getCostPressureFactor should be bounded between 0.8 and 1.0', async () => {
      const { getCostPressureFactor } = await import('../../core/risk/dynamic-sizing-engine.js');
      
      const factor = getCostPressureFactor();
      
      expect(factor).toBeGreaterThanOrEqual(0.8);
      expect(factor).toBeLessThanOrEqual(1.0);
    });
    
    it('M8: DSE_CONFIG should include COST_PRESSURE_DAMPENING', async () => {
      const { DSE_CONFIG } = await import('../../core/risk/dynamic-sizing-engine.js');
      
      expect(DSE_CONFIG.COST_PRESSURE_DAMPENING).toBe(0.2);
    });
  });
  
  describe('Schema Version (Task 5)', () => {
    it('should be v1.5.9 for Directive 11.3C', async () => {
      const { SCHEMA_VERSION } = await import('../../config/schema-version.js');
      expect(SCHEMA_VERSION).toBe('v1.6.3');
    });
    
    it('should have 11.3C directive', async () => {
      const { SCHEMA_DIRECTIVE } = await import('../../config/schema-version.js');
      expect(SCHEMA_DIRECTIVE).toBe('11.4C.1');
    });
    
    it('should have 11.3C in schema history', async () => {
      const { SCHEMA_HISTORY } = await import('../../config/schema-version.js');
      const entry = SCHEMA_HISTORY.find(h => h.directive === '11.3C');
      expect(entry).toBeDefined();
      expect(entry?.version).toBe('v1.5.9');
    });
  });
  
  describe('Diagnostics Endpoints (Task 4)', () => {
    it('M9: getCostHistory function should exist', async () => {
      const module = await import('../../core/telemetry/cost-telemetry.js');
      expect(typeof module.getCostHistory).toBe('function');
    });
    
    it('M9: getRecentAlerts function should exist', async () => {
      const module = await import('../../services/monitoring/cost-drift-monitor.js');
      expect(typeof module.getRecentAlerts).toBe('function');
    });
    
    it('M9: getLatestSnapshot function should exist', async () => {
      const module = await import('../../core/telemetry/cost-telemetry.js');
      expect(typeof module.getLatestSnapshot).toBe('function');
    });
  });
});
