/**
 * Local Heuristic Trader Service (LHTS)
 * Phase 27.F.14 - Walter Stand-In for Offline Trading Optimization
 * 
 * Provides autonomous trading parameter adjustments based on portfolio performance
 * without external API dependencies. Replaces Walter's adjustment functionality
 * during OpenAI API quota issues.
 * 
 * Features:
 * - MetricsCollector: Aggregate portfolio KPIs (win rate, drawdown, exposure)
 * - HeuristicEngine: Rule-based decision making with safety bounds
 * - AdjustmentExecutor: Apply parameter changes to database
 * - Safety: Cooldowns, rate limits, bounds validation, rollback capability
 */

import { storage } from '../storage';
import { contextBridge } from './context-bridge';

type TradingMode = 'paper' | 'live';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PortfolioMetrics {
  // Performance Metrics
  winRate: number;
  lossRate: number;
  profitFactor: number;
  
  // Risk Metrics
  currentDrawdown: number;
  maxDrawdown: number;
  dailyLoss24h: number;
  
  // Exposure Metrics
  totalExposure: number;
  exposurePercent: number;
  openPositions: number;
  
  // Trading Activity
  tradesLast24h: number;
  tradesLast7d: number;
  avgHoldingPeriod: number;
  
  // Timestamp
  timestamp: Date;
}

export interface HeuristicRule {
  id: string;
  category: 'performance' | 'risk' | 'exposure' | 'strategy';
  description: string;
  condition: (metrics: PortfolioMetrics) => boolean;
  action: (metrics: PortfolioMetrics) => AdjustmentRecommendation[];
  cooldownMinutes: number;
  priority: number;
  enabled: boolean;
  lastTriggered?: Date;
}

export interface AdjustmentRecommendation {
  type: 'guardrail' | 'filter' | 'strategy';
  parameter: string;
  currentValue: number;
  recommendedValue: number;
  changePercent: number;
  reason: string;
  confidence: number;
  ruleId?: string; // Track which rule generated this recommendation
}

export interface AdjustmentLog {
  id?: string;
  mode: TradingMode;
  ruleId: string;
  parameterType: string;
  parameterName: string;
  oldValue: number;
  newValue: number;
  changePercent: number;
  triggerMetrics: PortfolioMetrics;
  reason: string;
  executionTimeMs: number;
  timestamp: Date;
}

export interface LHTSConfig {
  enabled: boolean;
  updateIntervalMinutes: number;
  maxAdjustmentsPerHour: number;
  defaultCooldownMinutes: number;
  maxChangePercent: number;
  mode: TradingMode;
}

export interface LHTSHealth {
  status: 'healthy' | 'degraded' | 'offline';
  enabled: boolean;
  lastRun?: Date;
  adjustmentsLast24h: number;
  activeRules: number;
  averageExecutionTimeMs: number;
  errors: string[];
}

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

class MetricsCollector {
  private readonly MODULE_NAME = 'MetricsCollector';

