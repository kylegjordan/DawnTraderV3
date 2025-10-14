/**
 * Bob Routing Middleware - Phase 7.2
 * 
 * Transparent interception layer for health/metrics endpoints
 * Routes requests through Bob Core for caching with fallback to original handlers
 */

import { Request, Response, NextFunction } from 'express';
import { bobCore } from '../services/bob-core';
import { metricsBob } from '../services/bob-metrics';

interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * Intercept /api/system/health requests
 * Try Bob Core first, fallback to original handler on error
 */
export async function interceptSystemHealth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // Only intercept if Bob is enabled
  if (!bobCore.isEnabled()) {
    return next();
  }

  const mode = (req.query.mode as string) || 'live';
  const userId = req.userId;

  try {
    console.log('[BobRouting] 🎯 Intercepting /api/system/health');
    
    const healthData = await metricsBob.getSystemHealth(
      mode as 'live' | 'paper',
      undefined // Use default TTL
    );

    return res.json(healthData);
  } catch (error: any) {
    // Fallback to original handler
    console.error('[BobRouting] ⚠️ MetricsBob failed, falling back to original handler:', error.message);
    await bobCore.fallback('systemHealth', async () => {
      // Let original handler process the request
      return next();
    });
  }
}

/**
 * Intercept /api/paper-sim/status requests
 * Try Bob Core first, fallback to original handler on error
 */
export async function interceptPaperSimStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // Only intercept if Bob is enabled
  if (!bobCore.isEnabled()) {
    return next();
  }

  try {
    console.log('[BobRouting] 🎯 Intercepting /api/paper-sim/status');
    
    const status = await metricsBob.getPaperSimStatus();

    return res.json(status);
  } catch (error: any) {
    // Fallback to original handler
    console.error('[BobRouting] ⚠️ MetricsBob failed, falling back to original handler:', error.message);
    await bobCore.fallback('paperSimStatus', async () => {
      // Let original handler process the request
      return next();
    });
  }
}

/**
 * Bob stats endpoint for debugging and monitoring
 */
export async function bobStatsHandler(
  req: Request,
  res: Response
) {
  const stats = bobCore.getStats();
  res.json(stats);
}
