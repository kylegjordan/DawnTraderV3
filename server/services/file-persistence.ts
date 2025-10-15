import { promises as fs } from 'fs';
import path from 'path';

export type FileCategory = 'report' | 'log' | 'export' | 'analysis';
export type FileFormat = 'md' | 'json' | 'log' | 'csv' | 'xlsx' | 'txt';

interface DetailedMetrics {
  reportsSaved: number;
  logsSaved: number;
  exportsSaved: number;
  analysisSaved: number;
  fallbackWrites: number;
  saveErrors: number;
  timeouts: number;
  totalOperations: number;
  lastSavedFile: string | null;
  latency: {
    total: number;
    count: number;
    average: number;
    max: number;
    byCategory: Record<FileCategory, { total: number; count: number; average: number; max: number }>;
  };
}

interface FileSaveResult {
  success: boolean;
  path?: string;
  error?: string;
  url?: string;
  bytes?: number;
  latencyMs?: number;
  usedFallback?: boolean;
}

class FilePersistenceService {
  private static instance: FilePersistenceService;
  private metrics: DetailedMetrics;
  private selfTestPassed: boolean = false;
  
  private readonly BASE_PATHS = {
    report: path.join(process.cwd(), 'reports'),
    log: path.join(process.cwd(), 'logs'),
    export: path.join(process.cwd(), 'exports'),
    analysis: path.join(process.cwd(), 'logs', 'ai_analysis'),
  };

  private constructor() {
    this.metrics = {
      reportsSaved: 0,
      logsSaved: 0,
      exportsSaved: 0,
      analysisSaved: 0,
      fallbackWrites: 0,
      saveErrors: 0,
      timeouts: 0,
      totalOperations: 0,
      lastSavedFile: null,
      latency: {
        total: 0,
        count: 0,
        average: 0,
        max: 0,
        byCategory: {
          report: { total: 0, count: 0, average: 0, max: 0 },
          log: { total: 0, count: 0, average: 0, max: 0 },
          export: { total: 0, count: 0, average: 0, max: 0 },
          analysis: { total: 0, count: 0, average: 0, max: 0 },
        },
      },
    };
    this.ensureDirectories();
  }

  static getInstance(): FilePersistenceService {
    if (!FilePersistenceService.instance) {
      FilePersistenceService.instance = new FilePersistenceService();
    }
    return FilePersistenceService.instance;
  }

  private async ensureDirectories(): Promise<void> {
    for (const [category, dirPath] of Object.entries(this.BASE_PATHS)) {
      try {
        await fs.mkdir(dirPath, { recursive: true });
      } catch (error) {
        console.error(`[FilePersistence] Failed to create ${category} directory:`, error);
      }
    }
  }

  async runStartupSelfTest(): Promise<boolean> {
    const testFilename = `self-test-${Date.now()}.tmp`;
    const testContent = 'File persistence self-test';
    
    try {
      console.log('[FilePersistence] Running startup self-test...');
      
      // Test persistent directory write
      const testPath = path.join(this.BASE_PATHS.log, testFilename);
      await fs.writeFile(testPath, testContent, 'utf-8');
      
      // Verify read
      const readContent = await fs.readFile(testPath, 'utf-8');
      if (readContent !== testContent) {
        throw new Error('Read content does not match written content');
      }
      
      // Clean up
      await fs.unlink(testPath);
      
      this.selfTestPassed = true;
      console.log('[FilePersistence] ✅ Self-test: OK (persistent write verified)');
      
      return true;
    } catch (error: any) {
      this.selfTestPassed = false;
      console.error('[FilePersistence] ❌ Self-test: FAILED -', error.message);
      console.error('[FilePersistence] ⚠️ System marked as DEGRADED - will use /tmp fallback');
      
      return false;
    }
  }

