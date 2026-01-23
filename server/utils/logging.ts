/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7D.1 — Logging Utilities with Concurrency Safety
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides atomic file write operations to prevent JSON corruption during
 * concurrent log writes.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 50;

/**
 * Safely appends a record to a JSON array file with retry logic.
 * Prevents concurrent writes from corrupting JSON structure.
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
      
      const tempFile = `${file}.tmp.${Date.now()}`;
      fs.writeFileSync(tempFile, JSON.stringify(existing, null, 2));
      fs.renameSync(tempFile, file);
      
      return true;
    } catch (err) {
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
