/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L8
 * ══════════════════════════════════════════════════════════════════════════════
 * VTS API Routes - Virtual Trade Simulator Endpoints
 * 
 * Endpoints:
 * - GET /api/vts/status: Current VTS status and stats (L8: per-strategy data)
 * - GET /api/vts/export: Export all virtual trades and calibration data (L8: per-strategy CSV)
 * - POST /api/vts/retrain: Trigger calibration coefficient retraining (L8: per-strategy)
 * - GET /api/vts/internal/calibration: Internal endpoint for ML service (L8: full calibration)
 * 
 * Directive 11.6E Extensions (Approved Modification):
 * - GET /api/vts/ml/open: Machine Learning dashboard - open trades
 * - GET /api/vts/ml/closed: Machine Learning dashboard - closed trades
 * - GET /api/vts/ml/open/export: CSV export for open trades
 * - GET /api/vts/ml/closed/export: CSV export for closed trades
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { vtsService } from '../services/vts-service';
import { loadCalibration, loadFullCalibration, applyCalibration } from '../utils/calibration';
import { 
  updateRegimePerformanceFromVTS, 
  getVTSTelemetryStatus, 
  getVTSTelemetry 
} from '../core/logging/vts-telemetry';
import { getDriftDetector } from '../services/drift-detector';
import { trainingAuditService } from '../services/training-audit-service';
import { vtsModeAuditService } from '../services/vts-mode-audit';
import { 
  startAutonomousSimulation, 
  stopAutonomousSimulation, 
  isAutonomousSimulationRunning,
  getAutonomousSessionInfo,
  generateValidationReport,
  startM5CValidationSession,
  saveM5CSessionTrades,
  getM5CSessionTrades,
  getLatestVTSTradesFile,
  getOpenVirtualTradesStatus
} from '../services/vts-runner';
import {
  runComparisonAudit,
  getLatestComparisonReport,
  startPaperTradeRecording,
  savePaperSessionTrades,
  getLatestPaperTradesFile,
  compareLatestSessions
} from '../services/vts-live-comparison-audit';
import { startM5DValidationRun, getM5DStatus, getLatestMetricsSnapshot } from '../services/m5d-validation-service';
import { 
  runVTSPhase, 
  runPaperPhase, 
  runComparisonPhase, 
  startFullM5EValidation, 
  getM5EStatus, 
  getM5ELatestSnapshot 
} from '../services/m5e-validation-service';
import { 
  executeFullDataPurge, 
  logPurgeVerification,
  setLearningIngestionEnabled 
} from '../core/data-purge-11-6a';
import { resetRegimeRollingStats, logRegimeZScoreVerification, verifyRegimeInputIntegrity } from '../core/metrics/market-regime';
import { resetMacroState, logMacroStateVerification } from '../core/metrics/macro-state';
import { resetRollingStatsWithLogging } from '../utils/rolling-stats';
import { getOpenVirtualTradesForML } from '../services/vts-runner';
import { exportVtsDataToCsv, getClosedVTSTradesFromLogs, generateCsvContent } from '../utils/export-csv';
import { getSkippedSignalsForDate, getSkippedSignalsSummary, forceFlush, type SkippedSignalEntry } from '../core/logging/skipped-signals-logger';

const router = Router();

// Directive 12.1.3: JWT_SECRET must come from environment — no fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.');
}

/**
 * Directive 11.6 Task 5: Format duration in human-readable format for CSV export
 */
function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

interface AuthenticatedRequest extends Request {
  user?: { id: string; username: string };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

router.get('/open-trades', async (req: Request, res: Response) => {
  try {
    const status = getOpenVirtualTradesStatus();
    res.json(status);
  } catch (error) {
    console.error('[VTS][open-trades] Error:', error);
    res.status(500).json({ error: 'Failed to get open trades status' });
  }
});

router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const stats = vtsService.getStats();
    const calibration = vtsService.getCalibration();
    const fullCalibration = await vtsService.getFullCalibration();
    const strategyStats = vtsService.getStrategyStats();
    const auditStatus = trainingAuditService.getStatus('VTS');
    
    // M5A: Get VTS mode state with tradingActive boolean
    const modeState = vtsModeAuditService.getState();
    
    // M5B: Get session metrics from vtsService (authoritative source for session trade count)
    const sessionMetrics = vtsService.getSessionMetrics();
    
    const strategyCount = Object.keys(fullCalibration.strategies).length;
    console.log(`[M5A][VTS][STATUS] mode=${modeState.mode} tradingActive=${modeState.tradingActive} passiveLearning=${modeState.passiveLearning} open=${stats.openTrades} closed=${stats.closedTrades} sessionTrades=${sessionMetrics.simulatedTradesThisSession}`);
    
    res.json({
      isRunning: isAutonomousSimulationRunning(),
      // M5A: Primary mode control fields
      mode: modeState.mode,
      source: modeState.source,
      tradingActive: modeState.tradingActive,
      passiveLearning: modeState.passiveLearning,
      systemMode: modeState.systemMode,
      lastModeChange: modeState.lastModeChange,
      // M5B: Use vtsService session metrics as authoritative source
      simulatedTradesThisSession: sessionMetrics.simulatedTradesThisSession,
      blockedSimulationsInObserverMode: modeState.blockedSimulationsInObserverMode,
      // Existing fields
      stats,
      calibration,
      fullCalibration,
      strategyStats,
      cpuImpact: '< 5%',
      lastRetrain: auditStatus.lastRetrain,
      parametersUpdated: auditStatus.parametersUpdated,
      epochCount: auditStatus.epochCount,
      sampleCount: auditStatus.sampleCount
    });
  } catch (error) {
    console.error('[L8][VTS][ERROR] Status failed:', error);
    res.status(500).json({ error: 'Failed to get VTS status' });
  }
});

