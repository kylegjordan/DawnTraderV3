/**
 * Directive 9.5 — CWQI v4 Unit Tests
 * Directive 9.9 — Net Expectancy & Friction Standardization Tests
 * 
 * Tests the Net Expectancy gate and Quality Score ranking system:
 * 1. The Gate (netEV): Trades with netEV ≤ 0 must be rejected
 * 2. The Score (CWQI): Ranking based on normalize(netEV / risk) × DI × (1-VolNoise) × (1-ρ̄)
 * 3. Friction standardization: Gate and Score use identical netEV
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cwqiService, CWQIResult, TradeMeta } from '../../services/cwqi-service.js';
import { calculateFriction, getFrictionRate } from '../../utils/analysis-utils.js';
import { SYSTEM_GUARDS } from '../../config/system-guards.js';

describe('Directive 9.5 — CWQI v4 Service', () => {
  
  describe('9.5.A: Net Expectancy Gate (The Gate)', () => {
    
    it('should reject trades where fees make EV negative (Fee Killer Test)', () => {
      const result = cwqiService.calculateTradeExpectancy('BTC/USD', {
        entryPrice: 100,
        targetPrice: 101,
        stopPrice: 99,
        DI: 50,
        VolNoise: 0.3
      });
      
      expect(result.isTradeable).toBe(false);
      expect(result.ev).toBeLessThanOrEqual(0);
      expect(result.rejectionReason).toContain('negative expectancy');
    });
    
    it('should approve trades with positive EV after fees', () => {
      const result = cwqiService.calculateTradeExpectancy('BTC/USD', {
        entryPrice: 100,
        targetPrice: 110,
        stopPrice: 99,
        DI: 80,
        VolNoise: 0.2
      });
      
      expect(result.isTradeable).toBe(true);
      expect(result.ev).toBeGreaterThan(0);
      expect(result.rejectionReason).toBeUndefined();
    });
    
    it('should calculate win probability based on DI (Pwin = 0.40 + DI/200, capped at 0.60)', () => {
      const result = cwqiService.calculateTradeExpectancy('ETH/USD', {
        entryPrice: 100,
        targetPrice: 120,
        stopPrice: 95,
        DI: 30,
        VolNoise: 0.3
      });
      
      expect(result.pWin).toBeCloseTo(0.40 + 30/200, 2);
      expect(result.pWin).toBeCloseTo(0.55, 2);
    });
    
    it('should cap Pwin at 0.60', () => {
      const result = cwqiService.calculateTradeExpectancy('SOL/USD', {
        entryPrice: 100,
        targetPrice: 150,
        stopPrice: 90,
        DI: 100,
        VolNoise: 0.1
      });
      
      expect(result.pWin).toBeLessThanOrEqual(0.60);
    });
    
    it('should include 0.5% friction (fees + slippage) on round-trip', () => {
      const result = cwqiService.calculateTradeExpectancy('ADA/USD', {
        entryPrice: 100,
        targetPrice: 110,
        stopPrice: 95,
        DI: 50,
        VolNoise: 0.3
      });
      
      const expectedFriction = calculateFriction(100, 110, 1);
      expect(result.friction).toBeCloseTo(expectedFriction, 4);
      expect(result.friction).toBeCloseTo((100 + 110) * 0.005, 4);
    });
    
  });
  
  describe('9.5.B: Quality Score (The Rank)', () => {
    
    it('should calculate score with proper scaling', () => {
      const result = cwqiService.calculateTradeExpectancy('BTC/USD', {
        entryPrice: 100,
        targetPrice: 120,
        stopPrice: 95,
        DI: 70,
        VolNoise: 0.2
      });
      
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.isTradeable).toBe(true);
    });
    
    it('should clamp score between 0 and 100', () => {
      const result = cwqiService.calculateTradeExpectancy('ETH/USD', {
        entryPrice: 100,
        targetPrice: 200,
        stopPrice: 99,
        DI: 100,
        VolNoise: 0
      });
      
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
    
  });
  
  describe('9.5.C: Default Values', () => {
    
    it('should use default DI=50 when not provided', () => {
      const result = cwqiService.calculateTradeExpectancy('DOGE/USD', {
        entryPrice: 100,
        targetPrice: 110,
        stopPrice: 95
      });
      
      expect(result.pWin).toBe(0.60);
    });
    
    it('should use default VolNoise=0.3 when not provided', () => {
      const result1 = cwqiService.calculateTradeExpectancy('LINK/USD', {
        entryPrice: 100,
        targetPrice: 120,
        stopPrice: 95,
        DI: 70
      });
      
      const result2 = cwqiService.calculateTradeExpectancy('LINK/USD', {
        entryPrice: 100,
        targetPrice: 120,
        stopPrice: 95,
        DI: 70,
        VolNoise: 0.3
      });
      
      expect(result1.score).toBeCloseTo(result2.score, 2);
    });
    
  });
  
  describe('9.5.D: Batch Evaluation', () => {
    
    it('should filter out non-tradeable candidates', () => {
      const candidates = [
        { 
          symbol: 'BTC/USD', 
          tradeMeta: { entryPrice: 100, targetPrice: 101, stopPrice: 99, DI: 50, VolNoise: 0.3 }
        },
        { 
          symbol: 'ETH/USD', 
          tradeMeta: { entryPrice: 100, targetPrice: 130, stopPrice: 95, DI: 70, VolNoise: 0.2 }
        }
      ];
      
      const results = cwqiService.evaluateCandidates(candidates);
      
      expect(results.length).toBe(1);
      expect(results[0].symbol).toBe('ETH/USD');
    });
    
    it('should rank tradeable candidates by score (descending)', () => {
      const candidates = [
        { 
          symbol: 'LOW/USD', 
          tradeMeta: { entryPrice: 100, targetPrice: 110, stopPrice: 95, DI: 50, VolNoise: 0.4 }
        },
        { 
          symbol: 'HIGH/USD', 
          tradeMeta: { entryPrice: 100, targetPrice: 130, stopPrice: 95, DI: 80, VolNoise: 0.1 }
        },
        { 
          symbol: 'MID/USD', 
          tradeMeta: { entryPrice: 100, targetPrice: 120, stopPrice: 95, DI: 65, VolNoise: 0.25 }
        }
      ];
      
      const results = cwqiService.evaluateCandidates(candidates);
      
      for (let i = 1; i < results.length; i++) {
        expect(results[i-1].result.score).toBeGreaterThanOrEqual(results[i].result.score);
      }
    });
    
  });
  
  describe('9.5.E: Telemetry Logging', () => {
    
    it('should emit [9.9][CWQI] log on calculation with NetEV and Friction', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      
      cwqiService.calculateTradeExpectancy('BTC/USD', {
        entryPrice: 100,
        targetPrice: 120,
        stopPrice: 95,
        DI: 70,
        VolNoise: 0.2
      });
      
      const cwqiLog = consoleSpy.mock.calls.find(call => 
        typeof call[0] === 'string' && call[0].includes('[9.9][CWQI]')
      );
      
      expect(cwqiLog).toBeDefined();
      expect(cwqiLog?.[0]).toContain('NetEV=');
      expect(cwqiLog?.[0]).toContain('Friction=');
      expect(cwqiLog?.[0]).toContain('Score=');
      
      consoleSpy.mockRestore();
    });
    
  });
  
  describe('9.5.F: Configuration', () => {
    
    it('should return correct configuration values', () => {
      const config = cwqiService.getConfig();
      
      expect(config.costPercent).toBe(0.005);
      expect(config.minPwin).toBe(0.40);
      expect(config.maxPwin).toBe(0.60);
      expect(config.diPwinFactor).toBe(200);
    });
    
  });
  
});

/**
 * Directive 9.9.D — Regression Tests for Friction Standardization
 * 
 * Tests micro-scalp, normal, and swing trades to confirm:
 * 1. Gate and Score use identical netEV
 * 2. Friction is applied via canonical helper from SYSTEM_GUARDS
 * 3. No trade with negative netEV can achieve CWQI Score > 0
 */
