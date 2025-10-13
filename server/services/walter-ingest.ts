/**
 * Walter Data Ingestion Service - Phase 6.3
 * 
 * Automatically processes uploaded learning files and ingests them into Walter's memory
 */

import fs from 'fs/promises';
import path from 'path';
import { createMemory } from './walter-memory';
import AdmZip from 'adm-zip';

const LEARNING_DIR = path.join(process.cwd(), 'attached_assets', 'learning');
const INGEST_LOG_PATH = path.join(process.cwd(), 'logs', 'ingest_log.json');

export interface IngestionResult {
  filename: string;
  fileType: string;
  startTime: string;
  endTime: string;
  success: boolean;
  memoriesCreated: number;
  error?: string;
  metadata: Record<string, any>;
}

export interface IngestionLog {
  ingestions: IngestionResult[];
}

/**
 * Initialize learning directory
 */
async function ensureLearningDirectory(): Promise<void> {
  try {
    await fs.mkdir(LEARNING_DIR, { recursive: true });
  } catch (error) {
    console.error('[Ingest] Error creating learning directory:', error);
  }
}

/**
 * Load ingestion log
 */
async function loadIngestionLog(): Promise<IngestionLog> {
  try {
    const content = await fs.readFile(INGEST_LOG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return { ingestions: [] };
  }
}

/**
 * Save ingestion result to log
 */
async function logIngestion(result: IngestionResult): Promise<void> {
  try {
    const log = await loadIngestionLog();
    log.ingestions.push(result);
    
    // Keep only last 100 ingestions
    if (log.ingestions.length > 100) {
      log.ingestions = log.ingestions.slice(-100);
    }
    
    await fs.writeFile(INGEST_LOG_PATH, JSON.stringify(log, null, 2));
    console.log(`[Ingest] Logged ingestion: ${result.filename} (${result.memoriesCreated} memories)`);
  } catch (error) {
    console.error('[Ingest] Error logging ingestion:', error);
  }
}

/**
 * Process a JSON learning file
 */
async function processJSONFile(filePath: string, userId: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    let memoriesCreated = 0;
    
    // Handle different JSON structures
    if (Array.isArray(data)) {
      // Array of memory objects
      for (const item of data) {
        if (item.content && item.type) {
          await createMemory(
            userId,
            item.type,
            item.content,
            item.importance || 3,
            { source: 'learning_file', filename: path.basename(filePath), ...item.metadata }
          );
          memoriesCreated++;
        }
      }
    } else if (data.memories && Array.isArray(data.memories)) {
      // Object with memories array
      for (const mem of data.memories) {
        if (mem.content && mem.type) {
          await createMemory(
            userId,
            mem.type,
            mem.content,
            mem.importance || 3,
            { source: 'learning_file', filename: path.basename(filePath), ...mem.metadata }
          );
          memoriesCreated++;
        }
      }
    } else if (data.content) {
      // Single memory object
      await createMemory(
        userId,
        data.type || 'lesson',
        data.content,
        data.importance || 3,
        { source: 'learning_file', filename: path.basename(filePath), ...data.metadata }
      );
      memoriesCreated++;
    }
    
    return memoriesCreated;
  } catch (error) {
    console.error('[Ingest] Error processing JSON file:', error);
    throw error;
  }
}

/**
 * Process a text/markdown file
 */
async function processTextFile(filePath: string, userId: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Split into paragraphs (simple chunking)
    const paragraphs = content
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 50); // Only meaningful paragraphs
    
    let memoriesCreated = 0;
    
    for (const paragraph of paragraphs) {
      if (paragraph.length > 2000) {
        // Skip overly long paragraphs
        continue;
      }
      
      await createMemory(
        userId,
        'lesson',
        paragraph,
        3, // Default importance
        { source: 'learning_file', filename: path.basename(filePath) }
      );
      memoriesCreated++;
    }
    
    return memoriesCreated;
  } catch (error) {
    console.error('[Ingest] Error processing text file:', error);
    throw error;
  }
}

/**
 * Process a ZIP file containing learning materials
 */
async function processZIPFile(filePath: string, userId: string): Promise<number> {
  try {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    
    let totalMemories = 0;
    
    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;
      
      const ext = path.extname(entry.entryName).toLowerCase();
      
      if (ext === '.json') {
        // Extract to temp location
        const tempPath = path.join(LEARNING_DIR, '.temp', entry.entryName);
        await fs.mkdir(path.dirname(tempPath), { recursive: true });
        await fs.writeFile(tempPath, entry.getData());
        
        const memories = await processJSONFile(tempPath, userId);
        totalMemories += memories;
        
        // Cleanup
        await fs.unlink(tempPath);
      } else if (ext === '.txt' || ext === '.md') {
        const tempPath = path.join(LEARNING_DIR, '.temp', entry.entryName);
        await fs.mkdir(path.dirname(tempPath), { recursive: true });
        await fs.writeFile(tempPath, entry.getData());
        
        const memories = await processTextFile(tempPath, userId);
        totalMemories += memories;
        
        // Cleanup
        await fs.unlink(tempPath);
      }
    }
    
    return totalMemories;
  } catch (error) {
    console.error('[Ingest] Error processing ZIP file:', error);
    throw error;
  }
}

/**
 * Ingest a learning file
 */
export async function ingestLearningFile(
  filePath: string,
  userId: string
): Promise<IngestionResult> {
  const startTime = new Date().toISOString();
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();
  
  console.log(`[Ingest] Processing file: ${filename}`);
  
  try {
    let memoriesCreated = 0;
    let fileType = ext;
    
    if (ext === '.json') {
      memoriesCreated = await processJSONFile(filePath, userId);
      fileType = 'json';
    } else if (ext === '.txt' || ext === '.md') {
      memoriesCreated = await processTextFile(filePath, userId);
      fileType = ext === '.txt' ? 'text' : 'markdown';
    } else if (ext === '.zip') {
      memoriesCreated = await processZIPFile(filePath, userId);
      fileType = 'zip';
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }
    
    const result: IngestionResult = {
      filename,
      fileType,
      startTime,
      endTime: new Date().toISOString(),
      success: true,
      memoriesCreated,
      metadata: {
        fileSize: (await fs.stat(filePath)).size,
        userId,
      }
    };
    
    await logIngestion(result);
    
    console.log(`[Ingest] ✅ Processed ${filename}: ${memoriesCreated} memories created`);
    
    return result;
  } catch (error: any) {
    const result: IngestionResult = {
      filename,
      fileType: ext,
      startTime,
      endTime: new Date().toISOString(),
      success: false,
      memoriesCreated: 0,
      error: error.message,
      metadata: { userId }
    };
    
    await logIngestion(result);
    
    console.error(`[Ingest] ❌ Failed to process ${filename}:`, error);
    
    return result;
  }
}

/**
 * Watch learning directory for new files (optional - can be triggered manually)
 */
export async function watchLearningDirectory(userId: string): Promise<void> {
  await ensureLearningDirectory();
  
  console.log(`[Ingest] Watching ${LEARNING_DIR} for new learning files...`);
  
  // Note: File watching implementation would use fs.watch()
  // For now, this is a manual trigger system
}

/**
 * Get ingestion history
 */
export async function getIngestionHistory(limit: number = 20): Promise<IngestionResult[]> {
  const log = await loadIngestionLog();
  return log.ingestions.slice(-limit).reverse();
}

/**
 * Detect if message contains "learn from <filename>" command
 */
export function detectLearnCommand(message: string): string | null {
  const regex = /learn from (.+?)(?:\.|$)/i;
  const match = message.match(regex);
  return match ? match[1].trim() : null;
}