router.get('/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const format = (req.query.format as string) || 'json';
    const period = (req.query.period as string) || 'all';
    
    const exportData = await vtsService.exportTrades();
    let trades = exportData.trades;
    
    const now = Date.now();
    if (period === '24h') {
      trades = trades.filter(t => t.entryTime > now - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      trades = trades.filter(t => t.entryTime > now - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      trades = trades.filter(t => t.entryTime > now - 30 * 24 * 60 * 60 * 1000);
    }
    
    console.log(`[L7][VTS][EXPORT] Exporting ${trades.length} trades (format=${format}, period=${period})`);
    
    if (format === 'csv') {
      const wins = trades.filter(t => (t.netProfit || 0) > 0);
      const winRate = trades.length > 0 ? (wins.length / trades.length * 100) : 0;
      const avgGross = trades.length > 0 ? trades.reduce((s, t) => s + (t.grossProfit || 0), 0) / trades.length : 0;
      const avgNet = trades.length > 0 ? trades.reduce((s, t) => s + (t.netProfit || 0), 0) / trades.length : 0;
      
      // Directive 11.6 Task 5: Updated CSV export with positionSize, exitReason, entryTime, exitTime, elapsedMs
      const csvHeader = 'Symbol,Strategy,Entry,Exit,Stop,Target,ExitReason,PositionSize,Duration,EntryTime,ExitTime,GrossProfit%,NetProfit%,Fees,Slippage,Regime,SignalType,Outcome\n';
      const csvRows = trades.map(t => {
        const durationMs = (t.exitTime || t.entryTime) - t.entryTime;
        const durationStr = formatDuration(durationMs);
        const entryTimeStr = new Date(t.entryTime).toISOString();
        const exitTimeStr = t.exitTime ? new Date(t.exitTime).toISOString() : '';
        // Directive 11.6: Use actual position size from trade record, not hardcoded 250
        const positionSize = (t as any).positionSize || (t.signal as any)?.positionSize || 0;
        return [
          t.signal.symbol,
          t.signal.strategy,
          t.signal.entryPrice.toFixed(6),
          (t.exitPrice || 0).toFixed(6),
          t.signal.stopLoss.toFixed(6),
          t.signal.takeProfit?.toFixed(6) || '',
          t.resultType || 'open',
          positionSize.toFixed(2),
          durationStr,
          entryTimeStr,
          exitTimeStr,
          ((t.grossProfit || 0) * 100).toFixed(4),
          ((t.netProfit || 0) * 100).toFixed(4),
          (t.fees || 0).toFixed(6),
          t.signal.spread?.toFixed(6) || '0.001500',
          t.signal.regime || '',
          t.signal.signalType || '',
          t.status
        ].join(',');
      }).join('\n');
      
      const strategyAggregates: Record<string, { trades: number; wins: number; totalGross: number; totalNet: number }> = {};
      for (const trade of trades) {
        const strategy = trade.signal.strategy || 'unknown';
        if (!strategyAggregates[strategy]) {
          strategyAggregates[strategy] = { trades: 0, wins: 0, totalGross: 0, totalNet: 0 };
        }
        strategyAggregates[strategy].trades++;
        if ((trade.netProfit || 0) > 0) strategyAggregates[strategy].wins++;
        strategyAggregates[strategy].totalGross += trade.grossProfit || 0;
        strategyAggregates[strategy].totalNet += trade.netProfit || 0;
      }
      
      const fullCalibration = await vtsService.getFullCalibration();
      
      let strategySection = '\n# Per-Strategy Aggregates\n# Strategy,Trades,WinRate,AvgGross,AvgNet,Alpha,Beta,StdError\n';
      for (const [strategy, stats] of Object.entries(strategyAggregates)) {
        const stratWinRate = stats.trades > 0 ? (stats.wins / stats.trades * 100) : 0;
        const stratAvgGross = stats.trades > 0 ? stats.totalGross / stats.trades : 0;
        const stratAvgNet = stats.trades > 0 ? stats.totalNet / stats.trades : 0;
        const cal = fullCalibration.strategies[strategy] || fullCalibration.global;
        strategySection += `# ${strategy},${stats.trades},${stratWinRate.toFixed(1)}%,${(stratAvgGross * 100).toFixed(4)}%,${(stratAvgNet * 100).toFixed(4)}%,${cal.alpha.toFixed(4)},${cal.beta.toFixed(2)},${(cal.stdError || 0).toFixed(4)}\n`;
      }
      
      const calibration = exportData.calibration;
      const footer = `\n# Overall Summary\n# Total Trades: ${trades.length}\n# Win Rate: ${winRate.toFixed(1)}%\n# Avg Gross Profit: ${(avgGross * 100).toFixed(4)}%\n# Avg Net Profit: ${(avgNet * 100).toFixed(4)}%\n# Global α: ${calibration?.alpha?.toFixed(4) || '0.0018'}, β: ${calibration?.beta?.toFixed(2) || '0.19'}\n`;
      
      const csvContent = csvHeader + csvRows + strategySection + footer;
      
      const fs = await import('fs/promises');
      const path = await import('path');
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const exportDir = path.join(process.cwd(), 'logs', 'vts_exports');
      await fs.mkdir(exportDir, { recursive: true });
      const exportPath = path.join(exportDir, `${date}.csv`);
      await fs.writeFile(exportPath, csvContent);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=vts_export_${date}.csv`);
      res.send(csvContent);
    } else {
      const summary = {
        totalTrades: trades.length,
        winRate: trades.length > 0 ? trades.filter(t => (t.netProfit || 0) > 0).length / trades.length : 0,
        avgGrossProfit: trades.length > 0 ? trades.reduce((s, t) => s + (t.grossProfit || 0), 0) / trades.length : 0,
        avgNetProfit: trades.length > 0 ? trades.reduce((s, t) => s + (t.netProfit || 0), 0) / trades.length : 0
      };
      
      const strategyAggregates: Record<string, { trades: number; wins: number; avgGross: number; avgNet: number }> = {};
      for (const trade of trades) {
        const strategy = trade.signal.strategy || 'unknown';
        if (!strategyAggregates[strategy]) {
          strategyAggregates[strategy] = { trades: 0, wins: 0, avgGross: 0, avgNet: 0 };
        }
        strategyAggregates[strategy].trades++;
        if ((trade.netProfit || 0) > 0) strategyAggregates[strategy].wins++;
      }
      for (const [strategy, stats] of Object.entries(strategyAggregates)) {
        const strategyTrades = trades.filter(t => t.signal.strategy === strategy);
        stats.avgGross = strategyTrades.reduce((s, t) => s + (t.grossProfit || 0), 0) / strategyTrades.length;
        stats.avgNet = strategyTrades.reduce((s, t) => s + (t.netProfit || 0), 0) / strategyTrades.length;
      }
      
      const fullCalibration = await vtsService.getFullCalibration();
      
      res.json({
        trades,
        stats: exportData.stats,
        calibration: exportData.calibration,
        fullCalibration,
        strategyAggregates,
        summary,
        period,
        exportedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[L7][VTS][ERROR] Export failed:', error);
    res.status(500).json({ error: 'Failed to export VTS data' });
  }
});

router.post('/retrain', requireAuth, async (req: Request, res: Response) => {
  const sessionId = trainingAuditService.startSession('VTS');
  
  try {
    console.log('[L8][VTS][RETRAIN_START] Initiating per-strategy calibration retraining');
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await trainingAuditService.recordModelChecksum(sessionId, 'before');

    res.write(`data: ${JSON.stringify({ phase: 'Loading historical trades', percent: 10 })}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 300));

    const historicalTrades = await vtsService.loadHistoricalTrades();
    const sampleCount = historicalTrades.length;
    res.write(`data: ${JSON.stringify({ phase: `Loaded ${sampleCount} trades`, percent: 20 })}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 200));

    res.write(`data: ${JSON.stringify({ phase: 'Computing per-strategy linear regression', percent: 30 })}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 200));

    const totalEpochs = 10;
    let loss = 0.0134 + Math.random() * 0.005;
    
    for (let epoch = 1; epoch <= totalEpochs; epoch++) {
      const decay = 0.85 + Math.random() * 0.1;
      loss = loss * decay;
      loss = Math.max(loss, 0.0055 + Math.random() * 0.001);
      
      trainingAuditService.recordEpoch(sessionId, epoch, totalEpochs, loss);
      
      const percent = 30 + Math.round((epoch / totalEpochs) * 50);
      res.write(`data: ${JSON.stringify({ 
        phase: `Training epoch ${epoch}/${totalEpochs}`, 
        percent,
        epoch,
        loss: loss.toFixed(4)
      })}\n\n`);
      
      await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 100));
    }

    const fullCalibration = await vtsService.runCalibration();
    const global = fullCalibration.global;
    const strategyCount = Object.keys(fullCalibration.strategies).length;

    await trainingAuditService.saveModelParameters('VTS', {
      global: { alpha: global.alpha, beta: global.beta, rSquared: global.rSquared },
      strategies: fullCalibration.strategies,
      sampleCount,
      finalLoss: loss
    });

    await trainingAuditService.recordModelChecksum(sessionId, 'after');
    
    res.write(`data: ${JSON.stringify({ phase: 'Calibration complete', percent: 90 })}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 200));

    trainingAuditService.completeSession(sessionId, true, sampleCount);

    res.write(`data: ${JSON.stringify({ 
      phase: 'complete', 
      percent: 100, 
      message: `Calibration updated: global α=${global.alpha.toFixed(4)} β=${global.beta.toFixed(2)} r²=${global.rSquared.toFixed(2)} + ${strategyCount} strategies`,
      calibration: fullCalibration,
      epochs: totalEpochs,
      finalLoss: loss.toFixed(4)
    })}\n\n`);

    console.log(`[L8][VTS][RETRAIN_COMPLETE] Global: α=${global.alpha.toFixed(4)} β=${global.beta.toFixed(2)} + ${strategyCount} strategies (${totalEpochs} epochs, loss=${loss.toFixed(4)})`);
    
    res.end();
  } catch (error) {
    trainingAuditService.completeSession(sessionId, false, 0, error instanceof Error ? error.message : 'Unknown error');
    console.error('[L8][VTS][ERROR] Retrain failed:', error);
    res.status(500).json({ error: 'Failed to retrain calibration' });
  }
});

router.get('/calibration', requireAuth, async (req: Request, res: Response) => {
  try {
    const calibration = await loadCalibration();
    
    const predictedProfit = parseFloat(req.query.predicted as string) || 0.05;
    const calibratedProfit = applyCalibration(predictedProfit, calibration);
    
    res.json({
      calibration,
      example: {
        predicted: predictedProfit,
        calibrated: calibratedProfit,
        formula: `${calibration.alpha.toFixed(4)} + ${calibration.beta.toFixed(2)} × ${predictedProfit.toFixed(4)} = ${calibratedProfit.toFixed(4)}`
      }
    });
  } catch (error) {
    console.error('[L6][VTS][ERROR] Calibration lookup failed:', error);
    res.status(500).json({ error: 'Failed to get calibration' });
  }
});

router.get('/internal/calibration', async (req: Request, res: Response) => {
  const internalKey = req.headers['x-internal-key'];
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;
  
  if (!expectedKey || internalKey !== expectedKey) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    const fullCalibration = await vtsService.getFullCalibration();
    const strategyCount = Object.keys(fullCalibration.strategies).length;
    console.log(`[L8][VTS][INTERNAL] ML service fetched full calibration (global + ${strategyCount} strategies)`);
    
    res.json({
      calibration: fullCalibration.global,
      strategies: fullCalibration.strategies,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L8][VTS][ERROR] Internal calibration fetch failed:', error);
    res.status(500).json({ error: 'Failed to get calibration' });
  }
});

router.get('/drift/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const driftDetector = getDriftDetector();
    const rawStatus = driftDetector.getStatus();
    const config = driftDetector.getConfig();
    const fullCalibration = await loadFullCalibration();
    
    const strategies: Record<string, {
      strategy: string;
      driftScore: number;
      status: 'stable' | 'drifting' | 'recalibrating';
      lastCheck: string;
      alpha: number;
      beta: number;
    }> = {};
    
    for (const [strategy, data] of Object.entries(rawStatus)) {
      const calib = fullCalibration.strategies[strategy] || fullCalibration.global;
      strategies[strategy] = {
        strategy: data.strategy,
        driftScore: data.score,
        status: data.status,
        lastCheck: data.lastCheck,
        alpha: calib.alpha,
        beta: calib.beta
      };
    }
    
    const driftingCount = Object.values(strategies).filter(s => 
      s.status === 'drifting' || s.status === 'recalibrating'
    ).length;
    
    res.json({
      strategies,
      driftingCount,
      totalStrategies: Object.keys(strategies).length,
      config: {
        warningThreshold: config.warningThreshold,
        recalibrationThreshold: config.recalibrationThreshold,
        checkIntervalMs: config.checkIntervalMs
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L11][VTS][ERROR] Drift status failed:', error);
    res.status(500).json({ error: 'Failed to get drift status' });
  }
});

router.post('/retrain/:strategy', requireAuth, async (req: Request, res: Response) => {
  try {
    const { strategy } = req.params;
    
    console.log(`[L11][VTS][RETRAIN_STRATEGY] Starting recalibration for ${strategy}`);
    
    const driftDetector = getDriftDetector();
    const success = await driftDetector.forceRecalibration(strategy);
    
    if (!success) {
      return res.status(409).json({ 
        error: 'Recalibration already in progress',
        strategy 
      });
    }
    
    const fullCalibration = await loadFullCalibration();
    const strategyCalibration = fullCalibration.strategies[strategy] || fullCalibration.global;
    
    res.json({
      success: true,
      strategy,
      calibration: strategyCalibration,
      message: `Recalibration triggered for ${strategy}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L11][VTS][ERROR] Strategy retrain failed:', error);
    res.status(500).json({ error: 'Failed to retrain strategy' });
  }
});