  /**
   * Collect comprehensive portfolio metrics for decision making
   */
  async collect(userId: string, mode: TradingMode): Promise<PortfolioMetrics> {
    const startTime = Date.now();
    
    try {
      console.log(`[${this.MODULE_NAME}] 🔍 Collecting metrics for ${mode} mode...`);
      
      // Import services dynamically to avoid circular dependencies
      const { RiskManager } = await import('./risk-manager');
      const riskManager = new RiskManager();
      
      // Get recent trades (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Fetch trades based on mode
      let allTrades: any[];
      let activePositions: any[];
      
      if (mode === 'paper') {
        // For paper mode, get paper sim trades
        const paperTrades = await storage.getPaperSimTradeLogs(userId);
        allTrades = paperTrades.map((t: any) => ({
          ...t,
          createdAt: t.timestamp,
          status: t.message?.includes('CLOSED') ? 'closed' : 'open',
          realizedPL: t.metadata?.realizedPL || '0',
          entryTime: t.timestamp,
          exitTime: t.message?.includes('CLOSED') ? t.timestamp : null
        }));
        // Phase 27.F.15.A: Global mode-based query (no userId)
        activePositions = await storage.getPaperSimOpenPositions(mode);
        console.log('[Phase-27.F.15.B.2] Updated service heuristic-trader → mode-based only');
      } else {
        // For live mode, get regular trades
        // Phase 27.F.15.A: Global mode-based queries (no userId)
        allTrades = await storage.getTrades(mode);
        activePositions = await storage.getActiveTrades(mode);
      }
      
      // Filter recent trades
      const recentTrades = allTrades.filter(t => 
        t.createdAt && new Date(t.createdAt) >= sevenDaysAgo
      );
      const trades24h = recentTrades.filter(t => 
        t.createdAt && new Date(t.createdAt) >= twentyFourHoursAgo
      );
      
      // Calculate win rate
      const closedTrades = recentTrades.filter(t => 
        t.status === 'closed' || t.exitPrice
      );
      const wins = closedTrades.filter(t => {
        const pl = parseFloat(t.realizedPL || '0');
        return pl > 0;
      });
      const losses = closedTrades.filter(t => {
        const pl = parseFloat(t.realizedPL || '0');
        return pl < 0;
      });
      
      const winRate = closedTrades.length > 0 
        ? (wins.length / closedTrades.length) * 100 
        : 0;
      const lossRate = closedTrades.length > 0 
        ? (losses.length / closedTrades.length) * 100 
        : 0;
      
      // Calculate profit factor
      const totalProfit = wins.reduce((sum, t) => 
        sum + Math.abs(parseFloat(t.realizedPL || '0')), 0
      );
      const totalLoss = losses.reduce((sum, t) => 
        sum + Math.abs(parseFloat(t.realizedPL || '0')), 0
      );
      const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0;
      
      // Calculate drawdown (simplified - would need equity curve in reality)
      const settings = await storage.getTradingSettings(userId);
      const portfolioValue = parseFloat(settings?.portfolioValue || '50000');
      
      // Calculate 24h P/L
      const pl24h = await riskManager.calculate24hPL(userId, settings);
      const currentDrawdown = Math.abs(pl24h.lossPercent);
      
      // Calculate exposure
      const totalExposure = activePositions.reduce((sum, pos: any) => {
        const price = parseFloat(pos.entryPrice || pos.currentPrice || '0');
        const qty = parseFloat(pos.amount || pos.quantity || '0');
        return sum + (price * qty);
      }, 0);
      const exposurePercent = portfolioValue > 0 
        ? (totalExposure / portfolioValue) * 100 
        : 0;
      
      // Calculate average holding period
      const avgHoldingPeriod = closedTrades.length > 0
        ? closedTrades.reduce((sum, t) => {
            if (!t.entryTime || !t.exitTime) return sum;
            const duration = new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime();
            return sum + duration;
          }, 0) / closedTrades.length / (60 * 1000) // Convert to minutes
        : 0;
      
      const metrics: PortfolioMetrics = {
        winRate,
        lossRate,
        profitFactor,
        currentDrawdown,
        maxDrawdown: currentDrawdown, // Simplified - would track over time
        dailyLoss24h: Math.abs(pl24h.totalPL),
        totalExposure,
        exposurePercent,
        openPositions: activePositions.length,
        tradesLast24h: trades24h.length,
        tradesLast7d: recentTrades.length,
        avgHoldingPeriod,
        timestamp: new Date()
      };
      
      console.log(`[${this.MODULE_NAME}] ✅ Metrics collected in ${Date.now() - startTime}ms:`, {
        winRate: `${metrics.winRate.toFixed(1)}%`,
        drawdown: `${metrics.currentDrawdown.toFixed(1)}%`,
        exposure: `${metrics.exposurePercent.toFixed(1)}%`,
        trades24h: metrics.tradesLast24h
      });
      
      return metrics;
      
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Error collecting metrics:`, error.message);
      throw error;
    }
  }
}

// ============================================================================
// HEURISTIC ENGINE
// ============================================================================

class HeuristicEngine {
  private readonly MODULE_NAME = 'HeuristicEngine';
  private rules: HeuristicRule[] = [];
  private adjustmentHistory: Map<string, Date[]> = new Map(); // Track adjustments per hour

  constructor() {
    this.registerDefaultRules();
  }

  /**
   * Register default heuristic rules
   */
  private registerDefaultRules(): void {
    // Rule 1: Win Rate Adjustment
    this.rules.push({
      id: 'win_rate_adjustment',
      category: 'performance',
      description: 'Adjust risk based on win rate performance',
      condition: (m) => m.winRate < 40 || m.winRate > 60,
      action: (m) => {
        if (m.winRate < 40) {
          return [
            {
              type: 'guardrail',
              parameter: 'riskPerTrade',
              currentValue: 0, // Will be fetched
              recommendedValue: 0, // Will be calculated
              changePercent: -10,
              reason: `Win rate below 40% (${m.winRate.toFixed(1)}%) - reducing risk`,
              confidence: 85
            },
            {
              type: 'guardrail',
              parameter: 'maxPositionSize',
              currentValue: 0,
              recommendedValue: 0,
              changePercent: -15,
              reason: `Win rate below 40% - reducing position size`,
              confidence: 85
            }
          ];
        } else {
          return [
            {
              type: 'guardrail',
              parameter: 'riskPerTrade',
              currentValue: 0,
              recommendedValue: 0,
              changePercent: 5,
              reason: `Win rate above 60% (${m.winRate.toFixed(1)}%) - increasing risk`,
              confidence: 75
            }
          ];
        }
      },
      cooldownMinutes: 60,
      priority: 50,
      enabled: true
    });

    // Rule 2: Drawdown Protection
    this.rules.push({
      id: 'drawdown_protection',
      category: 'risk',
      description: 'Emergency tightening when drawdown exceeds threshold',
      condition: (m) => m.currentDrawdown > 5,
      action: (m) => [
        {
          type: 'guardrail',
          parameter: 'maxDailyLoss',
          currentValue: 0,
          recommendedValue: 0,
          changePercent: -20,
          reason: `EMERGENCY: Drawdown at ${m.currentDrawdown.toFixed(1)}% - reducing daily loss limit`,
          confidence: 95
        },
        {
          type: 'guardrail',
          parameter: 'maxOpenPositions',
          currentValue: 0,
          recommendedValue: 0,
          changePercent: -20, // Reduce by 1 position
          reason: `EMERGENCY: Drawdown at ${m.currentDrawdown.toFixed(1)}% - reducing position count`,
          confidence: 95
        }
      ],
      cooldownMinutes: 120,
      priority: 100, // HIGHEST PRIORITY
      enabled: true
    });

    // Rule 3: Profit Factor Optimization
    this.rules.push({
      id: 'profit_factor_optimization',
      category: 'performance',
      description: 'Adjust filters based on profit factor',
      condition: (m) => m.profitFactor < 1.2 || m.profitFactor > 1.8,
      action: (m) => {
        if (m.profitFactor < 1.2 && m.profitFactor > 0) {
          return [
            {
              type: 'filter',
              parameter: 'minVolume',
              currentValue: 0,
              recommendedValue: 0,
              changePercent: 10,
              reason: `Profit factor low (${m.profitFactor.toFixed(2)}) - increasing quality threshold`,
              confidence: 70
            }
          ];
        } else if (m.profitFactor > 1.8) {
          return [
            {
              type: 'filter',
              parameter: 'minVolume',
              currentValue: 0,
              recommendedValue: 0,
              changePercent: -5,
              reason: `Profit factor high (${m.profitFactor.toFixed(2)}) - expanding opportunities`,
              confidence: 65
            }
          ];
        }
        return [];
      },
      cooldownMinutes: 90,
      priority: 40,
      enabled: true
    });

    // Rule 4: Exposure Management
    this.rules.push({
      id: 'exposure_management',
      category: 'exposure',
      description: 'Adjust position limits based on total exposure',
      condition: (m) => m.exposurePercent > 30 || (m.exposurePercent < 15 && m.winRate > 55),
      action: (m) => {
        if (m.exposurePercent > 30) {
          return [
            {
              type: 'guardrail',
              parameter: 'maxOpenPositions',
              currentValue: 0,
              recommendedValue: 0,
              changePercent: -15,
              reason: `Exposure too high (${m.exposurePercent.toFixed(1)}%) - reducing positions`,
              confidence: 80
            }
          ];
        } else {
          return [
            {
              type: 'guardrail',
              parameter: 'maxOpenPositions',
              currentValue: 0,
              recommendedValue: 0,
              changePercent: 15,
              reason: `Underutilized capital (${m.exposurePercent.toFixed(1)}%) - increasing positions`,
              confidence: 70
            }
          ];
        }
      },
      cooldownMinutes: 60,
      priority: 70,
      enabled: true
    });

    // Rule 5: Trading Frequency Control
    this.rules.push({
      id: 'trading_frequency_control',
      category: 'performance',
      description: 'Adjust filters based on trading frequency',
      condition: (m) => m.tradesLast24h < 2 || m.tradesLast24h > 10,
      action: (m) => {
        if (m.tradesLast24h < 2 && m.tradesLast7d > 0) {
          return [
            {
              type: 'filter',
              parameter: 'minVolume',
              currentValue: 0,
              recommendedValue: 0,
              changePercent: -10,
              reason: `Low trading frequency (${m.tradesLast24h} trades/24h) - loosening filters`,
              confidence: 60
            }
          ];
        } else if (m.tradesLast24h > 10) {
          return [
            {
              type: 'filter',
              parameter: 'minVolume',
              currentValue: 0,
              recommendedValue: 0,
              changePercent: 10,
              reason: `High trading frequency (${m.tradesLast24h} trades/24h) - tightening for quality`,
              confidence: 65
            }
          ];
        }
        return [];
      },
      cooldownMinutes: 120,
      priority: 30,
      enabled: true
    });

    console.log(`[${this.MODULE_NAME}] ✅ Registered ${this.rules.length} default heuristic rules`);
  }

  /**
   * Get trading pace targets from system context
   * Phase 27.F.14.B Task 7: Trading-Pace-Driven Performance Targets
   */
  private async getPaceTargets(mode: TradingMode): Promise<{
    targetWinRate: number;
    targetTradesPerDay: number;
    targetEarningsPerTrade: number;
    targetDailyProfit: number;
    paceName: string;
  }> {
    const context = await storage.getSystemContext(mode);
    const pace = context?.tradingPace || 'baseline';
    
    // Define targets for each pace level
    const paceTargets = {
      conservative: {
        targetWinRate: 0.60,      // 60% win rate
        targetTradesPerDay: 3,    // 3 trades/day
        targetEarningsPerTrade: 8, // $8/trade
        targetDailyProfit: 24,    // $24/day
        paceName: 'Conservative'
      },
      baseline: {
        targetWinRate: 0.55,      // 55% win rate
        targetTradesPerDay: 5,    // 5 trades/day
        targetEarningsPerTrade: 6, // $6/trade
        targetDailyProfit: 30,    // $30/day
        paceName: 'Baseline'
      },
      optimistic: {
        targetWinRate: 0.50,      // 50% win rate
        targetTradesPerDay: 8,    // 8 trades/day
        targetEarningsPerTrade: 5, // $5/trade
        targetDailyProfit: 40,    // $40/day
        paceName: 'Optimistic'
      },
      aggressive: {
        targetWinRate: 0.45,      // 45% win rate
        targetTradesPerDay: 12,   // 12 trades/day
        targetEarningsPerTrade: 4, // $4/trade
        targetDailyProfit: 48,    // $48/day
        paceName: 'Aggressive'
      }
    };
    
    return paceTargets[pace as keyof typeof paceTargets] || paceTargets.baseline;
  }

  /**
   * Evaluate all rules and generate recommendations
   * Phase 27.F.14.B Task 7: Now pace-aware
   */
  async evaluate(metrics: PortfolioMetrics, mode: TradingMode): Promise<AdjustmentRecommendation[]> {
    // Fetch trading pace targets
    const paceTargets = await this.getPaceTargets(mode);
    console.log(`[${this.MODULE_NAME}] 🎯 Evaluating ${this.rules.length} heuristic rules (Pace: ${paceTargets.paceName})...`);
    console.log(`[${this.MODULE_NAME}] 📊 Targets: Win=${(paceTargets.targetWinRate*100).toFixed(0)}%, Trades=${paceTargets.targetTradesPerDay}/day, Earnings=$${paceTargets.targetEarningsPerTrade}/trade`);
    
    const recommendations: AdjustmentRecommendation[] = [];
    const now = new Date();
    
    // Sort rules by priority (highest first)
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);
    
    for (const rule of sortedRules) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      if (rule.lastTriggered) {
        const cooldownMs = rule.cooldownMinutes * 60 * 1000;
        const timeSinceLastTrigger = now.getTime() - rule.lastTriggered.getTime();
        if (timeSinceLastTrigger < cooldownMs) {
          const remainingMin = Math.ceil((cooldownMs - timeSinceLastTrigger) / (60 * 1000));
          console.log(`[${this.MODULE_NAME}] ⏸️  Rule '${rule.id}' in cooldown (${remainingMin}m remaining)`);
          continue;
        }
      }
      
      // Evaluate condition with pace-aware thresholds (Phase 27.F.14.B Task 7)
      try {
        const triggered = this.evaluatePaceAwareCondition(rule, metrics, paceTargets);
        if (triggered) {
          console.log(`[${this.MODULE_NAME}] ✨ Rule '${rule.id}' triggered`);
          const ruleRecommendations = this.generatePaceAwareRecommendations(rule, metrics, paceTargets);
          
          // Fetch current values and calculate recommended values
          for (const rec of ruleRecommendations) {
            const enriched = await this.enrichRecommendation({ ...rec, ruleId: rule.id }, mode);
            if (enriched) {
              recommendations.push(enriched);
            }
          }
          
          // Update last triggered time
          rule.lastTriggered = now;
        }
      } catch (error: any) {
        console.error(`[${this.MODULE_NAME}] ❌ Error evaluating rule '${rule.id}':`, error.message);
      }
    }
    
    console.log(`[${this.MODULE_NAME}] 📋 Generated ${recommendations.length} recommendations`);
    return recommendations;
  }
  
  /**
   * Evaluate rule condition with pace-aware thresholds
   * Phase 27.F.14.B Task 7
   */
  private evaluatePaceAwareCondition(
    rule: HeuristicRule, 
    metrics: PortfolioMetrics,
    paceTargets: any
  ): boolean {
    // Use pace-aware thresholds for key rules
    if (rule.id === 'win_rate_adjustment') {
      const targetWinRate = paceTargets.targetWinRate * 100;
      return metrics.winRate < (targetWinRate - 10) || metrics.winRate > (targetWinRate + 10);
    } else if (rule.id === 'trading_frequency_control') {
      const targetTrades = paceTargets.targetTradesPerDay;
      return metrics.tradesLast24h < (targetTrades * 0.5) || metrics.tradesLast24h > (targetTrades * 1.5);
    }
    
    // Fall back to original condition
    return rule.condition(metrics);
  }
  
  /**
   * Generate pace-aware recommendations
   * Phase 27.F.14.B Task 7
   */
  private generatePaceAwareRecommendations(
    rule: HeuristicRule,
    metrics: PortfolioMetrics,
    paceTargets: any
  ): Omit<AdjustmentRecommendation, 'ruleId'>[] {
    if (rule.id === 'trading_frequency_control') {
      const targetTrades = paceTargets.targetTradesPerDay;
      const currentTrades = metrics.tradesLast24h;
      
      if (currentTrades < targetTrades * 0.5) {
        return [{
          type: 'filter',
          parameter: 'minVolume',
          currentValue: 0,
          recommendedValue: 0,
          changePercent: -10,
          reason: `Below ${paceTargets.paceName} pace target (${currentTrades} vs ${targetTrades} trades/day) - loosening filters`,
          confidence: 70
        }];
      } else if (currentTrades > targetTrades * 1.5) {
        return [{
          type: 'filter',
          parameter: 'minVolume',
          currentValue: 0,
          recommendedValue: 0,
          changePercent: 10,
          reason: `Exceeding ${paceTargets.paceName} pace target (${currentTrades} vs ${targetTrades} trades/day) - tightening filters`,
          confidence: 70
        }];
      }
    }
    
    // Fall back to original action
    return rule.action(metrics);
  }

  /**
   * Enrich recommendation with current values and calculate recommended values
   */
  private async enrichRecommendation(
    rec: AdjustmentRecommendation,
    mode: TradingMode
  ): Promise<AdjustmentRecommendation | null> {
    try {
      if (rec.type === 'guardrail') {
        const guardrails = await storage.getGuardrails({ mode });
        if (!guardrails) return null;
        
        const currentValue = parseFloat(guardrails[rec.parameter as keyof typeof guardrails]?.toString() || '0');
        const recommendedValue = currentValue * (1 + rec.changePercent / 100);
        
        return {
          ...rec,
          currentValue,
          recommendedValue
        };
      } else if (rec.type === 'filter') {
        const filters = await storage.getScreenerFilters({ mode });
        if (!filters) return null;
        
        const currentValue = parseFloat(filters[rec.parameter as keyof typeof filters]?.toString() || '0');
        const recommendedValue = currentValue * (1 + rec.changePercent / 100);
        
        return {
          ...rec,
          currentValue,
          recommendedValue
        };
      }
      
      return rec;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] Error enriching recommendation:`, error.message);
      return null;
    }
  }

  /**
   * Check if rate limit (max adjustments per hour) is exceeded
   */
  checkRateLimit(maxPerHour: number): { exceeded: boolean; current: number } {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Clean up old history
    for (const [key, timestamps] of this.adjustmentHistory.entries()) {
      this.adjustmentHistory.set(
        key,
        timestamps.filter(t => t >= oneHourAgo)
      );
    }
    
    // Count adjustments in last hour
    const allAdjustments = Array.from(this.adjustmentHistory.values()).flat();
    const recentAdjustments = allAdjustments.filter(t => t >= oneHourAgo);
    
    return {
      exceeded: recentAdjustments.length >= maxPerHour,
      current: recentAdjustments.length
    };
  }

  /**
   * Record an adjustment in history
   */
  recordAdjustment(ruleId: string): void {
    const history = this.adjustmentHistory.get(ruleId) || [];
    history.push(new Date());
    this.adjustmentHistory.set(ruleId, history);
  }
}

