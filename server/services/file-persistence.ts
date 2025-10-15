import { promises as fs } from 'fs';
import path from 'path';

export type FileCategory = 'report' | 'log' | 'export' | 'analysis';
export type FileFormat = 'md' | 'json' | 'log' | 'csv' | 'xlsx' | 'txt';

interface FileMetrics {
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  totalLatencyMs: number;
  byCategory: Record<FileCategory, { success: number; failed: number; avgLatencyMs: number }>;
}

class FilePersistenceService {
  private static instance: FilePersistenceService;
  private metrics: FileMetrics;
  
  private readonly BASE_PATHS = {
    report: path.join(process.cwd(), 'reports'),
    log: path.join(process.cwd(), 'logs'),
    export: path.join(process.cwd(), 'exports'),
    analysis: path.join(process.cwd(), 'logs', 'ai_analysis'),
  };

  private constructor() {
    this.metrics = {
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      totalLatencyMs: 0,
      byCategory: {
        report: { success: 0, failed: 0, avgLatencyMs: 0 },
        log: { success: 0, failed: 0, avgLatencyMs: 0 },
        export: { success: 0, failed: 0, avgLatencyMs: 0 },
        analysis: { success: 0, failed: 0, avgLatencyMs: 0 },
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

  async saveFile(
    category: FileCategory,
    filename: string,
    content: string | Buffer,
    options: { timeout?: number; skipVerification?: boolean } = {}
  ): Promise<{ success: boolean; path?: string; error?: string; url?: string }> {
    const { timeout = 5000, skipVerification = false } = options;
    const startTime = Date.now();

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
      this.updateMetrics(category, true, latency);

      const relativePath = path.relative(process.cwd(), filePath);
      const downloadUrl = `/api/files/download/${category}/${filename}`;

      console.log(`[FilePersistence] ✅ Saved successfully at ./${relativePath} (${latency}ms)`);

      return {
        success: true,
        path: relativePath,
        url: downloadUrl,
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      
      if (error.message === 'File write timeout') {
        this.metrics.timeoutCount++;
        console.error(`[FilePersistence] ⏱️ Timeout writing ${category}/${filename} (${timeout}ms)`);
      } else {
        this.updateMetrics(category, false, latency);
        console.error(`[FilePersistence] ❌ Failed to save ${category}/${filename}:`, error.message);
      }

      return {
        success: false,
        error: error.message,
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
      return { success: false, error: error.message };
    }
  }

  async fileExists(category: FileCategory, filename: string): Promise<boolean> {
    try {
      const basePath = this.BASE_PATHS[category];
      const filePath = path.join(basePath, filename);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
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

  getMetrics(): FileMetrics {
    return { ...this.metrics };
  }

  getHealthSummary(): string {
    const { successCount, failureCount, timeoutCount, byCategory } = this.metrics;
    const lines: string[] = [];

    lines.push(`[FilePersistence] Total: ${successCount} saved, ${failureCount} failed, ${timeoutCount} timeouts`);
    
    for (const [cat, stats] of Object.entries(byCategory)) {
      if (stats.success > 0 || stats.failed > 0) {
        const avgLatency = stats.success > 0 ? Math.round(stats.avgLatencyMs / stats.success) : 0;
        const status = stats.failed === 0 ? 'OK' : `${stats.failed} warning${stats.failed !== 1 ? 's' : ''}`;
        lines.push(`[FilePersistence] ${cat}: ${status} (${stats.success} saved, ${avgLatency}ms avg)`);
      }
    }

    return lines.join('\n');
  }

  private updateMetrics(category: FileCategory, success: boolean, latencyMs: number): void {
    if (success) {
      this.metrics.successCount++;
      this.metrics.byCategory[category].success++;
      this.metrics.byCategory[category].avgLatencyMs += latencyMs;
    } else {
      this.metrics.failureCount++;
      this.metrics.byCategory[category].failed++;
    }
    this.metrics.totalLatencyMs += latencyMs;
  }

  getDownloadPath(category: FileCategory, filename: string): string {
    return path.join(this.BASE_PATHS[category], filename);
  }
}

export const filePersistence = FilePersistenceService.getInstance();