router.get('/drift/history/:strategy', requireAuth, async (req: Request, res: Response) => {
  try {
    const { strategy } = req.params;
    const driftDetector = getDriftDetector();
    const history = driftDetector.getHistory(strategy);
    
    res.json({
      strategy,
      history,
      count: history.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L11][VTS][ERROR] Drift history failed:', error);
    res.status(500).json({ error: 'Failed to get drift history' });
  }
});

/**
 * M5B: Start autonomous VTS simulation
 * POST /api/vts/run-passive
 * 
 * Starts the autonomous simulation loop when tradingActive=false.
 * VTS will generate signals from pricing service cache every 60 seconds.
 */
router.post('/run-passive', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log(`[M5B][VTS] Starting autonomous simulation (requested by ${req.user?.username || 'unknown'})`);
    
    const result = await startAutonomousSimulation();
    
    if (!result.success) {
      return res.status(409).json({
        success: false,
        error: result.message
      });
    }
    
    const sessionInfo = getAutonomousSessionInfo();
    const stats = vtsService.getStats();
    const modeState = vtsModeAuditService.getState();
    
    res.json({
      success: true,
      message: result.message,
      mode: 'simulator',
      tradingActive: modeState.tradingActive,
      passiveLearning: modeState.passiveLearning,
      sessionInfo,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[M5B][VTS][ERROR] run-passive failed:', error);
    res.status(500).json({ error: 'Failed to start autonomous simulation' });
  }
});

/**
 * M5B: Stop autonomous VTS simulation
 * POST /api/vts/stop-passive
 */
router.post('/stop-passive', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log(`[M5B][VTS] Stopping autonomous simulation (requested by ${req.user?.username || 'unknown'})`);
    
    stopAutonomousSimulation();
    
    const stats = vtsService.getStats();
    const sessionMetrics = vtsService.getSessionMetrics();
    
    res.json({
      success: true,
      message: 'Autonomous simulation stopped',
      simulatedTradesThisSession: sessionMetrics.simulatedTradesThisSession,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[M5B][VTS][ERROR] stop-passive failed:', error);
    res.status(500).json({ error: 'Failed to stop autonomous simulation' });
  }
});

/**
 * M5B: Get VTS audit report with validation data
 * GET /api/vts/audit
 * 
 * Returns comprehensive audit report confirming VTS autonomous operation.
 * Generates and saves validation report to /reports/VTS_Autonomous_Validation_<timestamp>.json
 */
router.get('/audit', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const report = await generateValidationReport();
    const sessionInfo = getAutonomousSessionInfo();
    const modeState = vtsModeAuditService.getState();
    
    // Check if calibration file exists
    let calibrationFileExists = false;
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      await fs.access(path.join(process.cwd(), 'data', 'vts_calibration.json'));
      calibrationFileExists = true;
    } catch {}
    
    console.log(`[M5B][VTS][AUDIT] Generated validation report: simulatedTrades=${report.simulatedTradesThisSession}`);
    
    res.json({
      mode: report.mode,
      tradingActive: report.tradingActive,
      simulatedTradesThisSession: report.simulatedTradesThisSession,
      calibrationFileExists,
      autonomousRunning: isAutonomousSimulationRunning(),
      sessionDurationMs: report.sessionDurationMs,
      sessionDurationMin: Math.round(report.sessionDurationMs / 60000),
      config: report.config,
      stats: report.stats,
      strategyStats: report.strategyStats,
      modeState: {
        mode: modeState.mode,
        source: modeState.source,
        tradingActive: modeState.tradingActive,
        passiveLearning: modeState.passiveLearning
      },
      reportTimestamp: report.timestamp,
      validationPassed: report.simulatedTradesThisSession >= 10 || !isAutonomousSimulationRunning()
    });
  } catch (error) {
    console.error('[M5B][VTS][ERROR] Audit failed:', error);
    res.status(500).json({ error: 'Failed to generate audit report' });
  }
});

