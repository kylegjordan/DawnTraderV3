import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { addAlert } from "./system-alerts";

/**
 * Database size monitor — daily check + alarm.
 *
 * B75 (2026-05-06): thresholds parameterized via `module_constants` instead of
 * hardcoded against a stale 10 GiB limit. Tracks against the Supabase Pro plan
 * cap (200 GB default) so disk auto-expansions don't silently invalidate the
 * alarm (Langston rec #3, BATCH_75_PRE_AUDIT.md §D.1).
 *
 * Constants (module_name='database_monitor'):
 *   plan_cap_mb               = 204800   (200 GB Pro auto-expand cap)
 *   warning_threshold_pct     = 0.65
 *   critical_threshold_pct    = 0.80
 *
 * Per Kyle directive (CLAUDE.md §11): no hard-coded fallbacks for DB-governed
 * settings — fail hard if rows missing.
 */

interface MonitorConfig {
  planCapMb: number;
  warningThresholdPct: number;
  criticalThresholdPct: number;
}

export class DatabaseMonitor {
  private checkIntervalMs = 24 * 60 * 60 * 1000; // 24 hours
  private timer: NodeJS.Timeout | null = null;

  private async loadConfig(): Promise<MonitorConfig> {
    const res = await db.execute(
      sql`SELECT constant_name, value FROM module_constants
            WHERE module_name = 'database_monitor'`,
    );
    const map = new Map<string, unknown>();
    for (const row of res.rows as Array<{ constant_name: string; value: unknown }>) {
      map.set(row.constant_name, row.value);
    }

    function reqNum(key: string): number {
      const v = map.get(key);
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(
          `[DatabaseMonitor] missing or invalid module_constants.database_monitor.${key} ` +
            `— per CLAUDE.md §11 no hard-coded fallbacks; fix the DB row before proceeding.`,
        );
      }
      return n;
    }

    return {
      planCapMb: reqNum('plan_cap_mb'),
      warningThresholdPct: reqNum('warning_threshold_pct'),
      criticalThresholdPct: reqNum('critical_threshold_pct'),
    };
  }

  async checkDatabaseSize(): Promise<{ sizeMb: number; sizeGb: number; alertLevel: 'normal' | 'warning' | 'critical' }> {
    try {
      const cfg = await this.loadConfig();

      const result = await db.execute(
        sql`SELECT pg_database_size(current_database()) / 1024.0 / 1024.0 as size_mb`
      );

      const row = result.rows[0] as { size_mb: string };
      const sizeMb = parseFloat(row?.size_mb || "0");
      const sizeGb = sizeMb / 1024;
      const planCapGb = cfg.planCapMb / 1024;
      const utilization = sizeMb / cfg.planCapMb;

      // Log the size
      await storage.logDatabaseSize({
        sizeMb: sizeMb.toFixed(2),
        sizeGb: sizeGb.toFixed(4),
      });

      console.log(
        `[DatabaseMonitor] Database size: ${sizeMb.toFixed(2)} MB (${sizeGb.toFixed(4)} GB) ` +
          `— ${(utilization * 100).toFixed(1)}% of ${planCapGb.toFixed(0)} GB plan cap`,
      );

      // Determine alert level against Supabase plan cap (B75)
      let alertLevel: 'normal' | 'warning' | 'critical' = 'normal';
      if (utilization >= cfg.criticalThresholdPct) {
        alertLevel = 'critical';
        console.warn(
          `[DatabaseMonitor] ⚠️ CRITICAL: ${(utilization * 100).toFixed(1)}% of ${planCapGb.toFixed(0)} GB plan cap`,
        );
      } else if (utilization >= cfg.warningThresholdPct) {
        alertLevel = 'warning';
        console.warn(
          `[DatabaseMonitor] ⚠️ WARNING: ${(utilization * 100).toFixed(1)}% of ${planCapGb.toFixed(0)} GB plan cap`,
        );
      }

      // B-STORAGE-HARDEN OBJ-5: surface disk warning/critical to the §10.5 alert
      // queue (previously this condition ONLY console.warn'd — invisible to the
      // per-turn CC/Langston check, which is why the disk grew unnoticed). Dedup
      // per level so the 24h cadence collapses to one alert while the condition
      // holds, but a warning→critical transition still raises a fresh critical.
      if (alertLevel !== 'normal') {
        await this.emitDiskAlert(alertLevel, sizeGb, utilization, planCapGb);
      }

      return { sizeMb, sizeGb, alertLevel };
    } catch (error) {
      console.error("[DatabaseMonitor] Error checking database size:", error);
      throw error;
    }
  }

  /**
   * B-STORAGE-HARDEN OBJ-5: emit a §10.5 system-alert for a disk warning/critical.
   * Never let an alert-write failure mask the size check — swallow + log.
   */
  private async emitDiskAlert(
    level: 'warning' | 'critical',
    sizeGb: number,
    utilization: number,
    planCapGb: number,
  ): Promise<void> {
    try {
      await addAlert({
        triggers_at: new Date(), // immediate; dispatcher promotes scheduled→active next tick
        category: 'health_check',
        severity: level,
        title: `Database disk ${level.toUpperCase()}: ${(utilization * 100).toFixed(1)}% of ${planCapGb.toFixed(0)} GB plan cap`,
        body:
          `Logical database size is ${sizeGb.toFixed(1)} GB — ${(utilization * 100).toFixed(1)}% of the ` +
          `${planCapGb.toFixed(0)} GB Supabase plan cap (crossed the ${level} threshold). The hot/warm/cold ` +
          `tiering must keep moving old data off the hot disk; investigate what is growing (ticker capture, ` +
          `un-tiered analytics tables). Wired to the §10.5 queue by B-STORAGE-HARDEN OBJ-5 — this condition ` +
          `previously only logged to the process console.`,
        metadata: {
          source: 'database-monitor',
          batch: 'B-STORAGE-HARDEN',
          level,
          size_gb: Number(sizeGb.toFixed(2)),
          utilization: Number(utilization.toFixed(4)),
          plan_cap_gb: Number(planCapGb.toFixed(0)),
        },
        dedupe_key: `disk-utilization-${level}`,
      });
    } catch (err) {
      console.error('[DatabaseMonitor] failed to emit §10.5 disk alert:', err);
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
