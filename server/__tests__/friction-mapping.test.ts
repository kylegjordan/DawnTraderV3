import { describe, it, expect } from 'vitest';
import { mapFrictionVisual, FrictionVisual } from '../core/metrics/cost-metrics';

describe('Directive 11.4B - Server-Side Friction Mapping', () => {
  describe('mapFrictionVisual', () => {
    it('maps scores 0-30 to green (High Liquidity / Low Cost)', () => {
      const result = mapFrictionVisual(10);
      expect(result.color).toBe('green');
      expect(result.label).toContain('High Liquidity');
    });

    it('maps score 30 boundary to green', () => {
      const result = mapFrictionVisual(30);
      expect(result.color).toBe('green');
      expect(result.label).toContain('High Liquidity');
    });

    it('maps scores 31-70 to orange (Moderate Liquidity)', () => {
      const result = mapFrictionVisual(35);
      expect(result.color).toBe('orange');
      expect(result.label).toContain('Moderate Liquidity');
    });

    it('maps score 70 boundary to orange', () => {
      const result = mapFrictionVisual(70);
      expect(result.color).toBe('orange');
      expect(result.label).toContain('Moderate Liquidity');
    });

    it('maps scores 71-100 to red (Low Liquidity / High Cost)', () => {
      const result = mapFrictionVisual(95);
      expect(result.color).toBe('red');
      expect(result.label).toContain('Low Liquidity');
    });

    it('maps score 100 to red', () => {
      const result = mapFrictionVisual(100);
      expect(result.color).toBe('red');
      expect(result.label).toContain('Low Liquidity');
    });

    it('returns all required FrictionVisual fields', () => {
      const result = mapFrictionVisual(50);
      expect(result).toHaveProperty('color');
      expect(result).toHaveProperty('label');
    });
  });

  describe('M25 Governance - 3-Tier Color Mapping (Directive 11.4H.2)', () => {
    it('ensures all 3 tiers have distinct colors', () => {
      const tier1 = mapFrictionVisual(10);
      const tier2 = mapFrictionVisual(50);
      const tier3 = mapFrictionVisual(95);

      expect([tier1.color, tier2.color, tier3.color]).toEqual([
        'green',
        'orange',
        'red'
      ]);
    });

    it('ensures all 3 tiers have distinct labels', () => {
      const tier1 = mapFrictionVisual(10);
      const tier2 = mapFrictionVisual(50);
      const tier3 = mapFrictionVisual(95);

      expect(tier1.label).toContain('High Liquidity');
      expect(tier2.label).toContain('Moderate Liquidity');
      expect(tier3.label).toContain('Low Liquidity');
    });

    it('validates friction color boundaries (Directive 11.4H.2)', () => {
      expect(mapFrictionVisual(30).color).toBe('green');
      expect(mapFrictionVisual(31).color).toBe('orange');
      expect(mapFrictionVisual(70).color).toBe('orange');
      expect(mapFrictionVisual(71).color).toBe('red');
    });
  });
});