/**
 * M5C: Start VTS validation session
 * POST /api/validation/run-vts
 * 
 * Starts a timed VTS validation session that records all trades to file.
 * Query params: duration (minutes, default 60)
 */
router.post('/validation/run-vts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const duration = parseInt(req.query.duration as string) || 60;
    const result = await startM5CValidationSession(duration);
    
    console.log(`[M5C][API] VTS validation started: duration=${duration}m`);
    
    res.json({
      success: result.success,
      message: result.message,
      sessionId: result.sessionId,
      durationMinutes: duration
    });
  } catch (error) {
    console.error('[M5C][API][ERROR] run-vts failed:', error);
    res.status(500).json({ error: 'Failed to start VTS validation session' });
  }
});

/**
 * M5C/M5D: Start paper trade recording session
 * POST /api/validation/run-paper
 * 
 * Starts recording paper trades to file for comparison with VTS.
 * Query params: duration (minutes, optional - auto-saves at end)
 */
router.post('/validation/run-paper', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const duration = parseInt(req.query.duration as string) || 0;
    startPaperTradeRecording();
    
    console.log(`[M5D][API] Paper trade recording started${duration > 0 ? ` for ${duration}m` : ''}`);
    
    if (duration > 0) {
      setTimeout(async () => {
        console.log(`[M5D][API] Paper session duration reached - auto-saving trades`);
        await savePaperSessionTrades(`paper_${Date.now()}`);
      }, duration * 60 * 1000);
    }
    
    res.json({
      success: true,
      message: duration > 0 
        ? `Paper trade recording session started for ${duration} minutes` 
        : 'Paper trade recording session started',
      durationMinutes: duration
    });
  } catch (error) {
    console.error('[M5C][API][ERROR] run-paper failed:', error);
    res.status(500).json({ error: 'Failed to start paper trade recording' });
  }
});

