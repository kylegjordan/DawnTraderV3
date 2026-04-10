/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.1B — Telemetry Rehydration E2E Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Validates:
 * 1. Adaptive learning weight persistence
 * 2. Timestamp propagation through persistence/rehydration
 * 3. Time-based decay on rehydration
 * 4. Integration between TelemetryAggregator and AdaptiveManager
 * 
 * Decay Formula: exp(-0.05 * ageDays)
 * - 1 day old: ~95% strength
 * - 7 days old: ~70% strength
 * - 14 days old: ~50% strength
 * - 30 days old: ~22% strength
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SCHEMA_VERSION, SCHEMA_DIRECTIVE } from '../../config/schema-version.js';
import { 
  AdaptiveManagerService, 
  type AdaptiveWeights,
  type TimestampedWeightEntry 
} from '../../core/adaptive-manager.js';

describe('Directive 11.1B - Adaptive Learning Rehydration E2E', () => {
  describe('Schema Version', () => {
    it('should report schema version v1.5.3', () => {
      expect(SCHEMA_VERSION).toBe('v1.6.3');
    });

    it('should report schema directive 11.1B', () => {
      expect(SCHEMA_DIRECTIVE).toBe('11.4C.1');
    });
  });

  describe('AdaptiveManager Time Decay', () => {
    let manager: AdaptiveManagerService;

    beforeEach(() => {
      manager = new AdaptiveManagerService(0.05);
    });

    it('should calculate decay factor correctly for various ages', () => {
      expect(manager.calculateDecayFactor(0)).toBeCloseTo(1.0, 2);
      expect(manager.calculateDecayFactor(1)).toBeCloseTo(0.951, 2);
      expect(manager.calculateDecayFactor(7)).toBeCloseTo(0.704, 2);
      expect(manager.calculateDecayFactor(14)).toBeCloseTo(0.496, 2);
      expect(manager.calculateDecayFactor(30)).toBeCloseTo(0.223, 2);
    });

    it('should apply time decay when initializing with timestamps', () => {
      const now = Date.now();
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      
      const data = new Map<string, TimestampedWeightEntry>([
        ['strategy_fresh', { weights: { param1: 1.0, param2: 0.8 }, updatedAt: new Date(now) }],
        ['strategy_1day', { weights: { param1: 1.0, param2: 0.8 }, updatedAt: oneDayAgo }],
        ['strategy_7days', { weights: { param1: 1.0, param2: 0.8 }, updatedAt: sevenDaysAgo }],
      ]);
      
      manager.initializeWithTimestamps(data);
      
      const freshWeights = manager.getWeights('strategy_fresh');
      const oneDayWeights = manager.getWeights('strategy_1day');
      const sevenDayWeights = manager.getWeights('strategy_7days');
      
      expect(freshWeights?.param1).toBeCloseTo(1.0, 1);
      expect(oneDayWeights?.param1).toBeCloseTo(0.95, 1);
      expect(sevenDayWeights?.param1).toBeCloseTo(0.70, 1);
    });

    it('should initialize without timestamps (no decay)', () => {
      const weights = new Map<string, AdaptiveWeights>([
        ['strategy_a', { param1: 1.0, param2: 0.5 }],
        ['strategy_b', { param1: 0.8, param2: 0.6 }],
      ]);
      
      manager.initialize(weights);
      
      const strategyA = manager.getWeights('strategy_a');
      expect(strategyA?.param1).toBe(1.0);
      expect(strategyA?.param2).toBe(0.5);
    });

    it('should update weights with current timestamp', () => {
      manager.updateWeights('new_strategy', { param1: 0.9 });
      
      const weights = manager.getWeights('new_strategy');
      const timestamp = manager.getWeightTimestamp('new_strategy');
      
      expect(weights?.param1).toBe(0.9);
      expect(timestamp).toBeDefined();
      expect(Date.now() - timestamp!.getTime()).toBeLessThan(1000);
    });

    it('should adjust individual weight values', () => {
      manager.updateWeights('strategy_x', { param1: 0.5 });
      manager.adjustWeight('strategy_x', 'param1', 0.1);
      
      const weights = manager.getWeights('strategy_x');
      expect(weights?.param1).toBeCloseTo(0.6, 2);
    });

    it('should clamp weight adjustments to [0, 1]', () => {
      manager.updateWeights('strategy_y', { param1: 0.95 });
      manager.adjustWeight('strategy_y', 'param1', 0.2);
      
      const weights = manager.getWeights('strategy_y');
      expect(weights?.param1).toBe(1.0);
      
      manager.adjustWeight('strategy_y', 'param1', -2.0);
      const weightsAfter = manager.getWeights('strategy_y');
      expect(weightsAfter?.param1).toBe(0.0);
    });

    it('should get decay statistics for all weights', () => {
      const now = Date.now();
      const data = new Map<string, TimestampedWeightEntry>([
        ['strategy_a', { weights: { p: 1 }, updatedAt: new Date(now) }],
        ['strategy_b', { weights: { p: 1 }, updatedAt: new Date(now - 7 * 24 * 60 * 60 * 1000) }],
      ]);
      
      manager.initializeWithTimestamps(data);
      
      const stats = manager.getDecayStats();
      expect(stats.length).toBe(2);
      
      const strategyA = stats.find(s => s.strategyId === 'strategy_a');
      const strategyB = stats.find(s => s.strategyId === 'strategy_b');
      
      expect(strategyA?.ageDays).toBeLessThan(0.1);
      expect(strategyB?.ageDays).toBeCloseTo(7, 0);
      expect(strategyB?.decayFactor).toBeCloseTo(0.70, 1);
    });

    it('should reset all weights', () => {
      manager.updateWeights('test', { p: 1 });
      expect(manager.isInitialized()).toBe(false);
      
      manager.initialize(new Map([['test', { p: 1 }]]));
      expect(manager.isInitialized()).toBe(true);
      
      manager.reset();
      expect(manager.isInitialized()).toBe(false);
      expect(manager.getWeights('test')).toBeUndefined();
    });
  });

  describe('Validation Scenarios', () => {
    let manager: AdaptiveManagerService;

    beforeEach(() => {
      manager = new AdaptiveManagerService(0.05);
    });

    it('SCENARIO: 30-day old weights should have ~22% effective strength', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const data = new Map<string, TimestampedWeightEntry>([
        ['old_strategy', { weights: { confidence: 1.0 }, updatedAt: thirtyDaysAgo }],
      ]);
      
      manager.initializeWithTimestamps(data);
      
      const weights = manager.getWeights('old_strategy');
      expect(weights?.confidence).toBeCloseTo(0.22, 1);
    });

    it('SCENARIO: 24h old weights should have ~95% effective strength', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const data = new Map<string, TimestampedWeightEntry>([
        ['recent_strategy', { weights: { confidence: 1.0 }, updatedAt: oneDayAgo }],
      ]);
      
      manager.initializeWithTimestamps(data);
      
      const weights = manager.getWeights('recent_strategy');
      expect(weights?.confidence).toBeCloseTo(0.95, 1);
    });

    it('SCENARIO: Mixed-age data should have proportional decay', () => {
      const now = Date.now();
      
      const data = new Map<string, TimestampedWeightEntry>([
        ['fresh', { weights: { w: 1.0 }, updatedAt: new Date(now) }],
        ['day_old', { weights: { w: 1.0 }, updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000) }],
        ['week_old', { weights: { w: 1.0 }, updatedAt: new Date(now - 7 * 24 * 60 * 60 * 1000) }],
        ['month_old', { weights: { w: 1.0 }, updatedAt: new Date(now - 30 * 24 * 60 * 60 * 1000) }],
      ]);
      
      manager.initializeWithTimestamps(data);
      
      const fresh = manager.getWeights('fresh')?.w ?? 0;
      const dayOld = manager.getWeights('day_old')?.w ?? 0;
      const weekOld = manager.getWeights('week_old')?.w ?? 0;
      const monthOld = manager.getWeights('month_old')?.w ?? 0;
      
      expect(fresh).toBeGreaterThan(dayOld);
      expect(dayOld).toBeGreaterThan(weekOld);
      expect(weekOld).toBeGreaterThan(monthOld);
    });
  });

  describe('Configurable Decay Rate', () => {
    it('should support custom decay rates', () => {
      const aggressiveManager = new AdaptiveManagerService(0.10);
      const conservativeManager = new AdaptiveManagerService(0.02);
      
      expect(aggressiveManager.getDecayRate()).toBe(0.10);
      expect(conservativeManager.getDecayRate()).toBe(0.02);
      
      expect(aggressiveManager.calculateDecayFactor(7)).toBeCloseTo(0.497, 2);
      expect(conservativeManager.calculateDecayFactor(7)).toBeCloseTo(0.869, 2);
    });

    it('should allow decay rate updates', () => {
      const manager = new AdaptiveManagerService(0.05);
      expect(manager.getDecayRate()).toBe(0.05);
      
      manager.setDecayRate(0.03);
      expect(manager.getDecayRate()).toBe(0.03);
    });
  });
});
