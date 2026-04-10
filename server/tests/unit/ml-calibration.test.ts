/**
 * Directive 10.6 — ML Calibration Unit Tests
 * 
 * Tests the learning loop that analyzes VTS trade outcomes
 * and generates weight adjustment recommendations.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { 
  MLCalibrationService, 
  setGetRecentTradesFn, 
  type TradeRecord 
} from '../../services/ml-calibration';

describe('MLCalibrationService', () => {
  beforeEach(() => {
    setGetRecentTradesFn(null as any);
  });

  test('Returns error when VTS function not configured', async () => {
    const report = await MLCalibrationService.analyzePerformance();
    expect(report.success).toBe(false);
    expect(report.reason).toContain('not configured');
  });

  test('Returns error when no trades found', async () => {
    setGetRecentTradesFn(async () => []);
    
    const report = await MLCalibrationService.analyzePerformance();
    expect(report.success).toBe(false);
    expect(report.reason).toContain('No HYBRID trades found');
  });

  test('Increases weight for consistently winning pattern', async () => {
    const trades: TradeRecord[] = Array(10).fill(null).map(() => ({
      signalType: 'HYBRID',
      patternType: 'PINBAR',
      pnl: 10,
      finalScore: 0.8,
      predictiveConfidence: 0.7,
      regimeWeight: 0.9,
    }));
    
    setGetRecentTradesFn(async () => trades);
    
    const report = await MLCalibrationService.analyzePerformance();
    expect(report.success).toBe(true);
    expect(report.recommendations).toBeDefined();
    
    const pinbarRec = report.recommendations!.find(r => r.pattern === 'PINBAR');
    expect(pinbarRec).toBeDefined();
    expect(pinbarRec!.suggestion).toBe('INCREASE');
    expect(pinbarRec!.adjustment).toBeGreaterThan(0);
    expect(pinbarRec!.winRate).toBe(100);
  });

  test('Decreases weight for consistently losing pattern', async () => {
    const trades: TradeRecord[] = Array(10).fill(null).map(() => ({
      signalType: 'HYBRID',
      patternType: 'ENGULFING',
      pnl: -10,
      finalScore: 0.4,
      predictiveConfidence: 0.3,
      regimeWeight: 0.5,
    }));
    
    setGetRecentTradesFn(async () => trades);
    
    const report = await MLCalibrationService.analyzePerformance();
    expect(report.success).toBe(true);
    
    const engulfingRec = report.recommendations!.find(r => r.pattern === 'ENGULFING');
    expect(engulfingRec).toBeDefined();
    expect(engulfingRec!.suggestion).toBe('DECREASE');
    expect(engulfingRec!.adjustment).toBeLessThan(0);
    expect(engulfingRec!.winRate).toBe(0);
  });

  test('Holds steady for mixed performance (50% win rate)', async () => {
    const trades: TradeRecord[] = [
      ...Array(5).fill(null).map(() => ({ signalType: 'HYBRID', patternType: 'INSIDE_BAR', pnl: 10 })),
      ...Array(5).fill(null).map(() => ({ signalType: 'HYBRID', patternType: 'INSIDE_BAR', pnl: -10 })),
    ];
    
    setGetRecentTradesFn(async () => trades);
    
    const report = await MLCalibrationService.analyzePerformance();
    expect(report.success).toBe(true);
    
    const insideBarRec = report.recommendations!.find(r => r.pattern === 'INSIDE_BAR');
    expect(insideBarRec).toBeDefined();
    expect(insideBarRec!.suggestion).toBe('HOLD');
    expect(insideBarRec!.adjustment).toBe(0);
    expect(insideBarRec!.winRate).toBe(50);
  });

  test('Groups multiple patterns correctly', async () => {
    const trades: TradeRecord[] = [
      { signalType: 'HYBRID', patternType: 'PINBAR', pnl: 10 },
      { signalType: 'HYBRID', patternType: 'PINBAR', pnl: 10 },
      { signalType: 'HYBRID', patternType: 'PINBAR', pnl: 10 },
      { signalType: 'HYBRID', patternType: 'ENGULFING', pnl: -10 },
      { signalType: 'HYBRID', patternType: 'ENGULFING', pnl: -10 },
      { signalType: 'HYBRID', patternType: 'MORNING_STAR', pnl: 5 },
      { signalType: 'HYBRID', patternType: 'MORNING_STAR', pnl: -5 },
    ];
    
    setGetRecentTradesFn(async () => trades);
    
    const report = await MLCalibrationService.analyzePerformance();
    expect(report.success).toBe(true);
    expect(report.recommendations).toHaveLength(3);
    expect(report.analyzedTrades).toBe(7);
    
    const pinbar = report.recommendations!.find(r => r.pattern === 'PINBAR');
    expect(pinbar!.suggestion).toBe('INCREASE');
    expect(pinbar!.winRate).toBe(100);
    
    const engulfing = report.recommendations!.find(r => r.pattern === 'ENGULFING');
    expect(engulfing!.suggestion).toBe('DECREASE');
    expect(engulfing!.winRate).toBe(0);
    
    const morning = report.recommendations!.find(r => r.pattern === 'MORNING_STAR');
    expect(morning!.suggestion).toBe('HOLD');
    expect(morning!.winRate).toBe(50);
  });

  test('Handles UNKNOWN pattern type for trades without pattern', async () => {
    const trades: TradeRecord[] = [
      { signalType: 'HYBRID', pnl: 10 },
      { signalType: 'HYBRID', pnl: 10 },
      { signalType: 'HYBRID', pnl: -5 },
    ];
    
    setGetRecentTradesFn(async () => trades);
    
    const report = await MLCalibrationService.analyzePerformance();
    expect(report.success).toBe(true);
    
    const unknownRec = report.recommendations!.find(r => r.pattern === 'UNKNOWN');
    expect(unknownRec).toBeDefined();
    expect(unknownRec!.winRate).toBeCloseTo(66.7, 0);
  });

  test('Calculates average expectancy correctly', async () => {
    const trades: TradeRecord[] = [
      { signalType: 'HYBRID', patternType: 'PINBAR', pnl: 0.02 },
      { signalType: 'HYBRID', patternType: 'PINBAR', pnl: 0.01 },
      { signalType: 'HYBRID', patternType: 'PINBAR', pnl: 0.03 },
    ];
    
    setGetRecentTradesFn(async () => trades);
    
    const report = await MLCalibrationService.analyzePerformance();
    expect(report.success).toBe(true);
    
    const pinbarRec = report.recommendations!.find(r => r.pattern === 'PINBAR');
    expect(pinbarRec!.avgExpectancy).toBeCloseTo(0.02, 4);
  });

  test('Report includes timestamp', async () => {
    const trades: TradeRecord[] = [{ signalType: 'HYBRID', patternType: 'PINBAR', pnl: 10 }];
    setGetRecentTradesFn(async () => trades);
    
    const before = Date.now();
    const report = await MLCalibrationService.analyzePerformance();
    const after = Date.now();
    
    expect(report.timestamp).toBeDefined();
    expect(report.timestamp).toBeGreaterThanOrEqual(before);
    expect(report.timestamp).toBeLessThanOrEqual(after);
  });
});