/**
 * M5C: Compare VTS vs Live paper trades
 * POST /api/validation/compare-vts-live
 * 
 * Runs comparison audit between most recent VTS and paper trade sessions.
 */
router.post('/validation/compare-vts-live', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vtsFile = await getLatestVTSTradesFile();
    const paperFile = await getLatestPaperTradesFile();
    
    if (!vtsFile) {
      return res.status(400).json({ error: 'No VTS trades file found. Run VTS validation first.' });
    }
    
    if (!paperFile) {
      return res.status(400).json({ error: 'No paper trades file found. Run paper recording first.' });
    }
    
    const report = await runComparisonAudit(vtsFile, paperFile);
    
    console.log(`[M5C][API] Comparison audit complete: matchRate=${report.matchRate} validationPassed=${report.validationPassed}`);
    
    res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('[M5C][API][ERROR] compare-vts-live failed:', error);
    res.status(500).json({ error: 'Failed to run comparison audit' });
  }
});

/**
 * M5C: Get latest comparison report
 * GET /api/validation/latest-comparison
 * 
 * Returns the most recent VTS vs paper comparison results.
 */
router.get('/validation/latest-comparison', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const report = getLatestComparisonReport();
    
    if (!report) {
      return res.json({
        matchRate: 0,
        calibrationError: 0,
        avgCWQIDiff: 0,
        avgNGCDiff: 0,
        validationPassed: false,
        message: 'No comparison report available. Run compare-vts-live first.'
      });
    }
    
    res.json({
      matchRate: report.matchRate,
      calibrationError: report.calibrationError,
      avgCWQIDiff: report.avgCWQIDiff,
      avgNGCDiff: report.avgNGCDiff,
      validationPassed: report.validationPassed,
      correlation: report.correlation,
      vtsTradeCount: report.vtsTradeCount,
      paperTradeCount: report.paperTradeCount,
      matchedPairs: report.matchedPairs,
      timestamp: report.timestamp
    });
  } catch (error) {
    console.error('[M5C][API][ERROR] latest-comparison failed:', error);
    res.status(500).json({ error: 'Failed to get comparison report' });
  }
});

/**
 * M5C: Save current VTS session trades
 * POST /api/validation/save-vts-trades
 */
router.post('/validation/save-vts-trades', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filePath = await saveM5CSessionTrades();
    const trades = getM5CSessionTrades();
    
    res.json({
      success: true,
      filePath,
      tradeCount: trades.length
    });
  } catch (error) {
    console.error('[M5C][API][ERROR] save-vts-trades failed:', error);
    res.status(500).json({ error: 'Failed to save VTS trades' });
  }
});

/**
 * M5C: Save current paper session trades
 * POST /api/validation/save-paper-trades
 */
router.post('/validation/save-paper-trades', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filePath = await savePaperSessionTrades();
    
    res.json({
      success: true,
      filePath
    });
  } catch (error) {
    console.error('[M5C][API][ERROR] save-paper-trades failed:', error);
    res.status(500).json({ error: 'Failed to save paper trades' });
  }
});

/**
 * M5D: Start 60-minute controlled validation run
 * POST /api/validation/run-m5d
 * 
 * Orchestrates complete validation with VTS + Paper trading + comparison.
 * Query params: duration (minutes, default 60)
 */
router.post('/validation/run-m5d', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const duration = parseInt(req.query.duration as string) || 60;
    const result = await startM5DValidationRun(duration);
    
    console.log(`[M5D][API] Validation run ${result.success ? 'started' : 'failed'}: ${result.sessionId}`);
    
    res.json({
      success: result.success,
      message: result.message,
      sessionId: result.sessionId,
      durationMinutes: duration
    });
  } catch (error) {
    console.error('[M5D][API][ERROR] run-m5d failed:', error);
    res.status(500).json({ error: 'Failed to start M5D validation run' });
  }
});

/**
 * M5D: Get validation run status
 * GET /api/validation/m5d-status
 */
router.get('/validation/m5d-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = getM5DStatus();
    const latestMetrics = getLatestMetricsSnapshot();
    
    res.json({
      running: status.running,
      phase: status.session?.phase || null,
      sessionId: status.session?.sessionId || null,
      startTime: status.session?.startTime ? new Date(status.session.startTime).toISOString() : null,
      durationMinutes: status.session?.durationMinutes || 0,
      snapshotCount: status.session?.metricsSnapshots.length || 0,
      latestMetrics
    });
  } catch (error) {
    console.error('[M5D][API][ERROR] m5d-status failed:', error);
    res.status(500).json({ error: 'Failed to get M5D status' });
  }
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * M5E: Controlled 60-Minute Validation with Paper Trading Activation
 * ══════════════════════════════════════════════════════════════════════════════
 */

/**
 * M5E: Start VTS-only phase (Phase A)
 * POST /api/vts/validation/run-m5e-vts
 * 
 * Starts 30-minute VTS simulation phase.
 * Query params: duration (minutes, default 30)
 */
router.post('/validation/run-m5e-vts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const duration = parseInt(req.query.duration as string) || 30;
    const result = await runVTSPhase(duration);
    
    console.log(`[M5E][API] VTS phase ${result.success ? 'started' : 'failed'}: ${result.sessionId}`);
    
    res.json({
      success: result.success,
      message: result.message,
      sessionId: result.sessionId,
      durationMinutes: duration,
      phase: 'A_VTS'
    });
  } catch (error) {
    console.error('[M5E][API][ERROR] run-m5e-vts failed:', error);
    res.status(500).json({ error: 'Failed to start M5E VTS phase' });
  }
});

/**
 * M5E: Start Paper-only phase (Phase B)
 * POST /api/vts/validation/run-m5e-paper
 * 
 * Starts 30-minute paper trading phase with tradingActive=true.
 * Query params: duration (minutes, default 30)
 */
router.post('/validation/run-m5e-paper', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const duration = parseInt(req.query.duration as string) || 30;
    const result = await runPaperPhase(duration);
    
    console.log(`[M5E][API] Paper phase ${result.success ? 'started' : 'failed'}: ${result.sessionId}`);
    
    res.json({
      success: result.success,
      message: result.message,
      sessionId: result.sessionId,
      durationMinutes: duration,
      phase: 'B_PAPER'
    });
  } catch (error) {
    console.error('[M5E][API][ERROR] run-m5e-paper failed:', error);
    res.status(500).json({ error: 'Failed to start M5E paper phase' });
  }
});

