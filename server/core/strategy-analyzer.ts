/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.5 Task 6 — Strategy Performance Analyzer
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Audits strategy performance across regimes before disabling.
 * Ensures data-driven decisions about strategy enablement.
 * 
 * Schema: v1.7.0
 * Governance: Directive 11.5 Task 6
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { MarketRegimeType } from '../types/market-regime.types';

export interface TradeResult {
  id: string;
  symbol: string;
  strategy: string;
  signalType: string;
  regime: MarketRegimeType;
  netProfit: number;
  grossProfit: number;
  entryTime: number;
  exitTime: number;
  resultType: 'take_profit' | 'stop_loss' | 'timeout';
}

export interface StrategyAuditResult {
  strategy: string;
  totalTrades: number;
  winRate: number;
  avgNetProfit: number;
  avgGrossProfit: number;
  byRegime: Record<string, {
    trades: number;
    winRate: number;
    avgNetProfit: number;
  }>;
  byResultType: Record<string, number>;
  recommendation: 'keep' | 'monitor' | 'disable';
}

/**
 * Directive 11.5 Task 6: Audit Strategy Performance
 * 
 * Groups trades by strategy and calculates performance metrics.
 * Logs win rate for each strategy to help determine if underperformance
 * is due to mapping issues or actual strategy weakness.
 * 
 * @param results - Array of trade results to analyze
 * @returns Map of strategy name to audit results
 */
export function auditStrategyPerformance(results: TradeResult[]): Map<string, StrategyAuditResult> {
  const grouped = new Map<string, TradeResult[]>();
  
  for (const trade of results) {
    const strategy = trade.strategy;
    if (!grouped.has(strategy)) {
      grouped.set(strategy, []);
    }
    grouped.get(strategy)!.push(trade);
  }
  
  const auditResults = new Map<string, StrategyAuditResult>();
  
  for (const [strategy, trades] of grouped.entries()) {
    const wins = trades.filter(t => t.netProfit > 0);
    const winRate = trades.length > 0 ? wins.length / trades.length : 0;
    
    const avgNetProfit = trades.length > 0
      ? trades.reduce((sum, t) => sum + t.netProfit, 0) / trades.length
      : 0;
    
    const avgGrossProfit = trades.length > 0
      ? trades.reduce((sum, t) => sum + t.grossProfit, 0) / trades.length
      : 0;
    
    const byRegime: Record<string, { trades: number; winRate: number; avgNetProfit: number }> = {};
    const regimeGroups = new Map<string, TradeResult[]>();
    
    for (const trade of trades) {
      const regime = trade.regime;
      if (!regimeGroups.has(regime)) {
        regimeGroups.set(regime, []);
      }
      regimeGroups.get(regime)!.push(trade);
    }
    
    for (const [regime, regimeTrades] of regimeGroups.entries()) {
      const regimeWins = regimeTrades.filter(t => t.netProfit > 0);
      byRegime[regime] = {
        trades: regimeTrades.length,
        winRate: regimeTrades.length > 0 ? regimeWins.length / regimeTrades.length : 0,
        avgNetProfit: regimeTrades.length > 0
          ? regimeTrades.reduce((sum, t) => sum + t.netProfit, 0) / regimeTrades.length
          : 0
      };
    }
    
    const byResultType: Record<string, number> = {
      take_profit: 0,
      stop_loss: 0,
      timeout: 0
    };
    
    for (const trade of trades) {
      if (byResultType[trade.resultType] !== undefined) {
        byResultType[trade.resultType]++;
      }
    }
    
    let recommendation: 'keep' | 'monitor' | 'disable';
    if (winRate >= 0.35 && avgNetProfit > 0) {
      recommendation = 'keep';
    } else if (winRate >= 0.20 || trades.length < 50) {
      recommendation = 'monitor';
    } else {
      recommendation = 'disable';
    }
    
    console.log(`[11.5][Audit] ${strategy} Win Rate: ${(winRate * 100).toFixed(2)}% (${trades.length} trades) → ${recommendation.toUpperCase()}`);
    
    auditResults.set(strategy, {
      strategy,
      totalTrades: trades.length,
      winRate,
      avgNetProfit,
      avgGrossProfit,
      byRegime,
      byResultType,
      recommendation
    });
  }
  
  return auditResults;
}

/**
 * Directive 11.5: Get overall audit summary
 */
export function getAuditSummary(auditResults: Map<string, StrategyAuditResult>): {
  totalStrategies: number;
  keep: string[];
  monitor: string[];
  disable: string[];
  overallWinRate: number;
} {
  const keep: string[] = [];
  const monitor: string[] = [];
  const disable: string[] = [];
  
  let totalTrades = 0;
  let totalWins = 0;
  
  for (const [strategy, result] of auditResults.entries()) {
    switch (result.recommendation) {
      case 'keep':
        keep.push(strategy);
        break;
      case 'monitor':
        monitor.push(strategy);
        break;
      case 'disable':
        disable.push(strategy);
        break;
    }
    
    totalTrades += result.totalTrades;
    totalWins += Math.round(result.totalTrades * result.winRate);
  }
  
  return {
    totalStrategies: auditResults.size,
    keep,
    monitor,
    disable,
    overallWinRate: totalTrades > 0 ? totalWins / totalTrades : 0
  };
}

/**
 * Directive 11.5: Log full audit report
 */
export function logAuditReport(results: TradeResult[]): void {
  console.log('[11.5][Audit] ═══════════════════════════════════════════');
  console.log('[11.5][Audit] Strategy Performance Audit Report');
  console.log('[11.5][Audit] ═══════════════════════════════════════════');
  
  const auditResults = auditStrategyPerformance(results);
  const summary = getAuditSummary(auditResults);
  
  console.log(`[11.5][Audit] Total Strategies: ${summary.totalStrategies}`);
  console.log(`[11.5][Audit] Overall Win Rate: ${(summary.overallWinRate * 100).toFixed(2)}%`);
  console.log(`[11.5][Audit] Keep: ${summary.keep.join(', ') || 'none'}`);
  console.log(`[11.5][Audit] Monitor: ${summary.monitor.join(', ') || 'none'}`);
  console.log(`[11.5][Audit] Disable: ${summary.disable.join(', ') || 'none'}`);
  console.log('[11.5][Audit] ═══════════════════════════════════════════');
}
