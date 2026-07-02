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
  getCacheTTLRemaining,
  getAllCachedSymbols,
  getCacheSize,
} from '../../core/cache/cost-cache.js';
// P19-B7.2a (#330): the cache serves measured microstructure only; the fee is
// composed from the B-4.5 merge site (the symbol cache is structurally
// crypto-lane-only — every cached symbol is crypto_spot, so the class fee is
// exact for this diagnostics surface). Stats via the fee-bearing wrapper.
import { computeTotalRoundTripCost, getFrictionForAssetClass, getCostCacheStatsWithFee } from '../../core/math/cost-model.js';

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
  const takerFee = getFrictionForAssetClass('crypto_spot').feeRateTaker; // merge-site fee (cache = crypto lane)
  const diagnostics: CostDiagnosticsResponse[] = symbols.map(symbol => {
    const metrics = getCostMetrics(symbol);
    const ttl = getCacheTTLRemaining(symbol);

    if (metrics) {
      return {
        symbol,
        takerFee,
        slippage: metrics.slippage,
        spread: metrics.spread,
        totalCost: computeTotalRoundTripCost(takerFee, metrics.slippage, metrics.spread),
        source: 'memory' as const,
        ttlRemaining: ttl,
      };
    }

    const defaults = getOrSetCostMetrics(symbol);
    return {
      symbol,
      takerFee,
      slippage: defaults.slippage,
      spread: defaults.spread,
      totalCost: computeTotalRoundTripCost(takerFee, defaults.slippage, defaults.spread),
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
  const takerFee = getFrictionForAssetClass('crypto_spot').feeRateTaker; // P19-B7.2a: merge-site fee
  const totalCost = computeTotalRoundTripCost(takerFee, metrics.slippage, metrics.spread);

  const duration = performance.now() - startTime;

  const response: CostDiagnosticsResponse = {
    symbol,
    takerFee,
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
  
  const stats = getCostCacheStatsWithFee(); // P19-B7.2a: fee-bearing wrapper (merge-site avgFee)
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
