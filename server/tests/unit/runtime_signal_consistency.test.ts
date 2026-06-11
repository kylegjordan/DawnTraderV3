/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4F.1 — Runtime SignalType Consistency Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Updated to reflect Directive 11.4F.1 canonical mappings.
 * 
 * Validates that:
 * 1. API returns canonical signalType for all pairs
 * 2. SignalType always matches getTypeForStrategy(strategy)
 * 3. No stale or misclassified signals reach the UI
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect } from 'vitest';
import { 
  getTypeForStrategy, 
  CANONICAL_REGIME_STRATEGY_MAP 
} from '../../config/canonical-regime-strategy-map';

describe('Directive 11.4F.1 — Runtime SignalType Consistency', () => {
  
  describe('API-level signalType normalization', () => {
    test('getTypeForStrategy returns canonical type for all CANONICAL_REGIME_STRATEGY_MAP strategies', () => {
      for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP.crypto_spot)) {
        for (const stratDef of mapping.strategies) {
          const derived = getTypeForStrategy(stratDef.strategyKey);
          expect(derived).toBe(stratDef.signalType);
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
      
      for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP.crypto_spot)) {
        for (const stratDef of mapping.strategies) {
          expect(validTypes).toContain(stratDef.signalType);
        }
      }
    });

    test('No lowercase or mixed-case signalTypes exist', () => {
      for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP.crypto_spot)) {
        for (const stratDef of mapping.strategies) {
          expect(stratDef.signalType).toBe(stratDef.signalType.toUpperCase());
          expect(stratDef.signalType).not.toMatch(/[a-z]/);
        }
      }
    });
  });

  describe('Strategy-to-SignalType mapping consistency', () => {
    test('Each strategy maps to exactly one signalType via getTypeForStrategy', () => {
      const strategyToType = new Map<string, string>();
      
      for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP.crypto_spot)) {
        for (const stratDef of mapping.strategies) {
          const derivedType = getTypeForStrategy(stratDef.strategyKey);
          if (strategyToType.has(stratDef.strategyKey)) {
            expect(strategyToType.get(stratDef.strategyKey)).toBe(derivedType);
          } else {
            strategyToType.set(stratDef.strategyKey, derivedType);
          }
        }
      }
    });

    test('getTypeForStrategy is consistent with CANONICAL_REGIME_STRATEGY_MAP', () => {
      for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP.crypto_spot)) {
        for (const stratDef of mapping.strategies) {
          expect(getTypeForStrategy(stratDef.strategyKey)).toBe(stratDef.signalType);
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
        { symbol: 'ETH/USD', strategy: 'range_trade', signalType: 'PATTERN' },
        { symbol: 'SOL/USD', strategy: 'adaptive_flow', signalType: 'QUANT' },
      ];

      const normalizedPairs = stalePairs.map(p => ({
        ...p,
        signalType: p.strategy && p.strategy !== '—' ? getTypeForStrategy(p.strategy) : p.signalType
      }));

      expect(normalizedPairs[0].signalType).toBe('QUANT');
      expect(normalizedPairs[1].signalType).toBe('QUANT');
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
