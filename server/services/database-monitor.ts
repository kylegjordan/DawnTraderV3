import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";

export class DatabaseMonitor {
  private checkIntervalMs = 24 * 60 * 60 * 1000; // 24 hours
  private timer: NodeJS.Timeout | null = null;

  async checkDatabaseSize(): Promise<{ sizeMb: number; sizeGb: number; alertLevel: 'normal' | 'warning' | 'critical' }> {
    try {
      // Query database size in MB
      const result = await db.execute(
        sql`SELECT pg_database_size(current_database()) / 1024.0 / 1024.0 as size_mb`
      );
      
      const row = result.rows[0] as { size_mb: string };
      const sizeMb = parseFloat(row?.size_mb || "0");
      const sizeGb = sizeMb / 1024;

      // Log the size
      await storage.logDatabaseSize({
        sizeMb: sizeMb.toFixed(2),
        sizeGb: sizeGb.toFixed(4),
      });

      console.log(`[DatabaseMonitor] Database size: ${sizeMb.toFixed(2)} MB (${sizeGb.toFixed(4)} GB)`);

      // Determine alert level (10 GiB = 10240 MB limit)
      // Phase 9.10: Adjusted thresholds - 65% warning, 80% critical (was 50%/70%)
      let alertLevel: 'normal' | 'warning' | 'critical' = 'normal';
      if (sizeMb >= 8192) { // 8 GiB (80%)
        alertLevel = 'critical';
        console.warn(`[DatabaseMonitor] ⚠️ CRITICAL: Database is at ${(sizeGb / 10 * 100).toFixed(1)}% of 10 GiB limit`);
      } else if (sizeMb >= 6656) { // 6.5 GiB (65%)
        alertLevel = 'warning';
        console.warn(`[DatabaseMonitor] ⚠️ WARNING: Database is at ${(sizeGb / 10 * 100).toFixed(1)}% of 10 GiB limit`);
      }

      return { sizeMb, sizeGb, alertLevel };
    } catch (error) {
      console.error("[DatabaseMonitor] Error checking database size:", error);
      throw error;
    }
  }

  startDailyChecks(): void {
    if (this.timer) {
      console.log("[DatabaseMonitor] Daily checks already running");
      return;
    }

    console.log("[DatabaseMonitor] Starting daily database size checks");
    
    // Check immediately on startup
    this.checkDatabaseSize().catch(err => {
      console.error("[DatabaseMonitor] Initial size check failed:", err);
    });

    // Then check every 24 hours
    this.timer = setInterval(() => {
      this.checkDatabaseSize().catch(err => {
        console.error("[DatabaseMonitor] Daily size check failed:", err);
      });
    }, this.checkIntervalMs);
  }

  stopDailyChecks(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[DatabaseMonitor] Stopped daily database size checks");
    }
  }
}

export const databaseMonitor = new DatabaseMonitor();
