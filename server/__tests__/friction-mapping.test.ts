import { describe, it, expect } from 'vitest';
import { mapFrictionVisual, FrictionVisual } from '../core/metrics/cost-metrics';

describe('Directive 11.4B - Server-Side Friction Mapping', () => {
  describe('mapFrictionVisual', () => {
    it('maps scores 0-20 to green (High Liquidity)', () => {
      const result = mapFrictionVisual(10);
      expect(result.color).toBe('green');
      expect(result.label).toContain('High Liquidity');
    });

    it('maps score 20 boundary to green', () => {
      const result = mapFrictionVisual(20);
      expect(result.color).toBe('green');
      expect(result.label).toContain('High Liquidity');
    });

    it('maps scores 21-50 to yellow (Normal)', () => {
      const result = mapFrictionVisual(35);
      expect(result.color).toBe('yellow');
      expect(result.label).toContain('Normal');
    });

    it('maps score 50 boundary to yellow', () => {
      const result = mapFrictionVisual(50);
      expect(result.color).toBe('yellow');
      expect(result.label).toContain('Normal');
    });

    it('maps scores 51-80 to orange (Stressed)', () => {
      const result = mapFrictionVisual(65);
      expect(result.color).toBe('orange');
      expect(result.label).toContain('Stressed');
    });

    it('maps score 80 boundary to orange', () => {
      const result = mapFrictionVisual(80);
      expect(result.color).toBe('orange');
      expect(result.label).toContain('Stressed');
    });

    it('maps scores 81-100 to red (Frozen)', () => {
      const result = mapFrictionVisual(95);
      expect(result.color).toBe('red');
      expect(result.label).toContain('Frozen');
    });

    it('maps score 100 to red', () => {
      const result = mapFrictionVisual(100);
      expect(result.color).toBe('red');
      expect(result.label).toContain('Frozen');
    });

    it('returns all required FrictionVisual fields', () => {
      const result = mapFrictionVisual(50);
      expect(result).toHaveProperty('color');
      expect(result).toHaveProperty('label');
    });
  });

  describe('M25 Governance - 4-Tier Color Mapping', () => {
    it('ensures all 4 tiers have distinct colors', () => {
      const tier1 = mapFrictionVisual(10);
      const tier2 = mapFrictionVisual(35);
      const tier3 = mapFrictionVisual(65);
      const tier4 = mapFrictionVisual(95);

      expect([tier1.color, tier2.color, tier3.color, tier4.color]).toEqual([
        'green',
        'yellow',
        'orange',
        'red'
      ]);
    });

    it('ensures all 4 tiers have distinct labels', () => {
      const tier1 = mapFrictionVisual(10);
      const tier2 = mapFrictionVisual(35);
      const tier3 = mapFrictionVisual(65);
      const tier4 = mapFrictionVisual(95);

      expect(tier1.label).toContain('High Liquidity');
      expect(tier2.label).toContain('Normal');
      expect(tier3.label).toContain('Stressed');
      expect(tier4.label).toContain('Frozen');
    });

    it('validates friction color boundaries (M25)', () => {
      expect(mapFrictionVisual(20).color).toBe('green');
      expect(mapFrictionVisual(21).color).toBe('yellow');
      expect(mapFrictionVisual(50).color).toBe('yellow');
      expect(mapFrictionVisual(51).color).toBe('orange');
      expect(mapFrictionVisual(80).color).toBe('orange');
      expect(mapFrictionVisual(81).color).toBe('red');
    });
  });
});
