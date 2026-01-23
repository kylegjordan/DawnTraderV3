/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7E — Integrity Verification Script
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Phase: 11.7 | Series: Predictive Learning Feedback Loop
 * Dependencies: 11.7E Task 1 (Archival Schema)
 * Implements: Nightly checksum validation and corruption detection
 * Runs: 0 2 * * * (2:00 AM UTC daily)
 * 
 * Process:
 * 1. Load archive manifest
 * 2. For each archive file, recompute deterministic checksums
 * 3. Compare to stored checksums
 * 4. Alert on mismatch
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
  ARCHIVE_DIR,
  RegimeArchiveRecord,
  getManifest,
  verifyChecksum,
} from '../core/archival/regime-archiver';

const SYSTEM_EVENTS_LOG = path.join(process.cwd(), 'logs', 'system_events.log');

interface VerificationResult {
  filename: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  mismatches: string[];
  status: 'OK' | 'CORRUPTED' | 'MISSING' | 'ERROR';
}

function logSystemEvent(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp} [${level}] [11.7E][Verify] ${message}\n`;
  
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

function verifyArchiveFile(filename: string, compressed: boolean): VerificationResult {
  const result: VerificationResult = {
    filename,
    totalRecords: 0,
    validRecords: 0,
    invalidRecords: 0,
    mismatches: [],
    status: 'OK',
  };
  
  try {
    let filePath = path.join(ARCHIVE_DIR, filename);
    
    if (compressed) {
      const gzPath = filePath.endsWith('.gz') ? filePath : `${filePath}.gz`;
      if (!fs.existsSync(gzPath)) {
        result.status = 'MISSING';
        logSystemEvent('WARN', `Archive file missing: ${gzPath}`);
        return result;
      }
      filePath = gzPath;
    } else {
      if (!fs.existsSync(filePath)) {
        const gzPath = `${filePath}.gz`;
        if (fs.existsSync(gzPath)) {
          filePath = gzPath;
          compressed = true;
        } else {
          result.status = 'MISSING';
          logSystemEvent('WARN', `Archive file missing: ${filePath}`);
          return result;
        }
      }
    }
    
    let content: string;
    
    if (compressed || filePath.endsWith('.gz')) {
      const compressedData = fs.readFileSync(filePath);
      content = zlib.gunzipSync(compressedData).toString('utf8');
    } else {
      content = fs.readFileSync(filePath, 'utf8');
    }
    
    const records = JSON.parse(content) as RegimeArchiveRecord[];
    result.totalRecords = records.length;
    
    for (const record of records) {
      if (verifyChecksum(record)) {
        result.validRecords++;
      } else {
        result.invalidRecords++;
        result.mismatches.push(`${record.regime}/${record.strategy}`);
      }
    }
    
    if (result.invalidRecords > 0) {
      result.status = 'CORRUPTED';
      logSystemEvent('ERROR', `Checksum mismatch detected in ${filename}: ${result.invalidRecords} invalid records`);
    } else {
      logSystemEvent('INFO', `Archive ${filename} verified OK: ${result.validRecords} records`);
    }
    
    return result;
  } catch (err) {
    result.status = 'ERROR';
    logSystemEvent('ERROR', `Error verifying ${filename}: ${err}`);
    return result;
  }
}

export async function verifyArchiveIntegrity(): Promise<{
  success: boolean;
  totalFiles: number;
  validFiles: number;
  corruptedFiles: number;
  missingFiles: number;
  results: VerificationResult[];
  message: string;
}> {
  console.log('[11.7E][Verify] Starting integrity verification...');
  logSystemEvent('INFO', 'Starting nightly integrity verification');
  
  const manifest = getManifest();
  
  if (manifest.length === 0) {
    logSystemEvent('INFO', 'No archives to verify');
    return {
      success: true,
      totalFiles: 0,
      validFiles: 0,
      corruptedFiles: 0,
      missingFiles: 0,
      results: [],
      message: 'No archives to verify',
    };
  }
  
  const results: VerificationResult[] = [];
  let validFiles = 0;
  let corruptedFiles = 0;
  let missingFiles = 0;
  
  for (const entry of manifest) {
    const result = verifyArchiveFile(entry.filename, entry.compressed);
    results.push(result);
    
    switch (result.status) {
      case 'OK':
        validFiles++;
        break;
      case 'CORRUPTED':
        corruptedFiles++;
        break;
      case 'MISSING':
        missingFiles++;
        break;
      default:
        corruptedFiles++;
    }
  }
  
  const success = corruptedFiles === 0;
  const message = success
    ? `All ${validFiles} archives verified successfully`
    : `${corruptedFiles} corrupted, ${missingFiles} missing out of ${manifest.length} archives`;
  
  logSystemEvent(
    success ? 'INFO' : 'ERROR',
    `Verification complete: ${message}`
  );
  
  console.log(`[11.7E][Verify] ${message}`);
  
  return {
    success,
    totalFiles: manifest.length,
    validFiles,
    corruptedFiles,
    missingFiles,
    results,
    message,
  };
}

