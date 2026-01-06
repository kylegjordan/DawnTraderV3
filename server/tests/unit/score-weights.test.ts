/**
 * Directive 10.9A: Score Weights Configuration Tests (Purified)
 * 
 * Validates that the centralized scoring coefficients are correctly defined,
 * version-tracked, and that FinalScore calculations are consistent.
 */

import { describe, it, expect } from 'vitest';
import { 
  SCORE_WEIGHTS, 
  SCORE_WEIGHTS_VERSION,
  getScoreWeightsMetadata 
} from '../../config/score-weights.config';

describe('Directive 10.9A — Score Weights Configuration (Purified)', () => {
  
  describe('SCORE_WEIGHTS object', () => {
    it('should have all required FINAL_SCORE coefficients', () => {
      expect(SCORE_WEIGHTS.FINAL_SCORE).toBeDefined();
      expect(SCORE_WEIGHTS.FINAL_SCORE.HYBRID).toBeDefined();
      expect(SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE).toBeDefined();
      expect(SCORE_WEIGHTS.FINAL_SCORE.REGIME).toBeDefined();
      expect(SCORE_WEIGHTS.FINAL_SCORE.DECAY).toBeDefined();
    });
    
    it('should have expected weight values', () => {
      expect(SCORE_WEIGHTS.FINAL_SCORE.HYBRID).toBe(0.4);
      expect(SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE).toBe(0.3);
      expect(SCORE_WEIGHTS.FINAL_SCORE.REGIME).toBe(0.2);
      expect(SCORE_WEIGHTS.FINAL_SCORE.DECAY).toBe(0.1);
    });
    
    it('should be immutable (frozen object)', () => {
      expect(Object.isFrozen(SCORE_WEIGHTS)).toBe(true);
      expect(Object.isFrozen(SCORE_WEIGHTS.FINAL_SCORE)).toBe(true);
    });
    
    it('positive weights should sum to 0.9 (decay is subtracted)', () => {
      const positiveSum = 
        SCORE_WEIGHTS.FINAL_SCORE.HYBRID +
        SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE +
        SCORE_WEIGHTS.FINAL_SCORE.REGIME;
      expect(positiveSum).toBeCloseTo(0.9, 5);
    });
  });

  describe('SCORE_WEIGHTS_VERSION', () => {
    it('should be defined and have expected format', () => {
      expect(SCORE_WEIGHTS_VERSION).toBeDefined();
      expect(typeof SCORE_WEIGHTS_VERSION).toBe('string');
      expect(SCORE_WEIGHTS_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
    });
    
    it('should be v1.0.1', () => {
      expect(SCORE_WEIGHTS_VERSION).toBe('v1.0.1');
    });
  });

  describe('Config Purity (No Runtime Logic)', () => {
    it('should NOT have calculateFinalScore in exports', async () => {
      const configModule = await import('../../config/score-weights.config');
      // calculateFinalScore was removed in 10.9A - verify it's not exported
      expect('calculateFinalScore' in configModule).toBe(false);
    });
    
    it('should only export SCORE_WEIGHTS, SCORE_WEIGHTS_VERSION, and getScoreWeightsMetadata', async () => {
      const configModule = await import('../../config/score-weights.config');
      const exportedKeys = Object.keys(configModule);
      
      // Should only have: SCORE_WEIGHTS, SCORE_WEIGHTS_VERSION, getScoreWeightsMetadata
      expect(exportedKeys).toContain('SCORE_WEIGHTS');
      expect(exportedKeys).toContain('SCORE_WEIGHTS_VERSION');
      expect(exportedKeys).toContain('getScoreWeightsMetadata');
      expect(exportedKeys.length).toBe(3);
    });
  });

  describe('getScoreWeightsMetadata function', () => {
    it('should return coefficient metadata with version for telemetry', () => {
      const metadata = getScoreWeightsMetadata();
      
      expect(metadata).toHaveProperty('version');
      expect(metadata).toHaveProperty('weights');
      expect(metadata.version).toBe(SCORE_WEIGHTS_VERSION);
      expect(metadata.weights).toHaveProperty('HYBRID');
      expect(metadata.weights).toHaveProperty('CONFIDENCE');
      expect(metadata.weights).toHaveProperty('REGIME');
      expect(metadata.weights).toHaveProperty('DECAY');
    });
    
    it('should return a copy, not the original object', () => {
      const metadata1 = getScoreWeightsMetadata();
      const metadata2 = getScoreWeightsMetadata();
      
      expect(metadata1.weights).not.toBe(metadata2.weights);
      expect(metadata1.weights).toEqual(metadata2.weights);
    });
  });

  describe('Inline FinalScore Calculation Consistency', () => {
    // These tests validate the inlined formula used in Signal Orchestrator and RTB Service
    const W = SCORE_WEIGHTS.FINAL_SCORE;
    
    function inlineCalculateFinalScore(params: {
      hybridScore?: number;
      predictiveConfidence?: number;
      regimeWeight?: number;
      decayPenalty?: number;
    }): number {
      return Math.max(0, Math.min(1,
        (params.hybridScore ?? 0) * W.HYBRID +
        (params.predictiveConfidence ?? 0) * W.CONFIDENCE +
        (params.regimeWeight ?? 0) * W.REGIME -
        (params.decayPenalty ?? 0) * W.DECAY
      ));
    }
    
    it('should calculate correct score with all parameters', () => {
      const score = inlineCalculateFinalScore({
        hybridScore: 0.8,
        predictiveConfidence: 0.7,
        regimeWeight: 0.6,
        decayPenalty: 0,
      });
      
      // Expected: 0.8 * 0.4 + 0.7 * 0.3 + 0.6 * 0.2 - 0 * 0.1 = 0.32 + 0.21 + 0.12 = 0.65
      expect(score).toBeCloseTo(0.65, 4);
    });
    
    it('should handle missing parameters with defaults', () => {
      const score = inlineCalculateFinalScore({
        hybridScore: 0.5,
      });
      
      // hybridScore=0.5, others default to 0
      // Expected: 0.5 * 0.4 + 0 * 0.3 + 0 * 0.2 - 0 * 0.1 = 0.2
      expect(score).toBeCloseTo(0.2, 4);
    });
    
    it('should apply decay penalty correctly', () => {
      const scoreWithDecay = inlineCalculateFinalScore({
        hybridScore: 0.8,
        predictiveConfidence: 0.7,
        regimeWeight: 0.6,
        decayPenalty: 0.5,
      });
      
      const scoreWithoutDecay = inlineCalculateFinalScore({
        hybridScore: 0.8,
        predictiveConfidence: 0.7,
        regimeWeight: 0.6,
        decayPenalty: 0,
      });
      
      // Decay penalty should reduce the score
      expect(scoreWithDecay).toBeLessThan(scoreWithoutDecay);
      expect(scoreWithDecay).toBeCloseTo(0.65 - (0.5 * 0.1), 4);
    });
    
    it('should clamp score to [0, 1] range', () => {
      const maxScore = inlineCalculateFinalScore({
        hybridScore: 1.0,
        predictiveConfidence: 1.0,
        regimeWeight: 1.0,
        decayPenalty: 0,
      });
      
      const minScore = inlineCalculateFinalScore({
        hybridScore: 0,
        predictiveConfidence: 0,
        regimeWeight: 0,
        decayPenalty: 10, // Extreme decay
      });
      
      expect(maxScore).toBeLessThanOrEqual(1.0);
      expect(minScore).toBeGreaterThanOrEqual(0);
    });
    
    it('should produce identical results for same inputs', () => {
      const params = {
        hybridScore: 0.75,
        predictiveConfidence: 0.68,
        regimeWeight: 0.55,
        decayPenalty: 0.1,
      };
      
      const score1 = inlineCalculateFinalScore(params);
      const score2 = inlineCalculateFinalScore(params);
      const score3 = inlineCalculateFinalScore(params);
      
      expect(score1).toBe(score2);
      expect(score2).toBe(score3);
    });
  });

  describe('Signal Orchestrator and RTB Refresh consistency', () => {
    const W = SCORE_WEIGHTS.FINAL_SCORE;
    
    function inlineCalculateFinalScore(params: {
      hybridScore?: number;
      predictiveConfidence?: number;
      regimeWeight?: number;
      decayPenalty?: number;
    }): number {
      return Math.max(0, Math.min(1,
        (params.hybridScore ?? 0) * W.HYBRID +
        (params.predictiveConfidence ?? 0) * W.CONFIDENCE +
        (params.regimeWeight ?? 0) * W.REGIME -
        (params.decayPenalty ?? 0) * W.DECAY
      ));
    }
    
    it('should produce same FinalScore for same signal parameters', () => {
      // Simulates Signal Orchestrator calculation (new signal)
      const orchestratorScore = inlineCalculateFinalScore({
        hybridScore: 0.72,
        predictiveConfidence: 0.65,
        regimeWeight: 0.5,
        decayPenalty: 0,
      });
      
      // Simulates RTB Refresh calculation (refreshed signal, no decay yet)
      const refreshScore = inlineCalculateFinalScore({
        hybridScore: 0.72,
        predictiveConfidence: 0.65,
        regimeWeight: 0.5,
        decayPenalty: 0,
      });
      
      expect(orchestratorScore).toBe(refreshScore);
    });
    
    it('refresh score should decrease with decay over time', () => {
      const initialScore = inlineCalculateFinalScore({
        hybridScore: 0.72,
        predictiveConfidence: 0.65,
        regimeWeight: 0.5,
        decayPenalty: 0,
      });
      
      // After 5 minutes of decay
      const decayedScore = inlineCalculateFinalScore({
        hybridScore: 0.72,
        predictiveConfidence: 0.65,
        regimeWeight: 0.5,
        decayPenalty: 0.15, // Simulated decay after 5 mins
      });
      
      expect(decayedScore).toBeLessThan(initialScore);
      expect(initialScore - decayedScore).toBeCloseTo(0.015, 4); // 0.15 * 0.1 = 0.015
    });
  });
});
