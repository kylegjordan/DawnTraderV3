/**
 * Phase 8.6.5 Validation: Provenance Debug API Routes
 * 
 * Provides diagnostic endpoints for tracing Walter's data lineage
 */

import express from 'express';
import { provenanceDebug } from './services/provenance-debug';
import { provenanceLogger } from './services/provenance-logger';

const router = express.Router();

/**
 * Enable verbose provenance logging
 */
router.post('/api/provenance/debug/enable', async (req, res) => {
  try {
    provenanceDebug.enableVerboseMode();
    
    res.json({
      ok: true,
      message: 'Provenance debug mode enabled',
      status: 'verbose',
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Enable failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Disable verbose provenance logging
 */
router.post('/api/provenance/debug/disable', async (req, res) => {
  try {
    provenanceDebug.disableVerboseMode();
    
    res.json({
      ok: true,
      message: 'Provenance debug mode disabled',
      status: 'normal',
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Disable failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get debug mode status
 */
router.get('/api/provenance/debug/status', async (req, res) => {
  try {
    const isEnabled = provenanceDebug.isVerboseEnabled();
    
    res.json({
      ok: true,
      enabled: isEnabled,
      message: isEnabled ? 'Debug mode active - verbose logging enabled' : 'Debug mode inactive',
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Status check failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Query recent lineage records
 */
router.get('/api/provenance/debug/lineage/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const records = await provenanceDebug.queryRecentLineage(limit);
    
    res.json({
      ok: true,
      count: records.length,
      records,
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Recent lineage query failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Query recent BoB trace logs
 */
router.get('/api/provenance/debug/bob-traces/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const records = await provenanceDebug.queryRecentBobTraces(limit);
    
    res.json({
      ok: true,
      count: records.length,
      records,
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Recent BoB traces query failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Query lineage by specific traceId
 */
router.get('/api/provenance/debug/trace/:traceId', async (req, res) => {
  try {
    const { traceId } = req.params;
    const correlation = await provenanceDebug.correlateTrace(traceId);
    
    res.json({
      ok: true,
      traceId,
      correlation,
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Trace correlation failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Search Walter memory
 */
router.get('/api/provenance/debug/walter-memory/search', async (req, res) => {
  try {
    const pattern = req.query.pattern as string || '';
    const records = await provenanceDebug.searchWalterMemory(pattern);
    
    res.json({
      ok: true,
      pattern,
      count: records.length,
      records,
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Walter memory search failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Generate full provenance report
 */
router.get('/api/provenance/debug/report', async (req, res) => {
  try {
    const report = await provenanceDebug.generateReport();
    
    res.json({
      ok: true,
      report,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Report generation failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Generate trace ID for new Walter query
 */
router.post('/api/provenance/debug/trace/new', async (req, res) => {
  try {
    const traceId = provenanceLogger.generateTraceId();
    
    res.json({
      ok: true,
      traceId,
      message: 'Use this traceId to track data lineage for your next query',
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Trace ID generation failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get trace chain (in-memory debug traces)
 */
router.get('/api/provenance/debug/trace/:traceId/chain', async (req, res) => {
  try {
    const { traceId } = req.params;
    const chain = provenanceDebug.getTraceChain(traceId);
    
    if (chain.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'No in-memory trace found. Use /api/provenance/debug/trace/:traceId for database records.',
      });
    }
    
    res.json({
      ok: true,
      traceId,
      chain,
      hops: chain.length,
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Chain retrieval failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Clear in-memory debug traces (prevent memory leak)
 */
router.post('/api/provenance/debug/trace/clear', async (req, res) => {
  try {
    provenanceDebug.clearActiveTraces();
    
    res.json({
      ok: true,
      message: 'In-memory traces cleared',
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Clear traces failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Comprehensive diagnostic - runs all checks
 */
router.get('/api/provenance/debug/diagnostic', async (req, res) => {
  try {
    const [report, recentLineage, recentBobTraces] = await Promise.all([
      provenanceDebug.generateReport(),
      provenanceDebug.queryRecentLineage(5),
      provenanceDebug.queryRecentBobTraces(5),
    ]);

    const goalsMemory = await provenanceDebug.searchWalterMemory('goal');
    const strategyMemory = await provenanceDebug.searchWalterMemory('strategy');
    const balanceMemory = await provenanceDebug.searchWalterMemory('balance');

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      debugMode: provenanceDebug.isVerboseEnabled(),
      report,
      recentActivity: {
        lineage: recentLineage.length,
        bobTraces: recentBobTraces.length,
      },
      walterMemory: {
        goals: goalsMemory.length,
        strategies: strategyMemory.length,
        balances: balanceMemory.length,
      },
      recommendations: generateRecommendations(report),
    });
  } catch (error: any) {
    console.error('[ProvenanceDebugAPI] Diagnostic failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Generate recommendations based on report
 */
function generateRecommendations(report: any): string[] {
  const recommendations: string[] = [];

  if (report.staleCaches > 0) {
    recommendations.push(`Found ${report.staleCaches} stale cache entries - consider refreshing Cortex`);
  }

  if (report.goals.live === 0) {
    recommendations.push('No recent live mode goal fetches detected - data may be stale');
  }

  if (report.strategies.paper > report.strategies.live * 2) {
    recommendations.push('Paper mode strategy fetches significantly exceed live mode - check mode balance');
  }

  if (report.recentTraces === 0) {
    recommendations.push('No recent provenance traces - debug mode may need to be enabled');
  }

  if (recommendations.length === 0) {
    recommendations.push('All provenance metrics look healthy ✅');
  }

  return recommendations;
}

console.log('[ProvenanceDebugAPI] ✅ Provenance debug API routes registered');

export default router;
