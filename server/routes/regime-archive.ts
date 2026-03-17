/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7E — Regime Archive API Endpoints
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Phase: 11.7 | Series: Predictive Learning Feedback Loop
 * Dependencies: 11.7E Task 1 (Archival Schema)
 * Implements: Query, inspect, and export archived regime-metric data
 *
 * Routes (relative to apiRouter mounted at /api):
 * - GET /vts/regime-archive - Paginated archive list
 * - GET /vts/regime-archive/latest - Fetch most recent
 * - GET /vts/regime-archive/summary - Summary statistics
 * - GET /vts/regime-archive/export - CSV export
 * - GET /vts/regime-archive/manifest - Get manifest entries
 * - GET /vts/regime-archive/scheduler-status - Scheduler health (HF12)
 *
 * All routes secured with requireAuth.
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  getArchiveRecords,
  getLatestArchive,
  getArchiveSummary,
  getManifest,
  exportArchiveToCSV,
  RegimeArchiveRecord,
} from '../core/archival/regime-archiver';
import { archiveRegimeMetrics } from '../scripts/archive-regime-metrics';
import { verifyArchiveIntegrity } from '../scripts/verify-archive-integrity';
import { compressOldArchives } from '../scripts/compress-old-archives';
import { getSchedulerStatus } from '../core/archival/archival-scheduler';

const router = Router();

// Directive 12.1.3: JWT_SECRET must come from environment — no fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.');
}

interface AuthenticatedRequest extends Request {
  user?: { id: string; username: string };
}

// Directive 12.1.3: Removed x-internal-audit and x-validation-session bypass headers
function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.get('/vts/regime-archive', requireAuth, (req: Request, res: Response): void => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const records = getArchiveRecords({ from, to, limit, offset });

    res.json({
      ok: true,
      records,
      pagination: {
        limit,
        offset,
        count: records.length,
      },
    });
  } catch (err) {
    console.error('[11.7E][API] Error fetching archives:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch archive records',
    });
  }
});

router.get('/vts/regime-archive/latest', requireAuth, (req: Request, res: Response): void => {
  try {
    const records = getLatestArchive();

    if (!records) {
      res.json({
        ok: true,
        data: null,
        message: 'No archives available',
      });
      return;
    }

    res.json({
      ok: true,
      data: records,
      count: records.length,
    });
  } catch (err) {
    console.error('[11.7E][API] Error fetching latest archive:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch latest archive',
    });
  }
});

router.get('/vts/regime-archive/summary', requireAuth, (req: Request, res: Response): void => {
  try {
    const summary = getArchiveSummary();

    res.json({
      ok: true,
      summary,
    });
  } catch (err) {
    console.error('[11.7E][API] Error fetching archive summary:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch archive summary',
    });
  }
});

router.get('/vts/regime-archive/manifest', requireAuth, (req: Request, res: Response): void => {
  try {
    const manifest = getManifest();

    const sortedManifest = [...manifest].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({
      ok: true,
      manifest: sortedManifest,
      count: sortedManifest.length,
    });
  } catch (err) {
    console.error('[11.7E][API] Error fetching manifest:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch archive manifest',
    });
  }
});

/**
 * HF12: Scheduler status endpoint — read-only health check.
 * Returns scheduler initialization state, next scheduled runs,
 * startup catch-up results, and overdue status.
 */
router.get('/vts/regime-archive/scheduler-status', requireAuth, (req: Request, res: Response): void => {
  try {
    const status = getSchedulerStatus();

    res.json({
      ok: true,
      scheduler: status,
    });
  } catch (err) {
    console.error('[11.7E][API] Error fetching scheduler status:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch scheduler status',
    });
  }
});

router.get('/vts/regime-archive/export', requireAuth, (req: Request, res: Response): void => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 10000, 50000);

    const records = getArchiveRecords({ from, to, limit, offset: 0 });

    if (records.length === 0) {
      res.status(404).json({
        ok: false,
        error: 'No records to export',
      });
      return;
    }

    const csv = exportArchiveToCSV(records);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=regime_archive_export_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('[11.7E][API] Error exporting archives:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to export archive records',
    });
  }
});

router.post('/vts/regime-archive/trigger', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('[11.7E][API] Manual archive trigger requested');

    const result = await archiveRegimeMetrics();

    res.json({
      ok: result.success,
      data: result,
    });
  } catch (err) {
    console.error('[11.7E][API] Error triggering archive:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to trigger archive',
    });
  }
});

router.post('/vts/regime-archive/verify', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('[11.7E][API] Manual integrity verification requested');

    const result = await verifyArchiveIntegrity();

    res.json({
      ok: result.success,
      data: result,
    });
  } catch (err) {
    console.error('[11.7E][API] Error verifying integrity:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to verify archive integrity',
    });
  }
});

router.post('/vts/regime-archive/compress', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('[11.7E][API] Manual compression requested');

    const result = await compressOldArchives();

    res.json({
      ok: result.success,
      data: result,
    });
  } catch (err) {
    console.error('[11.7E][API] Error compressing archives:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to compress archives',
    });
  }
});

router.get('/vts/regime-archive/drift', requireAuth, (req: Request, res: Response): void => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const records = getArchiveRecords({
      from: fromDate.toISOString(),
      limit: 10000
    });

    const driftData: Record<string, {
      dates: string[];
      confidence: number[];
      winRate: number[];
      avgPnL: number[];
      dynamicROI: number[];
    }> = {};

    for (const record of records) {
      const key = `${record.regime}/${record.strategy}`;
      if (!driftData[key]) {
        driftData[key] = {
          dates: [],
          confidence: [],
          winRate: [],
          avgPnL: [],
          dynamicROI: [],
        };
      }

      driftData[key].dates.push(record.timestamp);
      driftData[key].confidence.push(record.metrics.confidence);
      driftData[key].winRate.push(record.metrics.winRate);
      driftData[key].avgPnL.push(record.metrics.avgPnL);
      driftData[key].dynamicROI.push(record.metrics.dynamicROI);
    }

    res.json({
      ok: true,
      data: driftData,
      days,
      recordCount: records.length,
    });
  } catch (err) {
    console.error('[11.7E][API] Error fetching drift data:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch drift data',
    });
  }
});

export default router;
