/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7D.1 — Logging Utilities with Concurrency Safety
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides atomic file write operations to prevent JSON corruption during
 * concurrent log writes using file locking and mutex patterns.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 25;
const LOCK_TIMEOUT_MS = 5000;

const fileLocks = new Map<string, Promise<void>>();

/**
 * Acquires an in-memory mutex lock for a specific file path.
 * Ensures only one operation runs per file at a time within this process.
 */
async function acquireLock(filePath: string): Promise<() => void> {
  const normalizedPath = path.resolve(filePath);
  
  while (fileLocks.has(normalizedPath)) {
    await fileLocks.get(normalizedPath);
  }
  
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  
  fileLocks.set(normalizedPath, lockPromise);
  
  return () => {
    fileLocks.delete(normalizedPath);
    releaseLock!();
  };
}

/**
 * Creates a lock file for cross-process locking.
 * Returns cleanup function if lock acquired, null if lock is held.
 */
function tryAcquireFileLock(filePath: string): (() => void) | null {
  const lockFile = `${filePath}.lock`;
  
  try {
    if (fs.existsSync(lockFile)) {
      const stat = fs.statSync(lockFile);
      const lockAge = Date.now() - stat.mtimeMs;
      if (lockAge > LOCK_TIMEOUT_MS) {
        fs.unlinkSync(lockFile);
      } else {
        return null;
      }
    }
    
    fs.writeFileSync(lockFile, String(Date.now()), { flag: 'wx' });
    
    return () => {
      try {
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
      } catch {
      }
    };
  } catch {
    return null;
  }
}

/**
 * Safely appends a record to a JSON array file with mutex locking.
 * Prevents concurrent writes from corrupting JSON structure or losing entries.
 * Uses both in-memory mutex (for same-process concurrency) and file locks
 * (for cross-process concurrency).
 * 
 * @param file - Path to the JSON file
 * @param record - Record to append to the array
 * @returns true if successful, false otherwise
 */
export function safeAppendJSON<T extends Record<string, unknown>>(file: string, record: T): boolean {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const releaseLock = tryAcquireFileLock(file);
    
    if (!releaseLock) {
      const sleepTime = RETRY_DELAY_MS * Math.pow(2, attempt);
      const start = Date.now();
      while (Date.now() - start < sleepTime) {
      }
      continue;
    }
    
    try {
      let existing: T[] = [];
      
      if (fs.existsSync(file)) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            existing = parsed;
          }
        } catch (parseError) {
          console.warn(`[safeAppendJSON] Parse error on ${file}, starting fresh array`);
          existing = [];
        }
      }
      
      existing.push(record);
      
      const tempFile = `${file}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
      fs.writeFileSync(tempFile, JSON.stringify(existing, null, 2));
      fs.renameSync(tempFile, file);
      
      releaseLock();
      return true;
    } catch (err) {
      releaseLock();
      console.warn(`[safeAppendJSON] Retry ${attempt + 1}/${MAX_RETRIES} for ${file}: ${err}`);
      
      if (attempt < MAX_RETRIES - 1) {
        const sleepTime = RETRY_DELAY_MS * Math.pow(2, attempt);
        const start = Date.now();
        while (Date.now() - start < sleepTime) {
        }
      }
    }
  }
  
  console.error(`[safeAppendJSON] Failed to append to ${file} after ${MAX_RETRIES} attempts`);
  return false;
}

/**
 * Async version of safeAppendJSON with in-memory mutex for same-process safety.
 * Recommended for high-concurrency scenarios.
 */
export async function safeAppendJSONAsync<T extends Record<string, unknown>>(
  file: string, 
  record: T
): Promise<boolean> {
  const release = await acquireLock(file);
  
  try {
    return safeAppendJSON(file, record);
  } finally {
    release();
  }
}

/**
 * Safely reads a JSON array file with error handling.
 * Returns empty array if file doesn't exist or is corrupted.
 * 
 * @param file - Path to the JSON file
 * @returns Array of records or empty array
 */
export function safeReadJSONArray<T>(file: string): T[] {
  try {
    if (!fs.existsSync(file)) {
      return [];
    }
    
    const content = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(content);
    
    if (!Array.isArray(parsed)) {
      console.warn(`[safeReadJSONArray] File ${file} is not an array`);
      return [];
    }
    
    return parsed as T[];
  } catch (err) {
    console.warn(`[safeReadJSONArray] Error reading ${file}: ${err}`);
    return [];
  }
}

/**
 * Atomically writes JSON to a file using temp file + rename pattern.
 * 
 * @param file - Path to the JSON file
 * @param data - Data to write
 * @returns true if successful, false otherwise
 */
export function safeWriteJSON<T>(file: string, data: T): boolean {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const tempFile = `${file}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, file);
    return true;
  } catch (err) {
    console.error(`[safeWriteJSON] Failed to write ${file}: ${err}`);
    return false;
  }
}