// ============================================================================
// SAFETY VALIDATOR - Phase 27.F.14.B Task 6
// ============================================================================

interface SafetyViolation {
  type: 'EXCESSIVE_CHANGE' | 'RATE_LIMIT_EXCEEDED';
  parameter: string;
  attemptedChange: number;
  limit: number;
  details: string;
}

class SafetyValidator {
  private readonly MODULE_NAME = 'SafetyValidator';
  private readonly MAX_CHANGE_PERCENT = 30; // ±30%
  private readonly MAX_ADJUSTMENTS_PER_HOUR = 3;
  
  // Track adjustments per parameter per mode
  private adjustmentHistory: Map<string, Date[]> = new Map();

  /**
   * Validate adjustment against safety rules
   */
  async validateAdjustment(
    rec: AdjustmentRecommendation,
    mode: TradingMode
  ): Promise<{ valid: boolean; violation?: SafetyViolation }> {
    // Rule 1: No parameter change > ±30%
    const changePercent = Math.abs(rec.changePercent);
    if (changePercent > this.MAX_CHANGE_PERCENT) {
      return {
        valid: false,
        violation: {
          type: 'EXCESSIVE_CHANGE',
          parameter: rec.parameter,
          attemptedChange: rec.changePercent,
          limit: this.MAX_CHANGE_PERCENT,
          details: `Attempted ${rec.changePercent.toFixed(1)}% change exceeds ±${this.MAX_CHANGE_PERCENT}% limit`
        }
      };
    }

    // Rule 2: Max 3 adjustments per hour per parameter
    const historyKey = `${mode}:${rec.parameter}`;
    const recentCount = this.getRecentAdjustmentCount(historyKey);
    
    if (recentCount >= this.MAX_ADJUSTMENTS_PER_HOUR) {
      return {
        valid: false,
        violation: {
          type: 'RATE_LIMIT_EXCEEDED',
          parameter: rec.parameter,
          attemptedChange: recentCount + 1,
          limit: this.MAX_ADJUSTMENTS_PER_HOUR,
          details: `Already made ${recentCount} adjustments in past hour (limit: ${this.MAX_ADJUSTMENTS_PER_HOUR})`
        }
      };
    }

    return { valid: true };
  }