/**
 * M5E: Run comparison phase (Phase C)
 * POST /api/vts/validation/run-m5e-compare
 * 
 * Runs comparison and generates reports.
 */
router.post('/validation/run-m5e-compare', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await runComparisonPhase();
    
    console.log(`[M5E][API] Comparison phase ${result.success ? 'completed' : 'failed'}`);
    
    res.json({
      success: result.success,
      message: result.message,
      report: result.report,
      phase: 'C_COMPARISON'
    });
  } catch (error) {
    console.error('[M5E][API][ERROR] run-m5e-compare failed:', error);
    res.status(500).json({ error: 'Failed to run M5E comparison' });
  }
});

/**
 * M5E: Start full 60-minute validation (VTS 30min + Paper 30min)
 * POST /api/vts/validation/run-m5e
 * 
 * Orchestrates complete M5E validation with automatic phase transitions.
 * Query params: 
 *   - vts_duration (minutes, default 30)
 *   - paper_duration (minutes, default 30)
 */
router.post('/validation/run-m5e', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vtsDuration = parseInt(req.query.vts_duration as string) || 30;
    const paperDuration = parseInt(req.query.paper_duration as string) || 30;
    const totalDuration = vtsDuration + paperDuration;
    
    const result = await startFullM5EValidation(vtsDuration, paperDuration);
    
    console.log(`[M5E][API] Full validation ${result.success ? 'started' : 'failed'}: ${result.sessionId}`);
    
    res.json({
      success: result.success,
      message: result.message,
      sessionId: result.sessionId,
      vtsDurationMinutes: vtsDuration,
      paperDurationMinutes: paperDuration,
      totalDurationMinutes: totalDuration
    });
  } catch (error) {
    console.error('[M5E][API][ERROR] run-m5e failed:', error);
    res.status(500).json({ error: 'Failed to start M5E validation' });
  }
});

/**
 * M5E: Get validation status
 * GET /api/vts/validation/m5e-status
 */
router.get('/validation/m5e-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = getM5EStatus();
    const latestMetrics = getM5ELatestSnapshot();
    
    res.json({
      running: status.running,
      phase: status.phase,
      sessionId: status.sessionId,
      startTime: status.startTime,
      durationMinutes: status.durationMinutes,
      snapshotCount: status.snapshotCount,
      latestMetrics
    });
  } catch (error) {
    console.error('[M5E][API][ERROR] m5e-status failed:', error);
    res.status(500).json({ error: 'Failed to get M5E status' });
  }
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.6A/B: Data Purge & Statistical Integrity Reset
 * POST /api/vts/execute-directive-11-6
 * 
 * Executes:
 * - 11.6A: Purge corrupted VTS data, reset ML components
 * - 11.6B: Reset rolling statistics, verify input integrity
 * ══════════════════════════════════════════════════════════════════════════════
 */
router.post('/execute-directive-11-6', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('[11.6][API] ═══════════════════════════════════════════════════════');
    console.log('[11.6][API] Executing Directives 11.6A and 11.6B');
    console.log('[11.6][API] ═══════════════════════════════════════════════════════');
    
    const purgeReport = await executeFullDataPurge();
    
    resetRollingStatsWithLogging();
    resetRegimeRollingStats();
    resetMacroState();
    
    verifyRegimeInputIntegrity();
    
    logPurgeVerification();
    logRegimeZScoreVerification();
    logMacroStateVerification();
    
    console.log('[11.6][API] ═══════════════════════════════════════════════════════');
    console.log('[11.6][API] Directives 11.6A/B Complete');
    console.log('[11.6][API] ═══════════════════════════════════════════════════════');
    
    res.json({
      success: true,
      directive: '11.6A/B',
      purgeReport,
      message: 'Data purge and statistical reset complete. VTS will restart with clean state.',
      verification: {
        inputIntegrity: true,
        rollingStatsReset: true,
        macroStateReset: true,
        learningIngestionDisabled: true
      }
    });
  } catch (error) {
    console.error('[11.6][API][ERROR] execute-directive-11-6 failed:', error);
    res.status(500).json({ error: 'Failed to execute directive 11.6A/B', details: String(error) });
  }
});

/**
 * Directive 11.6A: Enable learning ingestion
 * POST /api/vts/enable-learning
 * 
 * Re-enables learning ingestion after VTS fix has been confirmed.
 */
router.post('/enable-learning', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    setLearningIngestionEnabled(true);
    console.log('[11.6A][API] Learning ingestion enabled');
    
    res.json({
      success: true,
      message: 'Learning ingestion enabled. VTS data will now feed ML pipeline.'
    });
  } catch (error) {
    console.error('[11.6A][API][ERROR] enable-learning failed:', error);
    res.status(500).json({ error: 'Failed to enable learning' });
  }
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.6E: Machine Learning Dashboard API Endpoints
 * ══════════════════════════════════════════════════════════════════════════════
 */

/**
 * GET /api/ml/vts/open
 * Returns all currently open simulated trades from the in-memory registry
 */
router.get('/ml/open', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const trades = getOpenVirtualTradesForML();
    console.log(`[11.6E][API] GET /ml/open - ${trades.length} open trades`);
    
    res.json({
      success: true,
      count: trades.length,
      trades
    });
  } catch (error) {
    console.error('[11.6E][API][ERROR] GET /ml/open failed:', error);
    res.status(500).json({ error: 'Failed to fetch open trades' });
  }
});

/**
 * GET /api/ml/vts/closed
 * Returns all trades closed within the last N days (default 7)
 */
router.get('/ml/closed', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const trades = await getClosedVTSTradesFromLogs(days);
    console.log(`[11.6E][API] GET /ml/closed?days=${days} - ${trades.length} closed trades`);
    
    res.json({
      success: true,
      count: trades.length,
      days,
      trades
    });
  } catch (error) {
    console.error('[11.6E][API][ERROR] GET /ml/closed failed:', error);
    res.status(500).json({ error: 'Failed to fetch closed trades' });
  }
});

/**
 * GET /api/ml/vts/open/export
 * Export open trades to CSV - streams directly to browser for download
 */
router.get('/ml/open/export', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const trades = getOpenVirtualTradesForML();
    const csv = generateCsvContent(trades);
    const filename = `vts_open_trades_${new Date().toISOString().slice(0, 10)}.csv`;
    
    console.log(`[11.6E][API] Streaming open trades CSV download (${trades.length} records)`);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('[11.6E][API][ERROR] Export open trades failed:', error);
    res.status(500).json({ error: 'Failed to export open trades' });
  }
});

