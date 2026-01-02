/**
 * [9.7] Guardrails Deprecation Invariant Test
 * 
 * This test ensures that no code uses the deprecated legacy guardrails table.
 * All guardrails access must go through guardrails_v2.
 * 
 * Purpose: Prevent accidental usage of deprecated storage.getGuardrails() 
 * and storage.upsertGuardrails() methods.
 */

import { describe, it, expect } from 'vitest';
import { storage } from '../../storage';

describe('[9.7] Guardrails Deprecation Invariant', () => {
  
  describe('storage.getGuardrails()', () => {
    it('should throw deprecation error when called', async () => {
      await expect(storage.getGuardrails({ mode: 'paper' }))
        .rejects.toThrow('[9.7] Deprecated');
    });

    it('should throw deprecation error for live mode as well', async () => {
      await expect(storage.getGuardrails({ mode: 'live' }))
        .rejects.toThrow('[9.7] Deprecated');
    });
  });

  describe('storage.upsertGuardrails()', () => {
    it('should throw deprecation error when called', async () => {
      const testData = {
        mode: 'paper' as const,
        maxDailyLoss: '1000.00',
        maxDrawdown: '10.00',
        maxPositionSize: '5000.00',
        maxOpenPositions: 5,
        riskPerTrade: '1.5',
        aiCanAdjust: false,
      };
      
      await expect(storage.upsertGuardrails(testData))
        .rejects.toThrow('[9.7] Deprecated');
    });
  });

  describe('storage.getGuardrailsV2()', () => {
    it('should work correctly for paper mode', async () => {
      const result = await storage.getGuardrailsV2({ mode: 'paper' });
      if (result) {
        expect(result).toHaveProperty('mode', 'paper');
        expect(result).toHaveProperty('portfolioRiskPerTradePct');
        expect(result).toHaveProperty('symbolCooldownMinutes');
      }
    });

    it('should work correctly for live mode', async () => {
      const result = await storage.getGuardrailsV2({ mode: 'live' });
      if (result) {
        expect(result).toHaveProperty('mode', 'live');
        expect(result).toHaveProperty('portfolioRiskPerTradePct');
        expect(result).toHaveProperty('symbolCooldownMinutes');
      }
    });
  });

  describe('storage.getGuardrailsLegacy()', () => {
    it('should be available for debug/audit use only', async () => {
      const result = await storage.getGuardrailsLegacy({ mode: 'paper' });
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });
});
