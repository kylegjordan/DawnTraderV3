/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7D.1 — Predictive Adjustments API
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides queryable endpoints for predictive adjustment data:
 * - Date range filtering
 * - Pagination
 * - Category filtering
 * - Summary statistics
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { 
  getAdjustments, 
  getAdjustmentsSummary, 
  getCurrentAdaptiveValues,
  AdjustmentCategory,
  PREDICTIVE_ADJUSTMENTS_SCHEMA
} from '../core/logging/predictive-adjustments';

const router = Router();

/**
 * GET /api/vts/predictive-adjustments
 * Retrieves adjustment records with optional filtering and pagination.
 * 
 * Query params:
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * - limit: Max records to return (default: 100, max: 1000)
 * - category: Filter by adjustment category
 * - regime: Filter by regime
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const { from, to, limit: limitStr, category, regime } = req.query;
    
    let limit = parseInt(limitStr as string) || 100;
    limit = Math.min(Math.max(limit, 1), 1000);
    
    const validCategories: AdjustmentCategory[] = ['ROI', 'Expectancy', 'Confidence', 'Weight', 'Scoring', 'Other'];
    const categoryFilter = validCategories.includes(category as AdjustmentCategory) 
      ? category as AdjustmentCategory 
      : undefined;
    
    const adjustments = getAdjustments({
      from: from as string,
      to: to as string,
      limit,
      category: categoryFilter,
      regime: regime as string
    });
    
    res.json({
      ok: true,
      schema: PREDICTIVE_ADJUSTMENTS_SCHEMA,
      count: adjustments.length,
      limit,
      filters: {
        from: from || null,
        to: to || null,
        category: categoryFilter || null,
        regime: regime || null
      },
      adjustments
    });
  } catch (error) {
    console.error('[11.7D.1][API] Error fetching adjustments:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to fetch predictive adjustments' 
    });
  }
});

/**
 * GET /api/vts/predictive-adjustments/summary
 * Retrieves summary statistics for adjustments.
 * 
 * Query params:
 * - days: Number of days to look back (default: 7, max: 30)
 */
router.get('/summary', (req: Request, res: Response) => {
  try {
    const daysStr = req.query.days as string;
    let days = parseInt(daysStr) || 7;
    days = Math.min(Math.max(days, 1), 30);
    
    const summary = getAdjustmentsSummary(days);
    
    res.json({
      ok: true,
      schema: PREDICTIVE_ADJUSTMENTS_SCHEMA,
      period: {
        days,
        from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10)
      },
      summary
    });
  } catch (error) {
    console.error('[11.7D.1][API] Error fetching summary:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to fetch adjustment summary' 
    });
  }
});

/**
 * GET /api/vts/predictive-adjustments/current
 * Retrieves current adaptive parameter values.
 */
router.get('/current', (req: Request, res: Response) => {
  try {
    const currentValues = getCurrentAdaptiveValues();
    
    res.json({
      ok: true,
      schema: PREDICTIVE_ADJUSTMENTS_SCHEMA,
      values: currentValues
    });
  } catch (error) {
    console.error('[11.7D.1][API] Error fetching current values:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to fetch current adaptive values' 
    });
  }
});

/**
 * GET /api/vts/predictive-adjustments/export
 * Exports adjustment records as CSV.
 * 
 * Query params:
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * - limit: Max records (default: 1000)
 */
router.get('/export', (req: Request, res: Response) => {
  try {
    const { from, to, limit: limitStr } = req.query;
    
    let limit = parseInt(limitStr as string) || 1000;
    limit = Math.min(Math.max(limit, 1), 10000);
    
    const adjustments = getAdjustments({
      from: from as string,
      to: to as string,
      limit
    });
    
    const headers = ['timestamp', 'category', 'parameter', 'oldValue', 'newValue', 'delta', 'impact', 'regime', 'strategy', 'reason'];
    const csvRows = [headers.join(',')];
    
    for (const adj of adjustments) {
      const row = [
        adj.timestamp,
        adj.category,
        adj.parameter,
        adj.oldValue,
        adj.newValue,
        adj.delta,
        adj.impact,
        adj.regime || '',
        adj.strategy || '',
        `"${(adj.reason || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    }
    
    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=predictive_adjustments_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('[11.7D.1][API] Error exporting adjustments:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to export adjustments' 
    });
  }
});

export default router;
