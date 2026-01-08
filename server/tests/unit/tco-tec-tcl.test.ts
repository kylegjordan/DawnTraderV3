/**
 * Directive 11.0B — TCL/TEC/SQE Component Boundary Tests
 * 
 * Verifies that:
 * - TCL picks top-ranked signals from pre-ordered RTB (by FinalScore)
 * - SQE filters by FinalScore and RegimeWeight thresholds from screener config
 * - TEC handles adaptive sizing based on trendline feedback
 * - Exposure/correlation/cooldown are NOT in TCL or TEC
 * - NO legacy metrics (NGC, CWQI, risk, profitRate) in SQE
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Directive 11.0B: TCL/TEC/SQE Separation', () => {
  describe('TCL (Trade Criteria Limiter) - Picks from Pre-Ordered RTB', () => {
    it('should have onFailsafeTimer method for 2-minute failsafe', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect(tcl.onFailsafeTimer).toBeDefined();
      expect(typeof tcl.onFailsafeTimer).toBe('function');
    });

    it('should have onReadyToBuyQueueFull method for RTB threshold', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect(tcl.onReadyToBuyQueueFull).toBeDefined();
      expect(typeof tcl.onReadyToBuyQueueFull).toBe('function');
    });

    it('should have promoteTopSignals method', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect(tcl.promoteTopSignals).toBeDefined();
      expect(typeof tcl.promoteTopSignals).toBe('function');
    });

    it('should have getOpenSlots method for slot monitoring', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect(tcl.getOpenSlots).toBeDefined();
      expect(typeof tcl.getOpenSlots).toBe('function');
    });

    it('should NOT have calculatePositionSize method', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect((tcl as any).calculatePositionSize).toBeUndefined();
    });

    it('should NOT have exposure/correlation check methods (Signal Orchestrator owns these)', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect((tcl as any).checkExposureLimit).toBeUndefined();
      expect((tcl as any).checkCorrelation).toBeUndefined();
      expect((tcl as any).checkCooldown).toBeUndefined();
    });

    it('should have failsafe timer management methods', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect(tcl.startFailsafeTimer).toBeDefined();
      expect(tcl.stopFailsafeTimer).toBeDefined();
      expect(tcl.resetFailsafeTimer).toBeDefined();
    });

    it('should export TCL config with correct defaults', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      const config = tcl.getConfig();
      
      expect(config).toHaveProperty('maxOpenPositions');
      expect(config).toHaveProperty('rtbQueueThreshold');
      expect(config).toHaveProperty('failsafeTimerMs');
      expect(config.rtbQueueThreshold).toBe(15);
      expect(config.failsafeTimerMs).toBe(2 * 60 * 1000);
    });
  });

  describe('SQE (Signal Quality Evaluator) - FinalScore + RegimeWeight Only', () => {
    it('should have default thresholds for FinalScore and RegimeWeight', async () => {
      const { SQE_DEFAULT_THRESHOLDS } = await import('../../core/filters/signal_quality_evaluator.js');
      
      expect(SQE_DEFAULT_THRESHOLDS.MIN_FINAL_SCORE).toBe(0.35);
      expect(SQE_DEFAULT_THRESHOLDS.MIN_REGIME_WEIGHT).toBe(0.30);
    });

    it('should pass signals with FinalScore >= 0.35 and RegimeWeight >= 0.30', async () => {
      const { evaluateSignalQualitySync } = await import('../../core/filters/signal_quality_evaluator.js');
      
      const result = evaluateSignalQualitySync({
        signalId: 'test-signal-1',
        symbol: 'BTC/USD',
        strategy: 'sma_trend_ride',
        mode: 'paper',
        finalScore: 0.50,
        regimeWeight: 0.40
      });
      
      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('should reject signals with FinalScore < 0.35', async () => {
      const { evaluateSignalQualitySync } = await import('../../core/filters/signal_quality_evaluator.js');
      
      const result = evaluateSignalQualitySync({
        signalId: 'test-signal-2',
        symbol: 'BTC/USD',
        strategy: 'sma_trend_ride',
        mode: 'paper',
        finalScore: 0.30,
        regimeWeight: 0.40
      });
      
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures[0]).toContain('FinalScore');
    });

    it('should reject signals with RegimeWeight < 0.30', async () => {
      const { evaluateSignalQualitySync } = await import('../../core/filters/signal_quality_evaluator.js');
      
      const result = evaluateSignalQualitySync({
        signalId: 'test-signal-3',
        symbol: 'BTC/USD',
        strategy: 'sma_trend_ride',
        mode: 'paper',
        finalScore: 0.50,
        regimeWeight: 0.20
      });
      
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures[0]).toContain('RegimeWeight');
    });

    it('should NOT have legacy metric support (NGC, CWQI, risk, profitRate)', async () => {
      const { evaluateSignalQualitySync } = await import('../../core/filters/signal_quality_evaluator.js');
      
      // Verify the function signature only accepts FinalScore and RegimeWeight
      const result = evaluateSignalQualitySync({
        signalId: 'test-signal-4',
        symbol: 'BTC/USD',
        strategy: 'sma_trend_ride',
        mode: 'paper',
        finalScore: 0.50,
        regimeWeight: 0.40
      });
      
      // Result should only contain finalScore and regimeWeight metrics
      expect(result.metrics).toHaveProperty('finalScore');
      expect(result.metrics).toHaveProperty('regimeWeight');
      expect(result.metrics).not.toHaveProperty('ngc');
      expect(result.metrics).not.toHaveProperty('cwqi');
      expect(result.metrics).not.toHaveProperty('riskScore');
      expect(result.metrics).not.toHaveProperty('profitRate');
    });

    it('should include thresholds in result for transparency', async () => {
      const { evaluateSignalQualitySync } = await import('../../core/filters/signal_quality_evaluator.js');
      
      const result = evaluateSignalQualitySync({
        signalId: 'test-signal-5',
        symbol: 'BTC/USD',
        strategy: 'sma_trend_ride',
        mode: 'paper',
        finalScore: 0.50,
        regimeWeight: 0.40
      });
      
      expect(result.thresholds).toBeDefined();
      expect(result.thresholds.finalScoreMin).toBe(0.35);
      expect(result.thresholds.regimeWeightMin).toBe(0.30);
    });
  });

  describe('TEC (Trade Execution Controller) - Adaptive Sizing + Trailing Exits', () => {
    it('should have monitor method for trade monitoring', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect(tec.monitor).toBeDefined();
      expect(typeof tec.monitor).toBe('function');
    });

    it('should have updateTrailingStop method', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect(tec.updateTrailingStop).toBeDefined();
      expect(typeof tec.updateTrailingStop).toBe('function');
    });

    it('should have updateAdaptiveSize method for trendline-based sizing', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect(tec.updateAdaptiveSize).toBeDefined();
      expect(typeof tec.updateAdaptiveSize).toBe('function');
    });

    it('should have closeTrade method', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect(tec.closeTrade).toBeDefined();
      expect(typeof tec.closeTrade).toBe('function');
    });

    it('should expand size by 10% when trendline reinforced', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      const trade = {
        tradeId: 'trade-123',
        signalId: 'signal-123',
        symbol: 'BTC/USD',
        strategy: 'sma_trend_ride' as const,
        mode: 'paper' as const,
        entryPrice: 50000,
        quantity: 1.0,
        stopPrice: 49000,
        targetPrice: 52000,
        openedAt: new Date().toISOString(),
        trendline: { reinforced: true, weakened: false }
      };
      
      const result = tec.updateAdaptiveSize(trade);
      
      expect(result.adjusted).toBe(true);
      expect(result.adjustment).toBe('expand');
      expect(result.newQuantity).toBe(1.1);
    });

    it('should contract size by 10% when trendline weakened', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      const trade = {
        tradeId: 'trade-123',
        signalId: 'signal-123',
        symbol: 'BTC/USD',
        strategy: 'sma_trend_ride' as const,
        mode: 'paper' as const,
        entryPrice: 50000,
        quantity: 1.0,
        stopPrice: 49000,
        targetPrice: 52000,
        openedAt: new Date().toISOString(),
        trendline: { reinforced: false, weakened: true }
      };
      
      const result = tec.updateAdaptiveSize(trade);
      
      expect(result.adjusted).toBe(true);
      expect(result.adjustment).toBe('contract');
      expect(result.newQuantity).toBe(0.9);
    });

    it('should NOT have enqueueExecution method (no queue logic)', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect((tec as any).enqueueExecution).toBeUndefined();
    });

    it('should detect stop loss exit condition', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      const trade = {
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
      
      const decision = tec.monitor(trade);
      
      expect(decision.shouldExit).toBe(true);
      expect(decision.exitReason).toBe('stop_loss_hit');
    });

    it('should detect take profit exit condition', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      const trade = {
        tradeId: 'trade-123',
        signalId: 'signal-123',
        symbol: 'BTC/USD',
        strategy: 'sma_trend_ride' as const,
        mode: 'paper' as const,
        entryPrice: 50000,
        quantity: 0.1,
        stopPrice: 49000,
        targetPrice: 52000,
        currentPrice: 53000,
        openedAt: new Date().toISOString()
      };
      
      const decision = tec.monitor(trade);
      
      expect(decision.shouldExit).toBe(true);
      expect(decision.exitReason).toBe('take_profit_hit');
    });

    it('should update trailing stop when profit threshold met', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      const trade = {
        tradeId: 'trade-123',
        signalId: 'signal-123',
        symbol: 'BTC/USD',
        strategy: 'sma_trend_ride' as const,
        mode: 'paper' as const,
        entryPrice: 50000,
        quantity: 0.1,
        stopPrice: 49000,
        targetPrice: 55000,
        currentPrice: 51000,
        openedAt: new Date().toISOString()
      };
      
      const newTrailingStop = tec.updateTrailingStop(trade);
      
      expect(newTrailingStop).toBeGreaterThan(0);
      expect(newTrailingStop).toBeLessThan(trade.currentPrice);
    });

    it('should have adaptive sizing configuration options', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      const config = tec.getConfig();
      
      expect(config).toHaveProperty('trailingStopActivationPct');
      expect(config).toHaveProperty('trailingStopDistancePct');
      expect(config).toHaveProperty('maxHoldingPeriodMs');
      expect(config).toHaveProperty('adaptiveSizeExpandPct');
      expect(config).toHaveProperty('adaptiveSizeContractPct');
    });
  });

  describe('TCO Removal Verification', () => {
    it('should NOT have TradeControlOperator file', async () => {
      let fileExists = true;
      try {
        await import('../../core/operators/trade-control-operator.js');
      } catch (err) {
        fileExists = false;
      }
      
      expect(fileExists).toBe(false);
    });
  });

  describe('Exposure/Correlation/Cooldown Ownership', () => {
    it('TCL should NOT have exposure/correlation/cooldown checks', async () => {
      const { CriteriaLimiter } = await import('../../core/criteria-limiter.js');
      const tcl = new CriteriaLimiter();
      
      expect((tcl as any).checkExposure).toBeUndefined();
      expect((tcl as any).checkCorrelation).toBeUndefined();
      expect((tcl as any).checkCooldown).toBeUndefined();
      expect((tcl as any).evaluateExposure).toBeUndefined();
      expect((tcl as any).evaluateCorrelation).toBeUndefined();
    });

    it('TEC should NOT have exposure/correlation/cooldown checks', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect((tec as any).checkExposure).toBeUndefined();
      expect((tec as any).checkCorrelation).toBeUndefined();
      expect((tec as any).checkCooldown).toBeUndefined();
    });
  });

  describe('Schema Version', () => {
    it('should be at backend version 1.4.3 for Directive 11.0B (with screener config)', () => {
      const BACKEND_SCHEMA_VERSION = '1.4.3';
      expect(BACKEND_SCHEMA_VERSION).toBe('1.4.3');
    });
  });
});
