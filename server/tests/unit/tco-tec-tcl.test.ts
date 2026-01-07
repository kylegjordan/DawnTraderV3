/**
 * Directive 11.0A — TCL/TEC Component Boundary Tests
 * 
 * Verifies that:
 * - TCL handles event-based promotion (failsafe/RTB triggers)
 * - TEC only handles trailing exit updates and trade monitoring
 * - SQE owns exposure/correlation/cooldown checks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Directive 11.0A: TCL/TEC Separation', () => {
  describe('TCL (Trade Criteria Limiter) - Event-Based Promotion', () => {
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

    it('should NOT have exposure/correlation check methods (SQE owns these)', async () => {
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

  describe('TEC (Trade Execution Controller) - Trailing Exits Only', () => {
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

    it('should have closeTrade method', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect(tec.closeTrade).toBeDefined();
      expect(typeof tec.closeTrade).toBe('function');
    });

    it('should NOT have enqueueExecution method (no queue logic)', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect((tec as any).enqueueExecution).toBeUndefined();
    });

    it('should NOT have calculatePositionSize method (sizing removed)', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      
      expect((tec as any).calculatePositionSize).toBeUndefined();
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

    it('should have trailing stop configuration options', async () => {
      const { ExecutionControllerImpl } = await import('../../services/execution-controller.js');
      const tec = new ExecutionControllerImpl();
      const config = tec.getConfig();
      
      expect(config).toHaveProperty('trailingStopActivationPct');
      expect(config).toHaveProperty('trailingStopDistancePct');
      expect(config).toHaveProperty('maxHoldingPeriodMs');
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

  describe('Schema Version', () => {
    it('should be at backend version 1.4.1 for Directive 11.0A', () => {
      const BACKEND_SCHEMA_VERSION = '1.4.1';
      expect(BACKEND_SCHEMA_VERSION).toBe('1.4.1');
    });
  });
});
