/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7E — Compression & Retention Script
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Phase: 11.7 | Series: Predictive Learning Feedback Loop
 * Dependencies: 11.7E Task 1 (Archival Schema), Task 4 (Manifest)
 * Implements: 30-day rotation with manifest sync
 * 
 * Process:
 * 1. Find archives older than 30 days
 * 2. Compress .json → .json.gz
 * 3. Update manifest with compression metadata
 * 4. Remove original uncompressed file
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
  ARCHIVE_DIR,
  getManifest,
  updateManifestEntry,
} from '../core/archival/regime-archiver';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SYSTEM_EVENTS_LOG = path.join(process.cwd(), 'logs', 'system_events.log');

function logSystemEvent(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp} [${level}] [11.7E][Compress] ${message}\n`;
  
  try {
    const dir = path.dirname(SYSTEM_EVENTS_LOG);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(SYSTEM_EVENTS_LOG, logLine);
  } catch {
  }
  
  if (level === 'ERROR') {
    console.error(logLine.trim());
  } else if (level === 'WARN') {
    console.warn(logLine.trim());
  } else {
    console.log(logLine.trim());
  }
}

function compressFile(sourcePath: string, destPath: string): boolean {
  try {
    const content = fs.readFileSync(sourcePath);
    const compressed = zlib.gzipSync(content, { level: 9 });
    fs.writeFileSync(destPath, compressed);
    
    const originalSize = content.length;
    const compressedSize = compressed.length;
    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    
    logSystemEvent('INFO', `Compressed ${path.basename(sourcePath)}: ${originalSize}b → ${compressedSize}b (${ratio}% reduction)`);
    
    return true;
  } catch (err) {
    logSystemEvent('ERROR', `Failed to compress ${sourcePath}: ${err}`);
    return false;
  }
}

export async function compressOldArchives(): Promise<{
  success: boolean;
  processedCount: number;
  compressedCount: number;
  skippedCount: number;
  errorCount: number;
  message: string;
}> {
  console.log('[11.7E][Compress] Starting archive compression...');
  logSystemEvent('INFO', 'Starting archive compression job');
  
  const manifest = getManifest();
  const now = Date.now();
  const cutoffDate = now - THIRTY_DAYS_MS;
  
  let processedCount = 0;
  let compressedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const entry of manifest) {
    processedCount++;
    
    if (entry.compressed) {
      skippedCount++;
      continue;
    }
    
    const createdAt = new Date(entry.createdAt).getTime();
    
    if (createdAt > cutoffDate) {
      skippedCount++;
      continue;
    }
    
    const sourcePath = path.join(ARCHIVE_DIR, entry.filename);
    const destPath = `${sourcePath}.gz`;
    
    if (!fs.existsSync(sourcePath)) {
      if (fs.existsSync(destPath)) {
        updateManifestEntry(entry.filename, {
          compressed: true,
          compressedAt: new Date().toISOString(),
        });
        skippedCount++;
      } else {
        logSystemEvent('WARN', `Source file not found: ${entry.filename}`);
        errorCount++;
      }
      continue;
    }
    
    const compressed = compressFile(sourcePath, destPath);
    
    if (compressed) {
      try {
        fs.unlinkSync(sourcePath);
      } catch (err) {
        logSystemEvent('WARN', `Could not remove original file: ${sourcePath}`);
      }
      
      updateManifestEntry(entry.filename, {
        compressed: true,
        compressedAt: new Date().toISOString(),
      });
      
      compressedCount++;
    } else {
      errorCount++;
      
      if (fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath);
        } catch {
        }
      }
    }
  }
  
  const success = errorCount === 0;
  const message = `Processed ${processedCount} archives: ${compressedCount} compressed, ${skippedCount} skipped, ${errorCount} errors`;
  
  logSystemEvent(success ? 'INFO' : 'WARN', `Compression complete: ${message}`);
  console.log(`[11.7E][Compress] ${message}`);
  
  return {
    success,
    processedCount,
    compressedCount,
    skippedCount,
    errorCount,
    message,
  };
}

