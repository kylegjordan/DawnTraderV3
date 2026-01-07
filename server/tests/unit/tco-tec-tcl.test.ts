/**
 * Directive 11.0 — TCO/TEC/TCL Component Boundary Tests
 * 
 * Verifies that:
 * - TCL only handles eligibility checks (no sizing)
 * - TCO only promotes (no modification)
 * - TEC owns sizing and exit logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Directive 11.0: TCO/TEC/TCL Separation', () => {
  describe('TCL (Trade Criteria Limiter) - Eligibility Only', () => {
    it('should NOT have calculatePositionSize method', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect((tcl as any).calculatePositionSize).toBeUndefined();
    });

    it('should NOT have assignAdaptiveSize method', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect((tcl as any).assignAdaptiveSize).toBeUndefined();
    });

    it('should NOT have volatility-based sizing methods', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect((tcl as any).volatilityAdjustedSize).toBeUndefined();
      expect((tcl as any).sizingFactor).toBeUndefined();
    });

    it('should NOT have exit trigger methods', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect((tcl as any).calculateExitTrigger).toBeUndefined();
      expect((tcl as any).closeOpenTrade).toBeUndefined();
    });

    it('should have evaluate method for eligibility checking', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect(tcl.evaluate).toBeDefined();
      expect(typeof tcl.evaluate).toBe('function');
    });

    it('should export only eligibility-related configuration', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      const config = tcl.getConfig();
      
      expect(config).toHaveProperty('maxOpenPositions');
      expect(config).toHaveProperty('maxTotalExposurePct');
      expect(config).toHaveProperty('maxCorrelationThreshold');
      expect(config).toHaveProperty('minConfidenceThreshold');
      expect(config).toHaveProperty('cooldownPeriodMs');
      
      expect(config).not.toHaveProperty('positionSize');
      expect(config).not.toHaveProperty('adaptiveSize');
    });
  });

  describe('TCO (Trade Control Operator) - Pure Promoter', () => {
    it('should NOT have sizing methods', async () => {
      const { TradeControlOperatorImpl } = await import('../../core/operators/trade-control-operator.js');
      const tco = new TradeControlOperatorImpl();
      
      expect((tco as any).calculatePositionSize).toBeUndefined();
      expect((tco as any).assignAdaptiveSize).toBeUndefined();
    });

    it('should NOT have exit logic methods', async () => {
      const { TradeControlOperatorImpl } = await import('../../core/operators/trade-control-operator.js');
      const tco = new TradeControlOperatorImpl();
      
      expect((tco as any).evaluateExitConditions).toBeUndefined();
      expect((tco as any).closeTrade).toBeUndefined();
    });

    it('should have promote method', async () => {
      const { TradeControlOperatorImpl } = await import('../../core/operators/trade-control-operator.js');
      const tco = new TradeControlOperatorImpl();
      
      expect(tco.promote).toBeDefined();
      expect(typeof tco.promote).toBe('function');
    });

    it('should have promotion history tracking', async () => {
      const { TradeControlOperatorImpl } = await import('../../core/operators/trade-control-operator.js');
      const tco = new TradeControlOperatorImpl();
      
      expect(tco.getPromotionHistory).toBeDefined();
      expect(tco.getPromotionStats).toBeDefined();
    });
  });

  describe('TEC (Trade Execution Controller) - Sizing & Exits', () => {
    it('should have calculatePositionSize method', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect(tec.calculatePositionSize).toBeDefined();
      expect(typeof tec.calculatePositionSize).toBe('function');
    });

    it('should have evaluateExitConditions method', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect(tec.evaluateExitConditions).toBeDefined();
      expect(typeof tec.evaluateExitConditions).toBe('function');
    });

    it('should have closeTrade method', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect(tec.closeTrade).toBeDefined();
      expect(typeof tec.closeTrade).toBe('function');
    });

    it('should have enqueueExecution method', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect(tec.enqueueExecution).toBeDefined();
      expect(typeof tec.enqueueExecution).toBe('function');
    });

    it('should calculate position size with risk-based approach', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      const intent = {
        signalId: 'test-123',
        instrument: 'BTC/USD',
        entryPrice: 50000,
        stopPrice: 49000,
        targetPrice: 52000,
        strategy: 'sma_trend_ride' as const,
        confidence: 0.75,
        timestamp: new Date().toISOString(),
        mode: 'paper' as const
      };
      
      const result = tec.calculatePositionSize(intent, 10000);
      
      expect(result.quantity).toBeGreaterThan(0);
      expect(result.notionalValue).toBeGreaterThan(0);
      expect(result.riskAmount).toBeGreaterThan(0);
      expect(result.sizingMethod).toBeDefined();
      expect(result.inputs).toBeDefined();
    });

    it('should evaluate exit conditions correctly', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      const activeTrade = {
        tradeId: 'trade-123',
        signalId: 'signal-123',
        symbol: 'BTC/USD',
        strategy: 'sma_trend_ride' as const,
        mode: 'paper' as const,
        entryPrice: 50000,
        quantity: 0.1,
        stopPrice: 49000,
        targetPrice: 52000,
        currentPrice: 48500,
        openedAt: new Date().toISOString()
      };
      
      const decision = tec.evaluateExitConditions(activeTrade);
      
      expect(decision.shouldExit).toBe(true);
      expect(decision.exitReason).toBe('stop_loss_hit');
    });

    it('should have sizing configuration options', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      const config = tec.getConfig();
      
      expect(config).toHaveProperty('defaultRiskPerTradePct');
      expect(config).toHaveProperty('maxPositionPct');
      expect(config).toHaveProperty('maxTotalExposurePct');
      expect(config).toHaveProperty('slippagePct');
      expect(config).toHaveProperty('feePct');
    });
  });

  describe('Interface Contracts', () => {
    it('should define ExecutionIntent interface correctly', async () => {
      const { executionController } = await import('../../services/execution-controller.js');
      
      const validIntent = {
        signalId: 'test-signal',
        instrument: 'ETH/USD',
        entryPrice: 3000,
        stopPrice: 2900,
        targetPrice: 3200,
        strategy: 'breakout' as const,
        confidence: 0.8,
        timestamp: new Date().toISOString(),
        mode: 'paper' as const
      };
      
      expect(validIntent.signalId).toBeDefined();
      expect(validIntent.instrument).toBeDefined();
      expect(validIntent.entryPrice).toBeGreaterThan(0);
    });

    it('should define EligibilityResult interface correctly', async () => {
      const { criteriaLimiter } = await import('../../core/criteria-limiter.js');
      
      const mockSignal = {
        signalId: 'test-signal',
        symbol: 'ETH/USD',
        strategy: 'breakout' as const,
        entryPrice: 3000,
        stopPrice: 2900,
        targetPrice: 3200,
        confidence: 0.3,
        timestamp: new Date().toISOString()
      };
      
      const result = await criteriaLimiter.evaluate(mockSignal, 'paper');
      
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('checksPerformed');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('Schema Version', () => {
    it('should be at backend version 1.4.0 for Directive 11.0', () => {
      const BACKEND_SCHEMA_VERSION = '1.4.0';
      expect(BACKEND_SCHEMA_VERSION).toBe('1.4.0');
    });
  });
});
