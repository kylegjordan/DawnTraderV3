/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4C.3-C — Runtime SignalType Consistency Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Validates that:
 * 1. API returns canonical signalType for all pairs
 * 2. SignalType always matches getTypeForStrategy(strategy)
 * 3. No stale or misclassified signals reach the UI
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect } from 'vitest';
import { getTypeForStrategy, REGIME_STRATEGY_MAP } from '../../config/regime-strategy-map';

describe('Directive 11.4C.3-C — Runtime SignalType Consistency', () => {
  
  describe('API-level signalType normalization', () => {
    test('getTypeForStrategy returns canonical type for all REGIME_STRATEGY_MAP strategies', () => {
      for (const [regime, mapping] of Object.entries(REGIME_STRATEGY_MAP)) {
        for (const strategy of mapping.strategies) {
          const derived = getTypeForStrategy(strategy);
          expect(derived).toBe(mapping.signalType);
        }
      }
    });

    test('Unknown strategies default to HYBRID', () => {
      expect(getTypeForStrategy('unknown_strategy')).toBe('HYBRID');
      expect(getTypeForStrategy('')).toBe('HYBRID');
      expect(getTypeForStrategy('legacy_deprecated_strategy')).toBe('HYBRID');
    });
  });

  describe('SignalType canonical values', () => {
    test('All signalTypes are uppercase canonical format', () => {
      const validTypes = ['QUANT', 'PATTERN', 'HYBRID'];
      
      for (const mapping of Object.values(REGIME_STRATEGY_MAP)) {
        expect(validTypes).toContain(mapping.signalType);
      }
    });

    test('No lowercase or mixed-case signalTypes exist', () => {
      for (const mapping of Object.values(REGIME_STRATEGY_MAP)) {
        expect(mapping.signalType).toBe(mapping.signalType.toUpperCase());
        expect(mapping.signalType).not.toMatch(/[a-z]/);
      }
    });
  });

  describe('Strategy-to-SignalType mapping consistency', () => {
    test('Each strategy maps to exactly one signalType', () => {
      const strategyToType = new Map<string, string>();
      
      for (const mapping of Object.values(REGIME_STRATEGY_MAP)) {
        for (const strategy of mapping.strategies) {
          if (strategyToType.has(strategy)) {
            expect(strategyToType.get(strategy)).toBe(mapping.signalType);
          } else {
            strategyToType.set(strategy, mapping.signalType);
          }
        }
      }
    });

    test('getTypeForStrategy is consistent with REGIME_STRATEGY_MAP', () => {
      for (const mapping of Object.values(REGIME_STRATEGY_MAP)) {
        for (const strategy of mapping.strategies) {
          expect(getTypeForStrategy(strategy)).toBe(mapping.signalType);
        }
      }
    });
  });

  describe('Simulated API response validation', () => {
    interface MockPair {
      symbol: string;
      strategy: string;
      signalType: string;
    }

    test('API normalization corrects stale signalType values', () => {
      const stalePairs: MockPair[] = [
        { symbol: 'BTC/USD', strategy: 'vwap_bounce', signalType: 'HYBRID' },
        { symbol: 'ETH/USD', strategy: 'range_trade', signalType: 'QUANT' },
        { symbol: 'SOL/USD', strategy: 'breakout', signalType: 'PATTERN' },
      ];

      const normalizedPairs = stalePairs.map(p => ({
        ...p,
        signalType: p.strategy && p.strategy !== '—' ? getTypeForStrategy(p.strategy) : p.signalType
      }));

      expect(normalizedPairs[0].signalType).toBe('QUANT');
      expect(normalizedPairs[1].signalType).toBe('PATTERN');
      expect(normalizedPairs[2].signalType).toBe('HYBRID');
    });

    test('Placeholder strategies retain original signalType', () => {
      const placeholderPair: MockPair = { symbol: 'XRP/USD', strategy: '—', signalType: 'HYBRID' };
      
      const normalized = {
        ...placeholderPair,
        signalType: placeholderPair.strategy && placeholderPair.strategy !== '—' 
          ? getTypeForStrategy(placeholderPair.strategy) 
          : placeholderPair.signalType
      };

      expect(normalized.signalType).toBe('HYBRID');
    });
  });
});
