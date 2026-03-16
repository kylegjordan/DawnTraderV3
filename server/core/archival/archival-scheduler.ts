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
 * HF12: Added startup catch-up check — if last archive is >7 days old,
 * runs archival immediately on server startup. Prevents missed archives
 * when Replit server is sleeping at scheduled time.
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as schedule from 'node-schedule';
import { archiveRegimeMetrics } from '../../scripts/archive-regime-metrics';
import { verifyArchiveIntegrity } from '../../scripts/verify-archive-integrity';
import { compressOldArchives } from '../../scripts/compress-old-archives';
import { getManifest } from './regime-archiver';

let archiveJob: schedule.Job | null = null;
let verifyJob: schedule.Job | null = null;
let compressJob: schedule.Job | null = null;
let isInitialized = false;

// HF12: Track startup catch-up state for status endpoint
let lastCatchUpRan: Date | null = null;
let lastCatchUpResult: { success: boolean; recordCount: number; message: string } | null = null;
let initTimestamp: Date | null = null;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * HF12: Check if the last archive is older than 7 days.
 * If so, run archival immediately to catch up after missed scheduled runs
 * (e.g., Replit server was sleeping at 00:45 UTC Sunday).
 */
async function checkAndRunCatchUp(): Promise<void> {
  try {
    const manifest = getManifest();

    if (manifest.length === 0) {
      console.log('[11.7E][CatchUp] No archives exist yet — running initial archive');
      const result = await archiveRegimeMetrics();
      lastCatchUpRan = new Date();
      lastCatchUpResult = { success: result.success, recordCount: result.recordCount, message: result.message };
      if (result.success) {
        console.log(`[11.7E][CatchUp] ✅ Initial archive complete: ${result.recordCount} records`);
      } else {
        console.warn(`[11.7E][CatchUp] ⚠️ Initial archive failed: ${result.message}`);
      }
      return;
    }

    // Find the most recent archive date
    const sortedManifest = [...manifest].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latestDate = new Date(sortedManifest[0].createdAt);
    const ageMs = Date.now() - latestDate.getTime();
    const ageDays = (ageMs / (24 * 60 * 60 * 1000)).toFixed(1);

    if (ageMs > SEVEN_DAYS_MS) {
      console.log(`[11.7E][CatchUp] Last archive is ${ageDays} days old (threshold: 7 days) — running catch-up archive`);
      const result = await archiveRegimeMetrics();
      lastCatchUpRan = new Date();
      lastCatchUpResult = { success: result.success, recordCount: result.recordCount, message: result.message };
      if (result.success) {
        console.log(`[11.7E][CatchUp] ✅ Catch-up archive complete: ${result.recordCount} records`);
      } else {
        console.warn(`[11.7E][CatchUp] ⚠️ Catch-up archive failed: ${result.message}`);
      }
    } else {
      console.log(`[11.7E][CatchUp] Last archive is ${ageDays} days old — no catch-up needed`);
    }
  } catch (err) {
    console.error('[11.7E][CatchUp] Error during catch-up check:', err);
    lastCatchUpRan = new Date();
    lastCatchUpResult = { success: false, recordCount: 0, message: `Catch-up error: ${err}` };
  }
}

export function initArchivalScheduler(): void {
  if (isInitialized) {
    console.log('[11.7E][Scheduler] Already initialized');
    return;
  }

  console.log('[11.7E][Scheduler] Initializing archival scheduler...');
  initTimestamp = new Date();

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

  // HF12: Run catch-up check after scheduler is initialized (async, non-blocking)
  checkAndRunCatchUp().catch(err => {
    console.error('[11.7E][CatchUp] Unhandled catch-up error:', err);
  });
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
  initTimestamp: string | null;
  nextArchive: Date | null;
  nextVerify: Date | null;
  nextCompress: Date | null;
  lastCatchUpRan: string | null;
  lastCatchUpResult: { success: boolean; recordCount: number; message: string } | null;
  isOverdue: boolean;
} {
  // Check if archive is overdue (>7 days since last archive)
  let isOverdue = false;
  try {
    const manifest = getManifest();
    if (manifest.length > 0) {
      const sortedManifest = [...manifest].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const ageMs = Date.now() - new Date(sortedManifest[0].createdAt).getTime();
      isOverdue = ageMs > SEVEN_DAYS_MS;
    } else {
      isOverdue = true; // No archives at all
    }
  } catch {
    // If we can't check, don't report overdue
  }

  return {
    isInitialized,
    initTimestamp: initTimestamp?.toISOString() || null,
    nextArchive: archiveJob?.nextInvocation() || null,
    nextVerify: verifyJob?.nextInvocation() || null,
    nextCompress: compressJob?.nextInvocation() || null,
    lastCatchUpRan: lastCatchUpRan?.toISOString() || null,
    lastCatchUpResult,
    isOverdue,
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
