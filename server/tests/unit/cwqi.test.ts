/**
 * Directive 9.5 — CWQI v4 Unit Tests
 * 
 * Tests the Net Expectancy gate and Quality Score ranking system:
 * 1. The Gate (EV): Trades with EV ≤ 0 must be rejected
 * 2. The Score (CWQI): Ranking based on Reward/Risk × DI × (1-VolNoise) × (1-ρ̄)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cwqiService, CWQIResult, TradeMeta } from '../../services/cwqi-service.js';

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
    
    it('should include 0.5% cost (0.4% fees + 0.1% slippage)', () => {
      const result = cwqiService.calculateTradeExpectancy('ADA/USD', {
        entryPrice: 100,
        targetPrice: 110,
        stopPrice: 95,
        DI: 50,
        VolNoise: 0.3
      });
      
      expect(result.costTotal).toBeCloseTo(100 * 0.005, 4);
      expect(result.costTotal).toBe(0.5);
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
    
    it('should emit [9.5][CWQI] log on calculation', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      
      cwqiService.calculateTradeExpectancy('BTC/USD', {
        entryPrice: 100,
        targetPrice: 120,
        stopPrice: 95,
        DI: 70,
        VolNoise: 0.2
      });
      
      const cwqiLog = consoleSpy.mock.calls.find(call => 
        typeof call[0] === 'string' && call[0].includes('[9.5][CWQI]')
      );
      
      expect(cwqiLog).toBeDefined();
      expect(cwqiLog?.[0]).toContain('EV=');
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