  async saveFile(
    category: FileCategory,
    filename: string,
    content: string | Buffer,
    options: { timeout?: number; skipVerification?: boolean } = {}
  ): Promise<FileSaveResult> {
    const { timeout = 5000, skipVerification = false } = options;
    const startTime = Date.now();
    this.metrics.totalOperations++;

    const contentSize = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf-8');

    try {
      await this.ensureDirectories();

      const basePath = this.BASE_PATHS[category];
      const filePath = path.join(basePath, filename);
      
      const writePromise = fs.writeFile(filePath, content, 'utf-8');
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('File write timeout')), timeout)
      );

      await Promise.race([writePromise, timeoutPromise]);

      if (!skipVerification) {
        try {
          await fs.access(filePath);
        } catch {
          throw new Error('File verification failed - file not found after write');
        }
      }

      const latency = Date.now() - startTime;
      this.updateMetrics(category, true, latency, false);
      this.metrics.lastSavedFile = filename;

      const relativePath = path.relative(process.cwd(), filePath);
      const downloadUrl = `/api/files/download/${category}/${filename}`;

      // Check for slow writes
      if (latency > 2000) {
        console.warn(`[FilePersistence] ⚠️ SLOW WRITE: ${category}/${filename} (${latency}ms, ${contentSize} bytes)`);
      } else {
        console.log(`[FilePersistence] ✅ Saved ${category}: ${filename} (${contentSize} bytes, ${latency}ms)`);
      }

      return {
        success: true,
        path: relativePath,
        url: downloadUrl,
        bytes: contentSize,
        latencyMs: latency,
        usedFallback: false,
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      
      if (error.message === 'File write timeout') {
        this.metrics.timeouts++;
        console.warn(`[FilePersistence] ⏱️ Timeout writing ${category}/${filename} (${timeout}ms), attempting /tmp fallback...`);
        
        try {
          const tmpDir = path.join('/tmp', category);
          await fs.mkdir(tmpDir, { recursive: true });
          const tmpFilePath = path.join(tmpDir, filename);
          
          await fs.writeFile(tmpFilePath, content, 'utf-8');
          
          if (!skipVerification) {
            await fs.access(tmpFilePath);
          }
          
          const fallbackLatency = Date.now() - startTime;
          this.updateMetrics(category, true, fallbackLatency, true);
          this.metrics.lastSavedFile = filename;
          
          console.log(`[FilePersistence] ⚠️ Fallback successful: ${tmpFilePath} (${contentSize} bytes, ${fallbackLatency}ms)`);
          
          return {
            success: true,
            path: tmpFilePath,
            url: `/api/files/download/${category}/${filename}`,
            bytes: contentSize,
            latencyMs: fallbackLatency,
            usedFallback: true,
          };
        } catch (fallbackError: any) {
          this.updateMetrics(category, false, latency, false);
          console.error(`[FilePersistence] ❌ Fallback failed for ${category}/${filename}:`, fallbackError.message);
          
          return {
            success: false,
            error: `Timeout and fallback failed: ${fallbackError.message}`,
            latencyMs: latency,
          };
        }
      } else {
        this.updateMetrics(category, false, latency, false);
        console.error(`[FilePersistence] ❌ Failed to save ${category}/${filename}:`, error.message);
      }

      return {
        success: false,
        error: error.message,
        latencyMs: latency,
      };
    }
  }

  async readFile(
    category: FileCategory,
    filename: string
  ): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
      const basePath = this.BASE_PATHS[category];
      const filePath = path.join(basePath, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      
      return { success: true, content };
    } catch (error: any) {
      try {
        const tmpPath = path.join('/tmp', category, filename);
        const content = await fs.readFile(tmpPath, 'utf-8');
        console.log(`[FilePersistence] Read from /tmp fallback: ${tmpPath}`);
        return { success: true, content };
      } catch (tmpError: any) {
        return { success: false, error: error.message };
      }
    }
  }

  async fileExists(category: FileCategory, filename: string): Promise<boolean> {
    try {
      const basePath = this.BASE_PATHS[category];
      const filePath = path.join(basePath, filename);
      await fs.access(filePath);
      return true;
    } catch {
      try {
        const tmpPath = path.join('/tmp', category, filename);
        await fs.access(tmpPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  async listFiles(category: FileCategory): Promise<string[]> {
    try {
      const basePath = this.BASE_PATHS[category];
      const files = await fs.readdir(basePath);
      return files;
    } catch {
      return [];
    }
  }

  getMetrics(): DetailedMetrics {
    return { ...this.metrics };
  }

  getHealthSummary(): string {
    const { reportsSaved, logsSaved, exportsSaved, analysisSaved, fallbackWrites, saveErrors, timeouts, latency, lastSavedFile } = this.metrics;
    const lines: string[] = [];

    const totalSaved = reportsSaved + logsSaved + exportsSaved + analysisSaved;
    lines.push(`[FilePersistence] Total: ${totalSaved} saved, ${saveErrors} errors, ${fallbackWrites} fallbacks, ${timeouts} timeouts`);
    
    if (reportsSaved > 0) {
      const avgLatency = Math.round(latency.byCategory.report.average);
      lines.push(`[FilePersistence] Reports: ${reportsSaved} saved (${avgLatency}ms avg)`);
    }
    
    if (logsSaved > 0) {
      const avgLatency = Math.round(latency.byCategory.log.average);
      lines.push(`[FilePersistence] Logs: ${logsSaved} saved (${avgLatency}ms avg)`);
    }
    
    if (exportsSaved > 0) {
      const avgLatency = Math.round(latency.byCategory.export.average);
      lines.push(`[FilePersistence] Exports: ${exportsSaved} saved (${avgLatency}ms avg)`);
    }

    if (lastSavedFile) {
      lines.push(`[FilePersistence] Last saved: ${lastSavedFile}`);
    }

    if (latency.max > 2000) {
      lines.push(`[FilePersistence] ⚠️ Slow write detected: ${latency.max}ms (max)`);
    }

    return lines.join('\n');
  }

  getDetailedStats() {
    const { reportsSaved, logsSaved, exportsSaved, analysisSaved, fallbackWrites, saveErrors, timeouts, totalOperations, lastSavedFile, latency } = this.metrics;
    
    return {
      summary: {
        totalOperations,
        totalSaved: reportsSaved + logsSaved + exportsSaved + analysisSaved,
        saveErrors,
        fallbackWrites,
        timeouts,
        lastSavedFile,
      },
      byCategory: {
        reports: { saved: reportsSaved, avgLatency: Math.round(latency.byCategory.report.average) },
        logs: { saved: logsSaved, avgLatency: Math.round(latency.byCategory.log.average) },
        exports: { saved: exportsSaved, avgLatency: Math.round(latency.byCategory.export.average) },
        analysis: { saved: analysisSaved, avgLatency: Math.round(latency.byCategory.analysis.average) },
      },
      latency: {
        overall: Math.round(latency.average),
        max: latency.max,
        slowWriteDetected: latency.max > 2000,
      },
      status: this.selfTestPassed ? 'OK' : 'DEGRADED',
    };
  }

  resetMetrics(): void {
    this.metrics = {
      reportsSaved: 0,
      logsSaved: 0,
      exportsSaved: 0,
      analysisSaved: 0,
      fallbackWrites: 0,
      saveErrors: 0,
      timeouts: 0,
      totalOperations: 0,
      lastSavedFile: null,
      latency: {
        total: 0,
        count: 0,
        average: 0,
        max: 0,
        byCategory: {
          report: { total: 0, count: 0, average: 0, max: 0 },
          log: { total: 0, count: 0, average: 0, max: 0 },
          export: { total: 0, count: 0, average: 0, max: 0 },
          analysis: { total: 0, count: 0, average: 0, max: 0 },
        },
      },
    };
  }

  private updateMetrics(category: FileCategory, success: boolean, latencyMs: number, usedFallback: boolean): void {
    if (success) {
      // Update category-specific counters
      switch (category) {
        case 'report':
          this.metrics.reportsSaved++;
          break;
        case 'log':
          this.metrics.logsSaved++;
          break;
        case 'export':
          this.metrics.exportsSaved++;
          break;
        case 'analysis':
          this.metrics.analysisSaved++;
          break;
      }

      if (usedFallback) {
        this.metrics.fallbackWrites++;
      }

      // Update latency metrics
      this.metrics.latency.total += latencyMs;
      this.metrics.latency.count++;
      this.metrics.latency.average = this.metrics.latency.total / this.metrics.latency.count;
      this.metrics.latency.max = Math.max(this.metrics.latency.max, latencyMs);

      const categoryLatency = this.metrics.latency.byCategory[category];
      categoryLatency.total += latencyMs;
      categoryLatency.count++;
      categoryLatency.average = categoryLatency.total / categoryLatency.count;
      categoryLatency.max = Math.max(categoryLatency.max, latencyMs);
    } else {
      this.metrics.saveErrors++;
    }
  }

  getDownloadPath(category: FileCategory, filename: string): string {
    return path.join(this.BASE_PATHS[category], filename);
  }

  getSelfTestStatus(): boolean {
    return this.selfTestPassed;
  }
}

export const filePersistence = FilePersistenceService.getInstance();
