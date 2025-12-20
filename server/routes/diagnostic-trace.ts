/**
 * Directive 8.8.4-A3.R9.0.D: Diagnostic Signal Flow Trace API
 * 
 * Provides API endpoints for controlling signal flow tracing.
 */

import express from 'express';
import { diagnosticTrace } from '../core/diagnostics/trace_service';
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();

/**
 * Start diagnostic tracing
 */
router.post('/api/diagnostics/trace/start', async (req, res) => {
  try {
    diagnosticTrace.start();
    const stats = diagnosticTrace.getStats();
    
    res.json({
      ok: true,
      message: 'Diagnostic tracing started (auto-stops after 10 minutes or 1 MB)',
      stats,
    });
  } catch (error: any) {
    console.error('[A3.R9.0.D][API] Start failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Stop diagnostic tracing
 */
router.post('/api/diagnostics/trace/stop', async (req, res) => {
  try {
    diagnosticTrace.stop();
    const stats = diagnosticTrace.getStats();
    
    res.json({
      ok: true,
      message: 'Diagnostic tracing stopped',
      stats,
    });
  } catch (error: any) {
    console.error('[A3.R9.0.D][API] Stop failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get tracing status
 */
router.get('/api/diagnostics/trace/status', async (req, res) => {
  try {
    const stats = diagnosticTrace.getStats();
    
    res.json({
      ok: true,
      ...stats,
      logFile: 'logs/diagnostic/trace_A3R9.log',
    });
  } catch (error: any) {
    console.error('[A3.R9.0.D][API] Status check failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Read recent trace entries
 */
router.get('/api/diagnostics/trace/entries', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logPath = path.resolve(process.cwd(), 'logs/diagnostic/trace_A3R9.log');
    
    if (!fs.existsSync(logPath)) {
      return res.json({
        ok: true,
        entries: [],
        message: 'No trace log file exists yet',
      });
    }
    
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.includes('[A3.R9.TRACE]'));
    const recentLines = lines.slice(-limit);
    
    const entries = recentLines.map(line => {
      try {
        const jsonStart = line.indexOf('{');
        if (jsonStart >= 0) {
          return JSON.parse(line.substring(jsonStart));
        }
        return { raw: line };
      } catch {
        return { raw: line };
      }
    });
    
    res.json({
      ok: true,
      count: entries.length,
      totalLines: lines.length,
      entries,
    });
  } catch (error: any) {
    console.error('[A3.R9.0.D][API] Read entries failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export function registerDiagnosticTraceRoutes(app: express.Application) {
  app.use(router);
  console.log('[A3.R9.0.D] Diagnostic trace routes registered');
}

export default router;
