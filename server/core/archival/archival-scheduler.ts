/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7E — Archival Scheduler Integration
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Phase: 11.7 | Series: Predictive Learning Feedback Loop
 * Dependencies: 11.7E Tasks 1-6
 * Implements: Scheduled jobs for archival, verification, and compression
 * 
 * Schedules:
 * - Weekly archival: Sunday 00:45 UTC (15 min after recalibration)
 * - Nightly integrity verification: Daily 02:00 UTC
 * - Monthly compression: First day of month 03:00 UTC
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as schedule from 'node-schedule';
import { archiveRegimeMetrics } from '../../scripts/archive-regime-metrics';
import { verifyArchiveIntegrity } from '../../scripts/verify-archive-integrity';
import { compressOldArchives } from '../../scripts/compress-old-archives';

let archiveJob: schedule.Job | null = null;
let verifyJob: schedule.Job | null = null;
let compressJob: schedule.Job | null = null;
let isInitialized = false;

export function initArchivalScheduler(): void {
  if (isInitialized) {
    console.log('[11.7E][Scheduler] Already initialized');
    return;
  }
  
  console.log('[11.7E][Scheduler] Initializing archival scheduler...');
  
  archiveJob = schedule.scheduleJob('45 0 * * 0', async () => {
    console.log('[11.7E][Scheduler] Starting weekly regime metrics archival...');
    try {
      const result = await archiveRegimeMetrics();
      if (result.success) {
        console.log(`[11.7E][Scheduler] ✅ Archival complete: ${result.recordCount} records`);
      } else {
        console.error(`[11.7E][Scheduler] ❌ Archival failed: ${result.message}`);
      }
    } catch (err) {
      console.error('[11.7E][Scheduler] Archival error:', err);
    }
  });
  console.log('[11.7E][Scheduler] Weekly archival scheduled: Sunday 00:45 UTC');
  
  verifyJob = schedule.scheduleJob('0 2 * * *', async () => {
    console.log('[11.7E][Scheduler] Starting nightly integrity verification...');
    try {
      const result = await verifyArchiveIntegrity();
      if (result.success) {
        console.log(`[11.7E][Scheduler] ✅ Verification complete: ${result.validFiles} files OK`);
      } else {
        console.error(`[11.7E][Scheduler] ❌ Verification issues: ${result.message}`);
      }
    } catch (err) {
      console.error('[11.7E][Scheduler] Verification error:', err);
    }
  });
  console.log('[11.7E][Scheduler] Nightly verification scheduled: Daily 02:00 UTC');
  
  compressJob = schedule.scheduleJob('0 3 1 * *', async () => {
    console.log('[11.7E][Scheduler] Starting monthly archive compression...');
    try {
      const result = await compressOldArchives();
      if (result.success) {
        console.log(`[11.7E][Scheduler] ✅ Compression complete: ${result.compressedCount} files`);
      } else {
        console.error(`[11.7E][Scheduler] ❌ Compression issues: ${result.message}`);
      }
    } catch (err) {
      console.error('[11.7E][Scheduler] Compression error:', err);
    }
  });
  console.log('[11.7E][Scheduler] Monthly compression scheduled: 1st of month 03:00 UTC');
  
  isInitialized = true;
  console.log('[11.7E][Scheduler] ✅ Archival scheduler initialized');
}

export function stopArchivalScheduler(): void {
  if (archiveJob) {
    archiveJob.cancel();
    archiveJob = null;
  }
  if (verifyJob) {
    verifyJob.cancel();
    verifyJob = null;
  }
  if (compressJob) {
    compressJob.cancel();
    compressJob = null;
  }
  isInitialized = false;
  console.log('[11.7E][Scheduler] Archival scheduler stopped');
}

export function getSchedulerStatus(): {
  isInitialized: boolean;
  nextArchive: Date | null;
  nextVerify: Date | null;
  nextCompress: Date | null;
} {
  return {
    isInitialized,
    nextArchive: archiveJob?.nextInvocation() || null,
    nextVerify: verifyJob?.nextInvocation() || null,
    nextCompress: compressJob?.nextInvocation() || null,
  };
}

export async function triggerManualArchive(): Promise<{
  success: boolean;
  recordCount: number;
  filename: string | null;
  message: string;
}> {
  console.log('[11.7E][Scheduler] Manual archive triggered');
  return archiveRegimeMetrics();
}

export async function triggerManualVerify(): Promise<{
  success: boolean;
  totalFiles: number;
  validFiles: number;
  corruptedFiles: number;
  message: string;
}> {
  console.log('[11.7E][Scheduler] Manual verification triggered');
  const result = await verifyArchiveIntegrity();
  return {
    success: result.success,
    totalFiles: result.totalFiles,
    validFiles: result.validFiles,
    corruptedFiles: result.corruptedFiles,
    message: result.message,
  };
}

export async function triggerManualCompress(): Promise<{
  success: boolean;
  compressedCount: number;
  message: string;
}> {
  console.log('[11.7E][Scheduler] Manual compression triggered');
  const result = await compressOldArchives();
  return {
    success: result.success,
    compressedCount: result.compressedCount,
    message: result.message,
  };
}