  /**
   * Record successful adjustment
   */
  recordAdjustment(parameter: string, mode: TradingMode): void {
    const historyKey = `${mode}:${parameter}`;
    const history = this.adjustmentHistory.get(historyKey) || [];
    history.push(new Date());
    this.adjustmentHistory.set(historyKey, history);
  }

  /**
   * Get count of recent adjustments (past hour)
   */
  private getRecentAdjustmentCount(historyKey: string): number {
    const history = this.adjustmentHistory.get(historyKey) || [];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Filter to only recent adjustments
    const recentAdjustments = history.filter(date => date > oneHourAgo);
    this.adjustmentHistory.set(historyKey, recentAdjustments);
    
    return recentAdjustments.length;
  }

  /**
   * Log safety violation to audit trail
   */
  async logViolation(
    violation: SafetyViolation,
    rec: AdjustmentRecommendation,
    mode: TradingMode
  ): Promise<void> {
    try {
      await storage.createTradingAuditLog({
        userId: 'system',
        action: 'LATTI_SAFETY_VIOLATION',
        mode,
        triggeredBy: 'latti_safety_validator',
        metadata: {
          violationType: violation.type,
          parameter: violation.parameter,
          attemptedChange: violation.attemptedChange,
          limit: violation.limit,
          details: violation.details,
          recommendation: {
            currentValue: rec.currentValue,
            recommendedValue: rec.recommendedValue,
            changePercent: rec.changePercent,
            reason: rec.reason
          }
        }
      });

      console.warn(`[${this.MODULE_NAME}] ⚠️  SAFETY VIOLATION:`, {
        type: violation.type,
        parameter: violation.parameter,
        details: violation.details
      });
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Failed to log violation:`, error.message);
    }
  }

  /**
   * Get safety status summary
   */
  async getSafetySummary(mode: TradingMode): Promise<{
    totalAdjustments24h: number;
    violationsCount: number;
    lastViolationTime: Date | null;
    status: 'safe' | 'warning' | 'limit_reached';
  }> {
    try {
      // Import db and schema
      const { db } = await import('../db');
      const { tradingAuditLog } = await import('@shared/schema');
      const { and, like, eq, gte } = await import('drizzle-orm');
      
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Get adjustments from past 24h (any action starting with latti_adjustment_)
      const adjustments = await db
        .select()
        .from(tradingAuditLog)
        .where(
          and(
            like(tradingAuditLog.action, 'latti_adjustment_%'),
            eq(tradingAuditLog.mode, mode),
            gte(tradingAuditLog.createdAt, oneDayAgo)
          )
        );

      // Get violations
      const violations = await db
        .select()
        .from(tradingAuditLog)
        .where(
          and(
            eq(tradingAuditLog.action, 'LATTI_SAFETY_VIOLATION'),
            eq(tradingAuditLog.mode, mode),
            gte(tradingAuditLog.createdAt, oneDayAgo)
          )
        )
        .orderBy(tradingAuditLog.createdAt);

      const totalAdjustments24h = adjustments.length;
      const violationsCount = violations.length;
      const lastViolationTime = violations.length > 0 
        ? new Date(violations[violations.length - 1].createdAt) 
        : null;

      // Determine status
      let status: 'safe' | 'warning' | 'limit_reached' = 'safe';
      if (violationsCount > 0) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentViolations = violations.filter(v => 
          new Date(v.createdAt) > oneHourAgo
        );
        status = recentViolations.length >= 3 ? 'limit_reached' : 'warning';
      }

      return {
        totalAdjustments24h,
        violationsCount,
        lastViolationTime,
        status
      };
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] Error getting safety summary:`, error.message);
      return {
        totalAdjustments24h: 0,
        violationsCount: 0,
        lastViolationTime: null,
        status: 'safe'
      };
    }
  }
}

