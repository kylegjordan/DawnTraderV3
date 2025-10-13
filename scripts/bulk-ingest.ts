import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { readdir, stat } from 'fs/promises';
import { ingestLearningFile } from '../server/services/walter-ingest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface IngestStats {
  totalFiles: number;
  processed: number;
  skipped: number;
  failed: number;
  totalMemories: number;
}

const SUPPORTED_EXTENSIONS = ['.json', '.txt', '.md'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

async function getAllFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  
  async function traverse(currentPath: string) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  await traverse(dirPath);
  return files;
}

async function ingestFile(filePath: string, userId: string): Promise<number> {
  const fileStats = await stat(filePath);
  
  if (fileStats.size > MAX_FILE_SIZE) {
    console.log(`⚠️  Skipping ${filePath} (too large: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB)`);
    return -1;
  }
  
  const filename = filePath.split('/').pop() || 'unknown';
  
  try {
    const result = await ingestLearningFile(filePath, userId);
    console.log(`✅ ${filename}: ${result.memoriesCreated} memories created`);
    return result.memoriesCreated;
  } catch (error) {
    console.error(`❌ ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

async function bulkIngest(dirPath: string, userId: string) {
  const stats: IngestStats = {
    totalFiles: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    totalMemories: 0
  };
  
  console.log(`\n🔍 Scanning directory: ${dirPath}\n`);
  
  const files = await getAllFiles(dirPath);
  stats.totalFiles = files.length;
  
  console.log(`📁 Found ${files.length} supported files (.json, .txt, .md)\n`);
  
  for (const file of files) {
    try {
      const memoriesCreated = await ingestFile(file, userId);
      
      if (memoriesCreated === -1) {
        stats.skipped++;
      } else {
        stats.processed++;
        stats.totalMemories += memoriesCreated;
      }
    } catch (error) {
      stats.failed++;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Ingestion Summary:');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total files found:    ${stats.totalFiles}`);
  console.log(`Successfully processed: ${stats.processed}`);
  console.log(`Skipped (too large):   ${stats.skipped}`);
  console.log(`Failed:                ${stats.failed}`);
  console.log(`Total memories created: ${stats.totalMemories}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const pathArg = args.find(arg => arg.startsWith('--path='));
const userArg = args.find(arg => arg.startsWith('--user='));

if (!pathArg) {
  console.error('Usage: tsx scripts/bulk-ingest.ts --path=<directory> [--user=<userId>]');
  console.error('Example: tsx scripts/bulk-ingest.ts --path=docs/training/Walter_Learning_Files --user=3ace5ebb-06f2-4116-8e60-f130425bab52');
  process.exit(1);
}

const targetPath = pathArg.split('=')[1];
const userId = userArg ? userArg.split('=')[1] : '3ace5ebb-06f2-4116-8e60-f130425bab52'; // Default test user

const absolutePath = join(process.cwd(), targetPath);

console.log(`\n🚀 Starting bulk ingestion...`);
console.log(`User ID: ${userId}`);
console.log(`Target: ${absolutePath}\n`);

bulkIngest(absolutePath, userId)
  .then(() => {
    console.log('✨ Bulk ingestion completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Bulk ingestion failed:', error);
    process.exit(1);
  });
