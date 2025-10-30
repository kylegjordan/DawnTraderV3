/**
 * Phase 31.D: Strategic Drive Guardrail Service
 * 
 * Implements "Soft Guardrails, Hard Coherency" design philosophy:
 * - Guardrails = dynamic stabilizers → slow down risky reallocations but rarely block them
 * - Coherency Rules = hard safety stop → final layer preventing unsafe exposure or trade loops
 * 
 * These guardrails control the Strategic Drive & Profit Optimization Engine's
 * reallocation behavior, ensuring smooth and safe portfolio adjustments.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { strategyDriveGuardrailPolicy, type StrategyDriveGuardrailPolicy } from '@shared/schema';

export interface GuardrailValidationResult {
  allowed: boolean;
  reason?: string;
  throttled?: boolean;
}

export interface ReallocationRequest {
  strategyName: string;
  currentWeight: number;
  proposedWeight: number;
  deltaPercentage: number;
}

class StrategicDriveGuardrailService {
  private lastReallocationTime: Date | null = null;
  private totalShiftThisHour = 0;
  private hourlyResetTimer: NodeJS.Timeout | null = null;

  constructor() {
    console.log('[31.D][SDPOE] Strategic Drive Guardrail Service initialized');
    this.startHourlyReset();
  }

  /**
   * Reset hourly shift counter every 60 minutes
   */
  private startHourlyReset(): void {
    this.hourlyResetTimer = setInterval(() => {
      console.log('[31.D][SDPOE] Resetting hourly shift counter');
      this.totalShiftThisHour = 0;
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Get current guardrail policy from database
   */
  async getPolicy(): Promise<StrategyDriveGuardrailPolicy> {
    const policies = await db.select().from(strategyDriveGuardrailPolicy).limit(1);
    
    if (policies.length === 0) {
      throw new Error('[31.D][SDPOE] No guardrail policy found in database');
    }
    
    return policies[0];
  }

  /**
   * Update guardrail policy
   */
  async updatePolicy(updates: Partial<StrategyDriveGuardrailPolicy>, updatedBy: string): Promise<StrategyDriveGuardrailPolicy> {
    const policy = await this.getPolicy();
    
    const [updated] = await db
      .update(strategyDriveGuardrailPolicy)
      .set({
        ...updates,
        updatedAt: new Date(),
        updatedBy,
      })
      .where(eq(strategyDriveGuardrailPolicy.id, policy.id))
      .returning();

    console.log('[31.D][SDPOE] Guardrail policy updated by', updatedBy);
    
    return updated;
  }

  /**
   * Validate a single strategy reallocation request
   */
  async validateReallocation(request: ReallocationRequest): Promise<GuardrailValidationResult> {
    const policy = await this.getPolicy();

    // Check max delta per cycle (soft limit)
    const absDelta = Math.abs(request.deltaPercentage);
    if (absDelta > policy.maxDeltaPerCycle) {
      console.log(`[31.D][SDPOE] Reallocation throttled: delta ${absDelta.toFixed(3)} exceeds max ${policy.maxDeltaPerCycle}`);
      return {
        allowed: false,
        reason: `Delta ${(absDelta * 100).toFixed(1)}% exceeds max allowed ${(policy.maxDeltaPerCycle * 100).toFixed(1)}% per cycle`,
        throttled: true
      };
    }

    // Check max exposure per strategy (soft limit)
    if (request.proposedWeight > policy.maxExposurePerStrategy) {
      console.log(`[31.D][SDPOE] Reallocation blocked: weight ${request.proposedWeight.toFixed(3)} exceeds max ${policy.maxExposurePerStrategy}`);
      return {
        allowed: false,
        reason: `Proposed weight ${(request.proposedWeight * 100).toFixed(1)}% exceeds max ${(policy.maxExposurePerStrategy * 100).toFixed(1)}% per strategy`,
        throttled: false
      };
    }

    // Check total shift this hour (soft limit)
    const projectedShift = this.totalShiftThisHour + absDelta;
    if (projectedShift > policy.maxTotalShiftPerHour) {
      console.log(`[31.D][SDPOE] Reallocation throttled: hourly shift ${projectedShift.toFixed(3)} exceeds max ${policy.maxTotalShiftPerHour}`);
      return {
        allowed: false,
        reason: `Total hourly shift ${(projectedShift * 100).toFixed(1)}% would exceed max ${(policy.maxTotalShiftPerHour * 100).toFixed(1)}%`,
        throttled: true
      };
    }

    // Check cooling period (soft limit)
    if (this.lastReallocationTime) {
      const minutesSinceLastReallocation = (Date.now() - this.lastReallocationTime.getTime()) / (1000 * 60);
      if (minutesSinceLastReallocation < policy.coolingMinutes) {
        const remainingMinutes = Math.ceil(policy.coolingMinutes - minutesSinceLastReallocation);
        console.log(`[31.D][SDPOE] Reallocation throttled: cooling period ${remainingMinutes} minutes remaining`);
        return {
          allowed: false,
          reason: `Cooling period active: wait ${remainingMinutes} more minute(s)`,
          throttled: true
        };
      }
    }

    // All guardrails passed
    return { allowed: true };
  }

  /**
   * Validate forecast-driven auto-action requirements
   */
  async validateAutoAction(forecastConfidence: number, smoothedSDI: number): Promise<GuardrailValidationResult> {
    const policy = await this.getPolicy();

    // Check minimum confidence (soft limit)
    if (forecastConfidence < policy.minConfidence) {
      console.log(`[31.D][SDPOE] Auto-action blocked: confidence ${forecastConfidence.toFixed(3)} below min ${policy.minConfidence}`);
      return {
        allowed: false,
        reason: `Forecast confidence ${(forecastConfidence * 100).toFixed(1)}% below minimum ${(policy.minConfidence * 100).toFixed(1)}%`,
        throttled: false
      };
    }

    // Check minimum smoothed SDI (soft limit)
    if (smoothedSDI < policy.minSmoothedSDI) {
      console.log(`[31.D][SDPOE] Auto-action paused: SDI ${smoothedSDI.toFixed(3)} below min ${policy.minSmoothedSDI}`);
      return {
        allowed: false,
        reason: `Smoothed SDI ${(smoothedSDI * 100).toFixed(1)}% below minimum ${(policy.minSmoothedSDI * 100).toFixed(1)}%`,
        throttled: true
      };
    }

    return { allowed: true };
  }

  /**
   * Record a successful reallocation (updates internal counters)
   */
  recordReallocation(deltaPercentage: number): void {
    this.lastReallocationTime = new Date();
    this.totalShiftThisHour += Math.abs(deltaPercentage);
    console.log(`[31.D][SDPOE] Reallocation recorded: delta=${(deltaPercentage * 100).toFixed(1)}%, hourlyTotal=${(this.totalShiftThisHour * 100).toFixed(1)}%`);
  }

  /**
   * Get current state metrics for diagnostics
   */
  getState() {
    return {
      lastReallocationTime: this.lastReallocationTime,
      totalShiftThisHour: this.totalShiftThisHour,
      minutesSinceLastReallocation: this.lastReallocationTime 
        ? (Date.now() - this.lastReallocationTime.getTime()) / (1000 * 60)
        : null
    };
  }

  /**
   * Cleanup timers on shutdown
   */
  destroy(): void {
    if (this.hourlyResetTimer) {
      clearInterval(this.hourlyResetTimer);
      this.hourlyResetTimer = null;
    }
  }
}

export const strategicDriveGuardrails = new StrategicDriveGuardrailService();