describe('Directive 9.9 — Net EV & Friction Standardization', () => {
  
  describe('9.9.A: Friction Standardization', () => {
    
    it('should use SYSTEM_GUARDS.BASE_FEE_SLIPPAGE for friction calculation', () => {
      const rate = getFrictionRate();
      expect(rate).toBe(SYSTEM_GUARDS.BASE_FEE_SLIPPAGE);
      expect(rate).toBe(0.005);
    });
    
    it('should calculate friction as (entry + exit) × qty × rate', () => {
      const entry = 100;
      const exit = 110;
      const qty = 2;
      const friction = calculateFriction(entry, exit, qty);
      
      expect(friction).toBeCloseTo((100 + 110) * 2 * 0.005, 6);
      expect(friction).toBeCloseTo(2.1, 6);
    });
    
    it('should default qty to 1 for per-unit friction', () => {
      const friction = calculateFriction(100, 110);
      expect(friction).toBeCloseTo((100 + 110) * 0.005, 6);
    });
    
  });
  
  describe('9.9.B: NetEV Computation', () => {
    
    it('should compute netEV = rawEV - friction', () => {
      const result = cwqiService.calculateTradeExpectancy('BTC/USD', {
        entryPrice: 100,
        targetPrice: 120,
        stopPrice: 95,
        DI: 70,
        VolNoise: 0.2
      });
      
      expect(result.netEV).toBeCloseTo(result.rawEV - result.friction, 6);
    });
    
    it('should expose rawEV, friction, and netEV in result', () => {
      const result = cwqiService.calculateTradeExpectancy('ETH/USD', {
        entryPrice: 100,
        targetPrice: 115,
        stopPrice: 98,
        DI: 60,
        VolNoise: 0.25
      });
      
      expect(typeof result.rawEV).toBe('number');
      expect(typeof result.friction).toBe('number');
      expect(typeof result.netEV).toBe('number');
      expect(result.friction).toBeGreaterThan(0);
    });
    
  });
  
  describe('9.9.C: Gate & Score Alignment', () => {
    
    it('should enforce: netEV <= 0 implies score = 0', () => {
      const result = cwqiService.calculateTradeExpectancy('FAIL/USD', {
        entryPrice: 100,
        targetPrice: 100.5,
        stopPrice: 99,
        DI: 30,
        VolNoise: 0.5
      });
      
      if (result.netEV <= 0) {
        expect(result.score).toBe(0);
        expect(result.isTradeable).toBe(false);
      }
    });
    
    it('should never allow score > 0 when netEV <= 0', () => {
      const candidates = [
        { entry: 100, target: 100.1, stop: 99.9, DI: 20, VolNoise: 0.6 },
        { entry: 100, target: 100.3, stop: 99.5, DI: 40, VolNoise: 0.4 },
        { entry: 100, target: 100.2, stop: 99.8, DI: 50, VolNoise: 0.3 },
      ];
      
      candidates.forEach((c, i) => {
        const result = cwqiService.calculateTradeExpectancy(`TEST${i}/USD`, {
          entryPrice: c.entry,
          targetPrice: c.target,
          stopPrice: c.stop,
          DI: c.DI,
          VolNoise: c.VolNoise
        });
        
        if (result.netEV <= 0) {
          expect(result.score).toBe(0);
        }
      });
    });
    
  });
  
  describe('9.9.D: Trade Type Regression Tests', () => {
    
    it('[Micro-Scalp] should reject tiny edge trades eaten by friction', () => {
      const result = cwqiService.calculateTradeExpectancy('SCALP/USD', {
        entryPrice: 100,
        targetPrice: 100.3,
        stopPrice: 99.9,
        DI: 50,
        VolNoise: 0.3
      });
      
      expect(result.friction).toBeGreaterThan(0);
      expect(result.netEV).toBeLessThanOrEqual(0);
      expect(result.isTradeable).toBe(false);
      expect(result.score).toBe(0);
    });
    
    it('[Normal Trade] should correctly evaluate 2:1 R:R trade', () => {
      const result = cwqiService.calculateTradeExpectancy('NORM/USD', {
        entryPrice: 100,
        targetPrice: 106,
        stopPrice: 97,
        DI: 65,
        VolNoise: 0.25
      });
      
      expect(result.friction).toBeCloseTo(calculateFriction(100, 106, 1), 6);
      
      if (result.netEV > 0) {
        expect(result.isTradeable).toBe(true);
        expect(result.score).toBeGreaterThan(0);
      }
    });
    
    it('[Swing Trade] should handle larger price moves correctly', () => {
      const result = cwqiService.calculateTradeExpectancy('SWING/USD', {
        entryPrice: 100,
        targetPrice: 120,
        stopPrice: 95,
        DI: 75,
        VolNoise: 0.15
      });
      
      expect(result.friction).toBeCloseTo(calculateFriction(100, 120, 1), 6);
      
      expect(result.rawEV).toBeGreaterThan(result.friction);
      expect(result.netEV).toBeGreaterThan(0);
      expect(result.isTradeable).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
    
    it('[Consistency] Gate and Score must use identical netEV value', () => {
      const tradeMeta = {
        entryPrice: 100,
        targetPrice: 115,
        stopPrice: 97,
        DI: 70,
        VolNoise: 0.2
      };
      
      const result = cwqiService.calculateTradeExpectancy('CONSISTENT/USD', tradeMeta);
      
      expect(result.ev).toBe(result.netEV);
      
      const isGatePassed = result.netEV > 0;
      expect(result.isTradeable).toBe(isGatePassed);
      
      if (!isGatePassed) {
        expect(result.score).toBe(0);
      }
    });
    
  });
  
  describe('9.9.E: Debug Mode Diagnostic Output', () => {
    
    it('should emit diagnostic log when debugMode is true', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      
      cwqiService.calculateTradeExpectancy('DEBUG/USD', {
        entryPrice: 100,
        targetPrice: 110,
        stopPrice: 98,
        DI: 60,
        VolNoise: 0.3
      }, true);
      
      const debugLog = consoleSpy.mock.calls.find(call => 
        typeof call[0] === 'string' && call[0].includes('[CWQI] NetEV=')
      );
      
      expect(debugLog).toBeDefined();
      expect(debugLog?.[0]).toContain('Friction=');
      expect(debugLog?.[0]).toContain('Score=');
      
      consoleSpy.mockRestore();
    });
    
    it('should NOT emit diagnostic log when debugMode is false', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      
      cwqiService.calculateTradeExpectancy('NODEBUG/USD', {
        entryPrice: 100,
        targetPrice: 110,
        stopPrice: 98,
        DI: 60,
        VolNoise: 0.3
      }, false);
      
      const debugLog = consoleSpy.mock.calls.find(call => 
        typeof call[0] === 'string' && 
        call[0].includes('[CWQI] NetEV=') && 
        !call[0].includes('[9.9][CWQI]')
      );
      
      expect(debugLog).toBeUndefined();
      
      consoleSpy.mockRestore();
    });
    
  });
  
});