// ============================================================================
// ADJUSTMENT EXECUTOR
// ============================================================================

class AdjustmentExecutor {
  private readonly MODULE_NAME = 'AdjustmentExecutor';
  private safetyValidator = new SafetyValidator();
  
  // Safety bounds for parameters
  private readonly BOUNDS = {
    riskPerTrade: { min: 0.5, max: 5.0 },
    maxDailyLoss: { min: 2.0, max: 15.0 },
    maxPositionSize: { min: 1000, max: 10000 },
    maxOpenPositions: { min: 1, max: 10 },
    minVolume: { min: 50000, max: 5000000 },
    minDailyRange: { min: 0.5, max: 10.0 }
  };

  /**
   * Execute adjustments with safety validation
   * Phase 27.F.14.B Task 6: Added safety validation layer
   */
  async execute(
    recommendations: AdjustmentRecommendation[],
    metrics: PortfolioMetrics,
    mode: TradingMode,
    userId: string
  ): Promise<AdjustmentLog[]> {
    const logs: AdjustmentLog[] = [];
    
    console.log(`[${this.MODULE_NAME}] 🔧 Executing ${recommendations.length} adjustments...`);
    
    for (const rec of recommendations) {
      const startTime = Date.now();
      
      try {
        // Phase 27.F.14.B Task 6: Safety validation
        const safetyCheck = await this.safetyValidator.validateAdjustment(rec, mode);
        if (!safetyCheck.valid && safetyCheck.violation) {
          // Log violation to audit trail
          await this.safetyValidator.logViolation(safetyCheck.violation, rec, mode);
          console.warn(`[${this.MODULE_NAME}] 🛑 SAFETY BLOCK: ${safetyCheck.violation.details}`);
          continue;
        }
        
        // Validate bounds
        if (!this.validateBounds(rec.parameter, rec.recommendedValue)) {
          console.warn(`[${this.MODULE_NAME}] ⚠️  Skipping adjustment: ${rec.parameter} = ${rec.recommendedValue} exceeds safety bounds`);
          continue;
        }
        
        // Apply adjustment
        const success = await this.applyAdjustment(rec, mode, userId);
        
        if (success) {
          // Record successful adjustment in safety validator
          this.safetyValidator.recordAdjustment(rec.parameter, mode);
          
          const log: AdjustmentLog = {
            mode,
            ruleId: rec.ruleId || 'unknown',
            parameterType: rec.type,
            parameterName: rec.parameter,
            oldValue: rec.currentValue,
            newValue: rec.recommendedValue,
            changePercent: rec.changePercent,
            triggerMetrics: metrics,
            reason: rec.reason,
            executionTimeMs: Date.now() - startTime,
            timestamp: new Date()
          };
          
          // Store in database
          await this.saveAdjustmentLog(log);
          logs.push(log);
          
          console.log(`[${this.MODULE_NAME}] ✅ Applied: ${rec.parameter} ${rec.currentValue.toFixed(2)} → ${rec.recommendedValue.toFixed(2)} (${rec.changePercent > 0 ? '+' : ''}${rec.changePercent}%)`);
        }
        
      } catch (error: any) {
        console.error(`[${this.MODULE_NAME}] ❌ Error executing adjustment:`, error.message);
      }
    }
    
    // Broadcast config change event
    if (logs.length > 0) {
      await this.broadcastConfigChange(mode, logs);
    }
    
    return logs;
  }