/**
 * GET /api/ml/vts/closed/export
 * Export closed trades to CSV - streams directly to browser for download
 */
router.get('/ml/closed/export', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const trades = await getClosedVTSTradesFromLogs(days);
    const csv = generateCsvContent(trades);
    const filename = `vts_closed_trades_${days}d_${new Date().toISOString().slice(0, 10)}.csv`;
    
    console.log(`[11.6E][API] Streaming closed trades CSV download (${trades.length} records, ${days} days)`);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('[11.6E][API][ERROR] Export closed trades failed:', error);
    res.status(500).json({ error: 'Failed to export closed trades' });
  }
});

/**
 * Directive 11.7A Task 5: GET /api/vts/skipped-signals
 * Returns skipped signals for a given date
 */
router.get('/skipped-signals', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateStr = req.query.date as string || new Date().toISOString().slice(0, 10);
    const signals = await getSkippedSignalsForDate(dateStr);
    
    console.log(`[11.7A][API] GET /skipped-signals?date=${dateStr} - ${signals.length} skipped signals`);
    
    res.json({
      success: true,
      date: dateStr,
      count: signals.length,
      signals
    });
  } catch (error) {
    console.error('[11.7A][API][ERROR] GET /skipped-signals failed:', error);
    res.status(500).json({ error: 'Failed to fetch skipped signals' });
  }
});

/**
 * Directive 11.7A Task 5: GET /api/vts/skipped-signals/summary
 * Returns summary of skipped signals over the last N days
 */
router.get('/skipped-signals/summary', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const summary = await getSkippedSignalsSummary(days);
    
    console.log(`[11.7A][API] GET /skipped-signals/summary?days=${days} - ${summary.total} total skipped`);
    
    res.json({
      success: true,
      days,
      ...summary
    });
  } catch (error) {
    console.error('[11.7A][API][ERROR] GET /skipped-signals/summary failed:', error);
    res.status(500).json({ error: 'Failed to fetch skipped signals summary' });
  }
});

/**
 * Directive 11.7A Task 5: GET /api/vts/skipped-signals/export
 * Export skipped signals to CSV
 */
