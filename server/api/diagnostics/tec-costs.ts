/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3B — TEC Cost Diagnostics Endpoint
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Exposes live cost data for every symbol.
 * Used by monitoring dashboards and debugging.
 * 
 * Governance Invariant C5: Endpoint must respond < 50ms
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import {
  getCostMetrics,
  getOrSetCostMetrics,
  getCacheStats,
  getCacheTTLRemaining,
  getAllCachedSymbols,
  getCacheSize,
} from '../../core/cache/cost-cache.js';
import { computeTotalRoundTripCost } from '../../core/math/cost-model.js';

const router = Router();

export interface CostDiagnosticsResponse {
  symbol: string;
  takerFee: number;
  slippage: number;
  spread: number;
  totalCost: number;
  source: 'memory' | 'default';
  ttlRemaining: number;
}

router.get('/costs', (_req: Request, res: Response) => {
  const startTime = performance.now();
  
  const symbols = getAllCachedSymbols();
  const diagnostics: CostDiagnosticsResponse[] = symbols.map(symbol => {
    const metrics = getCostMetrics(symbol);
    const ttl = getCacheTTLRemaining(symbol);
    
    if (metrics) {
      return {
        symbol,
        takerFee: metrics.fee,
        slippage: metrics.slippage,
        spread: metrics.spread,
        totalCost: computeTotalRoundTripCost(metrics.fee, metrics.slippage, metrics.spread),
        source: 'memory' as const,
        ttlRemaining: ttl,
      };
    }
    
    const defaults = getOrSetCostMetrics(symbol);
    return {
      symbol,
      takerFee: defaults.fee,
      slippage: defaults.slippage,
      spread: defaults.spread,
      totalCost: computeTotalRoundTripCost(defaults.fee, defaults.slippage, defaults.spread),
      source: 'default' as const,
      ttlRemaining: getCacheTTLRemaining(symbol),
    };
  });
  
  const duration = performance.now() - startTime;
  
  res.json({
    success: true,
    data: diagnostics,
    meta: {
      symbolCount: diagnostics.length,
      responseTimeMs: Number(duration.toFixed(2)),
    },
  });
});

router.get('/costs/:symbol', (req: Request, res: Response) => {
  const startTime = performance.now();
  const { symbol } = req.params;
  
  const metrics = getOrSetCostMetrics(symbol);
  const ttl = getCacheTTLRemaining(symbol);
  const totalCost = computeTotalRoundTripCost(metrics.fee, metrics.slippage, metrics.spread);
  
  const duration = performance.now() - startTime;
  
  const response: CostDiagnosticsResponse = {
    symbol,
    takerFee: metrics.fee,
    slippage: metrics.slippage,
    spread: metrics.spread,
    totalCost,
    source: 'memory',
    ttlRemaining: ttl,
  };
  
  res.json({
    success: true,
    data: response,
    meta: {
      responseTimeMs: Number(duration.toFixed(2)),
    },
  });
});

router.get('/costs-summary', (_req: Request, res: Response) => {
  const startTime = performance.now();
  
  const stats = getCacheStats();
  const cacheSize = getCacheSize();
  
  const duration = performance.now() - startTime;
  
  res.json({
    success: true,
    data: {
      symbolCount: cacheSize,
      avgFee: stats.avgFee,
      avgFeePct: (stats.avgFee * 100).toFixed(2) + '%',
      avgSlippage: stats.avgSlippage,
      avgSlippagePct: (stats.avgSlippage * 100).toFixed(2) + '%',
      avgSpread: stats.avgSpread,
      avgSpreadPct: (stats.avgSpread * 100).toFixed(2) + '%',
      avgTotalCost: computeTotalRoundTripCost(stats.avgFee, stats.avgSlippage, stats.avgSpread),
      avgTotalCostPct: (computeTotalRoundTripCost(stats.avgFee, stats.avgSlippage, stats.avgSpread) * 100).toFixed(2) + '%',
    },
    meta: {
      responseTimeMs: Number(duration.toFixed(2)),
    },
  });
});

export default router;