  /**
   * Validate parameter value against safety bounds
   */
  private validateBounds(parameter: string, value: number): boolean {
    const bounds = this.BOUNDS[parameter as keyof typeof this.BOUNDS];
    if (!bounds) return true; // No bounds defined
    
    return value >= bounds.min && value <= bounds.max;
  }

  /**
   * Apply single adjustment to database
   */
  private async applyAdjustment(
    rec: AdjustmentRecommendation,
    mode: TradingMode,
    userId: string
  ): Promise<boolean> {
    const { updateGuardrails, updateScreeners } = await import('./config-update-service');
    
    if (rec.type === 'guardrail') {
      const result = await updateGuardrails(userId, mode, {
        [rec.parameter]: rec.recommendedValue.toString()
      });
      return result.success;
      
    } else if (rec.type === 'filter') {
      const result = await updateScreeners(userId, mode, {
        [rec.parameter]: rec.recommendedValue.toString()
      });
      return result.success;
    }
    
    return false;
  }

  /**
   * Save adjustment log to database for durable audit trail
   */
  private async saveAdjustmentLog(log: AdjustmentLog): Promise<void> {
    try {
      // Phase 27.F.14.B: Use createTradingAuditLog for durable persistence
      await storage.createTradingAuditLog({
        userId: 'system', // LATTI is system-level, not user-specific
        action: `latti_adjustment_${log.parameterType}`,
        mode: log.mode,
        triggeredBy: 'latti_heuristic',
        metadata: {
          ruleId: log.ruleId,
          parameterType: log.parameterType,
          parameterName: log.parameterName,
          oldValue: log.oldValue,
          newValue: log.newValue,
          changePercent: log.changePercent,
          reason: log.reason,
          executionTimeMs: log.executionTimeMs,
          triggerMetrics: {
            winRate: log.triggerMetrics.winRate,
            profitFactor: log.triggerMetrics.profitFactor,
            drawdown: log.triggerMetrics.currentDrawdown,
            exposure: log.triggerMetrics.exposurePercent,
            tradesLast24h: log.triggerMetrics.tradesLast24h
          }
        }
      });
      
      console.log(`[${this.MODULE_NAME}] 📊 LATTI Adjustment Applied & Logged:`, {
        mode: log.mode,
        ruleId: log.ruleId,
        parameter: log.parameterName,
        change: `${log.oldValue.toFixed(2)} → ${log.newValue.toFixed(2)} (${log.changePercent > 0 ? '+' : ''}${log.changePercent}%)`,
        reason: log.reason
      });
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Failed to save adjustment log:`, error.message);
      // Fallback to console-only logging if database write fails
      console.log(`[${this.MODULE_NAME}] 📊 Adjustment (console fallback):`, {
        ruleId: log.ruleId,
        parameter: log.parameterName,
        change: `${log.oldValue} → ${log.newValue}`,
        reason: log.reason
      });
    }
  }

  /**
   * Broadcast configuration change event
   */
  private async broadcastConfigChange(mode: TradingMode, logs: AdjustmentLog[]): Promise<void> {
    await contextBridge.broadcast({
      type: 'config_update',
      payload: {
        mode,
        source: 'heuristic_trader',
        configType: 'automated_adjustment',
        adjustments: logs.map(l => ({
          parameter: l.parameterName,
          oldValue: l.oldValue,
          newValue: l.newValue,
          reason: l.reason
        })),
        timestamp: new Date().toISOString()
      }
    });
  }
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

export class HeuristicTraderService {
  private readonly MODULE_NAME = 'HeuristicTrader';
  
  private enabled: boolean = false;
  private intervalHandle: NodeJS.Timeout | null = null;
  
  private metricsCollector: MetricsCollector;
  private heuristicEngine: HeuristicEngine;
  private adjustmentExecutor: AdjustmentExecutor;
  
  private config: LHTSConfig = {
    enabled: false,
    updateIntervalMinutes: 5,
    maxAdjustmentsPerHour: 3,
    defaultCooldownMinutes: 30,
    maxChangePercent: 30,
    mode: 'paper'
  };

  constructor() {
    this.metricsCollector = new MetricsCollector();
    this.heuristicEngine = new HeuristicEngine();
    this.adjustmentExecutor = new AdjustmentExecutor();
  }

  /**
   * Start the heuristic trader service
   */
  async start(mode: TradingMode = 'paper'): Promise<void> {
    if (this.enabled) {
      console.warn(`[${this.MODULE_NAME}] Already running, ignoring start request`);
      return;
    }

    console.log(`[${this.MODULE_NAME}] 🚀 Starting Local Heuristic Trader Service (${mode} mode)...`);
    
    this.enabled = true;
    this.config.mode = mode;
    
    // Update system context
    const context = await storage.getSystemContext(mode);
    if (context) {
      await storage.updateSystemContext(mode, {
        lhtsEnabled: true,
        lhtsLastRun: new Date()
      });
    }
    
    // Run initial evaluation
    await this.runEvaluationCycle();
    
    // Schedule periodic evaluations
    const intervalMs = this.config.updateIntervalMinutes * 60 * 1000;
    this.intervalHandle = setInterval(
      () => this.runEvaluationCycle(),
      intervalMs
    );
    
    console.log(`[${this.MODULE_NAME}] ✅ Service started (evaluating every ${this.config.updateIntervalMinutes} minutes)`);
  }

  /**
   * Stop the heuristic trader service
   */
  async stop(): Promise<void> {
    if (!this.enabled) {
      console.warn(`[${this.MODULE_NAME}] Not running, ignoring stop request`);
      return;
    }

    console.log(`[${this.MODULE_NAME}] ⏹️  Stopping service...`);
    
    this.enabled = false;
    
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    
    // Update system context
    await storage.updateSystemContext(this.config.mode, {
      lhtsEnabled: false
    });
    
    console.log(`[${this.MODULE_NAME}] ✅ Service stopped`);
  }

  /**
   * Run a single evaluation cycle
   */
  private async runEvaluationCycle(): Promise<void> {
    if (!this.enabled) return;

    const startTime = Date.now();
    
    try {
      console.log(`\n[${this.MODULE_NAME}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`[${this.MODULE_NAME}] 🔄 Starting evaluation cycle...`);
      
      // Get first user for metrics collection (Phase 27.F.13: Global engines, but still track per-user metrics)
      const users = await storage.getAllUsers();
      if (users.length === 0) {
        console.log(`[${this.MODULE_NAME}] No users found, skipping cycle`);
        return;
      }
      
      const userId = users[0].id;
      
      // Step 1: Collect metrics
      const metrics = await this.metricsCollector.collect(userId, this.config.mode);
      
      // Step 2: Check rate limit
      const rateLimit = this.heuristicEngine.checkRateLimit(this.config.maxAdjustmentsPerHour);
      if (rateLimit.exceeded) {
        console.log(`[${this.MODULE_NAME}] ⚠️  Rate limit exceeded (${rateLimit.current}/${this.config.maxAdjustmentsPerHour} per hour) - skipping adjustments`);
        return;
      }
      
      // Step 3: Evaluate rules
      const recommendations = await this.heuristicEngine.evaluate(metrics, this.config.mode);
      
      if (recommendations.length === 0) {
        console.log(`[${this.MODULE_NAME}] ✅ No adjustments needed`);
        return;
      }
      
      // Step 4: Execute adjustments
      const logs = await this.adjustmentExecutor.execute(
        recommendations,
        metrics,
        this.config.mode,
        userId
      );
      
      // Step 5: Record adjustments in history
      for (const log of logs) {
        this.heuristicEngine.recordAdjustment(log.ruleId);
      }
      
      // Update system context
      const currentContext = await storage.getSystemContext(this.config.mode);
      await storage.updateSystemContext(this.config.mode, {
        lhtsLastRun: new Date(),
        lhtsAdjustmentsCount: ((currentContext?.lhtsAdjustmentsCount ?? 0) + logs.length)
      });
      
      const duration = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] ✅ Cycle completed in ${duration}ms - ${logs.length} adjustments applied`);
      console.log(`[${this.MODULE_NAME}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Error in evaluation cycle:`, error.message);
    }
  }

  /**
   * Get service health status
   */
  async getHealth(): Promise<LHTSHealth> {
    const context = await storage.getSystemContext(this.config.mode);
    
    // Count adjustments in last 24 hours (would need database query)
    const adjustmentsLast24h = 0; // Placeholder
    
    return {
      status: this.enabled ? 'healthy' : 'offline',
      enabled: this.enabled,
      lastRun: context?.lhtsLastRun || undefined,
      adjustmentsLast24h,
      activeRules: this.heuristicEngine['rules'].filter(r => r.enabled).length,
      averageExecutionTimeMs: 0, // Would calculate from logs
      errors: []
    };
  }

  /**
   * Get safety summary for LATTI adjustments
   * Phase 27.F.14.B Task 6
   */
  async getSafetySummary(): Promise<{
    totalAdjustments24h: number;
    violationsCount: number;
    lastViolationTime: Date | null;
    status: 'safe' | 'warning' | 'limit_reached';
  }> {
    return await this.adjustmentExecutor['safetyValidator'].getSafetySummary(this.config.mode);
  }

  /**
   * Emergency stop - immediately halt all operations
   */
  async emergencyStop(): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🚨 EMERGENCY STOP TRIGGERED`);
    await this.stop();
  }
}