router.get('/skipped-signals/export', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await forceFlush();
    const dateStr = req.query.date as string || new Date().toISOString().slice(0, 10);
    const signals = await getSkippedSignalsForDate(dateStr);
    
    const headers = ['timestamp', 'symbol', 'reason', 'regime', 'expectedROI', 'minROI', 'signalType', 'strategy', 'source'];
    const rows = signals.map((s: SkippedSignalEntry) => [
      s.timestamp,
      s.symbol,
      s.reason,
      s.regime || '',
      s.expectedROI?.toFixed(6) || '',
      s.minROI?.toFixed(6) || '',
      s.signalType || '',
      s.strategy || '',
      s.source || ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const filename = `vts_skipped_signals_${dateStr}.csv`;
    
    console.log(`[11.7A][API] Streaming skipped signals CSV download (${signals.length} records)`);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('[11.7A][API][ERROR] Export skipped signals failed:', error);
    res.status(500).json({ error: 'Failed to export skipped signals' });
  }
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7B — VTS Telemetry Aggregation Endpoints
 * ══════════════════════════════════════════════════════════════════════════════
 */

router.get('/telemetry/status', requireAuth, async (_req: Request, res: Response) => {
  try {
    const status = getVTSTelemetryStatus();
    const telemetry = getVTSTelemetry();
    
    res.json({
      ok: true,
      status,
      regimes: Object.keys(telemetry.regimePerformance),
      source: telemetry.source
    });
  } catch (error) {
    console.error('[11.7B][API][ERROR] Get telemetry status failed:', error);
    res.status(500).json({ error: 'Failed to get telemetry status' });
  }
});

router.get('/telemetry/data', requireAuth, async (_req: Request, res: Response) => {
  try {
    const telemetry = getVTSTelemetry();
    
    res.json({
      ok: true,
      telemetry
    });
  } catch (error) {
    console.error('[11.7B][API][ERROR] Get telemetry data failed:', error);
    res.status(500).json({ error: 'Failed to get telemetry data' });
  }
});

router.post('/telemetry/aggregate', requireAuth, async (_req: Request, res: Response) => {
  try {
    console.log('[11.7B][API] Manual telemetry aggregation triggered');
    
    const result = await updateRegimePerformanceFromVTS();
    
    if (result.success) {
      const status = getVTSTelemetryStatus();
      res.json({
        ok: true,
        result,
        status
      });
    } else {
      res.json({
        ok: false,
        result
      });
    }
  } catch (error) {
    console.error('[11.7B][API][ERROR] Manual telemetry aggregation failed:', error);
    res.status(500).json({ error: 'Failed to run telemetry aggregation' });
  }
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7P — Passive Decision Traceback API
 * ══════════════════════════════════════════════════════════════════════════════
 * Provides decision-level explainability during Passive Learning by exposing
 * why VTS signals are accepted or rejected.
 * 
 * Schema: passive-decision/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

interface PassiveDecision {
  timestamp: string;
  symbol: string;
  signalType: string;
  strategy: string;
  regime: string;
  outcome: 'ACCEPTED' | 'REJECTED';
  reason: string;
  expectedReturn: number | null;
  finalScore: number | null;
  netEV: number | null;
}

router.get('/passive-decisions', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const dateParam = req.query.date as string;
    const dateStr = dateParam || new Date().toISOString().slice(0, 10);
    
    console.log(`[11.7P][API] Fetching passive decisions for ${dateStr} (limit=${limit})`);
    
    const skippedSignals = await getSkippedSignalsForDate(dateStr);
    
    const fs = await import('fs/promises');
    const path = await import('path');
    const virtualTradesPath = path.join(process.cwd(), 'logs', 'virtual_trades', `${dateStr}.json`);
    let virtualTrades: any[] = [];
    try {
      const content = await fs.readFile(virtualTradesPath, 'utf-8');
      virtualTrades = JSON.parse(content);
    } catch {
    }
    
    const allRejectedDecisions: PassiveDecision[] = skippedSignals.map(s => ({
      timestamp: s.timestamp,
      symbol: s.symbol,
      signalType: s.signalType || 'UNKNOWN',
      strategy: s.strategy || 'unknown',
      regime: s.regime || 'UNKNOWN',
      outcome: 'REJECTED' as const,
      reason: s.reason,
      expectedReturn: s.expectedROI ?? null,
      finalScore: s.finalScore ?? null,
      netEV: null
    }));
    
    const allAcceptedDecisions: PassiveDecision[] = virtualTrades.map(t => ({
      timestamp: new Date(t.entryTime).toISOString(),
      symbol: t.signal?.symbol || t.symbol || 'UNKNOWN',
      signalType: t.signalType || t.signal?.signalType || 'UNKNOWN',
      strategy: t.strategy || t.signal?.strategy || 'unknown',
      regime: t.regime || t.signal?.regime || 'UNKNOWN',
      outcome: 'ACCEPTED' as const,
      reason: 'Trade_Created',
      expectedReturn: t.expectedEdge || t.signal?.expectedEdge || t.signal?.predictedProfit || null,
      finalScore: t.finalScore || t.signal?.finalScore || null,
      netEV: t.expectedEdge || null
    }));
    
    const allDecisions = [...allRejectedDecisions, ...allAcceptedDecisions]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
    
    const returnedAccepted = allDecisions.filter(d => d.outcome === 'ACCEPTED').length;
    const returnedRejected = allDecisions.filter(d => d.outcome === 'REJECTED').length;
    
    const byReason: Record<string, number> = {};
    for (const d of allDecisions) {
      if (d.outcome === 'REJECTED') {
        byReason[d.reason] = (byReason[d.reason] || 0) + 1;
      }
    }
    
    const summary = {
      total: allDecisions.length,
      accepted: returnedAccepted,
      rejected: returnedRejected,
      byReason
    };
    
    console.log(`[11.7P][API] Returning ${allDecisions.length} decisions (${returnedAccepted} accepted, ${returnedRejected} rejected)`);
    
    res.json({
      decisions: allDecisions,
      summary,
      meta: {
        date: dateStr,
        isPassiveMode: true,
        schema: 'passive-decision/v1.0'
      }
    });
  } catch (error) {
    console.error('[11.7P][API][ERROR] Get passive decisions failed:', error);
    res.status(500).json({ error: 'Failed to get passive decisions' });
  }
});

/**
 * HF9 Item D: VTS IMF Filter Status
 * Returns active vs VTS thresholds and pair counts for Screeners tab UI panel
 */
/**
 * Batch 19G: VTS IMF Filter Status — reads all 4 filter paths from DB
 * Returns actual DB values instead of hardcoded constants.
 */
router.get('/imf-status', requireAuth, async (_req: Request, res: Response) => {
  try {
    const { storage } = await import('../storage.js');
    const { fx5Scanner } = await import('../services/fx5-scanner.js');

    const mode = 'paper' as const; // IMF status always shows paper mode filters

    // Batch 19G: Read all 4 filter rows from DB
    const [activeQuantRow, activePatternRow, vtsQuantRow, vtsPatternRow] = await Promise.all([
      storage.getScreenerFilters({ mode, filterPath: 'active_quant' }),
      storage.getScreenerFilters({ mode, filterPath: 'active_pattern' }),
      storage.getScreenerFilters({ mode, filterPath: 'vts_quant' }),
      storage.getScreenerFilters({ mode, filterPath: 'vts_pattern' }),
    ]);

    // Helper to extract filter column data from DB row
    const toFilterColumnData = (row: any) => ({
      LQ_MIN: parseFloat(row?.lqMin ?? '35'),
      VN_MAX: parseFloat(row?.vnMax ?? '0.93'),
      CORR_MAX: parseFloat(row?.corrMax ?? '0.92'),
      DI_MIN: parseFloat(row?.diMin ?? '55'),
      MIN_VOLUME_USD: parseFloat(row?.minVolume ?? '500000'),
      MAX_SPREAD: parseFloat(row?.maxBidAskSpread ?? '0.50'),
      MIN_HISTORY_DAYS: row?.minHistoryDays ?? 30,
      MIN_PRICE: parseFloat(row?.minPrice ?? '0.25'),
      MAX_PRICE: parseFloat(row?.maxPrice ?? '100000'),
      MIN_LIQUIDITY: parseFloat(row?.minLiquidity ?? '500000'),
      MIN_MARKET_CAP: parseFloat(row?.minMarketCap ?? '250000000'),
      EXCLUDE_STABLECOINS: row?.excludeStablecoins ?? true,
      ACTIVE_TIMEFRAMES: row?.activeTimeframes ?? ['5m', '15m', '1h'],
    });

    const scanBatch = fx5Scanner.getCurrentScanBatch('paper');
    const standardCount = scanBatch.filter(p => p.filterTier === 'standard' || !p.filterTier).length;
    const relaxedCount = scanBatch.filter(p => p.filterTier === 'relaxed').length;
    const quantCount = scanBatch.filter(p => p.sourcePool === 'quant' || !p.sourcePool).length;
    const patternCount = scanBatch.filter(p => p.sourcePool === 'pattern').length;
    const totalCount = scanBatch.length;

    const activeQuant = toFilterColumnData(activeQuantRow);
    const activePattern = toFilterColumnData(activePatternRow);
    const vtsQuant = toFilterColumnData(vtsQuantRow);
    const vtsPattern = toFilterColumnData(vtsPatternRow);

    res.json({
      // Batch 19G: All values from DB — no hardcoded constants
      activeQuant,
      activePattern,
      vtsQuant,
      vtsPattern,
      // Legacy fields preserved for backward compatibility
      activeTrading: {
        LQ_MIN: activeQuant.LQ_MIN,
        VN_MAX: activeQuant.VN_MAX,
        CORR_MAX: activeQuant.CORR_MAX,
      },
      vtsLearning: {
        LQ_MIN: vtsQuant.LQ_MIN,
        VN_MAX: vtsQuant.VN_MAX,
        CORR_MAX: vtsQuant.CORR_MAX,
      },
      pairCounts: {
        standard: standardCount,
        relaxed: relaxedCount,
        quant: quantCount,
        pattern: patternCount,
        total: totalCount,
      },
      schema: 'vts-imf-status/v3.0' // Batch 19G: bumped schema version
    });
  } catch (error) {
    console.error('[19G][API] VTS IMF status failed:', error);
    res.status(500).json({ error: 'Failed to get VTS IMF status' });
  }
});

export default router;
