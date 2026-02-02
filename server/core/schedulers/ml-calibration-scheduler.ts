/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7I-04 — ML Calibration Scheduler
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Phase: 11.7I | Series: System Stabilization & Predictive Activation
 * Implements: Scheduled ML calibration runs with precondition checks
 * 
 * Schedule: Every 8 hours (0:00, 8:00, 16:00 UTC)
 * Preconditions:
 * - Minimum 10 closed VTS trades available
 * - Valid telemetry service running
 * 
 * Outputs: Logs adjustments via centralized predictive logging
 * Does NOT modify guardrails directly (per Directive 11.7I exclusions)
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as schedule from 'node-schedule';
import { MLCalibrationService } from '../../services/ml-calibration';
import { logPredictiveAdjustment } from '../logging/predictive-adjustments';

let calibrationJob: schedule.Job | null = null;
let isInitialized = false;
let lastCalibrationTime: Date | null = null;
let calibrationRunCount = 0;

const MIN_TRADES_FOR_CALIBRATION = 10;
const CALIBRATION_CRON = '0 0,8,16 * * *'; // Every 8 hours at 0:00, 8:00, 16:00 UTC

export interface MLCalibrationSchedulerStatus {
  isInitialized: boolean;
  lastCalibrationTime: string | null;
  calibrationRunCount: number;
  nextScheduledRun: string | null;
}

export interface CalibrationRunResult {
  success: boolean;
  reason: string;
  analyzedTrades?: number;
  recommendations?: number;
  timestamp: string;
}

async function runCalibration(): Promise<CalibrationRunResult> {
  console.log('[11.7I-04][MLScheduler] Starting scheduled ML calibration run...');
  const timestamp = new Date().toISOString();
  
  try {
    const report = await MLCalibrationService.analyzePerformance(50);
    
    if (!report.success) {
      const reason = report.reason || 'Unknown failure';
      console.log(`[11.7I-04][SKIP] Reason: ${reason}`);
      
      logPredictiveAdjustment({
        category: 'Other',
        parameter: 'ml.scheduler_run',
        oldValue: 0,
        newValue: 0,
        reason: `Calibration skipped: ${reason}`
      });
      return { success: false, reason, timestamp };
    }
    
    if ((report.analyzedTrades || 0) < MIN_TRADES_FOR_CALIBRATION) {
      const reason = `insufficient trades (found ${report.analyzedTrades}, need ${MIN_TRADES_FOR_CALIBRATION})`;
      console.log(`[11.7I-04][SKIP] Reason: ${reason}`);
      
      logPredictiveAdjustment({
        category: 'Other',
        parameter: 'ml.scheduler_precondition',
        oldValue: report.analyzedTrades || 0,
        newValue: MIN_TRADES_FOR_CALIBRATION,
        reason: `Precondition not met: ${reason}`
      });
      return { success: false, reason, analyzedTrades: report.analyzedTrades, timestamp };
    }
    
    MLCalibrationService.logRecommendations(report);
    
    calibrationRunCount++;
    lastCalibrationTime = new Date();
    
    const recCount = report.recommendations?.length || 0;
    console.log(`[11.7I-04][MLScheduler] ✅ Calibration complete: ${recCount} recommendations from ${report.analyzedTrades} trades`);
    
    logPredictiveAdjustment({
      category: 'Scoring',
      parameter: 'ml.calibration_run',
      oldValue: calibrationRunCount - 1,
      newValue: calibrationRunCount,
      reason: `Scheduled calibration #${calibrationRunCount}: ${recCount} recommendations`
    });
    
    return {
      success: true,
      reason: 'Calibration completed successfully',
      analyzedTrades: report.analyzedTrades,
      recommendations: recCount,
      timestamp
    };
    
  } catch (error: any) {
    const reason = error.message || 'Unknown error';
    console.error('[11.7I-04][MLScheduler] ❌ Calibration error:', reason);
    console.log(`[11.7I-04][SKIP] Reason: error - ${reason}`);
    
    logPredictiveAdjustment({
      category: 'Other',
      parameter: 'ml.scheduler_error',
      oldValue: 0,
      newValue: 1,
      reason: `Calibration error: ${reason}`
    });
    
    return { success: false, reason: `error: ${reason}`, timestamp };
  }
}

export function initMLCalibrationScheduler(): void {
  if (isInitialized) {
    console.log('[11.7I-04][MLScheduler] Already initialized');
    return;
  }
  
  console.log('[11.7I-04][MLScheduler] Initializing ML Calibration scheduler...');
  
  calibrationJob = schedule.scheduleJob(CALIBRATION_CRON, async () => {
    await runCalibration();
  });
  
  console.log('[11.7I-04][MLScheduler] Scheduled: Every 8 hours (0:00, 8:00, 16:00 UTC)');
  
  isInitialized = true;
  
  logPredictiveAdjustment({
    category: 'Other',
    parameter: 'ml.scheduler_init',
    oldValue: 0,
    newValue: 1,
    reason: 'ML Calibration scheduler initialized successfully'
  });
  
  console.log('[11.7I-04][MLScheduler] ✅ ML Calibration scheduler initialized');
  
  setTimeout(async () => {
    console.log('[11.7I-04][MLScheduler] Running initial calibration check...');
    await runCalibration();
  }, 5000);
}

export function stopMLCalibrationScheduler(): void {
  if (calibrationJob) {
    calibrationJob.cancel();
    calibrationJob = null;
  }
  isInitialized = false;
  console.log('[11.7I-04][MLScheduler] ML Calibration scheduler stopped');
}

export async function triggerManualCalibration(): Promise<CalibrationRunResult> {
  console.log('[11.7I-04][Manual] Calibration triggered');
  return await runCalibration();
}

export function getMLCalibrationSchedulerStatus(): MLCalibrationSchedulerStatus {
  return {
    isInitialized,
    lastCalibrationTime: lastCalibrationTime?.toISOString() || null,
    calibrationRunCount,
    nextScheduledRun: calibrationJob ? calibrationJob.nextInvocation()?.toISOString() || null : null
  };
}
