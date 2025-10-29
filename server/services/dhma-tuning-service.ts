import { db } from "../db";
import { sql } from "drizzle-orm";
import { strategyParamSchema, tradingAuditLog } from "@shared/schema";

interface DHMATelemetry {
  entries: number;
  exits: number;
  hitRate: number;
  avgPLPerTrade: number;
  avgSpreadTicks: number;
  avgToxicity: number;
  avgHoldTimeMinutes?: number;
}

export class DHMATuningService {
  private static lastUpdateTime: Record<string, number> = {
    paper: 0,
    live: 0,
  };
  
  private static updateCount: Record<string, number> = {
    paper: 0,
    live: 0,
  };

  /**
   * Process DHMA telemetry and adaptively adjust parameters based on performance
   * @param mode Trading mode (paper/live)
   * @param telemetry DHMA performance telemetry
   */
  static async processTelemetry(mode: 'paper' | 'live', telemetry: DHMATelemetry): Promise<void> {
    try {
      // Safety Rule 1: Throttle - one update per 30 minutes
      const now = Date.now();
      const timeSinceLastUpdate = now - this.lastUpdateTime[mode];
      const thirtyMinutes = 30 * 60 * 1000;
      
      if (timeSinceLastUpdate < thirtyMinutes) {
        console.log(`[DHMATuning][${mode}] Throttled: Last update ${Math.floor(timeSinceLastUpdate / 60000)}m ago (min: 30m)`);
        return;
      }

      // Safety Rule 2: Max 3 updates per day (24 hours)
      const twentyFourHours = 24 * 60 * 60 * 1000;
      if (now - this.lastUpdateTime[mode] > twentyFourHours) {
        // Reset counter after 24 hours
        this.updateCount[mode] = 0;
      }

      if (this.updateCount[mode] >= 3) {
        console.log(`[DHMATuning][${mode}] Daily limit reached: ${this.updateCount[mode]}/3 updates`);
        return;
      }

      const { hitRate, avgPLPerTrade, avgSpreadTicks, avgToxicity } = telemetry;

      // Target thresholds for optimization
      const targetHitRate = 0.58; // 58% target hit rate
      const minPL = 0.004; // $0.004 minimum P&L per trade

      // Fetch current DHMA parameters from database
      const result = await db.execute<{
        key: string;
        value: string;
        min: string;
        max: string;
        step: string;
      }>(sql`
        SELECT key, value, min, max, step
        FROM strategy_param_schema
        WHERE strategy_type='dhma' AND trading_mode=${mode};
      `);

      const rows = result.rows;
      const updates: { key: string; newValue: number; oldValue: number; reason: string }[] = [];

      // 1. Adjust spreadMaxTicks based on average spread
      const spreadParam = rows.find((r: any) => r.key === 'spreadMaxTicks');
      if (spreadParam && avgSpreadTicks !== undefined) {
        const currentSpread = parseFloat(spreadParam.value);
        const min = parseFloat(spreadParam.min);
        const max = parseFloat(spreadParam.max);
        const step = parseFloat(spreadParam.step);

        if (avgSpreadTicks > 5) {
          // Spreads too wide - tighten entry criteria
          const newValue = Math.max(min, currentSpread - step);
          if (newValue !== currentSpread) {
            updates.push({ 
              key: 'spreadMaxTicks', 
              newValue, 
              oldValue: currentSpread,
              reason: `avg_spread=${avgSpreadTicks.toFixed(2)} > 5.0 (tightening entry)`
            });
          }
        } else if (avgSpreadTicks < 3) {
          // Spreads narrow - can widen entry criteria
          const newValue = Math.min(max, currentSpread + step);
          if (newValue !== currentSpread) {
            updates.push({ 
              key: 'spreadMaxTicks', 
              newValue, 
              oldValue: currentSpread,
              reason: `avg_spread=${avgSpreadTicks.toFixed(2)} < 3.0 (widening entry)`
            });
          }
        }
      }

      // 2. Adjust toxicityLimit based on average toxicity
      const toxParam = rows.find((r: any) => r.key === 'toxicityLimit');
      if (toxParam && avgToxicity !== undefined) {
        const currentTox = parseFloat(toxParam.value);
        const min = parseFloat(toxParam.min);
        const max = parseFloat(toxParam.max);
        const step = parseFloat(toxParam.step);

        if (avgToxicity > 0.75) {
          // High toxicity - tighten threshold to avoid volatile conditions
          const newValue = Math.max(min, currentTox - step);
          if (newValue !== currentTox) {
            updates.push({ 
              key: 'toxicityLimit', 
              newValue, 
              oldValue: currentTox,
              reason: `avg_toxicity=${avgToxicity.toFixed(2)} > 0.75 (reducing tolerance)`
            });
          }
        } else if (avgToxicity < 0.5) {
          // Low toxicity - can increase threshold for more opportunities
          const newValue = Math.min(max, currentTox + step);
          if (newValue !== currentTox) {
            updates.push({ 
              key: 'toxicityLimit', 
              newValue, 
              oldValue: currentTox,
              reason: `avg_toxicity=${avgToxicity.toFixed(2)} < 0.50 (increasing tolerance)`
            });
          }
        }
      }

      // 3. Adjust micropriceDeviation based on hit rate
      const microParam = rows.find((r: any) => r.key === 'micropriceDeviation');
      if (microParam) {
        const currentMicro = parseFloat(microParam.value);
        const min = parseFloat(microParam.min);
        const max = parseFloat(microParam.max);
        const step = parseFloat(microParam.step);

        if (hitRate < targetHitRate) {
          // Hit rate too low - tighten entry criteria (lower deviation threshold)
          const newValue = Math.max(min, currentMicro - step);
          if (newValue !== currentMicro) {
            updates.push({ 
              key: 'micropriceDeviation', 
              newValue, 
              oldValue: currentMicro,
              reason: `hit_rate=${(hitRate * 100).toFixed(1)}% < ${(targetHitRate * 100).toFixed(1)}% (tightening)`
            });
          }
        } else if (hitRate > targetHitRate + 0.1) {
          // Hit rate very high - can loosen criteria for more opportunities
          const newValue = Math.min(max, currentMicro + step);
          if (newValue !== currentMicro) {
            updates.push({ 
              key: 'micropriceDeviation', 
              newValue, 
              oldValue: currentMicro,
              reason: `hit_rate=${(hitRate * 100).toFixed(1)}% > ${((targetHitRate + 0.1) * 100).toFixed(1)}% (loosening)`
            });
          }
        }
      }

      // 4. Adjust signedFlowRatio based on P&L performance
      const flowParam = rows.find((r: any) => r.key === 'signedFlowRatio');
      if (flowParam && avgPLPerTrade < minPL) {
        const currentFlow = parseFloat(flowParam.value);
        const max = parseFloat(flowParam.max);
        const step = parseFloat(flowParam.step);

        // P&L below target - increase flow ratio to favor stronger directional moves
        const newValue = Math.min(max, currentFlow + step);
        if (newValue !== currentFlow) {
          updates.push({ 
            key: 'signedFlowRatio', 
            newValue, 
            oldValue: currentFlow,
            reason: `avg_pl=$${avgPLPerTrade.toFixed(4)} < $${minPL.toFixed(4)} (increasing flow requirement)`
          });
        }
      }

      // Safety Rule 3: Max ±2 steps per parameter per session
      // (Already enforced by the single-step adjustments above)

      if (updates.length === 0) {
        console.log(`[DHMATuning][${mode}] No parameter adjustments needed (telemetry within targets)`);
        return;
      }

      // Apply updates and log to audit trail
      for (const update of updates) {
        await db.execute(sql`
          UPDATE strategy_param_schema
          SET value=${update.newValue}, updated_at=NOW()
          WHERE strategy_type='dhma' AND trading_mode=${mode} AND key=${update.key};
        `);

        // Log to trading_audit_log using existing schema structure
        await db.insert(tradingAuditLog).values({
          userId: 'system', // System-driven adjustment
          action: 'parameter_update',
          mode: mode,
          triggeredBy: 'latti_dhma_tuning',
          metadata: {
            strategy_type: 'dhma',
            key: update.key,
            old_value: update.oldValue,
            new_value: update.newValue,
            reason: update.reason,
            telemetry: {
              hit_rate: hitRate,
              avg_pl: avgPLPerTrade,
              avg_spread: avgSpreadTicks,
              avg_toxicity: avgToxicity,
            },
          },
        });

        console.log(`[DHMATuning][${mode}] ${update.key}: ${update.oldValue.toFixed(4)} → ${update.newValue.toFixed(4)} (${update.reason})`);
      }

      // Update throttle tracking
      this.lastUpdateTime[mode] = now;
      this.updateCount[mode]++;

      console.log(`[DHMATuning][${mode}] Applied ${updates.length} parameter adjustment(s) (${this.updateCount[mode]}/3 daily limit)`);
    } catch (err: any) {
      console.error(`[DHMATuning][${mode}] Error processing telemetry:`, err.message);
    }
  }
}