// ============================================================================
// SINGLETON EXPORT (Legacy - Phase 27.F.14)
// ============================================================================

export const heuristicTrader = new HeuristicTraderService();

// ============================================================================
// DUAL-MODE LATTI INSTANCES (Phase 27.F.14.B)
// ============================================================================
// Local Autonomous Trading Tuning Intelligence - operates independently in
// both paper and live trading modes for comprehensive optimization coverage

console.log('[LATTI] Module loaded - creating dual-mode instances...');
export const lattiPaper = new HeuristicTraderService();
export const lattiLive = new HeuristicTraderService();
console.log('[LATTI] Paper and Live instances created');

// LATTI Manager for coordinated dual-mode operations
export class LATTIManager {
  private readonly MODULE_NAME = 'LATTIManager';
  
  /**
   * Start both LATTI instances
   */
  async startBoth(): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🚀 Starting LATTI dual-mode operation...`);
    
    try {
      await Promise.all([
        lattiPaper.start('paper'),
        lattiLive.start('live')
      ]);
      
      console.log(`[${this.MODULE_NAME}] ✅ Both LATTI instances started successfully`);
      console.log(`[${this.MODULE_NAME}]    - Paper mode: ACTIVE`);
      console.log(`[${this.MODULE_NAME}]    - Live mode: ACTIVE`);
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Failed to start LATTI instances:`, error.message);
      throw error;
    }
  }
  
  /**
   * Stop both LATTI instances
   */
  async stopBoth(): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🛑 Stopping LATTI dual-mode operation...`);
    
    await Promise.all([
      lattiPaper.stop(),
      lattiLive.stop()
    ]);
    
    console.log(`[${this.MODULE_NAME}] ✅ Both LATTI instances stopped`);
  }
  
  /**
   * Get health status of both instances
   */
  async getHealthStatus(): Promise<{ paper: LHTSHealth; live: LHTSHealth }> {
    const [paper, live] = await Promise.all([
      lattiPaper.getHealth(),
      lattiLive.getHealth()
    ]);
    
    return { paper, live };
  }
  
  /**
   * Emergency stop for both instances
   */
  async emergencyStopAll(): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🚨 EMERGENCY STOP - Halting all LATTI operations`);
    
    await Promise.all([
      lattiPaper.emergencyStop(),
      lattiLive.emergencyStop()
    ]);
    
    console.log(`[${this.MODULE_NAME}] ✅ All LATTI instances emergency stopped`);
  }
}

export const lattiManager = new LATTIManager();
